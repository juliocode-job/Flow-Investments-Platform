import React, { useState } from 'react';
import api from '../services/api';
import { Mail, Lock, UserPlus, LogIn, TrendingUp } from 'lucide-react';

interface AuthProps {
  onAuthSuccess: (token: string, email: string) => void;
}

export const Auth: React.FC<AuthProps> = ({ onAuthSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        const response = await api.post('/auth/login', { email, password });
        const { access_token, user } = response.data;
        localStorage.setItem('flow_token', access_token);
        localStorage.setItem('flow_email', user.email);
        onAuthSuccess(access_token, user.email);
      } else {
        await api.post('/auth/register', { email, password });
        // After signup, automatically log in
        const response = await api.post('/auth/login', { email, password });
        const { access_token, user } = response.data;
        localStorage.setItem('flow_token', access_token);
        localStorage.setItem('flow_email', user.email);
        onAuthSuccess(access_token, user.email);
      }
    } catch (err: any) {
      setError(
        err.response?.data?.detail || 
        'Authentication failed. Please check your credentials.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div className="eink-card animate-fade-in" style={styles.card}>
        <div style={styles.logoSection}>
          <div style={styles.logoIcon}>
            <TrendingUp size={28} color="var(--text-primary)" />
          </div>
          <h1 style={styles.title}>FLOW</h1>
          <p style={styles.subtitle}>INVESTMENT PLATFORM</p>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <h2 style={styles.formTitle}>
            {isLogin ? 'Welcome Back' : 'Create Your Account'}
          </h2>
          <p style={styles.formSubtitle}>
            {isLogin 
              ? 'Sign in to track your investments in real-time' 
              : 'Start managing your smart asset portfolio'}
          </p>

          {error && <div style={styles.error}>{error}</div>}

          <div style={styles.inputGroup}>
            <label style={styles.label}>Email</label>
            <div style={styles.inputWrapper}>
              <Mail size={18} style={styles.icon} />
              <input
                type="email"
                className="eink-input"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={styles.input}
              />
            </div>
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Password</label>
            <div style={styles.inputWrapper}>
              <Lock size={18} style={styles.icon} />
              <input
                type="password"
                className="eink-input"
                placeholder="Your secret password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={styles.input}
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading} 
            className="eink-btn" 
            style={styles.submitBtn}
          >
            {loading ? (
              'Processing...'
            ) : isLogin ? (
              <>
                <LogIn size={18} style={{ marginRight: 8 }} /> Sign In
              </>
            ) : (
              <>
                <UserPlus size={18} style={{ marginRight: 8 }} /> Sign Up
              </>
            )}
          </button>
        </form>

        <div style={styles.footer}>
          <span style={{ color: 'var(--text-muted)' }}>
            {isLogin ? "Don't have an account?" : 'Already have an account?'}
          </span>
          <button 
            onClick={() => { setIsLogin(!isLogin); setError(''); }} 
            style={styles.switchBtn}
          >
            {isLogin ? 'Create one' : 'Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    width: '100vw',
    padding: '20px',
  } as React.CSSProperties,
  card: {
    width: '100%',
    maxWidth: '440px',
    borderRadius: '12px',
    padding: '40px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
  } as React.CSSProperties,
  logoSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    marginBottom: '30px',
  } as React.CSSProperties,
  logoIcon: {
    width: '56px',
    height: '56px',
    borderRadius: '12px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid var(--border-dark)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '12px',
    boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)',
  } as React.CSSProperties,
  title: {
    fontSize: '2.2rem',
    fontWeight: '800',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-heading)',
    letterSpacing: '0.1em',
  } as React.CSSProperties,
  subtitle: {
    fontSize: '0.7rem',
    color: 'var(--text-secondary)',
    letterSpacing: '0.25em',
    fontWeight: '700',
    marginTop: '2px',
  } as React.CSSProperties,
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  } as React.CSSProperties,
  formTitle: {
    fontSize: '1.25rem',
    color: 'var(--text-primary)',
    textAlign: 'center',
    fontWeight: '600',
  } as React.CSSProperties,
  formSubtitle: {
    fontSize: '0.85rem',
    color: 'var(--text-secondary)',
    textAlign: 'center',
    marginTop: '-12px',
    marginBottom: '8px',
  } as React.CSSProperties,
  error: {
    background: 'var(--danger-bg)',
    border: '1px solid var(--danger)',
    color: 'var(--danger)',
    padding: '12px',
    borderRadius: '4px',
    fontSize: '0.85rem',
    textAlign: 'center',
  } as React.CSSProperties,
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  } as React.CSSProperties,
  label: {
    fontSize: '0.8rem',
    color: 'var(--text-secondary)',
    fontWeight: '500',
  } as React.CSSProperties,
  inputWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  } as React.CSSProperties,
  icon: {
    position: 'absolute',
    left: '12px',
    color: 'var(--text-muted)',
  } as React.CSSProperties,
  input: {
    width: '100%',
    paddingLeft: '40px',
  } as React.CSSProperties,
  submitBtn: {
    padding: '12px',
    fontSize: '0.95rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: '10px',
    width: '100%',
  } as React.CSSProperties,
  footer: {
    display: 'flex',
    justifyContent: 'center',
    gap: '8px',
    marginTop: '25px',
    fontSize: '0.85rem',
  } as React.CSSProperties,
  switchBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-primary)',
    fontWeight: '700',
    textDecoration: 'underline',
    padding: '0',
    cursor: 'pointer',
  } as React.CSSProperties,
};
