import React, { useEffect } from 'react';

function KeyboardShortcuts({ isOpen, onClose }) {
  const shortcuts = [
    { key: 'Ctrl + Enter', description: 'Invia messaggio chat' },
    { key: 'Escape', description: 'Chiudi modale' },
    { key: 'Ctrl + K', description: 'Focus ricerca' },
    { key: 'Ctrl + N', description: 'Nuova chat' },
    { key: 'Ctrl + D', description: 'Vai a Dashboard' },
    { key: 'Ctrl + U', description: 'Carica documento' },
    { key: 'Ctrl + ,', description: 'Apri impostazioni' },
    { key: '?', description: 'Mostra questa guida' },
  ];

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === '?' && !e.ctrlKey) { if (!isOpen) onClose(); }
      if (e.key === 'Escape' && isOpen) { onClose(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)',
      zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
      animation: 'fadeInUp 0.3s ease-out',
    }}>
      <div style={{
        background: 'var(--bg-card)', borderRadius: '16px', maxWidth: '600px', width: '100%',
        maxHeight: '80vh', overflow: 'hidden', border: '1px solid var(--border-glass)',
        animation: 'slideInRight 0.4s ease-out',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-glass)',
        }}>
          <div>
            <h2 style={{
              fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 600,
              color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem',
            }}>
              <span style={{ fontSize: '1.1rem', background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>⌨️</span>
              Tasti Rapidi
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.25rem' }}>Migliora la produttività</p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '1.5rem', cursor: 'pointer', transition: 'color 0.2s' }}
            onMouseEnter={(e) => e.target.style.color = 'var(--text-primary)'}
            onMouseLeave={(e) => e.target.style.color = 'var(--text-secondary)'}
          >×</button>
        </div>
        <div style={{ padding: '1.5rem', overflowY: 'auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {shortcuts.map((shortcut, idx) => (
              <div key={idx} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0.6rem 1rem', background: 'var(--bg-glass)', borderRadius: '10px',
                border: '1px solid var(--border-glass)', transition: 'all 0.2s',
                animation: `fadeInUp 0.3s ease-out ${idx * 0.05}s backwards`,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(74,158,255,0.2)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-glass)'; }}
              >
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontFamily: 'var(--font-sans)' }}>{shortcut.description}</span>
                <kbd style={{
                  padding: '0.2rem 0.6rem', background: 'rgba(74,158,255,0.1)', color: 'var(--accent-blue)',
                  borderRadius: '6px', fontSize: '0.75rem', fontFamily: 'var(--font-mono)', fontWeight: 500,
                  border: '1px solid rgba(74,158,255,0.15)',
                }}>{shortcut.key}</kbd>
              </div>
            ))}
          </div>
          <div style={{
            marginTop: '1.25rem', padding: '0.75rem 1rem', background: 'rgba(74,158,255,0.05)',
            borderRadius: '10px', border: '1px solid rgba(74,158,255,0.1)',
          }}>
            <p style={{ color: 'var(--accent-blue)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>💡</span> Suggerimento: Usa i tasti rapidi per navigare più velocemente nell'app!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default KeyboardShortcuts;
