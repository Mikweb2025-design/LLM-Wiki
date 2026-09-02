import React, { useState, useEffect } from 'react';
import Chat from './components/Chat';
import UploadForm from './components/UploadForm';
import DocumentList from './components/DocumentList';
import SystemStatus from './components/SystemStatus';
import Settings from './components/Settings';
import Dashboard from './components/Dashboard';
import SearchWithFilters from './components/SearchWithFilters';
import ExportChat from './components/ExportChat';
import KeyboardShortcuts from './components/KeyboardShortcuts';
import CompareDocuments from './components/CompareDocuments';
import Folders from './components/Folders';
import NotificationCenter, { useNotifications } from './components/NotificationCenter';
import DiagnosticPanel from './components/DiagnosticPanel';
import './index.css';

function App() {
  const [activeTab, setActiveTab] = useState('chat');
  const [showShortcuts, setShowShortcuts] = useState(false);
  const { toasts, addToast, removeToast } = useNotifications();
  // Lo stato online/offline è ora gestito da <DiagnosticPanel /> che fa polling
  // su /health/full ogni 15s e mostra anche il dettaglio per componente.

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setActiveTab('search');
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        setActiveTab('chat');
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        setActiveTab('dashboard');
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
        e.preventDefault();
        setActiveTab('upload');
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setActiveTab('folders');
      }
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setActiveTab('settings');
      }
      if (e.key === '?' && !e.ctrlKey) {
        setShowShortcuts(true);
      }
      if (e.key === 'Escape') {
        setShowShortcuts(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const tabs = [
    { id: 'chat', label: 'Chat' },
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'search', label: 'Ricerca' },
    { id: 'upload', label: 'Carica' },
    { id: 'folders', label: 'Cartelle' },
    { id: 'documents', label: 'Documenti' },
    { id: 'compare', label: 'Confronta' },
    { id: 'export', label: 'Esporta' },
    { id: 'status', label: 'Stato' },
    { id: 'settings', label: 'Config' },
  ];

  const getComponent = (tabId) => {
    const components = {
      chat: Chat,
      dashboard: Dashboard,
      search: SearchWithFilters,
      upload: UploadForm,
      folders: Folders,
      documents: DocumentList,
      compare: CompareDocuments,
      export: ExportChat,
      status: SystemStatus,
      settings: Settings,
    };
    const Component = components[tabId];
    // Expose global navigate for any child that needs it (Quick Actions)
    if (typeof window !== 'undefined') window.__llmwiki_navigate = setActiveTab;
    // Dashboard needs navigation for Quick Actions
    if (tabId === 'dashboard') return <Component showToast={addToast} onNavigate={setActiveTab} />;
    return Component ? <Component showToast={addToast} /> : null;
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      fontFamily: 'var(--font-sans)',
      position: 'relative',
    }}>
      <NotificationCenter toasts={toasts} onRemove={removeToast} />

      {showShortcuts && <KeyboardShortcuts isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} />}

      {/* Animated gradient orbs in background */}
      <div style={{
        position: 'fixed',
        top: '-20%',
        left: '-10%',
        width: '500px',
        height: '500px',
        background: 'radial-gradient(circle, rgba(74, 158, 255, 0.12) 0%, transparent 70%)',
        borderRadius: '50%',
        filter: 'blur(60px)',
        animation: 'float 8s ease-in-out infinite',
        pointerEvents: 'none',
        zIndex: 0,
      }} />
      <div style={{
        position: 'fixed',
        top: '40%',
        right: '-15%',
        width: '600px',
        height: '600px',
        background: 'radial-gradient(circle, rgba(168, 85, 247, 0.1) 0%, transparent 70%)',
        borderRadius: '50%',
        filter: 'blur(80px)',
        animation: 'float 10s ease-in-out infinite 2s',
        pointerEvents: 'none',
        zIndex: 0,
      }} />
      <div style={{
        position: 'fixed',
        bottom: '-10%',
        left: '30%',
        width: '400px',
        height: '400px',
        background: 'radial-gradient(circle, rgba(236, 72, 153, 0.08) 0%, transparent 70%)',
        borderRadius: '50%',
        filter: 'blur(60px)',
        animation: 'float 12s ease-in-out infinite 4s',
        pointerEvents: 'none',
        zIndex: 0,
      }} />

      {/* Header with glass morphism */}
      <header style={{
        background: 'var(--bg-glass)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--border-glass)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        padding: '1rem 2rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{
            width: '48px',
            height: '48px',
            background: 'var(--accent-gradient)',
            borderRadius: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'var(--glow-blue)',
            animation: 'glowPulse 3s ease-in-out infinite',
            cursor: 'pointer',
            transition: 'transform 0.3s',
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05) rotate(-5deg)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1) rotate(0deg)'}
          >
            <span style={{ fontSize: '1.4rem' }}>🧠</span>
          </div>
          <div>
            <h1 style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.7rem',
              fontWeight: 700,
              background: 'var(--accent-gradient)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              letterSpacing: '-0.02em',
              lineHeight: 1.2,
              margin: 0,
            }}>
              LLM Wiki
            </h1>
            <p style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              margin: 0,
              fontWeight: 300,
            }}>
              AI Knowledge Base
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <DiagnosticPanel />

          <button
            onClick={() => setShowShortcuts(true)}
            style={{
              background: 'var(--bg-glass)',
              backdropFilter: 'blur(10px)',
              border: '1px solid var(--border-glass)',
              color: 'var(--text-secondary)',
              padding: '0.35rem 0.75rem',
              borderRadius: '10px',
              cursor: 'pointer',
              fontSize: '0.85rem',
              transition: 'all 0.3s',
            }}
            onMouseEnter={(e) => {
              e.target.style.background = 'rgba(74, 158, 255, 0.1)';
              e.target.style.color = 'var(--accent-blue)';
              e.target.style.borderColor = 'rgba(74, 158, 255, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.target.style.background = 'var(--bg-glass)';
              e.target.style.color = 'var(--text-secondary)';
              e.target.style.borderColor = 'var(--border-glass)';
            }}
            title="Keyboard shortcuts (?)"
          >
            ⌘ ?
          </button>
        </div>
      </header>

      {/* Navigation with modern pill buttons */}
      <nav style={{
        background: 'var(--bg-glass)',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid var(--border-glass)',
        padding: '0.75rem 2rem',
        overflowX: 'auto',
      }}>
        <div style={{ display: 'flex', gap: '0.35rem', minWidth: 'max-content' }}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                data-tab={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '0.5rem 1.1rem',
                  borderRadius: '10px',
                  fontSize: '0.82rem',
                  fontWeight: isActive ? 600 : 400,
                  fontFamily: 'var(--font-sans)',
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                  background: isActive 
                    ? 'linear-gradient(135deg, rgba(74, 158, 255, 0.15) 0%, rgba(168, 85, 247, 0.15) 100%)'
                    : 'transparent',
                  color: isActive ? 'var(--accent-blue)' : 'var(--text-secondary)',
                  border: isActive 
                    ? '1px solid rgba(74, 158, 255, 0.25)'
                    : '1px solid transparent',
                  boxShadow: isActive ? '0 4px 15px rgba(74, 158, 255, 0.1)' : 'none',
                  transform: isActive ? 'translateY(-1px)' : 'none',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.target.style.background = 'rgba(255, 255, 255, 0.05)';
                    e.target.style.color = 'var(--text-primary)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.target.style.background = 'transparent';
                    e.target.style.color = 'var(--text-secondary)';
                  }
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Main Content */}
      <main style={{
        maxWidth: activeTab === 'chat' ? '1100px' : '900px',
        margin: '0 auto',
        padding: '2rem 1.5rem',
        position: 'relative',
        zIndex: 1,
      }}>
        <div style={{ animation: 'fadeInUp 0.5s cubic-bezier(0.16, 1, 0.3, 1)' }}>
          {getComponent(activeTab)}
        </div>
      </main>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid var(--border-glass)',
        padding: '1.5rem 2rem',
        textAlign: 'center',
        fontFamily: 'var(--font-sans)',
        fontSize: '0.72rem',
        color: 'var(--text-secondary)',
        letterSpacing: '0.05em',
        fontWeight: 300,
      }}>
        LLM Wiki &copy; 2026 &middot; Powered by Local AI
      </footer>
    </div>
  );
}

export default App;
