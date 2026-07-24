import React, { useState, useEffect, useCallback } from 'react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

export default function Folders({ showToast }) {
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(null);
  const [scanProgress, setScanProgress] = useState(null);
  const [newFolderPath, setNewFolderPath] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => { loadFolders(); }, []);

  const loadFolders = async () => {
    try {
      const res = await fetch(`${API_URL}/api/documents/folders`);
      const data = await res.json();
      setFolders(data || []);
    } catch (err) {
      console.error('Errore caricamento cartelle:', err);
    } finally {
      setLoading(false);
    }
  };

  const addFolder = async () => {
    if (!newFolderPath.trim()) {
      showToast?.('Inserisci percorso cartella', 'error');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/documents/folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: newFolderPath, name: newFolderName || newFolderPath.split('/').pop() })
      });
      if (res.ok) {
        showToast?.('Cartella aggiunta', 'success');
        setNewFolderPath(''); setNewFolderName('');
        loadFolders();
      } else {
        const data = await res.json();
        showToast?.(data.detail || 'Errore', 'error');
      }
    } catch (err) {
      showToast?.('Errore: ' + err.message, 'error');
    }
  };

  const removeFolder = async (name) => {
    if (!confirm(`Rimuovere "${name}"?`)) return;
    try {
      const res = await fetch(`${API_URL}/api/documents/folders/${name}`, { method: 'DELETE' });
      if (res.ok) {
        showToast?.('Cartella rimossa', 'success');
        loadFolders();
      }
    } catch (err) {
      showToast?.('Errore: ' + err.message, 'error');
    }
  };

  const pollScanStatus = useCallback((onDone) => {
    let attempts = 0;
    const maxAttempts = 600;
    const poll = async () => {
      try {
        const res = await fetch(`${API_URL}/api/documents/scan-status`);
        const s = await res.json();
        if (s.total_files > 0) {
          setScanProgress({ processed: s.processed, total: s.total_files, pct: s.progress_pct, newFiles: s.new_files });
        }
        if (s.done) {
          setScanProgress(null);
          loadFolders();
          if (s.result) {
            const r = s.result;
            if (r.new_files > 0) showToast?.(`Scansione completata: ${r.new_files} nuovi documenti`, 'success');
            else showToast?.('Scansione completata: nessun nuovo documento', 'info');
          }
          onDone();
          return;
        }
      } catch {}
      attempts++;
      if (attempts < maxAttempts) setTimeout(poll, 500);
      else { setScanProgress(null); onDone(); }
    };
    poll();
  }, [showToast]);

  const scanFolder = async (name) => {
    setScanning(name);
    try {
      const res = await fetch(`${API_URL}/api/documents/folders/${name}/scan`, { method: 'POST' });
      const data = await res.json();
      showToast?.(`Scansione avviata...`, 'info');
      pollScanStatus(() => setScanning(null));
    } catch (err) {
      if (err.message?.includes('409')) showToast?.('Scansione già in corso', 'warning');
      else showToast?.('Errore scansione: ' + err.message, 'error');
      setScanning(null);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
        <div style={{
          width: '36px', height: '36px', border: '3px solid rgba(74,158,255,0.1)',
          borderTop: '3px solid var(--accent-blue)', borderRadius: '50%',
          animation: 'spin 1s linear infinite', marginRight: '0.75rem',
        }}></div>
        Caricamento...
      </div>
    );
  }

  return (
    <div className="glass-card" style={{ padding: '1.5rem' }}>
      <h2 style={{
        fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 600,
        color: 'var(--text-primary)', marginBottom: '1.5rem',
        display: 'flex', alignItems: 'center', gap: '0.5rem',
      }}>
        <span style={{ fontSize: '1.2rem' }}>📂</span> Cartelle Monitorizzate
      </h2>

{/* Add Folder Form */}
      <div style={{
        background: 'var(--bg-glass)', borderRadius: '14px', border: '1px solid var(--border-glass)',
        padding: '1.25rem', marginBottom: '1.5rem',
      }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          <input
            type="text" placeholder="Percorso cartella (es. /Users/nome/Documents)"
            value={newFolderPath} onChange={(e) => setNewFolderPath(e.target.value)}
            style={{
              flex: 1, minWidth: '200px', background: 'rgba(15,15,25,0.8)',
              border: '1px solid var(--border-glass)', borderRadius: '10px',
              padding: '0.65rem 1rem', color: 'var(--text-primary)',
              fontSize: '0.85rem', fontFamily: 'var(--font-mono)', outline: 'none', transition: 'border-color 0.2s',
            }}
            onFocus={(e) => e.target.style.borderColor = 'var(--accent-purple)'}
            onBlur={(e) => e.target.style.borderColor = 'var(--border-glass)'}
          />
          <input
            type="text" placeholder="Nome (opzionale)"
            value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)}
            style={{
              width: '180px', background: 'rgba(15,15,25,0.8)',
              border: '1px solid var(--border-glass)', borderRadius: '10px',
              padding: '0.65rem 1rem', color: 'var(--text-primary)',
              fontSize: '0.85rem', fontFamily: 'var(--font-sans)', outline: 'none', transition: 'border-color 0.2s',
            }}
            onFocus={(e) => e.target.style.borderColor = 'var(--accent-purple)'}
            onBlur={(e) => e.target.style.borderColor = 'var(--border-glass)'}
          />
          <button
            onClick={addFolder}
            style={{
              padding: '0.65rem 1.25rem',
              background: 'linear-gradient(135deg, rgba(168,85,247,0.15) 0%, rgba(236,72,153,0.15) 100%)',
              color: 'var(--accent-purple)', border: '1px solid rgba(168,85,247,0.2)',
              borderRadius: '10px', fontSize: '0.85rem', fontWeight: 500,
              cursor: 'pointer', transition: 'all 0.3s', fontFamily: 'var(--font-sans)',
            }}
            onMouseEnter={(e) => { e.target.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={(e) => { e.target.style.transform = 'none'; }}
          >Aggiungi</button>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
          💡 I file verranno indicizzati senza essere spostati
        </p>
        <button
          onClick={() => setShowHelp(!showHelp)}
          style={{
            background: 'none', border: 'none', color: 'var(--accent-blue)',
            fontSize: '0.75rem', cursor: 'pointer', padding: '0.25rem 0',
            textDecoration: 'underline',
          }}
        >
          {showHelp ? '▼ Nascondi percorsi' : '▶ Mostra percorsi comuni'}
        </button>
        {showHelp && (
          <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
              Clicca su un percorso per copiarlo:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {[
                '/Users/daniele/Documents',
                '/Users/daniele/Downloads',
                '/Users/daniele/Desktop',
              ].map((path) => (
                <button
                  key={path}
                  onClick={() => { setNewFolderPath(path); setNewFolderName(path.split('/').pop()); setShowHelp(false); }}
                  style={{
                    textAlign: 'left', padding: '0.4rem 0.6rem', background: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--border-glass)', borderRadius: '6px', color: 'var(--text-secondary)',
                    fontSize: '0.75rem', fontFamily: 'var(--font-mono)', cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => { e.target.style.background = 'rgba(74,158,255,0.1)'; e.target.style.color = 'var(--accent-blue)'; }}
                  onMouseLeave={(e) => { e.target.style.background = 'rgba(255,255,255,0.03)'; e.target.style.color = 'var(--text-secondary)'; }}
                >
                  {path}
                </button>
              ))}
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', marginTop: '0.75rem', opacity: 0.7 }}>
              💡 Per trovare il percorso: tasto destro su cartella in Finder → Informazioni → tieni premuto Opzione e clicca "Copia percorso"
            </p>
          </div>
        )}
      </div>

      {/* Folders List */}
      {folders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.6 }}>📁</div>
          <p style={{ fontSize: '1.1rem', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
            Nessuna cartella monitorizzata
          </p>
          <p style={{ fontSize: '0.85rem' }}>Aggiungi una cartella per iniziare</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {folders.map((folder, idx) => (
            <div key={folder.name} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '1rem 1.25rem', background: 'var(--bg-glass)',
              borderRadius: '12px', border: '1px solid var(--border-glass)',
              transition: 'all 0.3s', animation: `fadeInUp 0.3s ease-out ${idx * 0.05}s backwards`,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgba(168,85,247,0.2)';
              e.currentTarget.style.transform = 'translateX(4px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-glass)';
              e.currentTarget.style.transform = 'none';
            }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: '1.6rem' }}>📁</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    color: 'var(--text-primary)', fontSize: '0.95rem', fontWeight: 500,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>{folder.name}</p>
                  <p style={{
                    color: 'var(--text-secondary)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '0.2rem',
                  }}>{folder.path}</p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: '1rem' }}>
                <span style={{
                  fontSize: '0.7rem', padding: '0.2rem 0.6rem', borderRadius: '6px',
                  background: folder.active ? 'rgba(126,231,135,0.1)' : 'rgba(255,255,255,0.05)',
                  color: folder.active ? 'var(--accent-green)' : 'var(--text-secondary)',
                  border: `1px solid ${folder.active ? 'rgba(126,231,135,0.2)' : 'var(--border-glass)'}`,
                  fontFamily: 'var(--font-mono)',
                }}>
                  {folder.active ? 'Attiva' : 'Inattiva'}
                </span>
                <button
                  onClick={() => scanFolder(folder.name)}
                  disabled={scanning === folder.name}
                  style={{
                    padding: '0.4rem 0.8rem',
                    background: scanning === folder.name ? 'rgba(168,85,247,0.05)' : 'rgba(168,85,247,0.08)',
                    color: 'var(--accent-purple)', border: '1px solid rgba(168,85,247,0.15)',
                    borderRadius: '8px', fontSize: '0.8rem', cursor: scanning === folder.name ? 'not-allowed' : 'pointer',
                    opacity: scanning === folder.name ? 0.5 : 1, transition: 'all 0.2s',
                  }}
                >
                  {scanning === folder.name ? '⏳' : '🔍 Scansiona'}
                </button>
                <button
                  onClick={() => removeFolder(folder.name)}
                  style={{
                    padding: '0.4rem 0.8rem', background: 'rgba(255,85,85,0.05)',
                    color: '#ff5555', border: '1px solid rgba(255,85,85,0.15)',
                    borderRadius: '8px', fontSize: '0.8rem', cursor: 'pointer', transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => e.target.style.background = 'rgba(255,85,85,0.1)'}
                  onMouseLeave={(e) => e.target.style.background = 'rgba(255,85,85,0.05)'}
                >Rimuovi</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {scanProgress && (
        <div style={{ marginTop: '1rem', padding: '0.75rem 1.25rem', background: 'var(--bg-glass)', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
            <span>Indicizzazione: {scanProgress.processed}/{scanProgress.total}</span>
            <span>{scanProgress.pct}% · {scanProgress.newFiles} nuovi</span>
          </div>
          <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ width: `${scanProgress.pct}%`, height: '100%', background: 'linear-gradient(90deg, #a855f7, #ec4899)', borderRadius: '3px', transition: 'width 0.5s ease' }} />
          </div>
        </div>
      )}

      {/* Info */}
      <div style={{
        marginTop: '1.5rem', padding: '1rem 1.25rem',
        background: 'rgba(74,158,255,0.03)', borderRadius: '12px',
        border: '1px solid rgba(74,158,255,0.08)',
      }}>
        <p style={{
          color: 'var(--accent-blue)', fontSize: '0.8rem', fontWeight: 500,
          marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
        }}><span>💡</span> Come funziona</p>
        <ul style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.8, paddingLeft: '1.25rem' }}>
          <li>Aggiungi una cartella contenente i tuoi documenti</li>
          <li>Clicca "Scansiona" per indicizzare nuovi file</li>
          <li>I documenti verranno aggiunti alla ricerca AI</li>
          <li>Puoi rimuovere cartelle quando non servono più</li>
        </ul>
      </div>
    </div>
  );
}
