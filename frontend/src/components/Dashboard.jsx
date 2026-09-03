import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { statusApi, documentsApi } from '../utils/api';
import { useI18n, t } from '../utils/i18n';

function Dashboard({ onNavigate }) {
  const { lang } = useI18n();
  const tr = (p) => t(lang, p);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState([]);
  const [insights, setInsights] = useState('');
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState('');
  const [activity, setActivity] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    let docCountForInsights = 0;
    try {
      // Strategia veloce: /api/documents/stats aggrega tutto lato server (un sola query).
      // Fallback: vecchia coppia /api/status + /api/documents/ se /stats non c'e (backend vecchio).
      try {
        const [statsRes, statusRes, activityRes] = await Promise.all([
          documentsApi.stats(),
          statusApi.get(),
          documentsApi.activity(10).catch(() => ({ data: { activities: [] } })),
        ]);
        const s = statsRes.data || {};
        setStats({
          ...statusRes.data,
          total_documents: s.total_documents,
          total_chunks: s.total_chunks,
          total_size_bytes: s.total_size_bytes,
          total_words: s.total_words,
          by_extension: s.by_extension,
        });
        setDocuments(s.recent || []);
        setActivity(activityRes.data?.activities || []);
        docCountForInsights = s.total_documents || 0;
      } catch (innerErr) {
        // fallback
        const [statusRes, docsRes] = await Promise.all([
          statusApi.get(),
          documentsApi.list(),
        ]);
        setStats(statusRes.data);
        setDocuments(docsRes.data || []);
        docCountForInsights = statusRes.data?.total_documents ?? docsRes.data?.length ?? 0;
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      // Usa il valore appena fetchato, non lo state stale
      if (docCountForInsights > 0) {
        loadInsights();
      }
    }
  };

  const loadInsights = useCallback(async () => {
    setInsightsLoading(true);
    setInsightsError('');
    try {
      const res = await documentsApi.insights();
      setInsights(res.data.insights || '');
    } catch (e) {
      console.error('Insights error:', e);
      setInsightsError(tr('dashboard.insightsError'));
    } finally {
      setInsightsLoading(false);
    }
  }, [tr]);

  const totalSize = useMemo(() =>
    stats?.total_size_bytes != null
      ? stats.total_size_bytes
      : documents.reduce((acc, doc) => acc + (doc.size_bytes || 0), 0)
  , [documents, stats]);

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const docTypes = useMemo(() => {
    // Preferisci aggregato server-side (vede TUTTI i docs, non solo gli 8 recenti)
    if (stats?.by_extension?.length) {
      return stats.by_extension.map(({ ext, count }) => [ext, count]);
    }
    const types = {};
    documents.forEach(d => {
      const ext = d.extension || '.unknown';
      types[ext] = (types[ext] || 0) + 1;
    });
    return Object.entries(types).sort((a, b) => b[1] - a[1]);
  }, [documents, stats]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px' }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '3px solid rgba(74, 158, 255, 0.1)',
          borderTop: '3px solid var(--accent-blue)',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }}></div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Stats Cards - Large */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '1rem',
      }}>
        <StatCard icon="📚" label={tr('dashboard.docs')} value={stats?.total_documents || 0} color="blue" />
        <StatCard icon="🧩" label={tr('dashboard.chunks')} value={stats?.total_chunks || 0} color="purple" />
        <StatCard icon="💾" label={tr('dashboard.size')} value={formatSize(totalSize)} color="green" />
        <StatCard icon="📝" label={tr('dashboard.words')} value={stats?.total_words?.toLocaleString() || '0'} color="pink" />
      </div>

      {/* Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* Document Types - Animated Bars */}
        <div className="glass-card" style={{ padding: '1.5rem', animation: 'slideInRight 0.5s ease-out' }}>
          <h3 style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.2rem',
            fontWeight: 600,
            color: 'var(--text-primary)',
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}>
            <span style={{ fontSize: '1.1rem' }}>📊</span> {tr('dashboard.types')}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {docTypes.map(([ext, count], idx) => {
              const denom = stats?.total_documents || documents.length || 1;
              const percent = Math.round((count / denom) * 100);
              return (
                <div key={ext} style={{ animation: `fadeInUp 0.4s ease-out ${idx * 0.1}s backwards` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.3rem' }}>
                    <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)' }}>{ext}</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{count} ({percent}%)</span>
                  </div>
                  <div style={{
                    height: '8px',
                    background: 'rgba(255,255,255,0.05)',
                    borderRadius: '4px',
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      height: '100%',
                      width: `${percent}%`,
                      background: 'var(--accent-gradient)',
                      borderRadius: '4px',
                      transition: 'width 1s cubic-bezier(0.16, 1, 0.3, 1)',
                      animation: `shimmer 2s linear infinite`,
                      backgroundSize: '200% 100%',
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* AI Insights */}
        <div className="glass-card" style={{ padding: '1.5rem', animation: 'slideInRight 0.6s ease-out' }}>
          <h3 style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.2rem',
            fontWeight: 600,
            color: 'var(--text-primary)',
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}>
            <span style={{ fontSize: '1.1rem' }}>✨</span> {tr('dashboard.aiInsights')}
          </h3>
          {insightsLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '150px', gap: '0.75rem' }}>
              <div style={{
                width: '32px',
                height: '32px',
                border: '3px solid rgba(74, 158, 255, 0.1)',
                borderTop: '3px solid var(--accent-blue)',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }} />
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{tr('dashboard.analyzing')}</span>
            </div>
          ) : insightsError ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '150px', gap: '0.5rem' }}>
              <span style={{ color: 'var(--accent-orange)', fontSize: '0.85rem' }}>{insightsError}</span>
              <button
                onClick={loadInsights}
                style={{
                  marginTop: '0.5rem',
                  padding: '0.4rem 1rem',
                  background: 'rgba(74, 158, 255, 0.1)',
                  color: 'var(--accent-blue)',
                  border: '1px solid rgba(74, 158, 255, 0.2)',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                }}
              >{tr('dashboard.retry')}</button>
            </div>
          ) : insights ? (
            <div className="prose" style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>
              {insights.split('\n').map((line, i) => (
                <p key={i} style={{ marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>{line}</p>
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '150px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
              {tr('dashboard.noInsights')}
            </div>
          )}
        </div>
      </div>

      {/* Recent Documents - Bigger cards */}
      <div className="glass-card" style={{ padding: '1.5rem' }}>
        <h3 style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.2rem',
          fontWeight: 600,
          color: 'var(--text-primary)',
          marginBottom: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          <span style={{ fontSize: '1.1rem' }}>📄</span> {tr('dashboard.recentDocs')}
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
          {documents.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', gridColumn: '1 / -1', textAlign: 'center', padding: '2rem' }}>
              {tr('dashboard.noDocs')}
            </p>
          ) : (
            documents.slice(0, 8).map((doc, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  padding: '1rem 1.25rem',
                  background: 'var(--bg-glass)',
                  borderRadius: '12px',
                  border: '1px solid var(--border-glass)',
                  transition: 'all 0.3s',
                  animation: `fadeInUp 0.4s ease-out ${idx * 0.08}s backwards`,
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(74, 158, 255, 0.3)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = 'var(--glow-blue)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-glass)';
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <span style={{ fontSize: '1.8rem' }}>
                  {doc.extension?.includes('pdf') ? '📄' :
                   doc.extension?.includes('xls') ? '📊' :
                   doc.extension?.includes('doc') ? '📝' : '📃'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    color: 'var(--text-primary)',
                    fontSize: '0.9rem',
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    marginBottom: '0.25rem',
                  }}>{doc.filename}</p>
                  <p style={{
                    color: 'var(--text-secondary)',
                    fontSize: '0.75rem',
                    fontFamily: 'var(--font-mono)',
                  }}>{formatSize(doc.size_bytes)}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Quick Actions - Bigger */}
      <div className="glass-card" style={{
        padding: '1.5rem',
        background: 'linear-gradient(135deg, rgba(74, 158, 255, 0.05) 0%, rgba(168, 85, 247, 0.05) 50%, rgba(236, 72, 153, 0.05) 100%)',
      }}>
        <h3 style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.2rem',
          fontWeight: 600,
          color: 'var(--text-primary)',
          marginBottom: '1.25rem',
        }}>
          {tr('dashboard.quickActions')}
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' }}>
          <QuickAction icon="📤" label={tr('dashboard.upload')} tab="upload" onNavigate={onNavigate} />
          <QuickAction icon="💬" label={tr('dashboard.newChat')} tab="chat" onNavigate={onNavigate} />
          <QuickAction icon="🔄" label={tr('dashboard.scan')} tab="documents" onNavigate={onNavigate} />
          <QuickAction icon="⚙️" label={tr('dashboard.settings')} tab="settings" onNavigate={onNavigate} />
        </div>
      </div>

      {/* Activity Timeline */}
      {activity.length > 0 && (
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <h3 style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.2rem',
            fontWeight: 600,
            color: 'var(--text-primary)',
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}>
            <span style={{ fontSize: '1.1rem' }}>🕐</span> {tr('dashboard.activity')}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {activity.slice(0, 8).map((item, idx) => (
              <div
                key={item.id || idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.6rem 0.8rem',
                  borderRadius: '10px',
                  background: 'rgba(255,255,255,0.025)',
                  animation: `fadeInUp 0.3s ease-out ${idx * 0.05}s backwards`,
                }}
              >
                <span style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: item.action?.includes('add') ? 'var(--accent-green)' :
                              item.action?.includes('remove') ? '#f87171' :
                              item.action?.includes('chat') ? 'var(--accent-blue)' :
                              'var(--accent-purple)',
                  flexShrink: 0,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{
                    fontSize: '0.82rem',
                    color: 'var(--text-primary)',
                    fontWeight: 500,
                  }}>{item.action?.replace(/_/g, ' ')}</span>
                  {item.target && (
                    <span style={{
                      fontSize: '0.78rem',
                      color: 'var(--text-secondary)',
                      marginLeft: '0.5rem',
                      fontFamily: 'var(--font-mono)',
                    }}>{item.target}</span>
                  )}
                </div>
                <span style={{
                  fontSize: '0.7rem',
                  color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-mono)',
                  flexShrink: 0,
                }}>
                  {item.created_at ? new Date(item.created_at).toLocaleTimeString(lang === 'en' ? 'en-US' : lang === 'de' ? 'de-DE' : 'it-IT', { hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, color }) {
  const gradients = {
    blue: 'linear-gradient(135deg, rgba(74, 158, 255, 0.15) 0%, rgba(74, 158, 255, 0.05) 100%)',
    purple: 'linear-gradient(135deg, rgba(168, 85, 247, 0.15) 0%, rgba(168, 85, 247, 0.05) 100%)',
    green: 'linear-gradient(135deg, rgba(126, 231, 135, 0.15) 0%, rgba(126, 231, 135, 0.05) 100%)',
    pink: 'linear-gradient(135deg, rgba(236, 72, 153, 0.15) 0%, rgba(236, 72, 153, 0.05) 100%)',
  };
  const accentColors = {
    blue: 'var(--accent-blue)',
    purple: 'var(--accent-purple)',
    green: 'var(--accent-green)',
    pink: 'var(--accent-pink)',
  };
  return (
    <div className="glass-card" style={{
      padding: '1.5rem',
      background: gradients[color],
      animation: 'fadeInUp 0.5s ease-out',
      transition: 'all 0.3s',
      cursor: 'pointer',
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.transform = 'translateY(-3px) scale(1.02)';
      e.currentTarget.style.boxShadow = `0 10px 30px ${accentColors[color].replace(')', ', 0.2)')}`;
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.transform = 'none';
      e.currentTarget.style.boxShadow = 'none';
    }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={{
          width: '52px',
          height: '52px',
          borderRadius: '14px',
          background: `${accentColors[color]}15`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.6rem',
          border: `1px solid ${accentColors[color]}30`,
        }}>
          {icon}
        </div>
        <div>
          <p style={{
            fontSize: '1.8rem',
            fontWeight: 700,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-display)',
            lineHeight: 1.2,
          }}>{typeof value === 'number' ? value.toLocaleString() : value}</p>
          <p style={{
            fontSize: '0.8rem',
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-sans)',
            marginTop: '0.2rem',
          }}>{label}</p>
        </div>
      </div>
    </div>
  );
}

function QuickAction({ icon, label, tab, onNavigate }) {
  const navigateToTab = () => {
    if (onNavigate) {
      onNavigate(tab);
      return;
    }
    if (typeof window !== 'undefined' && window.__llmwiki_navigate) {
      window.__llmwiki_navigate(tab);
      return;
    }
    // Fallback legacy DOM
    const buttons = document.querySelectorAll('nav button');
    for (const btn of buttons) {
      if (btn.dataset.tab === tab || btn.textContent?.trim().toLowerCase().includes(tab)) {
        btn.click();
        return;
      }
    }
  };

  return (
    <button
      onClick={navigateToTab}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '1.25rem 1rem',
        background: 'var(--bg-glass)',
        borderRadius: '14px',
        border: '1px solid var(--border-glass)',
        cursor: 'pointer',
        transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        color: 'var(--text-secondary)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(74, 158, 255, 0.08)';
        e.currentTarget.style.borderColor = 'rgba(74, 158, 255, 0.3)';
        e.currentTarget.style.color = 'var(--accent-blue)';
        e.currentTarget.style.transform = 'translateY(-3px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'var(--bg-glass)';
        e.currentTarget.style.borderColor = 'var(--border-glass)';
        e.currentTarget.style.color = 'var(--text-secondary)';
        e.currentTarget.style.transform = 'none';
      }}
    >
      <span style={{ fontSize: '1.8rem' }}>{icon}</span>
      <span style={{ fontSize: '0.85rem', fontFamily: 'var(--font-sans)' }}>{label}</span>
    </button>
  );
}

export default Dashboard;
