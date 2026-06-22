# Deployment Protocol: Flow Investments Platform 🚀

This guide describes the requirements, configurations, and recommended processes for deploying the **Flow Investments Platform** to production environments (specifically targeting Render deployment with free PostgreSQL).

---

## 📋 Production Requirements

Unlike the local SQLite environment, we recommend the following production infrastructure:

1. **Database**: Managed **PostgreSQL** instance for persistence and concurrent connections.
2. **Environment Variables**: Configure secrets for API keys and database connections.
3. **Observability**: A Langfuse account (v4 telemetry compatibility) to trace LangGraph agent calls.

---

## ☁️ Step-by-Step Render Deployment Guide

Follow these steps to deploy the application on **Render** utilizing their free tiers.

### Step 1: Create a PostgreSQL Database on Render
1. Go to the Render Dashboard and click **New** -> **PostgreSQL**.
2. Set a name (e.g., `flow-db`) and choose the **Free** tier.
3. Once provisioned, copy the **Internal Database URL** (for backend services within Render) or **External Database URL** (for remote management).

### Step 2: Deploy Backend as Web Service
1. In the Render Dashboard, click **New** -> **Web Service**.
2. Connect your GitHub repository.
3. Configure the following service settings:
   - **Name**: `flow-backend`
   - **Root Directory**: `backend`
   - **Runtime**: `Python 3.11`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Add the following **Environment Variables**:
   - `DATABASE_URL`: *[Your PostgreSQL Connection String]* (Render will automatically translate `postgres://` to `postgresql://` via our connection adapter).
   - `JWT_SECRET`: *[A long secure random string]*
   - `JWT_ALGORITHM`: `HS256`
   - `ACCESS_TOKEN_EXPIRE_MINUTES`: `600`
   - `ALLOWED_ORIGINS`: `https://your-frontend-domain.onrender.com` (Add this *after* deploying the frontend, or set to `*` initially).
   - `ANTHROPIC_API_KEY`: *[Your Claude API Key]*
   - `LANGFUSE_PUBLIC_KEY`: *[Optional]*
   - `LANGFUSE_SECRET_KEY`: *[Optional]*
   - `LANGFUSE_HOST`: `https://cloud.langfuse.com`

### Step 3: Deploy Frontend as Static Site
1. In the Render Dashboard, click **New** -> **Static Site**.
2. Connect your GitHub repository.
3. Configure the following settings:
   - **Name**: `flow-investments`
   - **Root Directory**: `frontend`
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`
4. Add the following **Environment Variable**:
   - `VITE_API_URL`: `https://flow-backend.onrender.com` *(Point this to your backend Web Service URL)*.
5. In the Static Site settings, navigate to **Redirects/Rewrites** and add:
   - **Source**: `/*`
   - **Destination**: `/index.html`
   - **Action**: `Rewrite` (This ensures React Router works correctly on direct link accesses).

---

## 🐳 Alternative Deployment: Containerization (Docker)

If you prefer containerized self-hosting (e.g., AWS, DigitalOcean, VPS), you can use Docker.

### 1. Dockerfile (Backend)
Create a file at `backend/Dockerfile`:
```dockerfile
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### 2. Dockerfile (Frontend)
Create a file at `frontend/Dockerfile`:
```dockerfile
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

*Note: Ensure your `nginx.conf` has fallback routing set up:*
```nginx
server {
    listen 80;
    location / {
        root /usr/share/nginx/html;
        index index.html index.htm;
        try_files $uri $uri/ /index.html;
    }
}
```

### 3. Docker Compose (`docker-compose.yml`)
At the workspace root:
```yaml
version: '3.8'

services:
  db:
    image: postgres:15-alpine
    container_name: flow-db
    restart: always
    environment:
      POSTGRES_USER: flow_user
      POSTGRES_PASSWORD: secure_password
      POSTGRES_DB: flow_finance
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  backend:
    build: ./backend
    container_name: flow-backend
    restart: always
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://flow_user:secure_password@db:5432/flow_finance
      - JWT_SECRET=strong_jwt_secret_key
      - JWT_ALGORITHM=HS256
      - ANTHROPIC_API_KEY=your_key
    depends_on:
      - db

  frontend:
    build: ./frontend
    container_name: flow-frontend
    restart: always
    ports:
      - "80:80"
    depends_on:
      - backend

volumes:
  pgdata:
```
To run: `docker-compose up -d --build`
