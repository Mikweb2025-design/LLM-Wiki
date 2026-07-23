import React, { useState } from 'react';

function NotificationCenter({ toasts, onRemove }) {
  if (!toasts || toasts.length === 0) return null;

  const getStyles = (type) => {
    switch (type) {
      case 'success': return { bg: 'rgba(126,231,135,0.15)', border: 'rgba(126,231,135,0.3)', color: 'var(--accent-green)', icon: '✓' };
      case 'error': return { bg: 'rgba(255,85,85,0.15)', border: 'rgba(255,85,85,0.3)', color: '#ff5555', icon: '✕' };
      case 'warning': return { bg: 'rgba(255,166,87,0.15)', border: 'rgba(255,166,87,0.3)', color: 'var(--accent-orange)', icon: '⚠️' };
      default: return { bg: 'rgba(74,158,255,0.15)', border: 'rgba(74,158,255,0.3)', color: 'var(--accent-blue)', icon: 'ℹ️' };
    }
  };

  return (
    <div style={{
      position: 'fixed', top: '1rem', right: '1rem', zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: '0.5rem', maxWidth: '400px',
    }}>
      {toasts.map((toast) => {
        const s = getStyles(toast.type);
        return (
          <div key={toast.id} style={{
            background: s.bg, border: `1px solid ${s.border}`, color: s.color,
            backdropFilter: 'blur(20px)', padding: '0.75rem 1rem', borderRadius: '12px',
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            animation: 'slideInRight 0.3s ease-out', boxShadow: `0 4px 20px ${s.border}`,
            fontSize: '0.85rem', fontWeight: 500,
          }}>
            <span style={{ fontSize: '1.1rem' }}>{s.icon}</span>
            <span style={{ flex: 1 }}>{toast.message}</span>
            <button
              onClick={() => onRemove(toast.id)}
              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '1.1rem', opacity: 0.7, transition: 'opacity 0.2s' }}
              onMouseEnter={(e) => e.target.style.opacity = 1}
              onMouseLeave={(e) => e.target.style.opacity = 0.7}
            >×</button>
          </div>
        );
      })}
    </div>
  );
}

export function useNotifications() {
  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => { setToasts(prev => prev.filter(t => t.id !== id)); }, 4000);
    return id;
  };

  const removeToast = (id) => { setToasts(prev => prev.filter(t => t.id !== id)); };

  return { toasts, addToast, removeToast };
}

export default NotificationCenter;
