import React, { useState, useEffect } from 'react';
import { statusApi } from '../utils/api';
import { useI18n, t } from '../utils/i18n';

function SystemStatus() {
  const { lang } = useI18n(); const tr = p => t(lang,p);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStatus = async () => {
    try {
      const response = await statusApi.get();
      setStatus(response.data); setError(null);
    } catch (error) {
      console.error('Errore stato sistema:', error);
      setError(tr('system.connError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
        <div style={{
          width: '36px', height: '36px', border: '3px solid rgba(74,158,255,0.1)',
          borderTop: '3px solid var(--accent-blue)', borderRadius: '50%',
          animation: 'spin 1s linear infinite', marginRight: '0.75rem',
        }}></div>
        {tr('system.loading')}
      </div>
    );
  }

  if (error || !status) {
    return (
      <div className="glass-card" style={{ maxWidth: '480px', margin: '2rem auto', padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem', opacity: 0.8 }}>⚠️</div>
        <p style={{ color: '#ff5555', fontWeight: 500, marginBottom: '0.5rem' }}>{tr('system.connError')}</p>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '1.5rem' }}>{tr('system.checkBackend')}</p>
        <button
          onClick={fetchStatus}
          style={{
            padding: '0.5rem 1.5rem', background: 'var(--accent-gradient)', color: 'var(--bg-dark)',
            border: 'none', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
            fontFamily: 'var(--font-mono)', transition: 'transform 0.2s',
          }}
          onMouseEnter={(e) => e.target.style.transform = 'translateY(-1px)'}
          onMouseLeave={(e) => e.target.style.transform = 'none'}
        >🔄 {tr('system.retry')}</button>
      </div>
    );
  }

  const stats = [
    {
      label: tr('system.ollama'),
      value: status.ollama_connected ? tr('system.connected') : tr('system.notConnected'),
      icon: '🤖',
      color: status.ollama_connected ? 'green' : 'red',
      bgColor: status.ollama_connected ? 'rgba(126,231,135,0.05)' : 'rgba(255,85,85,0.05)',
      textColor: status.ollama_connected ? 'var(--accent-green)' : '#ff5555',
      borderColor: status.ollama_connected ? 'rgba(126,231,135,0.15)' : 'rgba(255,85,85,0.15)',
    },
    {
      label: tr('settings.docs'),
      value: `${status.total_documents} ${tr('system.indexed')}`,
      icon: '📚',
      color: 'blue',
      bgColor: 'rgba(74,158,255,0.05)', textColor: 'var(--accent-blue)',
      borderColor: 'rgba(74,158,255,0.15)',
    },
    {
      label: tr('settings.chunks'),
      value: `${status.total_chunks} ${tr('system.segments')}`,
      icon: '🧩',
      color: 'purple',
      bgColor: 'rgba(255,108,0,0.05)', textColor: 'var(--accent-purple)',
      borderColor: 'rgba(255,108,0,0.15)',
    },
    {
      label: tr('settings.model'),
      value: status.current_model || tr('system.noModel'),
      icon: '⚡',
      color: 'yellow',
      bgColor: 'rgba(255,166,87,0.05)', textColor: 'var(--accent-orange)',
      borderColor: 'rgba(255,166,87,0.15)',
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div className="glass-card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 600,
            color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem',
          }}>
            <span style={{ fontSize: '1.2rem', background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>⚙️</span>
            {tr('system.title')}
          </h2>
          <button
            onClick={fetchStatus}
            style={{
              background: 'var(--bg-glass)', border: '1px solid var(--border-glass)',
              borderRadius: '8px', padding: '0.4rem 0.8rem', color: 'var(--text-secondary)',
              cursor: 'pointer', fontSize: '0.8rem', transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => { e.target.style.background = 'rgba(74,158,255,0.08)'; e.target.style.color = 'var(--accent-blue)'; }}
            onMouseLeave={(e) => { e.target.style.background = 'var(--bg-glass)'; e.target.style.color = 'var(--text-secondary)'; }}
            title="Aggiorna"
          >🔄</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
          {stats.map((stat, index) => (
            <div key={index} style={{
              padding: '1rem 1.25rem', background: stat.bgColor, borderRadius: '12px',
              border: `1px solid ${stat.borderColor}`, transition: 'all 0.3s',
              animation: `fadeInUp 0.4s ease-out ${index * 0.1}s backwards`,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 25px ${stat.borderColor}`; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '1.4rem' }}>{stat.icon}</span>
                <div>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontFamily: 'var(--font-sans)' }}>{stat.label}</p>
                  <p style={{ color: stat.textColor, fontWeight: 600, fontSize: '0.9rem' }}>{stat.value}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modelli Disponibili */}
      <div className="glass-card" style={{ padding: '1.5rem' }}>
        <h3 style={{
          fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 600,
          color: 'var(--text-primary)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
        }}>
          <span style={{ fontSize: '1rem' }}>📦</span> {tr('system.availableModels')}
        </h3>
        {status.available_models?.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', padding: '1rem', textAlign: 'center', fontSize: '0.85rem' }}>{tr('system.noModels')}</p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {status.available_models?.map((model, index) => (
              <span key={index} style={{
                padding: '0.4rem 0.9rem', borderRadius: '8px', fontSize: '0.8rem',
                background: model === status.current_model ? 'var(--accent-gradient)' : 'var(--bg-glass)',
                color: model === status.current_model ? 'var(--bg-dark)' : 'var(--text-primary)',
                border: `1px solid ${model === status.current_model ? 'transparent' : 'var(--border-glass)'}`,
                fontWeight: model === status.current_model ? 600 : 400, transition: 'all 0.2s',
                cursor: 'default', animation: `fadeInUp 0.3s ease-out ${index * 0.05}s backwards`,
              }}>
                {model === status.current_model && '✓ '}{model}
              </span>
            ))}
          </div>
        )}
        {!status.ollama_connected && (
          <div style={{
            marginTop: '1rem', padding: '0.75rem 1rem', background: 'rgba(255,166,87,0.05)',
            borderRadius: '10px', border: '1px solid rgba(255,166,87,0.15)',
          }}>
            <p style={{ color: 'var(--accent-orange)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>⚠️</span> {tr('system.installHint')}: <code style={{ background: 'rgba(255,166,87,0.1)', padding: '0.15rem 0.4rem', borderRadius: '4px', marginLeft: '0.5rem', fontFamily: 'var(--font-mono)' }}>ollama pull llama3</code>
            </p>
          </div>
        )}
      </div>

      {/* Guida Installazione */}
      <div className="glass-card" style={{ padding: '1.5rem' }}>
        <h3 style={{
          fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 600,
          color: 'var(--text-primary)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
        }}>
          <span style={{ fontSize: '1rem' }}>📖</span> {tr('system.installGuide')}
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {[
            { step: 1, title: tr('system.installOllama'), desc: tr('system.downloadFrom'), link: 'https://ollama.ai', linkText: 'ollama.ai' },
            { step: 2, title: tr('system.downloadModels'), code: ['ollama pull llama3', 'ollama pull nomic-embed-text'] },
            { step: 3, title: tr('system.installTesseract'), code: ['brew install tesseract'], note: 'Solo per OCR immagini' },
          ].map((item) => (
            <div key={item.step} style={{
              padding: '0.75rem 1rem', background: 'rgba(31,41,55,0.02)', borderRadius: '10px',
              border: '1px solid var(--border-glass)', display: 'flex', gap: '0.75rem', alignItems: 'flex-start',
              animation: `fadeInUp 0.3s ease-out ${item.step * 0.1}s backwards`,
            }}>
              <span style={{
                width: '28px', height: '28px', background: 'var(--accent-gradient)', color: 'var(--bg-dark)',
                borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.75rem', fontWeight: 700, flexShrink: 0,
              }}>{item.step}</span>
              <div style={{ flex: 1 }}>
                <p style={{ color: 'var(--text-primary)', fontWeight: 500, fontSize: '0.9rem', marginBottom: '0.25rem' }}>{item.title}</p>
                {item.desc && (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                    {item.desc}{' '}
                    <a href={item.link} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-blue)', textDecoration: 'none' }}>{item.linkText}</a>
                  </p>
                )}
                {item.code && item.code.map((cmd, i) => (
                  <code key={i} style={{
                    background: '#ffffff', color: 'var(--accent-green)', padding: '0.3rem 0.6rem',
                    borderRadius: '6px', fontSize: '0.75rem', fontFamily: 'var(--font-mono)', display: 'block', marginBottom: '0.25rem',
                  }}>{cmd}</code>
                ))}
                {item.note && <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '0.25rem' }}>{item.note}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default SystemStatus;
