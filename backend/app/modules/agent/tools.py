from langchain_core.tools import tool
from langchain_core.runnables import RunnableConfig
from sqlalchemy.orm import Session
from app.database import SessionLocal, Holding, Transaction
from app.modules.portfolio.prices import get_current_prices, get_asset_info
import requests
import json
import urllib.parse

@tool
def get_portfolio(config: RunnableConfig) -> str:
    """
    Retrieves the current portfolio holdings of the user, including asset quantity,
    average purchase price, current market price, and overall returns.
    Use this to answer any questions about what investments the user currently owns.
    """
    user_id = config.get("configurable", {}).get("user_id")
    if not user_id:
        return "Error: User session not found. Please log in."
        
    db: Session = SessionLocal()
    try:
        holdings = db.query(Holding).filter(Holding.user_id == user_id, Holding.quantity > 0).all()
        if not holdings:
            return "Your portfolio is currently empty. You don't hold any stocks, ETFs or assets yet."
            
        prices = get_current_prices()
        lines = ["Here are your current portfolio holdings:"]
        total_cost = 0.0
        total_value = 0.0
        
        for h in holdings:
            asset_info = prices.get(h.ticker.upper(), get_asset_info(h.ticker))
            current_price = asset_info["price"]
            current_val = h.quantity * current_price
            cost_basis = h.quantity * h.avg_price
            
            total_cost += cost_basis
            total_value += current_val
            
            return_val = current_val - cost_basis
            return_pct = (return_val / cost_basis * 100.0) if cost_basis > 0 else 0.0
            
            lines.append(
                f"- **{h.ticker}** ({h.name} - {h.asset_type}): "
                f"Qty: {h.quantity:.2f} | "
                f"Avg Price: ${h.avg_price:.2f} | "
                f"Current Price: ${current_price:.2f} | "
                f"Value: ${current_val:.2f} | "
                f"Return: ${return_val:+.2f} ({return_pct:+.2f}%)"
            )
            
        total_return = total_value - total_cost
        total_return_pct = (total_return / total_cost * 100.0) if total_cost > 0 else 0.0
        
        lines.append(f"\n**Portfolio Summary:**")
        lines.append(f"- Total Invested (Cost Basis): ${total_cost:.2f}")
        lines.append(f"- Current Portfolio Value: ${total_value:.2f}")
        lines.append(f"- Total Returns: ${total_return:+.2f} ({total_return_pct:+.2f}%)")
        
        return "\n".join(lines)
    except Exception as e:
        return f"Error retrieving portfolio: {str(e)}"
    finally:
        db.close()

@tool
def search_web(query: str) -> str:
    """
    Searches the web for recent stock market news, financial updates, and asset info.
    Use this to get real-time external data on market conditions and company info.
    """
    # DuckDuckGo HTML search fallback or mock
    query_encoded = urllib.parse.quote_plus(query)
    url = f"https://html.duckduckgo.com/html/?q={query_encoded}"
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    try:
        response = requests.get(url, headers=headers, timeout=5)
        if response.status_code == 200 and "web-result" in response.text:
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(response.text, "html.parser")
            results = []
            for i, result in enumerate(soup.find_all("div", class_="result")):
                if i >= 4:
                    break
                title_elem = result.find("a", class_="result__url")
                snippet_elem = result.find("a", class_="result__snippet")
                if title_elem and snippet_elem:
                    title = title_elem.get_text(strip=True)
                    snippet = snippet_elem.get_text(strip=True)
                    results.append(f"Title: {title}\nSnippet: {snippet}\n")
            if results:
                return "\n".join(results)
    except Exception:
        pass
        
    # Standard high-quality mock data if network query fails/throttles
    mock_responses = {
        "AAPL": "Apple (AAPL) trades near $180. The company announced integration of local AI processing capabilities in its next-generation OS. Analysts maintain a buy rating, noting strong services segment growth but highlighting slight declines in hardware sales in China.",
        "TSLA": "Tesla (TSLA) stock holds around $220. Recent discussions focus on Full Self-Driving (FSD) beta rollouts in Europe and China, alongside production rate updates from Gigafactory Shanghai. Operating margins remain a key metric watched by investors.",
        "PETR4": "Petrobras (PETR4) updates show stable oil extraction rates at the pre-salt layer. Market discussions revolve around dividends policy and capital expenditure plans for deepwater oil fields development.",
        "IVVB11": "IVVB11 ETF (replicating the S&P 500 in Brazilian Reais) trades up, reflecting tech-led gains in US markets. Strong earnings from major tech names continue to support S&P 500 performance.",
        "BOVA11": "BOVA11 ETF (tracking the Ibovespa index) consolidates at 122 BRL. Domestic fiscal discussions and commodities prices (oil and iron ore) continue to dictate index performance.",
    }
    
    query_upper = query.upper()
    for key, text in mock_responses.items():
        if key in query_upper:
            return f"[Simulated Web Search Results for '{query}']:\n{text}"
            
    return (
        f"[Simulated Search Results for '{query}']:\n"
        "Markets are experiencing mild volatility today as investors digest recent central bank commentary on inflation and interest rates. "
        "Tech stocks show moderate strength, while traditional sectors like energy and consumer staples remain stable."
    )

@tool
def calculate_returns(principal: float, annual_rate: float, years: int, monthly_contribution: float = 0.0) -> str:
    """
    Calculates future compound interest projections given a principal investment, 
    an annual interest rate (in percent, e.g. 10.0 for 10%), number of years, and optional monthly additions.
    Useful to show portfolio projections to the user.
    """
    rate_decimal = annual_rate / 100.0
    monthly_rate = rate_decimal / 12.0
    months = years * 12
    
    total = principal
    total_invested = principal
    
    for _ in range(months):
        total = total * (1 + monthly_rate) + monthly_contribution
        total_invested += monthly_contribution
        
    total_returns = total - total_invested
    
    return json.dumps({
        "total_value": round(total, 2),
        "total_invested": round(total_invested, 2),
        "total_returns": round(total_returns, 2),
        "yield_percent": round((total_returns / total_invested * 100), 2) if total_invested > 0 else 0
    })
