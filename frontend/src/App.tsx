import { useState, useEffect } from 'react';
import { Auth } from './components/Auth';
import { Dashboard } from './components/Dashboard';
import { AgentPanel } from './components/AgentPanel';

function App() {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState<string>('');
  const [agentOpen, setAgentOpen] = useState(false);
  const [portfolioTrigger, setPortfolioTrigger] = useState(0);

  // Restore session from localStorage on startup
  useEffect(() => {
    const savedToken = localStorage.getItem('flow_token');
    const savedEmail = localStorage.getItem('flow_email');
    if (savedToken && savedEmail) {
      setToken(savedToken);
      setEmail(savedEmail);
    }
  }, []);

  const handleAuthSuccess = (newToken: string, newEmail: string) => {
    setToken(newToken);
    setEmail(newEmail);
    // Automatically open agent panel on login to welcome user!
    setTimeout(() => setAgentOpen(true), 800);
  };

  const handleLogout = () => {
    localStorage.removeItem('flow_token');
    localStorage.removeItem('flow_email');
    setToken(null);
    setEmail('');
    setAgentOpen(false);
  };

  const handlePortfolioUpdate = () => {
    // Increment trigger to signal changes to the agent panel
    setPortfolioTrigger(prev => prev + 1);
  };

  return (
    <div style={appStyles.appWrapper}>
      {!token ? (
        <Auth onAuthSuccess={handleAuthSuccess} />
      ) : (
        <div style={{
          ...appStyles.dashboardLayout,
          marginRight: agentOpen ? '380px' : '0px' // adjust main view when agent is open
        }}>
          <Dashboard 
            email={email} 
            onLogout={handleLogout}
            onPortfolioUpdate={handlePortfolioUpdate}
          />
          <AgentPanel 
            isOpen={agentOpen} 
            onToggle={() => setAgentOpen(!agentOpen)} 
            refreshPortfolioTrigger={portfolioTrigger}
          />
        </div>
      )}
    </div>
  );
}

const appStyles = {
  appWrapper: {
    minHeight: '100vh',
    width: '100vw',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    overflowX: 'hidden',
  } as React.CSSProperties,
  dashboardLayout: {
    display: 'flex',
    width: '100%',
    minHeight: '100vh',
    transition: 'margin-right 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
  } as React.CSSProperties,
};

export default App;
