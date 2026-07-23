import { useState, useRef, useEffect } from 'react';
import { documentsApi } from '../utils/api';

function FilePreview({ filename, onClose }) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState('');
  const iframeRef = useRef(null);

  useEffect(() => { loadPreview(); }, [filename]);

  const loadPreview = async () => {
    setLoading(true);
    const ext = filename.split('.').pop().toLowerCase();
    setType(ext);

    // Images and PDF: serve the file directly (preview endpoint returns FileResponse)
    if (['png', 'jpg', 'jpeg', 'bmp', 'tiff'].includes(ext) || ext === 'pdf') {
      setContent(`http://localhost:8000/api/documents/preview/${encodeURIComponent(filename)}`);
      setLoading(false);
    } else {
      // Text files: get JSON with content
      try {
        const response = await fetch(`http://localhost:8000/api/documents/content/${encodeURIComponent(filename)}`);
        const data = await response.json();
        setContent(data.content || 'Nessun contenuto disponibile');
      } catch (e) {
        setContent('Errore nel caricamento');
      } finally {
        setLoading(false);
      }
    }
  };

  const getFileIcon = () => {
    const ext = type;
    if (['png', 'jpg', 'jpeg', 'bmp', 'tiff'].includes(ext)) return '🖼️';
    if (ext === 'pdf') return '📄';
    if (ext.match(/xls/)) return '📊';
    if (ext === 'docx') return '📝';
    return '📃';
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(10px)',
      zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1rem', animation: 'fadeInUp 0.3s ease-out',
    }}>
      <div style={{
        background: 'var(--bg-card)', borderRadius: '16px', maxWidth: '900px', width: '100%',
        maxHeight: '85vh', overflow: 'hidden', border: '1px solid var(--border-glass)',
        display: 'flex', flexDirection: 'column', animation: 'slideInRight 0.4s ease-out',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-glass)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.4rem' }}>{getFileIcon()}</span>
            <div>
              <h3 style={{ color: 'var(--text-primary)', fontSize: '1rem', fontWeight: 600 }}>{filename}</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>{type.toUpperCase()}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '1.5rem', cursor: 'pointer', transition: 'color 0.2s' }}
            onMouseEnter={(e) => e.target.style.color = 'var(--text-primary)'}
            onMouseLeave={(e) => e.target.style.color = 'var(--text-secondary)'}
          >×</button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem', minHeight: 0 }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', color: 'var(--text-secondary)' }}>
              <div style={{
                width: '32px', height: '32px', border: '3px solid rgba(74,158,255,0.1)', borderTop: '3px solid var(--accent-blue)', borderRadius: '50%', animation: 'spin 1s linear infinite', marginRight: '0.75rem',
              }}></div>
              Caricamento...
            </div>
          ) : (
            <>
              {['png', 'jpg', 'jpeg', 'bmp', 'tiff'].includes(type) && (
                <img src={content} alt={filename} style={{ maxWidth: '100%', height: 'auto', borderRadius: '8px' }} />
              )}

              {type === 'pdf' && (
                <iframe ref={iframeRef} src={content} style={{ width: '100%', height: 'calc(85vh - 80px)', border: 'none' }} title={filename} />
              )}

              {!['png', 'jpg', 'jpeg', 'bmp', 'tiff', 'pdf'].includes(type) && (
                <pre style={{
                  whiteSpace: 'pre-wrap', color: 'var(--text-secondary)', fontSize: '0.85rem',
                  lineHeight: 1.7, fontFamily: 'var(--font-sans)', margin: 0,
                }}>{content}</pre>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default FilePreview;
