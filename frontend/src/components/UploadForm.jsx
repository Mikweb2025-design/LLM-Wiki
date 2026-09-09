import React, { useState, useCallback, useRef } from 'react';
import { documentsApi } from '../utils/api';
import { useI18n, t } from '../utils/i18n';

function UploadForm() {
  const { lang } = useI18n(); const tr = p => t(lang,p);
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({});
  const [results, setResults] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const acceptedTypes = [
    'application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/tiff', 'image/bmp',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain', 'text/csv',
  ];

  const handleFiles = useCallback((fileList) => {
    const newFiles = Array.from(fileList).filter(f =>
      acceptedTypes.includes(f.type) || /\.(pdf|png|jpe?g|tiff|bmp|xlsx?|docx|txt|csv)$/i.test(f.name)
    );
    if (newFiles.length < fileList.length) {
      setError(`${fileList.length - newFiles.length} ${tr('upload.unsupportedRemoved')}`);
    }
    setFiles(prev => [...prev, ...newFiles]);
    if (newFiles.length === fileList.length) setError('');
  }, [lang]);

  const handleDrag = (e) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };

  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
  };

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async () => {
    if (files.length === 0) return;
    setUploading(true); setError('');
    const results = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setProgress(prev => ({ ...prev, [i]: 'uploading' }));
      try {
        const response = await documentsApi.upload(file);
        setProgress(prev => ({ ...prev, [i]: 'success' }));
        results.push({ filename: file.name, status: 'success', ...response.data });
      } catch (error) {
        let errorMsg = tr('upload.unknownError');
        if (error.response?.data?.detail) {
          errorMsg = typeof error.response.data.detail === 'string'
            ? error.response.data.detail
            : error.response.data.detail.map(d => d.msg || d).join(', ');
        } else if (error.message) {
          errorMsg = error.message;
        }
        setProgress(prev => ({ ...prev, [i]: 'error' }));
        results.push({ filename: file.name, status: 'error', message: errorMsg });
      }
    }
    setResults(results);
    setUploading(false);
    const hasErrors = results.some(r => r.status === 'error');
    if (!hasErrors) { setFiles([]); setProgress({}); }
  };

  const getFileIcon = (file) => {
    const ext = file.name.split('.').pop().toLowerCase();
    const icons = { pdf: '📄', png: '🖼️', jpg: '🖼️', jpeg: '🖼️', tiff: '🖼️', bmp: '🖼️', xlsx: '📊', xls: '📊', docx: '📝', txt: '📃', csv: '📊' };
    return icons[ext] || '📁';
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="glass-card" style={{ padding: '1.5rem' }}>
      <h2 style={{
        fontFamily: 'var(--font-display)',
        fontSize: '1.3rem', fontWeight: 600, color: 'var(--text-primary)',
        marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
      }}>
        <span style={{ fontSize: '1.2rem' }}>📤</span> {tr('upload.title')}
      </h2>

      {error && (
        <div style={{
          marginBottom: '1rem', padding: '0.75rem 1rem',
          background: 'rgba(255,85,85,0.1)', border: '1px solid rgba(255,85,85,0.2)',
          borderRadius: '10px', color: '#ff5555', fontSize: '0.85rem',
        }}>{error}</div>
      )}

      {/* Drag & Drop Area */}
      <div
        onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${dragActive ? 'var(--accent-blue)' : 'rgba(31,41,55,0.1)'}`,
          borderRadius: '16px', padding: '3rem 2rem', textAlign: 'center',
          background: dragActive ? 'rgba(74,158,255,0.05)' : 'rgba(31,41,55,0.02)',
          cursor: 'pointer', transition: 'all 0.3s', marginBottom: '1.5rem',
        }}
        onMouseEnter={(e) => { if (!dragActive) e.currentTarget.style.borderColor = 'rgba(31,41,55,0.2)'; }}
        onMouseLeave={(e) => { if (!dragActive) e.currentTarget.style.borderColor = 'rgba(31,41,55,0.1)'; }}
      >
        <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.8 }}>📂</div>
        <p style={{ color: 'var(--text-primary)', fontSize: '1.1rem', fontWeight: 500, marginBottom: '0.5rem' }}>
          {dragActive ? tr('upload.dragActive') : tr('upload.dropTitle')}
        </p>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>{tr('upload.dropHint')}</p>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
          padding: '0.75rem 1.5rem',
          background: 'var(--accent-gradient)', color: 'var(--bg-dark)',
          borderRadius: '10px', fontSize: '0.9rem', fontWeight: 600,
          transition: 'transform 0.2s',
        }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}
        >
          <span>📁</span> {tr('upload.chooseFile')}
        </div>
        <input
          ref={fileInputRef} type="file" multiple
          accept=".pdf,.png,.jpg,.jpeg,.tiff,.bmp,.xlsx,.xls,.docx,.txt,.csv"
          onChange={(e) => handleFiles(e.target.files)}
          style={{ display: 'none' }}
        />
        <div style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
          {tr('upload.formatsHint')}
        </div>
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h3 style={{ color: 'var(--text-primary)', fontSize: '0.95rem', fontWeight: 500 }}>
              {tr('upload.selectedCount')} ({files.length})
            </h3>
            <button
              onClick={() => { setFiles([]); setProgress({}); }}
              style={{
                background: 'none', border: 'none', color: '#ff5555',
                cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'var(--font-mono)',
              }}
              onMouseEnter={(e) => e.target.style.opacity = 0.7}
              onMouseLeave={(e) => e.target.style.opacity = 1}
            >{tr('upload.removeAll')}</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {files.map((file, index) => (
              <div key={index} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0.75rem 1rem', background: 'var(--bg-glass)', borderRadius: '10px',
                border: '1px solid var(--border-glass)', animation: `fadeInUp 0.3s ease-out ${index * 0.05}s backwards`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '1.4rem' }}>{getFileIcon(file)}</span>
                  <div>
                    <p style={{ color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 500 }}>{file.name}</p>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                      {formatSize(file.size)}
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  {progress[index] === 'uploading' && (
                    <div style={{ width: '16px', height: '16px', border: '2px solid rgba(74,158,255,0.1)', borderTop: '2px solid var(--accent-blue)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                  )}
                  {progress[index] === 'success' && <span style={{ color: 'var(--accent-green)', fontSize: '1.1rem' }}>✓</span>}
                  {progress[index] === 'error' && <span style={{ color: '#ff5555', fontSize: '1.1rem' }}>✕</span>}
                  {!uploading && (
                    <button onClick={() => removeFile(index)} style={{
                      background: 'none', border: 'none', color: 'var(--text-secondary)',
                      cursor: 'pointer', fontSize: '1rem',
                    }}
                    onMouseEnter={(e) => e.target.style.color = '#ff5555'}
                    onMouseLeave={(e) => e.target.style.color = 'var(--text-secondary)'}
                    >✕</button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={uploadFiles} disabled={uploading}
            style={{
              width: '100%', marginTop: '1rem', padding: '0.85rem',
              background: uploading ? 'rgba(74,158,255,0.05)' : 'var(--accent-gradient)',
              color: uploading ? 'var(--text-secondary)' : 'var(--bg-dark)',
              border: 'none', borderRadius: '12px', fontSize: '0.9rem', fontWeight: 600,
              cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.5 : 1,
              transition: 'all 0.3s', fontFamily: 'var(--font-mono)',
            }}
            onMouseEnter={(e) => { if (!uploading) e.target.style.transform = 'translateY(-2px)'; }}
            onMouseLeave={(e) => { if (!uploading) e.target.style.transform = 'none'; }}
          >
            {uploading ? `⏳ ${tr('upload.uploading')}` : `📤 ${tr('upload.uploadBtn')} ${files.length} file`}
          </button>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div style={{ padding: '1rem', background: 'rgba(31,41,55,0.02)', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
          <h3 style={{ color: 'var(--text-primary)', fontSize: '0.95rem', fontWeight: 500, marginBottom: '0.75rem' }}>{tr('upload.results')}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {results.map((result, index) => (
              <div key={index} style={{
                padding: '0.75rem 1rem', borderRadius: '8px',
                background: result.status === 'success' ? 'rgba(126,231,135,0.05)' : 'rgba(255,85,85,0.05)',
                border: `1px solid ${result.status === 'success' ? 'rgba(126,231,135,0.15)' : 'rgba(255,85,85,0.15)'}`,
                animation: `slideInRight 0.3s ease-out ${index * 0.08}s backwards`,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <span>{result.status === 'success' ? '✓' : '✕'}</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 500 }}>{result.filename}</p>
                    {result.status === 'success' && (
                      <p style={{ color: 'var(--accent-green)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                        {tr('upload.chunksAdded')}: {result.chunks_added}
                      </p>
                    )}
                    {result.status === 'error' && (
                      <p style={{ color: '#ff5555', fontSize: '0.75rem', marginTop: '0.25rem', opacity: 0.8 }}>{result.message}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default UploadForm;
