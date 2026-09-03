import React, { useState, useMemo, useCallback, useRef } from 'react';
import { documentsApi } from '../utils/api';
import { useI18n, t } from '../utils/i18n';

// debounce helper (300ms) — evita di spammare /search ad ogni tasto
function useDebouncedCallback(fn, delay = 300) {
  const timer = useRef(null);
  return useCallback((...args) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => fn(...args), delay);
  }, [fn, delay]);
}

function SearchWithFilters() {
  const { lang } = useI18n(); const tr = p => t(lang,p);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ type: 'all', sizeRange: 'all' });
  const [sortBy, setSortBy] = useState('score');
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [docContent, setDocContent] = useState('');
  const [loadingContent, setLoadingContent] = useState(false);

  const handleSearch = async (q = query) => {
    const term = (typeof q === 'string' ? q : query).trim();
    if (!term) return;
    setLoading(true);
    try {
      const response = await documentsApi.search(term);
      let filtered = response.data?.results || response.data || [];
      // Filtri lato client solo per sizeRange (extension già filtrata meglio server-side se necessario)
      if (filters.type !== 'all') {
        filtered = filtered.filter(d => d.metadata?.extension?.includes(filters.type));
      }
      if (filters.sizeRange === 'small') {
        filtered = filtered.filter(d => (d.size_bytes || 0) < 1024 * 1024);
      } else if (filters.sizeRange === 'medium') {
        filtered = filtered.filter(d => {
          const s = d.size_bytes || 0;
          return s >= 1024 * 1024 && s < 10 * 1024 * 1024;
        });
      } else if (filters.sizeRange === 'large') {
        filtered = filtered.filter(d => (d.size_bytes || 0) >= 10 * 1024 * 1024);
      }
      filtered.sort((a, b) => {
        if (sortBy === 'score') return (b.score || 0) - (a.score || 0);
        if (sortBy === 'name') return (a.metadata?.filename || '').localeCompare(b.metadata?.filename || '');
        return 0;
      });
      setResults(filtered);
    } catch (e) {
      console.error(e); setResults([]);
    } finally {
      setLoading(false);
    }
  };

  // ricerca debounced mentre digiti (opzionale, attiva dopo 3 caratteri)
  const debouncedSearch = useDebouncedCallback((val) => {
    if (val.trim().length >= 3) handleSearch(val);
  }, 400);

  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileIcon = (ext) => {
    const icons = { pdf: '📄', png: '🖼️', jpg: '🖼️', docx: '📝', xlsx: '📊', txt: '📃', csv: '📊' };
    return icons[ext?.replace('.','')] || '📁';
  };

  const viewDocument = async (doc) => {
    const filename = doc.metadata?.filename || doc.filename;
    if (!filename) return;
    setSelectedDoc(doc);
    setLoadingContent(true);
    try {
      const response = await documentsApi.content(filename);
      setDocContent(response.data?.content || tr('common.noData'));
    } catch (e) {
      setDocContent(`${tr('common.error')}: ` + e.message);
    } finally {
      setLoadingContent(false);
    }
  };

  return (
    <div className="glass-card" style={{ padding: '1.5rem' }}>
      <h2 style={{
        fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 600,
        color: 'var(--text-primary)', marginBottom: '1.5rem',
        display: 'flex', alignItems: 'center', gap: '0.5rem',
      }}>
        <span style={{ fontSize: '1.2rem' }}>🔍</span> {tr('search.title')}
      </h2>

      {/* Search Input */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <input
          type="text" value={query} onChange={(e) => { setQuery(e.target.value); debouncedSearch(e.target.value); }}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder={tr('search.placeholder')}
          style={{
            flex: 1, background: 'var(--bg-glass)', border: '1px solid var(--border-glass)',
            borderRadius: '12px', padding: '0.75rem 1rem', color: 'var(--text-primary)',
            fontSize: '0.9rem', fontFamily: 'var(--font-sans)', outline: 'none', transition: 'border-color 0.2s',
          }}
          onFocus={(e) => e.target.style.borderColor = 'var(--accent-blue)'}
          onBlur={(e) => e.target.style.borderColor = 'var(--border-glass)'}
        />
        <button
          onClick={handleSearch} disabled={loading}
          style={{
            padding: '0.75rem 1.5rem', background: loading ? 'rgba(74,158,255,0.05)' : 'var(--accent-gradient)',
            color: loading ? 'var(--text-secondary)' : 'var(--bg-dark)', border: 'none',
            borderRadius: '12px', fontSize: '0.9rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.5 : 1, transition: 'all 0.3s', fontFamily: 'var(--font-mono)',
          }}
          onMouseEnter={(e) => { if (!loading) e.target.style.transform = 'translateY(-1px)'; }}
          onMouseLeave={(e) => { if (!loading) e.target.style.transform = 'none'; }}
        >
          {loading ? '⏳' : '🔍'}
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <select
          value={filters.type} onChange={(e) => setFilters({...filters, type: e.target.value})}
          style={{
            background: 'var(--bg-glass)', border: '1px solid var(--border-glass)',
            borderRadius: '10px', padding: '0.6rem 0.8rem', color: 'var(--text-primary)',
            fontSize: '0.85rem', fontFamily: 'var(--font-sans)', cursor: 'pointer', outline: 'none',
          }}
        >
          <option value="all">{tr('search.allTypes')}</option>
          <option value="pdf">{tr('search.typePdf')}</option>
          <option value="docx">{tr('search.typeWord')}</option>
          <option value="xlsx">{tr('search.typeExcel')}</option>
          <option value="txt">TXT</option>
          <option value="csv">CSV</option>
        </select>

        <select
          value={filters.sizeRange} onChange={(e) => setFilters({...filters, sizeRange: e.target.value})}
          style={{
            background: 'var(--bg-glass)', border: '1px solid var(--border-glass)',
            borderRadius: '10px', padding: '0.6rem 0.8rem', color: 'var(--text-primary)',
            fontSize: '0.85rem', fontFamily: 'var(--font-sans)', cursor: 'pointer', outline: 'none',
          }}
        >
          <option value="all">{tr('search.allSizes')}</option>
          <option value="small">{tr('search.small')}</option>
          <option value="medium">{tr('search.medium')}</option>
          <option value="large">{tr('search.large')}</option>
        </select>

        <select
          value={sortBy} onChange={(e) => setSortBy(e.target.value)}
          style={{
            background: 'var(--bg-glass)', border: '1px solid var(--border-glass)',
            borderRadius: '10px', padding: '0.6rem 0.8rem', color: 'var(--text-primary)',
            fontSize: '0.85rem', fontFamily: 'var(--font-sans)', cursor: 'pointer', outline: 'none',
          }}
        >
          <option value="score">{tr('search.byRelevance')}</option>
          <option value="name">{tr('search.byName')}</option>
        </select>

        <button
          onClick={() => setFilters({type: 'all', sizeRange: 'all'})}
          style={{
            background: 'var(--bg-glass)', border: '1px solid var(--border-glass)',
            borderRadius: '10px', padding: '0.6rem 0.8rem', color: 'var(--text-secondary)',
            fontSize: '0.8rem', cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'var(--font-mono)',
          }}
          onMouseEnter={(e) => { e.target.style.background = 'rgba(255,255,255,0.05)'; e.target.style.color = 'var(--text-primary)'; }}
          onMouseLeave={(e) => { e.target.style.background = 'var(--bg-glass)'; e.target.style.color = 'var(--text-secondary)'; }}
        >{tr('search.reset')}</button>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div style={{ animation: 'fadeInUp 0.4s ease-out' }}>
          <h3 style={{
            fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 600,
            color: 'var(--text-primary)', marginBottom: '1rem',
            display: 'flex', alignItems: 'center', gap: '0.5rem',
          }}>
            {tr('search.results')} ({results.length})
            <span style={{
              fontSize: '0.7rem', background: 'rgba(74,158,255,0.1)', color: 'var(--accent-blue)',
              padding: '0.15rem 0.5rem', borderRadius: '6px', fontWeight: 400,
            }}>{query}</span>
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {results.map((doc, idx) => (
              <div key={idx} style={{
                padding: '1rem 1.25rem', background: 'var(--bg-glass)',
                borderRadius: '12px', border: '1px solid var(--border-glass)',
                transition: 'all 0.3s', animation: `fadeInUp 0.3s ease-out ${idx * 0.05}s backwards`,
                cursor: 'pointer',
              }}
              onClick={() => viewDocument(doc)}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(74,158,255,0.2)';
                e.currentTarget.style.transform = 'translateX(4px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-glass)';
                e.currentTarget.style.transform = 'none';
              }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', gap: '0.75rem', flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: '1.4rem' }}>{getFileIcon(doc.metadata?.extension)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 500,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>{doc.metadata?.filename || doc.filename}</p>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)', marginTop: '0.2rem' }}>
                        {doc.metadata?.extension?.toUpperCase() || 'FILE'} • {tr('search.score')}: {doc.score?.toFixed(2)}
                      </p>
                      {/* Content preview */}
                      <p style={{
                        color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.5,
                        marginTop: '0.5rem', display: '-webkit-box', WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical', overflow: 'hidden',
                      }}>
                        {doc.content?.substring(0, 200)}...
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', marginLeft: '0.75rem' }}>
                    <span style={{
                      fontSize: '0.7rem', background: 'rgba(126,231,135,0.08)', color: 'var(--accent-green)',
                      padding: '0.2rem 0.5rem', borderRadius: '4px', fontFamily: 'var(--font-mono)',
                    }}>
                      {((doc.score || 0) * 100).toFixed(0)}% {tr('search.match')}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {query && !loading && results.length === 0 && (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem', opacity: 0.6 }}>🔍</div>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.9rem' }}>{tr('search.noResultsFor')} "{query}"</p>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.8rem', marginTop:'0.4rem' }}>{tr('search.tryDifferent')}</p>
        </div>
      )}

      {/* Document Preview Modal */}
      {selectedDoc && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: '2rem',
        }} onClick={() => setSelectedDoc(null)}
        >
          <div style={{
            background: 'var(--bg-secondary)', borderRadius: '16px', border: '1px solid var(--border-glass)',
            maxWidth: '800px', width: '100%', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
          }} onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-glass)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <h3 style={{ color: 'var(--text-primary)', fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>
                {selectedDoc.metadata?.filename || selectedDoc.filename}
              </h3>
              <button
                onClick={() => setSelectedDoc(null)}
                style={{
                  background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '1.5rem',
                  cursor: 'pointer', padding: '0.25rem',
                }}
              >✕</button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem' }}>
              {loadingContent ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
                  <div style={{ width: '24px', height: '24px', border: '2px solid rgba(74,158,255,0.1)', borderTop: '2px solid var(--accent-blue)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                </div>
              ) : (
                <pre style={{
                  color: 'var(--text-secondary)', fontSize: '0.85rem', fontFamily: 'var(--font-mono)',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0,
                }}>{docContent}</pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SearchWithFilters;
