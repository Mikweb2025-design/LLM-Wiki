import React, { useState, useEffect, useMemo } from 'react';
import { documentsApi, API_URL } from '../utils/api';
import { useI18n, t } from '../utils/i18n';

function DocumentList({ showToast }) {
  const { lang } = useI18n(); const tr = p => t(lang,p);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(null);
  const [reindexing, setReindexing] = useState(null);
  const [reindexAllLoading, setReindexAllLoading] = useState(false);
  const [reindexProgress, setReindexProgress] = useState(null);
  const [readingDoc, setReadingDoc] = useState(null);
  const [docContent, setDocContent] = useState('');
  const [loadingContent, setLoadingContent] = useState(false);
  const [customDir, setCustomDir] = useState('');
  const [scanningCustom, setScanningCustom] = useState(false);
  const [hidrivePath, setHidrivePath] = useState('/');
  const [scanningHidrive, setScanningHidrive] = useState(false);
  const [showFolderHelper, setShowFolderHelper] = useState(false);
  const [previewFiles, setPreviewFiles] = useState([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [recentFolders, setRecentFolders] = useState(['/Users/daniele/Downloads', '/Users/daniele/Documents', '/Users/daniele/Desktop']);
  const [searchFilter, setSearchFilter] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [selectedFiles, setSelectedFiles] = useState(new Set());
  const [batchLoading, setBatchLoading] = useState(false);
  const [tagsMap, setTagsMap] = useState({});
  const [tagFilter, setTagFilter] = useState('all');

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchTagsMap = async () => {
    try {
      const res = await fetch(`${API_URL}/api/documents/tags/map`);
      const data = await res.json();
      setTagsMap(data.map || {});
    } catch {}
  };

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const response = await documentsApi.list();
      setDocuments(response.data);
      fetchTagsMap();
    } catch (error) {
      console.error(tr('documents.loadError'), error);
    } finally {
      setLoading(false);
    }
  };

  const handleAutoTagAll = async () => {
    try {
      showToast?.(tr('documents.autoTagProgress'),'info');
      const res = await fetch(`${API_URL}/api/documents/auto-tag/all`, { method: 'POST' });
      const data = await res.json();
      showToast?.(`${tr('documents.autoTagResult')} ${data.tagged} ${tr('documents.of').toLowerCase()} ${data.tagged + data.skipped}, ${data.skipped} ${tr('common.success').toLowerCase()}`, 'success');
      fetchTagsMap();
    } catch(e){ showToast?.(`${tr('common.error')}: `+e.message,'error'); }
  };

  const pollScanStatus = async (onDone) => {
    let attempts = 0;
    const maxAttempts = 600; // 5 min max (500ms interval)
    const poll = async () => {
      try {
        const res = await documentsApi.scanStatus();
        const s = res.data;
        if (s.total_files > 0) {
          setScanProgress({ processed: s.processed, total: s.total_files, pct: s.progress_pct, newFiles: s.new_files });
        }
        if (s.done) {
          setScanProgress(null);
          fetchDocuments();
          if (s.result) {
            const r = s.result;
            if (r.new_files > 0) showToast(`${tr('documents.scanCompleteNew')}: ${r.new_files} ${tr('documents.indexed')}`, 'success');
            else showToast(tr('documents.scanCompleteNone'), 'info');
            if (r.errors && r.errors.length > 0) console.error('Errori scansione:', r.errors);
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
  };

  const handleScan = async () => {
    setScanning(true);
    try {
      await documentsApi.scan();
      showToast(tr('documents.scanStarted'), 'info');
      pollScanStatus(() => setScanning(false));
    } catch (error) {
      console.error('Errore scansione:', error);
      if (error.response?.status === 409) {
        showToast(tr('documents.scan409'), 'warning');
      }
      setScanning(false);
    }
  };

  const handleDelete = async (filename) => {
    if (!confirm(`${tr('documents.confirmDelete')} "${filename}"?`)) return;
    try {
      await documentsApi.delete(filename);
      showToast(`"${filename}" ${tr('common.success')}`, 'success');
      fetchDocuments();
    } catch (error) {
      console.error('Errore eliminazione:', error);
      showToast(tr('documents.deleteError'), 'error');
    }
  };

  const handleReindex = async (filename) => {
    if (!confirm(`${tr('documents.confirmReindex')} "${filename}"?`)) return;
    setReindexing(filename);
    try {
      await documentsApi.reindex(filename);
      showToast(`"${filename}" ${tr('common.success')}!`, 'success');
      fetchDocuments();
    } catch (error) {
      console.error('Errore reindicizzazione:', error);
      showToast(tr('common.error'), 'error');
    } finally {
      setReindexing(null);
    }
  };

  const handleReindexAll = async () => {
    if (!confirm(tr('documents.confirmReindexAll'))) return;
    setReindexAllLoading(true);
    setReindexProgress({ current: 0, total: documents.length });
    try {
      const response = await documentsApi.reindexAll();
      const data = response.data;
      setReindexProgress(null);
      showToast(`${tr('documents.reindexAllResult')} ${data.successes}/${data.total_files} ${tr('documents.indexed')}`, data.successes > 0 ? 'success' : 'warning');
      if (data.errors.length > 0) {
        console.error('Errori reindicizzazione:', data.errors);
        showToast(`${data.errors.length} ${tr('common.error').toLowerCase()}`, 'error');
      }
      fetchDocuments();
    } catch (error) {
      setReindexProgress(null);
      console.error('Errore reindicizzazione totale:', error);
      showToast(`${tr('common.error')}: ` + error.message, 'error');
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
      showToast(tr('documents.readError'), 'error');
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
      showToast(tr('documents.invalidPath'), 'warning');
      return;
    }
    setScanningCustom(true);
    try {
      const response = await documentsApi.scanCustom(customDir);
      const data = response.data;
      showToast(data.message || tr('documents.scanStarted'), 'info');
      if (!recentFolders.includes(customDir)) {
        setRecentFolders([customDir, ...recentFolders.slice(0, 4)]);
      }
      setPreviewFiles([]);
      pollScanStatus(() => setScanningCustom(false));
    } catch (error) {
      console.error('Errore scansione cartella personalizzata:', error);
      if (error.response?.status === 409) {
        showToast(tr('documents.scan409'), 'warning');
      } else {
        showToast(`${tr('common.error')}: ` + (error.response?.data?.detail || error.message), 'error');
      }
      setScanningCustom(false);
    }
  };

  const handleScanHidrive = async () => {
    setScanningHidrive(true);
    try {
      const response = await documentsApi.scanHidrive(hidrivePath || '/');
      const data = response.data;
      showToast(data.message || tr('documents.scanStarted'), 'info');
      pollScanStatus(() => { setScanningHidrive(false); fetchDocuments(); });
    } catch (error) {
      console.error('Errore scansione HiDrive:', error);
      if (error.response?.status === 409) {
        showToast(tr('documents.scan409'), 'warning');
      } else {
        showToast(`${tr('common.error')}: ` + (error.response?.data?.detail || error.message), 'error');
      }
      setScanningHidrive(false);
    }
  };

  const toggleSelect = (filename) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(filename)) next.delete(filename);
      else next.add(filename);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedFiles.size === filteredAndSortedDocs.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(filteredAndSortedDocs.map(d => d.filename)));
    }
  };

  const handleBatchDelete = async () => {
    if (selectedFiles.size === 0) return;
    if (!confirm(`${tr('documents.confirmDelete')} ${selectedFiles.size} ${tr('documents.selectedCount')}?`)) return;
    setBatchLoading(true);
    try {
      const filenames = Array.from(selectedFiles);
      const response = await documentsApi.batchDelete(filenames);
      const data = response.data;
      showToast(`${tr('common.success')}: ${data.count} ${tr('documents.indexed')}`, 'success');
      setSelectedFiles(new Set());
      fetchDocuments();
    } catch (error) {
      showToast(tr('documents.deleteError'), 'error');
    } finally {
      setBatchLoading(false);
    }
  };

  const handleBatchReindex = async () => {
    if (selectedFiles.size === 0) return;
    if (!confirm(`${tr('documents.confirmReindex')} ${selectedFiles.size} ${tr('documents.selectedCount')}?`)) return;
    setBatchLoading(true);
    try {
      const filenames = Array.from(selectedFiles);
      const response = await documentsApi.batchReindex(filenames);
      const data = response.data;
      showToast(`${tr('documents.reindexAllResult')} ${data.successes}/${data.total} ${tr('documents.indexed')}`, 'success');
      setSelectedFiles(new Set());
      fetchDocuments();
    } catch (error) {
      showToast(tr('common.error'), 'error');
    } finally {
      setBatchLoading(false);
    }
  };

  const handlePreviewFiles = async () => {
    if (!customDir.trim()) return;
    setLoadingPreview(true);
    try {
      const response = await documentsApi.scanCustom(customDir);
      const data = response.data;
      showToast(`${tr('documents.scanStarted')} ${data.total_files || '?'} ${tr('documents.segments')}...`, 'info');
      pollScanStatus(() => setLoadingPreview(false));
    } catch (error) {
      console.error('Errore preview:', error);
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
  const isWebDAV = (doc) => (doc.file_path || '').includes('webdav_cache') || (doc.filename||'').includes('__webdav');

  const tagOptions = useMemo(()=>{
    const all = new Set(Object.values(tagsMap).flat());
    return Array.from(all).sort();
  },[tagsMap]);

  const filteredAndSortedDocs = useMemo(() => {
    let filtered = documents;
    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      filtered = filtered.filter(d =>
        d.filename.toLowerCase().includes(q) ||
        d.extension?.toLowerCase().includes(q)
      );
    }
    if (tagFilter && tagFilter !== 'all') {
      filtered = filtered.filter(d => (tagsMap[d.filename]||[]).includes(tagFilter));
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
  }, [documents, searchFilter, sortBy, sortOrder, tagsMap, tagFilter]);

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
        {tr('common.loading')}
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
          {tr('documents.title')}
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
          {selectedFiles.size > 0 && (
            <>
              <button
                onClick={handleBatchReindex}
                disabled={batchLoading}
                style={{
                  padding: '0.5rem 1rem',
                  background: 'rgba(126, 231, 135, 0.1)',
                  color: 'var(--accent-green)',
                  border: '1px solid rgba(126, 231, 135, 0.2)',
                  borderRadius: '10px',
                  fontSize: '0.85rem',
                  cursor: batchLoading ? 'not-allowed' : 'pointer',
                  opacity: batchLoading ? 0.5 : 1,
                }}
              >
                {batchLoading ? '...' : `🔄 ${tr('documents.batchReindex')} (${selectedFiles.size})`}
              </button>
              <button
                onClick={handleBatchDelete}
                disabled={batchLoading}
                style={{
                  padding: '0.5rem 1rem',
                  background: 'rgba(255, 85, 85, 0.1)',
                  color: '#ff5555',
                  border: '1px solid rgba(255, 85, 85, 0.2)',
                  borderRadius: '10px',
                  fontSize: '0.85rem',
                  cursor: batchLoading ? 'not-allowed' : 'pointer',
                  opacity: batchLoading ? 0.5 : 1,
                }}
              >
                {batchLoading ? '...' : `🗑️ ${tr('documents.batchDelete')} (${selectedFiles.size})`}
              </button>
            </>
          )}
          <button
            onClick={handleReindexAll}
            disabled={reindexAllLoading}
            style={{
              padding: '0.5rem 1rem',
              background: reindexAllLoading ? 'rgba(74, 158, 255, 0.05)' : 'linear-gradient(135deg, rgba(74, 158, 255, 0.1) 0%, rgba(255,108,0, 0.1) 100%)',
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
            {reindexAllLoading ? `⏳ ${tr('documents.reindexing')}` : `🔄 ${tr('documents.reindexAll')}`}
          </button>
          <button
            onClick={handleScan}
            disabled={scanning}
            style={{
              padding: '0.5rem 1rem',
              background: scanning ? 'rgba(31,41,55,0.05)' : 'var(--bg-glass)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-glass)',
              borderRadius: '10px',
              fontSize: '0.85rem',
              cursor: scanning ? 'not-allowed' : 'pointer',
              transition: 'all 0.3s',
              opacity: scanning ? 0.5 : 1,
            }}
            onMouseEnter={(e) => { if (!scanning) { e.target.style.background = 'rgba(31,41,55,0.08)'; e.target.style.color = 'var(--text-primary)'; } }}
            onMouseLeave={(e) => { e.target.style.background = 'var(--bg-glass)'; e.target.style.color = 'var(--text-secondary)'; }}
          >
            {scanning ? `⏳ ${tr('common.loading')}` : `🔍 ${tr('documents.scanFolder')}`}
          </button>
          {scanProgress && (
            <div style={{ width: '100%', marginTop: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                <span>{tr('documents.scanProgress')}: {scanProgress.processed}/{scanProgress.total}</span>
                <span>{scanProgress.pct}% · {scanProgress.newFiles} {tr('documents.indexed')}</span>
              </div>
              <div style={{ width: '100%', height: '6px', background: 'rgba(31,41,55,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: `${scanProgress.pct}%`, height: '100%', background: 'linear-gradient(90deg, #4a9eff, #ff6c00)', borderRadius: '3px', transition: 'width 0.5s ease' }} />
              </div>
            </div>
          )}
          <button
            onClick={handleAutoTagAll}
            style={{
              padding: '0.5rem 1rem',
              background: 'rgba(255,108,0,0.08)',
              color: 'var(--accent-purple)',
              border: '1px solid rgba(255,108,0,0.2)',
              borderRadius: '10px',
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
            title={tr('documents.autoTagBtn')}
          >
            🏷️ {tr('documents.autoTagBtn')}
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
            onMouseEnter={(e) => { e.target.style.background = 'rgba(31,41,55,0.08)'; e.target.style.color = 'var(--text-primary)'; }}
            onMouseLeave={(e) => { e.target.style.background = 'var(--bg-glass)'; e.target.style.color = 'var(--text-secondary)'; }}
          >
            {tr('common.refresh')}
          </button>
        </div>
      </div>

      {/* Search and Sort + Tag filter */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <input
          type="text"
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          placeholder={tr('documents.searchPlaceholder')}
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
          <option value="name">{tr('documents.sortName')}</option>
          <option value="size">{tr('documents.sortSize')}</option>
          <option value="date">{tr('documents.sortDate')}</option>
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
          title={sortOrder === 'asc' ? 'asc' : 'desc'}
        >
          {sortOrder === 'asc' ? '↑' : '↓'}
        </button>
        <select
          value={tagFilter}
          onChange={(e)=>setTagFilter(e.target.value)}
          style={{
            background: 'var(--bg-glass)',
            border: '1px solid var(--border-glass)',
            borderRadius: '10px',
            padding: '0.6rem 0.8rem',
            color: 'var(--text-secondary)',
            fontSize: '0.82rem',
            cursor: 'pointer',
          }}
        >
          <option value="all">{tr('documents.allTags')}</option>
          {tagOptions.map(t=> <option key={t} value={t}>{t} ({(tagsMap && Object.values(tagsMap).flat().filter(x=>x===t).length)})</option>)}
        </select>
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
            <p style={{ fontSize: '0.85rem', color: 'var(--accent-blue)', fontWeight: 500 }}>{tr('documents.reindexing')}</p>
            {reindexProgress && (
              <span style={{ fontSize: '0.75rem', color: 'var(--accent-blue)' }}>{reindexProgress.current}/{reindexProgress.total}</span>
            )}
          </div>
          {reindexProgress && (
            <div style={{ height: '6px', background: 'rgba(31,41,55,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
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
          <p style={{ fontSize: '1.1rem', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>{tr('documents.noDocs')}</p>
          <p style={{ fontSize: '0.85rem' }}>{tr('documents.noDocsHint')}</p>
        </div>
      ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {/* Select All */}
          {filteredAndSortedDocs.length > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.4rem 1rem',
              borderBottom: '1px solid var(--border-glass)',
              marginBottom: '0.25rem',
            }}>
              <input
                type="checkbox"
                checked={selectedFiles.size === filteredAndSortedDocs.length && filteredAndSortedDocs.length > 0}
                onChange={toggleSelectAll}
                style={{ accentColor: 'var(--accent-blue)', width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                {selectedFiles.size > 0 ? `${selectedFiles.size} ${tr('documents.selectedCount')}` : tr('documents.selectAll')}
              </span>
            </div>
          )}
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
                <input
                  type="checkbox"
                  checked={selectedFiles.has(doc.filename)}
                  onChange={() => toggleSelect(doc.filename)}
                  style={{ accentColor: 'var(--accent-blue)', width: '15px', height: '15px', cursor: 'pointer', flexShrink: 0 }}
                />
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
                  <div style={{ display: 'flex', gap: '0.6rem', fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', alignItems:'center', flexWrap:'wrap' }}>
                    <span>{doc.extension?.toUpperCase()}</span>
                    <span>{formatSize(doc.size_bytes)}</span>
                    <span>{new Date(doc.modified).toLocaleDateString('it-IT')}</span>
                    <span title={isWebDAV(doc)?tr('documents.sourceNextcloud'):tr('documents.sourceLocal')} style={{ fontSize:'0.65rem', padding:'0.1rem 0.35rem', borderRadius:'6px', background: isWebDAV(doc)?'rgba(74,158,255,0.12)':'rgba(31,41,55,0.06)', color: isWebDAV(doc)?'var(--accent-blue)':'var(--text-secondary)', border:'1px solid var(--border-glass)' }}>{isWebDAV(doc)?tr('documents.badgeNextcloud'):tr('documents.badgeLocal')}</span>
                  </div>
                  {(tagsMap[doc.filename]||[]).length>0 && (
                    <div style={{ display:'flex', gap:'0.3rem', marginTop:'0.3rem', flexWrap:'wrap' }}>
                      {(tagsMap[doc.filename]||[]).map(tag=>(
                        <span key={tag} style={{ fontSize:'0.65rem', padding:'0.1rem 0.4rem', borderRadius:'6px', background: tag==='fattura'?'rgba(74,158,255,0.12)':tag==='stipendio'?'rgba(126,231,135,0.12)':tag==='contratto'?'rgba(255,108,0,0.12)':'rgba(31,41,55,0.06)', color: tag==='fattura'?'var(--accent-blue)':tag==='stipendio'?'var(--accent-green)':tag==='contratto'?'var(--accent-purple)':'var(--text-secondary)', border:'1px solid var(--border-glass)', fontFamily:'var(--font-mono)' }}>{tag}</span>
                      ))}
                    </div>
                  )}
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
                  title={tr('preview.noContent')}
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
                  title={tr('documents.reindex')}
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
                  title={tr('common.remove')}
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
          <span style={{ fontSize: '1rem' }}>📂</span> {tr('documents.customScanTitle')}
        </p>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
          {tr('documents.customScanHint')}
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.75rem' }}>
          {recentFolders.map((folder, idx) => (
            <button
              key={idx}
              onClick={() => setCustomDir(folder)}
              style={{
                padding: '0.3rem 0.7rem',
                background: customDir === folder ? 'rgba(255,108,0, 0.1)' : 'rgba(31,41,55,0.03)',
                color: customDir === folder ? 'var(--accent-purple)' : 'var(--text-secondary)',
                border: `1px solid ${customDir === folder ? 'rgba(255,108,0, 0.2)' : 'var(--border-glass)'}`,
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
              background: '#ffffff',
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
              background: loadingPreview ? 'rgba(31,41,55,0.05)' : 'var(--bg-glass)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-glass)',
              borderRadius: '10px',
              fontSize: '0.8rem',
              cursor: loadingPreview ? 'not-allowed' : 'pointer',
              opacity: loadingPreview ? 0.5 : 1,
              transition: 'all 0.2s',
            }}
            title={tr('documents.preview')}
          >
            {loadingPreview ? '⏳' : '👁️'}
          </button>
          <button
            onClick={handleScanCustom}
            disabled={scanningCustom || !customDir.trim()}
            style={{
              padding: '0.65rem 1.25rem',
              background: scanningCustom ? 'rgba(255,108,0, 0.05)' : 'linear-gradient(135deg, rgba(255,108,0, 0.1) 0%, rgba(255,138,0, 0.1) 100%)',
              color: 'var(--accent-purple)',
              border: '1px solid rgba(255,108,0, 0.2)',
              borderRadius: '10px',
              fontSize: '0.85rem',
              cursor: scanningCustom ? 'not-allowed' : 'pointer',
              transition: 'all 0.3s',
              opacity: scanningCustom ? 0.5 : 1,
            }}
            onMouseEnter={(e) => { if (!scanningCustom) { e.target.style.transform = 'translateY(-1px)'; } }}
            onMouseLeave={(e) => { e.target.style.transform = 'none'; }}
          >
            {scanningCustom ? `⏳ ${tr('common.loading')}` : `🔍 ${tr('documents.customScanBtn')}`}
          </button>
        </div>
      </div>

      {/* HiDrive scan (REST API via OAuth2) */}
      <div style={{
        marginTop: '1rem',
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
          <span style={{ fontSize: '1rem' }}>☁️</span> {tr('documents.hidriveScanTitle')}
        </p>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
          {tr('documents.hidriveScanHint')}
        </p>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input
            type="text"
            value={hidrivePath}
            onChange={(e) => setHidrivePath(e.target.value)}
            placeholder={tr('documents.hidrivePathPlaceholder')}
            style={{
              flex: 1,
              minWidth: '200px',
              background: '#ffffff',
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
            onKeyPress={(e) => e.key === 'Enter' && handleScanHidrive()}
          />
          <button
            onClick={handleScanHidrive}
            disabled={scanningHidrive || scanningCustom || scanning}
            style={{
              padding: '0.65rem 1.25rem',
              background: scanningHidrive ? 'rgba(74, 158, 255, 0.05)' : 'linear-gradient(135deg, rgba(74, 158, 255, 0.1) 0%, rgba(255,108,0, 0.1) 100%)',
              color: 'var(--accent-blue)',
              border: '1px solid rgba(74, 158, 255, 0.2)',
              borderRadius: '10px',
              fontSize: '0.85rem',
              cursor: (scanningHidrive || scanningCustom || scanning) ? 'not-allowed' : 'pointer',
              transition: 'all 0.3s',
              opacity: (scanningHidrive || scanningCustom || scanning) ? 0.5 : 1,
            }}
            onMouseEnter={(e) => { if (!scanningHidrive) { e.target.style.transform = 'translateY(-1px)'; } }}
            onMouseLeave={(e) => { e.target.style.transform = 'none'; }}
          >
            {scanningHidrive ? `⏳ ${tr('common.loading')}` : `☁️ ${tr('documents.hidriveScanBtn')}`}
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
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>{tr('common.loading')}</div>
              ) : (
                <pre style={{
                  whiteSpace: 'pre-wrap',
                  color: 'var(--text-secondary)',
                  fontSize: '0.85rem',
                  lineHeight: 1.7,
                  fontFamily: 'var(--font-sans)',
                  margin: 0,
                }}>
                  {docContent || tr('documents.noContent')}
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
