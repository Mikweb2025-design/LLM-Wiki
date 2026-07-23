import React, { useState, useEffect, useMemo } from 'react';
import { documentsApi } from '../utils/api';

function DocumentList({ showToast }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [reindexing, setReindexing] = useState(null);
  const [reindexAllLoading, setReindexAllLoading] = useState(false);
  const [reindexProgress, setReindexProgress] = useState(null);
  const [readingDoc, setReadingDoc] = useState(null);
  const [docContent, setDocContent] = useState('');
  const [loadingContent, setLoadingContent] = useState(false);
  const [customDir, setCustomDir] = useState('');
  const [scanningCustom, setScanningCustom] = useState(false);
  const [showFolderHelper, setShowFolderHelper] = useState(false);
  const [previewFiles, setPreviewFiles] = useState([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [recentFolders, setRecentFolders] = useState(['/Users/daniele/Downloads', '/Users/daniele/Documents', '/Users/daniele/Desktop']);
  const [searchFilter, setSearchFilter] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const response = await documentsApi.list();
      setDocuments(response.data);
    } catch (error) {
      console.error('Errore caricamento documenti:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleScan = async () => {
    setScanning(true);
    try {
      await documentsApi.scan();
      fetchDocuments();
      showToast('Scansione completata', 'success');
    } catch (error) {
      console.error('Errore scansione:', error);
    } finally {
      setScanning(false);
    }
  };

  const handleDelete = async (filename) => {
    if (!confirm(`Eliminare "${filename}"?`)) return;
    try {
      await documentsApi.delete(filename);
      showToast(`"${filename}" eliminato`, 'success');
      fetchDocuments();
    } catch (error) {
      console.error('Errore eliminazione:', error);
      showToast('Errore durante l\'eliminazione', 'error');
    }
  };

  const handleReindex = async (filename) => {
    if (!confirm(`Reindicizzare "${filename}"?`)) return;
    setReindexing(filename);
    try {
      await documentsApi.reindex(filename);
      showToast(`"${filename}" reindicizzato con successo!`, 'success');
      fetchDocuments();
    } catch (error) {
      console.error('Errore reindicizzazione:', error);
      showToast('Errore durante la reindicizzazione', 'error');
    } finally {
      setReindexing(null);
    }
  };

  const handleReindexAll = async () => {
    if (!confirm('Reindicizzare TUTTI i documenti? Questa operazione potrebbe richiedere tempo.')) return;
    setReindexAllLoading(true);
    setReindexProgress({ current: 0, total: documents.length });
    try {
      const response = await documentsApi.reindexAll();
      const data = response.data;
      setReindexProgress(null);
      showToast(`Reindicizzati ${data.successes}/${data.total_files} documenti`, data.successes > 0 ? 'success' : 'warning');
      if (data.errors.length > 0) {
        console.error('Errori reindicizzazione:', data.errors);
        showToast(`${data.errors.length} errori durante la reindicizzazione`, 'error');
      }
      fetchDocuments();
    } catch (error) {
      setReindexProgress(null);
      console.error('Errore reindicizzazione totale:', error);
      showToast('Errore durante la reindicizzazione: ' + error.message, 'error');
    } finally {
      setReindexAllLoading(false);
    }
  };

  const handleRead = async (filename) => {
    setReadingDoc(filename);
    setLoadingContent(true);
    setDocContent('');
    try {
      const response = await documentsApi.content(filename);
      setDocContent(response.data.content);
    } catch (error) {
      console.error('Errore lettura documento:', error);
      showToast('Errore durante la lettura del documento', 'error');
      setReadingDoc(null);
    } finally {
      setLoadingContent(false);
    }
  };

  const closeReader = () => {
    setReadingDoc(null);
    setDocContent('');
  };

  const handleScanCustom = async () => {
    if (!customDir.trim()) {
      showToast('Inserisci un percorso valido', 'warning');
      return;
    }
    setScanningCustom(true);
    try {
      const response = await documentsApi.scanCustom(customDir);
      const data = response.data;
      showToast(data.message, data.new_files > 0 ? 'success' : 'info');
      if (data.errors && data.errors.length > 0) {
        console.error('Errori:', data.errors);
      }
      fetchDocuments();
      if (!recentFolders.includes(customDir)) {
        setRecentFolders([customDir, ...recentFolders.slice(0, 4)]);
      }
      setPreviewFiles([]);
    } catch (error) {
      console.error('Errore scansione cartella personalizzata:', error);
      showToast('Errore durante la scansione: ' + (error.response?.data?.detail || error.message), 'error');
    } finally {
      setScanningCustom(false);
    }
  };

  const handlePreviewFiles = async () => {
    if (!customDir.trim()) return;
    setLoadingPreview(true);
    try {
      const response = await documentsApi.scanCustom(customDir);
      const data = response.data;
      showToast(`Trovati ${data.scanned_files} file. ${data.new_files} nuovi, ${data.already_indexed} già indicizzati.`, 'info');
    } catch (error) {
      console.error('Errore preview:', error);
    } finally {
      setLoadingPreview(false);
    }
  };

  const getFileIcon = (ext) => {
    const icons = {
      '.pdf': '📄',
      '.png': '🖼️',
      '.jpg': '🖼️',
      '.jpeg': '🖼️',
      '.tiff': '🖼️',
      '.bmp': '🖼️',
      '.xlsx': '📊',
      '.xls': '📊',
      '.docx': '📝',
      '.txt': '📃',
      '.csv': '📊',
    };
    return icons[ext] || '📁';
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const filteredAndSortedDocs = useMemo(() => {
    let filtered = documents;
    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      filtered = filtered.filter(d =>
        d.filename.toLowerCase().includes(q) ||
        d.extension?.toLowerCase().includes(q)
      );
    }
    const sorted = [...filtered].sort((a, b) => {
      let aVal, bVal;
      if (sortBy === 'name') {
        aVal = a.filename.toLowerCase();
        bVal = b.filename.toLowerCase();
      } else if (sortBy === 'size') {
        aVal = a.size_bytes || 0;
        bVal = b.size_bytes || 0;
      } else {
        aVal = new Date(a.modified || 0);
        bVal = new Date(b.modified || 0);
      }
      if (sortOrder === 'asc') {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      } else {
        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
      }
    });
    return sorted;
  }, [documents, searchFilter, sortBy, sortOrder]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
        <div style={{
          width: '36px',
          height: '36px',
          border: '3px solid rgba(74, 158, 255, 0.1)',
          borderTop: '3px solid var(--accent-blue)',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          marginRight: '0.75rem',
        }}></div>
        Caricamento...
      </div>
    );
  }

  return (
    <div className="glass-card" style={{ padding: '1.5rem' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '1.5rem',
        flexWrap: 'wrap',
        gap: '0.75rem',
      }}>
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.3rem',
          fontWeight: 600,
          color: 'var(--text-primary)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          <span style={{ fontSize: '1.2rem' }}>📄</span>
          Documenti Indicizzati
          <span style={{
            fontSize: '0.8rem',
            backgroundColor: 'rgba(74, 158, 255, 0.1)',
            color: 'var(--accent-blue)',
            padding: '0.2rem 0.6rem',
            borderRadius: '8px',
            fontWeight: 400,
          }}>
            {filteredAndSortedDocs.length}
          </span>
        </h2>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            onClick={handleReindexAll}
            disabled={reindexAllLoading}
            style={{
              padding: '0.5rem 1rem',
              background: reindexAllLoading ? 'rgba(74, 158, 255, 0.05)' : 'linear-gradient(135deg, rgba(74, 158, 255, 0.1) 0%, rgba(168, 85, 247, 0.1) 100%)',
              color: 'var(--accent-blue)',
              border: '1px solid rgba(74, 158, 255, 0.2)',
              borderRadius: '10px',
              fontSize: '0.85rem',
              cursor: reindexAllLoading ? 'not-allowed' : 'pointer',
              transition: 'all 0.3s',
              opacity: reindexAllLoading ? 0.5 : 1,
            }}
            onMouseEnter={(e) => { if (!reindexAllLoading) { e.target.style.transform = 'translateY(-1px)'; } }}
            onMouseLeave={(e) => { e.target.style.transform = 'none'; }}
          >
            {reindexAllLoading ? '⏳ Reindicizzazione...' : '🔄 Reindicizza Tutto'}
          </button>
          <button
            onClick={handleScan}
            disabled={scanning}
            style={{
              padding: '0.5rem 1rem',
              background: scanning ? 'rgba(255,255,255,0.05)' : 'var(--bg-glass)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-glass)',
              borderRadius: '10px',
              fontSize: '0.85rem',
              cursor: scanning ? 'not-allowed' : 'pointer',
              transition: 'all 0.3s',
              opacity: scanning ? 0.5 : 1,
            }}
            onMouseEnter={(e) => { if (!scanning) { e.target.style.background = 'rgba(255,255,255,0.08)'; e.target.style.color = 'var(--text-primary)'; } }}
            onMouseLeave={(e) => { e.target.style.background = 'var(--bg-glass)'; e.target.style.color = 'var(--text-secondary)'; }}
          >
            {scanning ? '⏳ Scansione...' : '🔍 Scansiona Cartella'}
          </button>
          <button
            onClick={fetchDocuments}
            style={{
              padding: '0.5rem 1rem',
              background: 'var(--bg-glass)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-glass)',
              borderRadius: '10px',
              fontSize: '0.85rem',
              cursor: 'pointer',
              transition: 'all 0.3s',
            }}
            onMouseEnter={(e) => { e.target.style.background = 'rgba(255,255,255,0.08)'; e.target.style.color = 'var(--text-primary)'; }}
            onMouseLeave={(e) => { e.target.style.background = 'var(--bg-glass)'; e.target.style.color = 'var(--text-secondary)'; }}
          >
            🔄 Aggiorna
          </button>
        </div>
      </div>

      {/* Search and Sort */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <input
          type="text"
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          placeholder="Cerca documenti..."
          style={{
            flex: 1,
            minWidth: '200px',
            background: 'var(--bg-glass)',
            border: '1px solid var(--border-glass)',
            borderRadius: '10px',
            padding: '0.6rem 1rem',
            color: 'var(--text-primary)',
            fontSize: '0.85rem',
            fontFamily: 'var(--font-sans)',
            outline: 'none',
            transition: 'border-color 0.2s',
          }}
          onFocus={(e) => e.target.style.borderColor = 'var(--accent-blue)'}
          onBlur={(e) => e.target.style.borderColor = 'var(--border-glass)'}
        />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          style={{
            background: 'var(--bg-glass)',
            border: '1px solid var(--border-glass)',
            borderRadius: '10px',
            padding: '0.6rem 0.8rem',
            color: 'var(--text-primary)',
            fontSize: '0.85rem',
            fontFamily: 'var(--font-sans)',
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          <option value="name">Nome</option>
          <option value="size">Dimensione</option>
          <option value="date">Data</option>
        </select>
        <button
          onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')}
          style={{
            padding: '0.6rem 0.8rem',
            background: 'var(--bg-glass)',
            border: '1px solid var(--border-glass)',
            borderRadius: '10px',
            color: 'var(--text-secondary)',
            fontSize: '0.85rem',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          title={sortOrder === 'asc' ? 'Crescente' : 'Decrescente'}
        >
          {sortOrder === 'asc' ? '↑' : '↓'}
        </button>
      </div>

      {/* Progress Bar for Reindex All */}
      {reindexAllLoading && (
        <div style={{
          marginBottom: '1.5rem',
          padding: '1rem',
          background: 'rgba(74, 158, 255, 0.05)',
          border: '1px solid rgba(74, 158, 255, 0.15)',
          borderRadius: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--accent-blue)', fontWeight: 500 }}>Reindicizzazione in corso...</p>
            {reindexProgress && (
              <span style={{ fontSize: '0.75rem', color: 'var(--accent-blue)' }}>{reindexProgress.current}/{reindexProgress.total}</span>
            )}
          </div>
          {reindexProgress && (
            <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${(reindexProgress.current / reindexProgress.total) * 100}%`,
                background: 'var(--accent-gradient)',
                borderRadius: '3px',
                transition: 'width 0.3s',
              }} />
            </div>
          )}
        </div>
      )}

      {/* Documents List - Bigger cards */}
      {filteredAndSortedDocs.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '3rem 1rem',
          color: 'var(--text-secondary)',
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.6 }}>📭</div>
          <p style={{ fontSize: '1.1rem', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Nessun documento indicizzato</p>
          <p style={{ fontSize: '0.85rem' }}>Carica file o scansiona la cartella documenti</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {filteredAndSortedDocs.map((doc, index) => (
            <div
              key={index}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '1rem 1.25rem',
                background: 'var(--bg-glass)',
                borderRadius: '12px',
                border: '1px solid var(--border-glass)',
                transition: 'all 0.3s',
                animation: `fadeInUp 0.4s ease-out ${index * 0.03}s backwards`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(74, 158, 255, 0.2)';
                e.currentTarget.style.transform = 'translateX(4px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-glass)';
                e.currentTarget.style.transform = 'none';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: '1.6rem' }}>{getFileIcon(doc.extension)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    color: 'var(--text-primary)',
                    fontSize: '0.95rem',
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    marginBottom: '0.2rem',
                  }}>{doc.filename}</p>
                  <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                    <span>{doc.extension?.toUpperCase()}</span>
                    <span>{formatSize(doc.size_bytes)}</span>
                    <span>{new Date(doc.modified).toLocaleDateString('it-IT')}</span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => handleRead(doc.filename)}
                  style={{
                    padding: '0.4rem 0.7rem',
                    background: 'rgba(126, 231, 135, 0.05)',
                    color: 'var(--accent-green)',
                    border: '1px solid rgba(126, 231, 135, 0.15)',
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => { e.target.style.background = 'rgba(126, 231, 135, 0.1)'; }}
                  onMouseLeave={(e) => { e.target.style.background = 'rgba(126, 231, 135, 0.05)'; }}
                  title="Leggi documento"
                >
                  📖
                </button>
                <button
                  onClick={() => handleReindex(doc.filename)}
                  disabled={reindexing === doc.filename}
                  style={{
                    padding: '0.4rem 0.7rem',
                    background: 'rgba(74, 158, 255, 0.05)',
                    color: 'var(--accent-blue)',
                    border: '1px solid rgba(74, 158, 255, 0.15)',
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                    cursor: reindexing === doc.filename ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                    opacity: reindexing === doc.filename ? 0.5 : 1,
                  }}
                  onMouseEnter={(e) => { if (reindexing !== doc.filename) { e.target.style.background = 'rgba(74, 158, 255, 0.1)'; } }}
                  onMouseLeave={(e) => { e.target.style.background = 'rgba(74, 158, 255, 0.05)'; }}
                  title="Reindicizza"
                >
                  {reindexing === doc.filename ? '⏳' : '🔄'}
                </button>
                <button
                  onClick={() => handleDelete(doc.filename)}
                  style={{
                    padding: '0.4rem 0.7rem',
                    background: 'rgba(255, 85, 85, 0.05)',
                    color: '#ff5555',
                    border: '1px solid rgba(255, 85, 85, 0.15)',
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => { e.target.style.background = 'rgba(255, 85, 85, 0.1)'; }}
                  onMouseLeave={(e) => { e.target.style.background = 'rgba(255, 85, 85, 0.05)'; }}
                  title="Elimina"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Custom folder scan */}
      <div style={{
        marginTop: '1.5rem',
        padding: '1.25rem',
        background: 'var(--bg-glass)',
        borderRadius: '14px',
        border: '1px solid var(--border-glass)',
      }}>
        <p style={{
          fontSize: '0.9rem',
          fontWeight: 500,
          color: 'var(--text-primary)',
          marginBottom: '0.75rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          <span style={{ fontSize: '1rem' }}>📂</span> Scansiona cartella personalizzata
        </p>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
          I file verranno indicizzati senza essere spostati. I file già presenti verranno ignorati automaticamente.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.75rem' }}>
          {recentFolders.map((folder, idx) => (
            <button
              key={idx}
              onClick={() => setCustomDir(folder)}
              style={{
                padding: '0.3rem 0.7rem',
                background: customDir === folder ? 'rgba(168, 85, 247, 0.1)' : 'rgba(255,255,255,0.03)',
                color: customDir === folder ? 'var(--accent-purple)' : 'var(--text-secondary)',
                border: `1px solid ${customDir === folder ? 'rgba(168, 85, 247, 0.2)' : 'var(--border-glass)'}`,
                borderRadius: '8px',
                fontSize: '0.75rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {idx === 0 && '📥 '}{idx === 1 && '📄 '}{idx === 2 && '🖥️ '}
              {folder.split('/').pop()}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input
            type="text"
            value={customDir}
            onChange={(e) => setCustomDir(e.target.value)}
            placeholder="/Users/daniele/..."
            style={{
              flex: 1,
              minWidth: '200px',
              background: 'rgba(15, 15, 25, 0.8)',
              border: '1px solid var(--border-glass)',
              borderRadius: '10px',
              padding: '0.65rem 1rem',
              color: 'var(--text-primary)',
              fontSize: '0.85rem',
              fontFamily: 'var(--font-mono)',
              outline: 'none',
              transition: 'border-color 0.2s',
            }}
            onFocus={(e) => e.target.style.borderColor = 'var(--accent-purple)'}
            onBlur={(e) => e.target.style.borderColor = 'var(--border-glass)'}
            onKeyPress={(e) => e.key === 'Enter' && handleScanCustom()}
          />
          <button
            onClick={handlePreviewFiles}
            disabled={loadingPreview || !customDir.trim()}
            style={{
              padding: '0.65rem 1rem',
              background: loadingPreview ? 'rgba(255,255,255,0.05)' : 'var(--bg-glass)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-glass)',
              borderRadius: '10px',
              fontSize: '0.8rem',
              cursor: loadingPreview ? 'not-allowed' : 'pointer',
              opacity: loadingPreview ? 0.5 : 1,
              transition: 'all 0.2s',
            }}
            title="Anteprima file"
          >
            {loadingPreview ? '⏳' : '👁️'}
          </button>
          <button
            onClick={handleScanCustom}
            disabled={scanningCustom || !customDir.trim()}
            style={{
              padding: '0.65rem 1.25rem',
              background: scanningCustom ? 'rgba(168, 85, 247, 0.05)' : 'linear-gradient(135deg, rgba(168, 85, 247, 0.1) 0%, rgba(236, 72, 153, 0.1) 100%)',
              color: 'var(--accent-purple)',
              border: '1px solid rgba(168, 85, 247, 0.2)',
              borderRadius: '10px',
              fontSize: '0.85rem',
              cursor: scanningCustom ? 'not-allowed' : 'pointer',
              transition: 'all 0.3s',
              opacity: scanningCustom ? 0.5 : 1,
            }}
            onMouseEnter={(e) => { if (!scanningCustom) { e.target.style.transform = 'translateY(-1px)'; } }}
            onMouseLeave={(e) => { e.target.style.transform = 'none'; }}
          >
            {scanningCustom ? '⏳ Scansione...' : '🔍 Scansiona e Indicizza'}
          </button>
        </div>
      </div>

      {/* Document Reader Modal */}
      {readingDoc && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(10px)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          animation: 'fadeInUp 0.3s ease-out',
        }}>
          <div style={{
            background: 'var(--bg-card)',
            borderRadius: '16px',
            maxWidth: '700px',
            width: '100%',
            maxHeight: '80vh',
            overflow: 'hidden',
            border: '1px solid var(--border-glass)',
            animation: 'slideInRight 0.4s ease-out',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid var(--border-glass)',
            }}>
              <h3 style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.1rem',
                fontWeight: 600,
                color: 'var(--text-primary)',
              }}>{readingDoc}</h3>
              <button
                onClick={closeReader}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  transition: 'color 0.2s',
                }}
                onMouseEnter={(e) => e.target.style.color = 'var(--text-primary)'}
                onMouseLeave={(e) => e.target.style.color = 'var(--text-secondary)'}
              >
                ×
              </button>
            </div>
            <div style={{ padding: '1.5rem', overflowY: 'auto', maxHeight: 'calc(80vh - 80px)' }}>
              {loadingContent ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Caricamento...</div>
              ) : (
                <pre style={{
                  whiteSpace: 'pre-wrap',
                  color: 'var(--text-secondary)',
                  fontSize: '0.85rem',
                  lineHeight: 1.7,
                  fontFamily: 'var(--font-sans)',
                  margin: 0,
                }}>
                  {docContent || 'Nessun contenuto disponibile'}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DocumentList;
