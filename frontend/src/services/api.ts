import axios from 'axios';

const API_BASE = (import.meta.env.VITE_API_URL as string) || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Automatically inject JWT token from localStorage
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('flow_token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

export default api;

export interface AssetPrice {
  name: string;
  asset_type: string;
  price: number;
}

export interface Holding {
  id: number;
  ticker: string;
  name: string;
  asset_type: string;
  quantity: number;
  avg_price: number;
  current_price: number;
  current_value: number;
  total_cost: number;
  return_val: number;
  return_percent: number;
  updated_at: string;
}

export interface PortfolioSummary {
  holdings: Holding[];
  total_cost: number;
  total_value: number;
  total_return: number;
  total_return_percent: number;
}

export interface Transaction {
  id: number;
  ticker: string;
  transaction_type: string;
  quantity: number;
  price: number;
  timestamp: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
