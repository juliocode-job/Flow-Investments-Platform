from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

class TransactionCreate(BaseModel):
    ticker: str = Field(..., description="Ticker symbol of the asset, e.g., AAPL")
    transaction_type: str = Field(..., description="BUY or SELL")
    quantity: float = Field(..., gt=0, description="Quantity of shares")
    price: float = Field(..., gt=0, description="Price per share")

class TransactionResponse(BaseModel):
    id: int
    ticker: str
    transaction_type: str
    quantity: float
    price: float
    timestamp: datetime

    class Config:
        from_attributes = True

class HoldingResponse(BaseModel):
    id: int
    ticker: str
    name: str
    asset_type: str
    quantity: float
    avg_price: float
    current_price: float
    current_value: float
    total_cost: float
    return_val: float
    return_percent: float
    updated_at: datetime

    class Config:
        from_attributes = True

class PortfolioSummary(BaseModel):
    holdings: List[HoldingResponse]
    total_cost: float
    total_value: float
    total_return: float
    total_return_percent: float
