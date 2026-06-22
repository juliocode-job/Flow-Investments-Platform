# Flow Investment Platform 📈✨

Flow is a premium financial platform for real-time investment tracking, equipped with an autonomous **Flow Agent** (powered by LangGraph) embedded directly into a slide-out side panel.

The interface is custom-designed following modern **glassmorphism** concepts, featuring smooth animations, interactive asset allocation charts, and continuous streaming of simulated market price tickers via WebSockets.

---

## 🛠️ Technology Stack

### Backend
* **FastAPI:** High-performance asynchronous web framework.
* **LangGraph & LangChain:** Orchestration of the autonomous financial agent and its tools.
* **SQLAlchemy ORM:** Relational database integration supporting SQLite (for local development) and PostgreSQL (for production).
* **PyJWT & Passlib:** Secure password hashing and JWT-based authentication mechanisms.

### Frontend
* **React + Vite + TypeScript:** Modern, fast single-page application framework.
* **Recharts:** Clean, responsive donut charts for asset allocation.
* **Lucide React:** Beautiful, consistent icon pack.
* **Vanilla CSS:** Custom design system featuring glassmorphic effects, HSL colors, and micro-animations.

---

## 🚀 Local Development Quick Start

Ensure you have **Python (>= 3.10)** and **Node.js (>= 18)** installed on your machine.

### 1. Running the Backend (FastAPI)

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   # On Windows (PowerShell/CMD):
   venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Configure your environment variables in `.env` (copy from `.env.example` if available):
   ```env
   DATABASE_URL=sqlite:///./aura_finance.db
   JWT_SECRET=supersecretkeychangeinproduction1234567890
   ANTHROPIC_API_KEY=your-api-key-here
   # Optional Langfuse configurations:
   LANGFUSE_PUBLIC_KEY=your-public-key
   LANGFUSE_SECRET_KEY=your-secret-key
   LANGFUSE_HOST=https://cloud.langfuse.com
   ```
5. Start the server:
   ```bash
   uvicorn app.main:app --port 8000 --reload
   ```

The backend API will be available at `http://localhost:8000`.

---

### 2. Running the Frontend (React)

1. Navigate to the frontend directory:
   ```bash
   cd ../frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy the example env file and update it if needed:
   ```bash
   cp .env.example .env
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```

The frontend application will be running at `http://localhost:5173`.

---

## 🤖 Flow Agent & Observability

The embedded autonomous agent uses **LangGraph** to process complex investment queries and has access to several tools:
* **`get_portfolio`:** Retrieves the user's real-time holdings, current valuations, and returns.
* **`search_web`:** Executes queries via Tavily/DuckDuckGo for recent market trends and news.
* **`calculate_returns`:** Computes future compounded returns.

Observability is handled via **Langfuse v4**, capturing full tracing of the LangGraph execution steps, latencies, and tool calls, automatically grouped by user session.
