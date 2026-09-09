import React, { useState, useEffect } from 'react';
import { statusApi } from '../utils/api';
import { useI18n, t } from '../utils/i18n';

function Settings() {
  const { lang } = useI18n(); const tr = p => t(lang,p);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState('general');

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      const response = await statusApi.get();
      setStatus(response.data);
    } catch (error) {
      console.error('Errore:', error);
    } finally {
      setLoading(false);
    }
  };

  const sections = [
    { id: 'general', icon: '⚙️', label: tr('settings.tabGeneral') },
    { id: 'models', icon: '🤖', label: tr('settings.tabModels') },
    { id: 'documents', icon: '📁', label: tr('settings.tabDocs') },
    { id: 'about', icon: 'ℹ️', label: tr('settings.tabInfo') },
  ];

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>{tr('settings.loading')}</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Sidebar */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={() => setActiveSection(section.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1rem',
              background: activeSection === section.id
                ? 'linear-gradient(135deg, rgba(74,158,255,0.15) 0%, rgba(255,108,0,0.15) 100%)'
                : 'var(--bg-glass)',
              color: activeSection === section.id ? 'var(--accent-blue)' : 'var(--text-secondary)',
              border: `1px solid ${activeSection === section.id ? 'rgba(74,158,255,0.3)' : 'var(--border-glass)'}`,
              borderRadius: '10px', fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.3s',
              fontFamily: 'var(--font-sans)',
            }}
            onMouseEnter={(e) => {
              if (activeSection !== section.id) {
                e.currentTarget.style.background = 'rgba(31,41,55,0.05)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }
            }}
            onMouseLeave={(e) => {
              if (activeSection !== section.id) {
                e.currentTarget.style.background = 'var(--bg-glass)';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }
            }}
          >
            <span style={{ fontSize: '1rem' }}>{section.icon}</span> {section.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="glass-card" style={{ padding: '1.5rem' }}>
        {activeSection === 'general' && (
          <div>
            <h2 style={{
              fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 600,
              color: 'var(--text-primary)', marginBottom: '1.25rem',
            }}>{tr('settings.title')}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
              <div style={{ padding: '1rem 1.25rem', background: 'var(--bg-glass)', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <p style={{ color: 'var(--text-primary)', fontWeight: 500, fontSize: '0.9rem' }}>{tr('settings.connection')}</p>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '0.2rem' }}>
                      {status?.ollama_connected ? `✅ ${tr('settings.active')}` : `❌ ${tr('settings.inactive')}`}
                    </p>
                  </div>
                  <div style={{
                    width: '12px', height: '12px', borderRadius: '50%',
                    background: status?.ollama_connected ? 'var(--accent-green)' : '#ff5555',
                    boxShadow: status?.ollama_connected ? '0 0 10px rgba(126,231,135,0.3)' : '0 0 10px rgba(255,85,85,0.3)',
                  }}></div>
                </div>
              </div>
              <div style={{ padding: '1rem 1.25rem', background: 'var(--bg-glass)', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <p style={{ color: 'var(--text-primary)', fontWeight: 500, fontSize: '0.9rem' }}>{tr('settings.docs')}</p>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '0.2rem' }}>{status?.total_documents || 0} {tr('settings.indexed')}</p>
                  </div>
                  <span style={{ fontSize: '1.6rem' }}>📚</span>
                </div>
              </div>
              <div style={{ padding: '1rem 1.25rem', background: 'var(--bg-glass)', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <p style={{ color: 'var(--text-primary)', fontWeight: 500, fontSize: '0.9rem' }}>{tr('settings.chunks')}</p>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '0.2rem' }}>{status?.total_chunks || 0} {tr('settings.segments')}</p>
                  </div>
                  <span style={{ fontSize: '1.6rem' }}>🧩</span>
                </div>
              </div>
              <div style={{ padding: '1rem 1.25rem', background: 'var(--bg-glass)', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <p style={{ color: 'var(--text-primary)', fontWeight: 500, fontSize: '0.9rem' }}>{tr('settings.model')}</p>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '0.2rem' }}>{status?.current_model || tr('settings.na')}</p>
                  </div>
                  <span style={{ fontSize: '1.6rem' }}>🤖</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'models' && (
          <div>
            <h2 style={{
              fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 600,
              color: 'var(--text-primary)', marginBottom: '1.25rem',
            }}>{tr('settings.aiModels')}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{
                padding: '1rem 1.25rem', background: 'linear-gradient(135deg, rgba(74,158,255,0.1) 0%, rgba(255,108,0,0.1) 100%)',
                borderRadius: '12px', border: '1px solid rgba(74,158,255,0.2)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <p style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{status?.current_model}</p>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '0.2rem' }}>{tr('settings.activeModel')}</p>
                  </div>
                  <span style={{ fontSize: '0.7rem', background: 'rgba(126,231,135,0.1)', color: 'var(--accent-green)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>{tr('settings.active')}</span>
                </div>
              </div>
              {status?.available_models?.map((model, idx) => (
                <div key={idx} style={{
                  padding: '0.75rem 1rem', background: 'var(--bg-glass)', borderRadius: '10px',
                  border: '1px solid var(--border-glass)', animation: `fadeInUp 0.3s ease-out ${idx * 0.05}s backwards`,
                }}>
                  <p style={{ color: 'var(--text-primary)', fontSize: '0.85rem' }}>{model}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeSection === 'documents' && (
          <div>
            <h2 style={{
              fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 600,
              color: 'var(--text-primary)', marginBottom: '1.25rem',
            }}>{tr('settings.docs')}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ padding: '1rem 1.25rem', background: 'var(--bg-glass)', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
                <p style={{ color: 'var(--text-primary)', fontWeight: 500, marginBottom: '0.5rem' }}>📁 {tr('settings.docFolder')}</p>
                <code style={{ fontSize: '0.8rem', color: 'var(--accent-blue)', background: '#ffffff', padding: '0.5rem 0.75rem', borderRadius: '8px', display: 'block', fontFamily: 'var(--font-mono)' }}>
                  {tr('settings.docFolderPath')}
                </code>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '0.5rem' }}>{tr('settings.docFolderHint')}</p>
              </div>
              <div style={{ padding: '1rem 1.25rem', background: 'var(--bg-glass)', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
                <p style={{ color: 'var(--text-primary)', fontWeight: 500, marginBottom: '0.5rem' }}>📋 {tr('settings.supportedFormats')}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {['PDF', 'DOCX', 'XLSX', 'TXT', 'CSV', 'PNG', 'JPG'].map(fmt => (
                    <span key={fmt} style={{
                      fontSize: '0.75rem', background: 'rgba(74,158,255,0.08)', color: 'var(--accent-blue)',
                      padding: '0.3rem 0.6rem', borderRadius: '6px', fontFamily: 'var(--font-mono)',
                    }}>{fmt}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'about' && (
          <div>
            <h2 style={{
              fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 600,
              color: 'var(--text-primary)', marginBottom: '1.25rem',
            }}>{tr('settings.aboutTitle')}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{
                padding: '1.5rem', background: 'linear-gradient(135deg, rgba(74,158,255,0.08) 0%, rgba(255,108,0,0.08) 50%, rgba(255,138,0,0.08) 100%)',
                borderRadius: '16px', textAlign: 'center', border: '1px solid rgba(74,158,255,0.1)',
              }}>
                <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🧠</div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 700,
                  background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                  marginBottom: '0.5rem',
                }}>{tr('settings.aboutApp')}</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{tr('settings.version')}</p>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                  {tr('settings.aboutDesc')}
                </p>
              </div>
              <div style={{ padding: '1rem 1.25rem', background: 'var(--bg-glass)', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.6 }}>
                  {tr('settings.stack')}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Settings;
