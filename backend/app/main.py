import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import json

from .database import engine, Base
from .modules.auth.router import router as auth_router
from .modules.portfolio.router import router as portfolio_router
from .modules.portfolio.prices import get_current_prices
from .modules.agent.router import router as agent_router

from .config import settings

# Initialize Database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Flow Investment API",
    description="Backend for Flow Investment Tracking and AI Embedded Agent.",
    version="1.0.0"
)

# CORS configuration
origins = [o.strip() for o in settings.ALLOWED_ORIGINS.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include modules
app.include_router(auth_router)
app.include_router(portfolio_router)
app.include_router(agent_router)

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/")
def read_root():
    return {"message": "Flow Investment API is running."}

@app.websocket("/portfolio/prices/ws")
async def websocket_prices(websocket: WebSocket):
    """
    WebSocket channel to stream real-time price updates for active trackers.
    """
    await websocket.accept()
    try:
        while True:
            # Get updated simulated prices
            prices_data = get_current_prices()
            # Send to client
            await websocket.send_text(json.dumps(prices_data))
            # Wait 2 seconds before the next tick
            await asyncio.sleep(2)
    except WebSocketDisconnect:
        pass
    except Exception:
        await websocket.close()
