import React, { useState, useRef, useEffect } from 'react';
import api from '../services/api';
import type { ChatMessage } from '../services/api';
import { Send, Sparkles, X, Plus, Clock, Trash2, ArrowLeft } from 'lucide-react';

interface AgentPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  refreshPortfolioTrigger: number; // A way to notify the agent or refresh
}

interface ChatSession {
  id: number;
  title: string;
  created_at: string;
}

export const AgentPanel: React.FC<AgentPanelProps> = ({ isOpen, onToggle, refreshPortfolioTrigger }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: 'Hi! I am Flow Agent. I can check your investment portfolio in real-time, search for market news, and run simulations. How can I help you?'
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // Fetch sessions when panel is opened
  useEffect(() => {
    if (isOpen) {
      fetchSessions();
    }
  }, [isOpen]);

  // When portfolio updates, agent can hint it
  useEffect(() => {
    if (refreshPortfolioTrigger > 0 && messages.length > 1) {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: '🔄 I detected updates to your investment portfolio! If you need an updated analysis of your balance or allocation, just ask me.'
        }
      ]);
    }
  }, [refreshPortfolioTrigger]);

  const fetchSessions = async () => {
    try {
      const response = await api.get('/agent/sessions');
      setSessions(response.data);
    } catch (err) {
      console.error('Error fetching chat sessions:', err);
    }
  };

  const loadSession = async (sessionId: number) => {
    setLoading(true);
    try {
      const response = await api.get(`/agent/sessions/${sessionId}/messages`);
      setMessages(response.data);
      setActiveSessionId(sessionId);
      setShowHistory(false);
    } catch (err) {
      console.error('Error loading session messages:', err);
    } finally {
      setLoading(false);
    }
  };

  const deleteSession = async (sessionId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this conversation?')) return;
    
    try {
      await api.delete(`/agent/sessions/${sessionId}`);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (activeSessionId === sessionId) {
        handleNewChat();
      }
    } catch (err) {
      console.error('Error deleting session:', err);
    }
  };

  const handleNewChat = () => {
    setMessages([
      {
        role: 'assistant',
        content: 'Hi! I am Flow Agent. I can check your investment portfolio in real-time, search for market news, and run simulations. How can I help you?'
      }
    ]);
    setActiveSessionId(null);
    setShowHistory(false);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      // Send message history along with active session_id
      const response = await api.post('/agent/chat', {
        messages: [...messages, { role: 'user', content: userMessage }],
        session_id: activeSessionId
      });
      
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: response.data.response }
      ]);

      if (!activeSessionId) {
        setActiveSessionId(response.data.session_id);
        fetchSessions();
      }
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, an error occurred while processing your request on the Flow Agent server. Make sure the backend is online and configured.'
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const renderFormattedContent = (content: string) => {
    if (!content) return null;
    const lines = content.split('\n');
    return lines.map((line, lineIdx) => {
      const parts = line.split('**');
      const formattedLine = parts.map((part, index) => {
        if (index % 2 === 1) {
          return <strong key={index}>{part}</strong>;
        }
        return part;
      });
      return (
        <div key={lineIdx} style={{ minHeight: line.trim() === '' ? '10px' : 'auto' }}>
          {formattedLine}
        </div>
      );
    });
  };

  return (
    <>
      {/* Floating Toggle Button when closed */}
      {!isOpen && (
        <button 
          onClick={onToggle} 
          style={styles.floatingToggle}
          title="Open Flow Assistant"
        >
          <Sparkles size={20} color="rgba(255, 255, 255, 0.95)" style={{ marginRight: 6 }} />
          <span style={{ fontSize: '0.85rem', fontWeight: '700', color: 'rgba(255, 255, 255, 0.95)' }}>Flow AI</span>
        </button>
      )}

      {/* Sliding Sidebar Panel */}
      <div 
        className="eink-card" 
        style={{
          ...styles.panel,
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          opacity: isOpen ? 1 : 0,
        }}
      >
        {/* Panel Header */}
        <div style={styles.header}>
          <div style={styles.headerTitle}>
            <Sparkles size={18} color="var(--text-primary)" style={{ marginRight: 8 }} />
            <h3 style={{ fontSize: '0.9rem', fontWeight: '800', fontFamily: 'var(--font-heading)', letterSpacing: '0.05em' }}>FLOW AGENT</h3>
            <span style={styles.badge}>Active</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {!showHistory && (
              <>
                <button 
                  onClick={() => {
                    fetchSessions();
                    setShowHistory(true);
                  }} 
                  className="icon-header-btn"
                  title="Chat history"
                >
                  <Clock size={16} />
                </button>
                <button 
                  onClick={handleNewChat} 
                  className="icon-header-btn"
                  title="New conversation"
                >
                  <Plus size={16} />
                </button>
              </>
            )}
            <button onClick={onToggle} style={styles.closeBtn} title="Close Panel">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content View: Messages list OR History list */}
        {showHistory ? (
          <div style={styles.historyContainer}>
            <div style={styles.historyHeader}>
              <h4 style={{ fontSize: '0.9rem', fontWeight: '700' }}>Previous Conversations</h4>
              <button onClick={() => setShowHistory(false)} style={styles.backBtn}>
                <ArrowLeft size={16} style={{ marginRight: 4 }} /> Back
              </button>
            </div>
            
            <div style={styles.sessionList}>
              {sessions.length === 0 ? (
                <div style={styles.emptySessions}>No saved conversations yet.</div>
              ) : (
                sessions.map(s => (
                  <div 
                    key={s.id} 
                    onClick={() => loadSession(s.id)}
                    className="session-item"
                    style={{
                      borderLeft: s.id === activeSessionId ? '3px solid var(--success)' : '1px solid var(--border-dark)',
                      background: s.id === activeSessionId ? 'rgba(255, 255, 255, 0.05)' : 'transparent'
                    }}
                  >
                    <div className="session-title">{s.title}</div>
                    <button 
                      onClick={(e) => deleteSession(s.id, e)} 
                      className="delete-btn"
                      title="Delete conversation"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Messages list */}
            <div style={styles.messagesContainer}>
              {messages.map((msg, index) => (
                <div 
                  key={index} 
                  style={{
                    ...styles.messageWrapper,
                    justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start'
                  }}
                >
                  {msg.role !== 'user' && (
                    <div style={styles.agentAvatar}>
                      <Sparkles size={12} color="var(--text-primary)" />
                    </div>
                  )}
                  <div 
                    className={msg.role === 'user' ? "eink-chat-bubble-user" : "eink-chat-bubble-agent"}
                    style={styles.messageBubble}
                  >
                    <div style={styles.messageContent}>{renderFormattedContent(msg.content)}</div>
                  </div>
                </div>
              ))}
              
              {loading && (
                <div style={{ ...styles.messageWrapper, justifyContent: 'flex-start' }}>
                  <div style={styles.agentAvatar}>
                    <Sparkles size={12} color="var(--text-primary)" />
                  </div>
                  <div 
                    className="eink-chat-bubble-agent" 
                    style={{ ...styles.messageBubble, boxShadow: 'none', background: 'var(--bg-white)', border: '1px solid var(--border-dark)' }}
                  >
                    <div style={styles.loader}>
                      <div style={styles.dot}></div>
                      <div style={{ ...styles.dot, animationDelay: '0.2s' }}></div>
                      <div style={{ ...styles.dot, animationDelay: '0.4s' }}></div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Form */}
            <form onSubmit={handleSend} style={styles.inputForm}>
              <input
                type="text"
                className="eink-input"
                placeholder="Ask about your portfolio or the market..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={loading}
                style={styles.chatInput}
              />
              <button 
                type="submit" 
                disabled={loading || !input.trim()} 
                className={input.trim() ? "eink-btn" : "eink-btn secondary"}
                style={styles.sendBtn}
              >
                <Send size={16} />
              </button>
            </form>
          </>
        )}
      </div>
    </>
  );
};

const styles = {
  floatingToggle: {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    height: '48px',
    padding: '0 20px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    zIndex: 99,
    border: '1px solid rgba(255, 255, 255, 0.15)',
    background: 'rgba(15, 23, 42, 0.9)', // rich deep background
    boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.5), 0 0 10px rgba(255, 255, 255, 0.05)',
    backdropFilter: 'blur(8px)',
  } as React.CSSProperties,
  panel: {
    position: 'fixed',
    top: 0,
    right: 0,
    width: '380px',
    height: '100vh',
    zIndex: 100,
    display: 'flex',
    flexDirection: 'column',
    borderLeft: '2px solid var(--border-dark)',
    transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease',
    boxShadow: '-4px 0 0px rgba(0, 0, 0, 0.3)',
    background: '#090e1a', // match app body dark base
  } as React.CSSProperties,
  header: {
    padding: '16px 20px',
    borderBottom: '1px solid var(--border-dark)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: 'var(--bg-tinted)',
  } as React.CSSProperties,
  headerTitle: {
    display: 'flex',
    alignItems: 'center',
  } as React.CSSProperties,
  badge: {
    fontSize: '0.65rem',
    background: 'var(--success-bg)',
    color: 'var(--success)',
    padding: '2px 6px',
    borderRadius: '2px',
    fontWeight: '700',
    marginLeft: '8px',
    border: '1px solid var(--success)',
  } as React.CSSProperties,
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-secondary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4px',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'var(--transition-fast)',
  } as React.CSSProperties,
  messagesContainer: {
    flex: 1,
    padding: '20px',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  } as React.CSSProperties,
  messageWrapper: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    maxWidth: '100%',
  } as React.CSSProperties,
  agentAvatar: {
    width: '24px',
    height: '24px',
    borderRadius: '2px',
    background: 'var(--bg-tinted)',
    border: '1px solid var(--border-dark)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: '2px',
    flexShrink: 0,
  } as React.CSSProperties,
  messageBubble: {
    padding: '12px 16px',
    maxWidth: '85%',
    wordBreak: 'break-word',
    fontSize: '0.88rem',
    lineHeight: '1.4',
    whiteSpace: 'pre-line',
  } as React.CSSProperties,
  messageContent: {
    fontWeight: '400',
  } as React.CSSProperties,
  inputForm: {
    padding: '16px 20px',
    borderTop: '1px solid var(--border-dark)',
    display: 'flex',
    gap: '8px',
    background: 'var(--bg-tinted)',
  } as React.CSSProperties,
  chatInput: {
    flex: 1,
    fontSize: '0.85rem',
  } as React.CSSProperties,
  sendBtn: {
    width: '38px',
    height: '38px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
  } as React.CSSProperties,
  loader: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '6px 0',
  } as React.CSSProperties,
  dot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: 'var(--text-primary)',
    animation: 'pulseGlow 1.2s infinite ease-in-out',
  } as React.CSSProperties,
  historyContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',
    padding: '20px',
  } as React.CSSProperties,
  historyHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    borderBottom: '1px solid var(--border-dark)',
    paddingBottom: '10px',
  } as React.CSSProperties,
  backBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-secondary)',
    display: 'flex',
    alignItems: 'center',
    fontSize: '0.8rem',
    cursor: 'pointer',
    fontWeight: '600',
  } as React.CSSProperties,
  sessionList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  } as React.CSSProperties,
  emptySessions: {
    color: 'var(--text-muted)',
    fontSize: '0.85rem',
    textAlign: 'center',
    padding: '20px 0',
  } as React.CSSProperties,
};
