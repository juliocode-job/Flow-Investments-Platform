import React, { useState, useEffect } from 'react';
import api from '../services/api';
import type { PortfolioSummary, Transaction, AssetPrice } from '../services/api';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { 
  TrendingUp, TrendingDown, Briefcase, Plus, Minus, 
  History, LogOut, RefreshCw, Layers, ArrowUpRight, ArrowDownRight 
} from 'lucide-react';

interface DashboardProps {
  email: string;
  onLogout: () => void;
  onPortfolioUpdate: () => void; // Trigger callback to notify the agent
}

export const Dashboard: React.FC<DashboardProps> = ({ email, onLogout, onPortfolioUpdate }) => {
  const [summary, setSummary] = useState<PortfolioSummary>({
    holdings: [],
    total_cost: 0.0,
    total_value: 0.0,
    total_return: 0.0,
    total_return_percent: 0.0,
  });
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [livePrices, setLivePrices] = useState<Record<string, AssetPrice>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Form states
  const [ticker, setTicker] = useState('AAPL');
  const [txType, setTxType] = useState<'BUY' | 'SELL'>('BUY');
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [txError, setTxError] = useState('');
  const [txSuccess, setTxSuccess] = useState(false);

  const COLORS = [
    'rgba(96, 165, 250, 0.8)',   // blue
    'rgba(52, 211, 153, 0.8)',   // emerald
    'rgba(167, 139, 250, 0.8)',  // purple
    'rgba(251, 113, 133, 0.8)',  // rose
    'rgba(251, 191, 36, 0.8)',   // amber
    'rgba(34, 211, 238, 0.8)',   // cyan
    'rgba(244, 114, 182, 0.8)',  // pink
  ];

  // Fetch portfolio summary and transaction logs
  const fetchData = async () => {
    try {
      const summaryRes = await api.get('/portfolio/holdings');
      setSummary(summaryRes.data);
      
      const txRes = await api.get('/portfolio/transactions');
      setTransactions(txRes.data.slice(0, 10)); // Top 10 recent
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    }
  };

  const loadAll = async () => {
    setLoading(true);
    await fetchData();
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, []);

  // Set up WebSocket for real-time price feed
  useEffect(() => {
    const apiBase = (import.meta.env.VITE_API_URL as string) || 'http://localhost:8000';
    const wsBase = apiBase.replace(/^https/, 'wss').replace(/^http/, 'ws');
    const ws = new WebSocket(`${wsBase}/portfolio/prices/ws`);
    
    ws.onmessage = (event) => {
      try {
        const prices = JSON.parse(event.data);
        setLivePrices(prices);
      } catch (err) {
        console.error('WS parsing error:', err);
      }
    };

    ws.onerror = (err) => {
      console.error('WebSocket Error:', err);
    };

    return () => {
      ws.close();
    };
  }, []);

  // Update transaction price input helper when ticker changes
  useEffect(() => {
    if (livePrices[ticker]) {
      setPrice(livePrices[ticker].price.toString());
    }
  }, [ticker, livePrices]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const handleTransactionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTxError('');
    setTxSuccess(false);

    const parsedQty = parseFloat(qty);
    const parsedPrice = parseFloat(price);

    if (isNaN(parsedQty) || parsedQty <= 0) {
      setTxError('Quantity must be greater than 0.');
      return;
    }
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      setTxError('Price must be greater than 0.');
      return;
    }

    try {
      await api.post('/portfolio/transactions', {
        ticker: ticker.toUpperCase(),
        transaction_type: txType,
        quantity: parsedQty,
        price: parsedPrice,
      });

      setTxSuccess(true);
      setQty('');
      await fetchData();
      onPortfolioUpdate(); // Notify parent so the agent can react!
      
      setTimeout(() => setTxSuccess(false), 3000);
    } catch (err: any) {
      setTxError(err.response?.data?.detail || 'Error processing transaction.');
    }
  };

  // Prepare chart data
  const chartData = summary.holdings
    .filter(h => h.quantity > 0)
    .map(h => ({
      name: h.ticker,
      value: Math.round(h.current_value)
    }));

  return (
    <div style={styles.container}>
      {/* Real-time Ticker Ribbon at the Top */}
      <div className="eink-card" style={styles.tickerRibbon}>
        <div style={styles.tickerTrack}>
          {Object.entries(livePrices).map(([symbol, info]) => (
            <div key={symbol} style={styles.tickerItem} className="font-mono">
              <span style={styles.tickerSymbol}>{symbol}</span>
              <span className="floating-active-data" style={{ fontSize: '0.8rem', padding: '2px 6px', transform: 'translateY(-1px)' }}>
                ${info.price.toFixed(2)}
              </span>
            </div>
          ))}
          {/* Duplicate list for infinite scroll animation */}
          {Object.entries(livePrices).map(([symbol, info]) => (
            <div key={`${symbol}-dup`} style={styles.tickerItem} className="font-mono">
              <span style={styles.tickerSymbol}>{symbol}</span>
              <span className="floating-active-data" style={{ fontSize: '0.8rem', padding: '2px 6px', transform: 'translateY(-1px)' }}>
                ${info.price.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Main Grid */}
      <div style={styles.mainGrid}>
        
        {/* Left Side: Summary Cards & Tables */}
        <div style={styles.leftColumn}>
          
          {/* Header Row */}
          <div style={styles.headerRow}>
            <div>
              <h2 style={{ fontSize: '1.75rem', fontWeight: '800' }}>Investment Dashboard</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Hello, {email}</p>
            </div>
            <div style={styles.actionButtons}>
              <button 
                onClick={handleRefresh} 
                disabled={refreshing} 
                style={styles.refreshBtn}
                title="Sync Portfolio"
              >
                <RefreshCw size={16} className={refreshing ? 'loading' : ''} />
              </button>
              <button onClick={onLogout} style={styles.logoutBtn}>
                <LogOut size={16} style={{ marginRight: 6 }} /> Sign Out
              </button>
            </div>
          </div>

          {loading ? (
            <div style={styles.loaderContainer}>
              <p style={{ color: 'var(--text-secondary)' }}>Loading your portfolio data...</p>
            </div>
          ) : (
            <>
              {/* Financial Metrics Cards */}
              <div style={styles.metricsRow}>
                <div className="eink-card" style={styles.metricCard}>
                  <div style={styles.cardHeader}>
                    <span style={styles.cardTitle}>Market Value</span>
                    <Briefcase size={20} color="var(--text-primary)" />
                  </div>
                  <div className="font-mono" style={styles.cardVal}>${summary.total_value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  <div style={styles.cardFoot}>
                    Total Cost: <span className="font-mono">${summary.total_cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </div>

                <div className="eink-card" style={styles.metricCard}>
                  <div style={styles.cardHeader}>
                    <span style={styles.cardTitle}>Total Return</span>
                    {summary.total_return >= 0 ? (
                      <TrendingUp size={20} color="var(--success)" />
                    ) : (
                      <TrendingDown size={20} color="var(--danger)" />
                    )}
                  </div>
                  <div className="font-mono" style={{
                    ...styles.cardVal,
                    color: summary.total_return >= 0 ? 'var(--success)' : 'var(--danger)',
                    display: 'inline-flex',
                    marginTop: '4px',
                    marginBottom: '4px',
                  }}>
                    <span className="floating-active-data" style={{
                      color: summary.total_return >= 0 ? 'var(--success)' : 'var(--danger)',
                      fontSize: '1.7rem',
                      fontWeight: '800',
                      padding: '4px 12px',
                    }}>
                      {summary.total_return >= 0 ? '+' : ''}${summary.total_return.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div style={{
                    ...styles.cardFoot,
                    color: summary.total_return >= 0 ? 'var(--success)' : 'var(--danger)'
                  }}>
                    {summary.total_return >= 0 ? <ArrowUpRight size={14} style={{ display: 'inline', marginRight: 4 }} /> : <ArrowDownRight size={14} style={{ display: 'inline', marginRight: 4 }} />}
                    <span className="font-mono">{summary.total_return_percent.toFixed(2)}%</span> accumulated return
                  </div>
                </div>
              </div>

              {/* Active Holdings Table */}
              <div className="eink-card" style={styles.tableCard}>
                <h3 style={styles.tableCardTitle}>
                  <Layers size={18} color="var(--text-primary)" style={{ marginRight: 8 }} />
                  My Assets
                </h3>
                <div style={styles.tableWrapper}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Asset</th>
                        <th style={styles.th}>Qty</th>
                        <th style={styles.th}>Avg Price</th>
                        <th style={styles.th}>Current Price</th>
                        <th style={styles.th}>Total Cost</th>
                        <th style={styles.th}>Current Value</th>
                        <th style={styles.th}>Return</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.holdings.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={styles.noData}>Your portfolio is empty. Add a transaction to get started.</td>
                        </tr>
                      ) : (
                        summary.holdings.map((holding) => (
                          <tr key={holding.id} style={styles.tr}>
                            <td style={styles.td}>
                              <div style={styles.tdTicker}>{holding.ticker}</div>
                              <div style={styles.tdName}>{holding.name}</div>
                            </td>
                            <td style={styles.td} className="font-mono">{holding.quantity}</td>
                            <td style={styles.td} className="font-mono">${holding.avg_price.toFixed(2)}</td>
                            <td style={styles.td} className="font-mono">
                              <span className="floating-active-data">
                                ${(livePrices[holding.ticker]?.price ?? holding.current_price).toFixed(2)}
                              </span>
                            </td>
                            <td style={styles.td} className="font-mono">${holding.total_cost.toFixed(2)}</td>
                            <td style={styles.td} className="font-mono">
                              <span className="floating-active-data">
                                ${(holding.quantity * (livePrices[holding.ticker]?.price ?? holding.current_price)).toFixed(2)}
                              </span>
                            </td>
                            <td className="font-mono" style={{
                              ...styles.td,
                              fontWeight: '600'
                            }}>
                              <span className="floating-active-data" style={{ color: holding.return_val >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                                {holding.return_val >= 0 ? '+' : ''}{holding.return_percent.toFixed(2)}%
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Recent Transaction History */}
              <div className="eink-card" style={styles.tableCard}>
                <h3 style={styles.tableCardTitle}>
                  <History size={18} color="var(--text-primary)" style={{ marginRight: 8 }} />
                  Recent Order History
                </h3>
                <div style={styles.tableWrapper}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Asset</th>
                        <th style={styles.th}>Type</th>
                        <th style={styles.th}>Quantity</th>
                        <th style={styles.th}>Unit Price</th>
                        <th style={styles.th}>Total Value</th>
                        <th style={styles.th}>Date/Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={styles.noData}>No orders placed yet.</td>
                        </tr>
                      ) : (
                        transactions.map((tx) => (
                          <tr key={tx.id} style={styles.tr}>
                            <td style={{ ...styles.td, fontWeight: '700' }}>{tx.ticker}</td>
                            <td style={styles.td}>
                              <span style={{
                                ...styles.badge,
                                background: tx.transaction_type === 'BUY' ? 'var(--success-bg)' : 'var(--danger-bg)',
                                color: tx.transaction_type === 'BUY' ? 'var(--success)' : 'var(--danger)',
                                border: `1px solid ${tx.transaction_type === 'BUY' ? 'var(--success)' : 'var(--danger)'}`,
                                borderRadius: '2px'
                              }}>
                                {tx.transaction_type === 'BUY' ? 'BUY' : 'SELL'}
                              </span>
                            </td>
                            <td style={styles.td} className="font-mono">{tx.quantity}</td>
                            <td style={styles.td} className="font-mono">${tx.price.toFixed(2)}</td>
                            <td style={styles.td} className="font-mono">${(tx.quantity * tx.price).toFixed(2)}</td>
                            <td style={styles.td} className="font-mono">{new Date(tx.timestamp).toLocaleString()}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Right Side: Charts & Order Form */}
        <div style={styles.rightColumn}>
          
          {/* Asset Allocation Chart Card */}
        <div className="eink-card" style={styles.chartCard}>
          <h3 style={styles.cardHeaderTitle}>Asset Allocation</h3>
          {chartData.length === 0 ? (
            <div style={styles.noChartData}>Not enough assets to generate chart.</div>
          ) : (
            <div style={{ height: 220, position: 'relative' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="var(--bg-white)"
                    strokeWidth={2}
                  >
                    {chartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      background: 'var(--bg-white)', 
                      border: '1px solid var(--border-dark)',
                      borderRadius: 0,
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font-mono)'
                    }} 
                  />
                </PieChart>
              </ResponsiveContainer>
              {/* Center Text inside Donut */}
              <div style={styles.chartCenterText}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Total</div>
                <div className="font-mono" style={{ fontSize: '1.1rem', fontWeight: '800' }}>
                  ${summary.total_value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
              </div>
            </div>
          )}
            <div style={styles.chartLegend}>
              {chartData.map((entry, idx) => (
                <div key={entry.name} style={styles.legendItem}>
                  <span style={{ ...styles.legendDot, backgroundColor: COLORS[idx % COLORS.length] }}></span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {entry.name} ({((entry.value / summary.total_value) * 100).toFixed(0)}%)
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* New Transaction / Order Form Card */}
          <div className="eink-card" style={styles.formCard}>
          <h3 style={styles.cardHeaderTitle}>Execute Order</h3>
          <p style={styles.formCardSub}>Record your asset buys and sells</p>
          
          <form onSubmit={handleTransactionSubmit} style={styles.orderForm}>
            {txError && <div style={styles.orderError}>{txError}</div>}
            {txSuccess && <div style={styles.orderSuccess}>Order executed successfully!</div>}

            {/* Type Switcher */}
            <div style={styles.orderTypeRow}>
              <button
                type="button"
                onClick={() => setTxType('BUY')}
                style={{
                  ...styles.typeBtn,
                  background: txType === 'BUY' ? 'rgba(52, 211, 153, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                  border: txType === 'BUY' ? '1px solid var(--success)' : '1px solid var(--border-dark)',
                  boxShadow: txType === 'BUY' ? '0 4px 12px rgba(52, 211, 153, 0.15)' : 'none',
                  color: txType === 'BUY' ? '#ffffff' : 'var(--text-secondary)'
                }}
              >
                <Plus size={16} style={{ marginRight: 4 }} /> BUY
              </button>
              <button
                type="button"
                onClick={() => setTxType('SELL')}
                style={{
                  ...styles.typeBtn,
                  background: txType === 'SELL' ? 'rgba(248, 113, 113, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                  border: txType === 'SELL' ? '1px solid var(--danger)' : '1px solid var(--border-dark)',
                  boxShadow: txType === 'SELL' ? '0 4px 12px rgba(248, 113, 113, 0.15)' : 'none',
                  color: txType === 'SELL' ? '#ffffff' : 'var(--text-secondary)'
                }}
              >
                <Minus size={16} style={{ marginRight: 4 }} /> SELL
              </button>
            </div>

            {/* Form Input fields */}
            <div style={styles.formGroup}>
              <label style={styles.inputLabel}>Asset Ticker</label>
              <select
                value={ticker}
                className="eink-input"
                onChange={(e) => setTicker(e.target.value)}
                style={{ width: '100%' }}
              >
                <option value="AAPL">AAPL (Apple)</option>
                <option value="TSLA">TSLA (Tesla)</option>
                <option value="MSFT">MSFT (Microsoft)</option>
                <option value="PETR4">PETR4 (Petrobras)</option>
                <option value="VALE3">VALE3 (Vale)</option>
                <option value="IVVB11">IVVB11 (S&P 500 ETF)</option>
                <option value="BOVA11">BOVA11 (Ibovespa ETF)</option>
                <option value="BTC">BTC (Bitcoin)</option>
              </select>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.inputLabel}>Quantity</label>
              <input
                type="number"
                className="eink-input"
                step="any"
                placeholder="0.00"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                required
                style={{ width: '100%' }}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.inputLabel}>Unit Price (USD / BRL)</label>
              <input
                type="number"
                className="eink-input"
                step="any"
                placeholder="0.00"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
                style={{ width: '100%' }}
              />
            </div>

            <button
              type="submit"
              className={txType === 'BUY' ? "eink-btn success" : "eink-btn danger"}
              style={styles.orderSubmitBtn}
            >
              Submit {txType === 'BUY' ? 'Buy' : 'Sell'} Order
            </button>
          </form>
        </div>

        </div>

      </div>
    </div>
  );
};

const styles = {
  container: {
    padding: '30px',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    minHeight: '100vh',
    width: '100%',
    paddingBottom: '80px', // spacing for floating agent bubble
  } as React.CSSProperties,
  tickerRibbon: {
    padding: '10px 0',
    overflow: 'hidden',
    position: 'relative',
    whiteSpace: 'nowrap',
    borderRadius: '12px',
    border: '1px solid var(--border-dark)',
    background: 'var(--bg-white)',
  } as React.CSSProperties,
  tickerTrack: {
    display: 'inline-flex',
    animation: 'slideInRight 15s linear infinite', // simplified infinite scroll
    gap: '30px',
    paddingLeft: '20px',
  } as React.CSSProperties,
  tickerItem: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '0.85rem',
  } as React.CSSProperties,
  tickerSymbol: {
    fontWeight: '700',
    color: 'var(--text-primary)',
  } as React.CSSProperties,
  tickerPrice: {
    fontWeight: '500',
    color: 'var(--text-primary)',
  } as React.CSSProperties,
  mainGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 340px',
    gap: '30px',
    alignItems: 'flex-start',
  } as React.CSSProperties,
  leftColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  } as React.CSSProperties,
  rightColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  } as React.CSSProperties,
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  } as React.CSSProperties,
  actionButtons: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  } as React.CSSProperties,
  refreshBtn: {
    background: 'var(--bg-white)',
    border: '1px solid var(--border-dark)',
    color: 'var(--text-primary)',
    width: '38px',
    height: '38px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'var(--transition-smooth)',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
  } as React.CSSProperties,
  logoutBtn: {
    background: 'rgba(248, 113, 113, 0.05)',
    border: '1px solid var(--danger)',
    color: 'var(--danger)',
    padding: '8px 16px',
    fontSize: '0.85rem',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'var(--transition-smooth)',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
  } as React.CSSProperties,
  loaderContainer: {
    padding: '60px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  } as React.CSSProperties,
  metricsRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '20px',
  } as React.CSSProperties,
  metricCard: {
    padding: '24px',
    borderRadius: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  } as React.CSSProperties,
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  } as React.CSSProperties,
  cardTitle: {
    fontSize: '0.85rem',
    color: 'var(--text-secondary)',
    fontWeight: '500',
  } as React.CSSProperties,
  cardVal: {
    fontSize: '1.85rem',
    fontWeight: '800',
    color: 'var(--text-primary)',
  } as React.CSSProperties,
  cardFoot: {
    fontSize: '0.75rem',
    color: 'var(--text-muted)',
    fontWeight: '500',
  } as React.CSSProperties,
  tableCard: {
    borderRadius: '12px',
    padding: '24px',
  } as React.CSSProperties,
  tableCardTitle: {
    fontSize: '1.05rem',
    fontWeight: '800',
    display: 'flex',
    alignItems: 'center',
    marginBottom: '16px',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-heading)',
  } as React.CSSProperties,
  tableWrapper: {
    width: '100%',
    overflowX: 'auto',
  } as React.CSSProperties,
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    textAlign: 'left',
    fontSize: '0.85rem',
  } as React.CSSProperties,
  th: {
    padding: '12px 16px',
    color: 'var(--text-secondary)',
    borderBottom: '1px solid var(--border-dark)',
    fontWeight: '700',
    fontFamily: 'var(--font-body)',
  } as React.CSSProperties,
  tr: {
    borderBottom: '1px solid var(--border-light)',
    transition: 'var(--transition-smooth)',
    '&:hover': {
      backgroundColor: 'var(--bg-tinted)',
    }
  } as React.CSSProperties,
  td: {
    padding: '14px 16px',
    color: 'var(--text-secondary)',
  } as React.CSSProperties,
  tdTicker: {
    fontWeight: '800',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-heading)',
  } as React.CSSProperties,
  tdName: {
    fontSize: '0.75rem',
    color: 'var(--text-muted)',
    marginTop: '2px',
  } as React.CSSProperties,
  noData: {
    padding: '30px',
    textAlign: 'center',
    color: 'var(--text-muted)',
  } as React.CSSProperties,
  badge: {
    fontSize: '0.7rem',
    padding: '2px 8px',
    borderRadius: '4px',
    fontWeight: '700',
  } as React.CSSProperties,
  chartCard: {
    padding: '24px',
    borderRadius: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  } as React.CSSProperties,
  cardHeaderTitle: {
    fontSize: '1rem',
    fontWeight: '800',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-heading)',
  } as React.CSSProperties,
  noChartData: {
    height: '180px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.85rem',
    color: 'var(--text-muted)',
    border: '1px dashed var(--border-dark)',
    borderRadius: '12px',
  } as React.CSSProperties,
  chartCenterText: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    textAlign: 'center',
    pointerEvents: 'none',
  } as React.CSSProperties,
  chartLegend: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px 16px',
    marginTop: '10px',
  } as React.CSSProperties,
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  } as React.CSSProperties,
  legendDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
  } as React.CSSProperties,
  formCard: {
    padding: '24px',
    borderRadius: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  } as React.CSSProperties,
  formCardSub: {
    fontSize: '0.8rem',
    color: 'var(--text-secondary)',
    marginBottom: '10px',
  } as React.CSSProperties,
  orderForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  } as React.CSSProperties,
  orderError: {
    background: 'var(--danger-bg)',
    border: '1px solid var(--danger)',
    color: 'var(--danger)',
    padding: '10px',
    borderRadius: '8px',
    fontSize: '0.8rem',
    textAlign: 'center',
  } as React.CSSProperties,
  orderSuccess: {
    background: 'var(--success-bg)',
    border: '1px solid var(--success)',
    color: 'var(--success)',
    padding: '10px',
    borderRadius: '8px',
    fontSize: '0.8rem',
    textAlign: 'center',
  } as React.CSSProperties,
  orderTypeRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px',
  } as React.CSSProperties,
  typeBtn: {
    padding: '10px 0',
    fontSize: '0.85rem',
    fontWeight: '700',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid var(--border-dark)',
    transition: 'var(--transition-smooth)',
    cursor: 'pointer',
  } as React.CSSProperties,
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  } as React.CSSProperties,
  inputLabel: {
    fontSize: '0.78rem',
    color: 'var(--text-secondary)',
    fontWeight: '500',
  } as React.CSSProperties,
  orderSubmitBtn: {
    marginTop: '6px',
    width: '100%',
  } as React.CSSProperties,
};
