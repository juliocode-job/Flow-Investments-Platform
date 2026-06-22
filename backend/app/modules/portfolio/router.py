from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db, Holding, Transaction, User
from app.modules.auth.router import get_current_user
from app.modules.agent.cache import invalidate_user_cache
from .schemas import TransactionCreate, TransactionResponse, HoldingResponse, PortfolioSummary
from .prices import get_current_prices, get_asset_info
import datetime

router = APIRouter(prefix="/portfolio", tags=["portfolio"])

@router.get("/prices")
def get_live_prices(current_user: User = Depends(get_current_user)):
    """Returns mock real-time prices of trackable assets."""
    return get_current_prices()

@router.get("/holdings", response_model=PortfolioSummary)
def get_portfolio_holdings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Calculates active portfolio holdings with current market value and returns."""
    holdings = db.query(Holding).filter(Holding.user_id == current_user.id, Holding.quantity > 0).all()
    prices = get_current_prices()
    
    holdings_response = []
    total_cost = 0.0
    total_value = 0.0
    
    for h in holdings:
        # Get current price
        asset_info = prices.get(h.ticker.upper(), get_asset_info(h.ticker))
        current_price = asset_info["price"]
        
        current_val = h.quantity * current_price
        cost_basis = h.quantity * h.avg_price
        
        total_cost += cost_basis
        total_value += current_val
        
        return_val = current_val - cost_basis
        return_pct = (return_val / cost_basis * 100.0) if cost_basis > 0 else 0.0
        
        holdings_response.append(
            HoldingResponse(
                id=h.id,
                ticker=h.ticker,
                name=h.name,
                asset_type=h.asset_type,
                quantity=h.quantity,
                avg_price=h.avg_price,
                current_price=current_price,
                current_value=current_val,
                total_cost=cost_basis,
                return_val=return_val,
                return_percent=return_pct,
                updated_at=h.updated_at
            )
        )
        
    total_return = total_value - total_cost
    total_return_pct = (total_return / total_cost * 100.0) if total_cost > 0 else 0.0
    
    return PortfolioSummary(
        holdings=holdings_response,
        total_cost=total_cost,
        total_value=total_value,
        total_return=total_return,
        total_return_percent=total_return_pct
    )

@router.post("/transactions", response_model=TransactionResponse, status_code=status.HTTP_201_CREATED)
def add_transaction(
    tx_data: TransactionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Executes a BUY or SELL operation on an asset."""
    ticker_upper = tx_data.ticker.upper().strip()
    tx_type = tx_data.transaction_type.upper().strip()
    
    if tx_type not in ["BUY", "SELL"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Transaction type must be BUY or SELL"
        )
        
    # Get asset details (name, type)
    asset_info = get_asset_info(ticker_upper)
    
    # Query existing holding
    holding = db.query(Holding).filter(
        Holding.user_id == current_user.id,
        Holding.ticker == ticker_upper
    ).first()
    
    if tx_type == "BUY":
        if holding:
            # Recalculate average price and update quantity
            new_qty = holding.quantity + tx_data.quantity
            new_total_cost = (holding.quantity * holding.avg_price) + (tx_data.quantity * tx_data.price)
            holding.avg_price = new_total_cost / new_qty
            holding.quantity = new_qty
        else:
            # Create a new holding
            holding = Holding(
                user_id=current_user.id,
                ticker=ticker_upper,
                name=asset_info["name"],
                asset_type=asset_info["asset_type"],
                quantity=tx_data.quantity,
                avg_price=tx_data.price
            )
            db.add(holding)
            
    elif tx_type == "SELL":
        if not holding or holding.quantity < tx_data.quantity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Insufficient balance. You hold {holding.quantity if holding else 0} shares of {ticker_upper}."
            )
        
        # Deduct quantity
        holding.quantity -= tx_data.quantity
        if holding.quantity == 0:
            db.delete(holding)
            
    # Record transaction log
    transaction = Transaction(
        user_id=current_user.id,
        ticker=ticker_upper,
        transaction_type=tx_type,
        quantity=tx_data.quantity,
        price=tx_data.price
    )
    db.add(transaction)
    
    # Invalidate agent chat cache
    invalidate_user_cache(db, current_user.id)
    
    db.commit()
    db.refresh(transaction)
    return transaction

@router.get("/transactions", response_model=List[TransactionResponse])
def get_transaction_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retrieves list of all transactions executed by the current user."""
    return db.query(Transaction).filter(
        Transaction.user_id == current_user.id
    ).order_by(Transaction.timestamp.desc()).all()
