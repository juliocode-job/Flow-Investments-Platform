import random
from typing import Dict

# Initial asset prices
MOCK_ASSETS = {
    "AAPL": {"name": "Apple Inc.", "asset_type": "Stock", "price": 180.50},
    "TSLA": {"name": "Tesla Inc.", "asset_type": "Stock", "price": 220.30},
    "MSFT": {"name": "Microsoft Corp.", "asset_type": "Stock", "price": 415.20},
    "PETR4": {"name": "Petrobrás PN", "asset_type": "Stock", "price": 38.40},
    "VALE3": {"name": "Vale SA ON", "asset_type": "Stock", "price": 62.10},
    "IVVB11": {"name": "iShares S&P 500 Fundo de Índice", "asset_type": "ETF", "price": 285.60},
    "BOVA11": {"name": "iShares Ibovespa Fundo de Índice", "asset_type": "ETF", "price": 122.30},
    "BTC": {"name": "Bitcoin (Mock)", "asset_type": "Crypto", "price": 67200.00},
}

def get_current_prices() -> Dict[str, dict]:
    """
    Returns current prices and fluctuates them slightly by up to 0.2% 
    to simulate a real-time market stream.
    """
    for ticker, info in MOCK_ASSETS.items():
        change_pct = random.uniform(-0.002, 0.002)  # Max 0.2% change
        info["price"] = round(info["price"] * (1 + change_pct), 2)
    return MOCK_ASSETS

def get_asset_info(ticker: str) -> dict:
    """
    Returns default details of an asset. If not in mock list, returns a generic placeholder.
    """
    ticker_upper = ticker.upper().strip()
    prices = get_current_prices()
    if ticker_upper in prices:
        return prices[ticker_upper]
    return {
        "name": f"{ticker_upper} Asset",
        "asset_type": "Stock" if not ticker_upper.endswith("11") else "ETF",
        "price": 100.00
    }
