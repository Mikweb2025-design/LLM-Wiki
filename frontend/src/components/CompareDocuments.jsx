import React, { useState, useEffect, useMemo } from 'react';
import { documentsApi } from '../utils/api';
import { useI18n, t } from '../utils/i18n';

function CompareDocuments({ showToast }) {
  const { lang } = useI18n(); const tr = p => t(lang,p);
  const [doc1, setDoc1] = useState(null);
  const [doc2, setDoc2] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    documentsApi.list()
      .then(res => { setDocuments(res.data || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleCompare = async () => {
    if (!doc1 || !doc2) { showToast(tr('compare.selectTwo'), 'warning'); return; }
    if (doc1.filename === doc2.filename) { showToast(tr('compare.selectDifferent'), 'warning'); return; }
    setComparing(true); setResult(null);
    try {
      const [res1, res2] = await Promise.all([
        documentsApi.content(doc1.filename),
        documentsApi.content(doc2.filename),
      ]);
      const d1 = res1.data || {};
      const d2 = res2.data || {};
      const content1 = d1.content || '';
      const content2 = d2.content || '';

      // Diagnostica: se entrambi i contenuti sono vuoti, mostra avviso utile
      const warnings = [];
      if (!content1.trim()) warnings.push({ name: doc1.filename, reason: d1.reason || 'Contenuto vuoto' });
      if (!content2.trim()) warnings.push({ name: doc2.filename, reason: d2.reason || 'Contenuto vuoto' });
      // Aggiungi avvisi per contenuto troncato
      if (d1.reason && d1.reason.includes('troncato')) warnings.push({ name: doc1.filename, reason: d1.reason });
      if (d2.reason && d2.reason.includes('troncato')) warnings.push({ name: doc2.filename, reason: d2.reason });
      if (warnings.length) {
        showToast(
          `${tr('compare.noText')} ${warnings.length === 2 ? 'entrambi i file' : warnings[0].name}. ` +
          (warnings[0].reason || 'Verifica formato/OCR.'),
          'warning'
        );
      }

      try {
        const diff = generateDiff(content1, content2, doc1.filename, doc2.filename);
        diff.warnings = warnings;
        diff.length1 = d1.length || 0;
        diff.length2 = d2.length || 0;
        diff.originalLength1 = d1.original_length || d1.length || 0;
        diff.originalLength2 = d2.original_length || d2.length || 0;
        setResult(diff);
        if (!warnings.length) showToast(tr('compare.done'), 'success');
      } catch (diffError) {
        showToast(tr('common.error') + ': ' + diffError.message, 'error');
      }
    } catch (e) {
      showToast(tr('common.error') + ': ' + e.message, 'error');
    } finally {
      setComparing(false);
    }
  };

  const generateDiff = (text1, text2, name1, name2) => {
    const MAX_LINES = 1000; // Limita il numero di righe per prestazioni
    const lines1 = text1.split('\n').filter(l => l.trim());
    const lines2 = text2.split('\n').filter(l => l.trim());
    const maxLen = Math.min(Math.max(lines1.length, lines2.length), MAX_LINES);
    const diff = [];
    for (let i = 0; i < maxLen; i++) {
      const l1 = lines1[i] || '';
      const l2 = lines2[i] || '';
      diff.push(l1 === l2 ? { type: 'same', l1, l2 } : { type: 'diff', l1, l2 });
    }
    const truncated = lines1.length > MAX_LINES || lines2.length > MAX_LINES;
    return { 
      diff, 
      name1, 
      name2, 
      total: diff.length, 
      same: diff.filter(d => d.type === 'same').length,
      truncated,
      totalLines1: lines1.length,
      totalLines2: lines2.length
    };
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileIcon = (ext) => {
    const icons = { '.pdf': '📄', '.png': '🖼️', '.jpg': '🖼️', '.xlsx': '📊', '.docx': '📝', '.txt': '📃' };
    return icons[ext] || '📁';
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
        <div style={{
          width: '36px', height: '36px',
          border: '3px solid rgba(74,158,255,0.1)', borderTop: '3px solid var(--accent-blue)',
          borderRadius: '50%', animation: 'spin 1s linear infinite', marginRight: '0.75rem',
        }}></div>
        {tr('common.loading')}
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
        <span style={{ fontSize: '1.2rem', background: 'linear-gradient(135deg, #7ee787 0%, #4a9eff 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>📈</span>
        {tr('compare.title')}
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
        {[{ doc: doc1, setDoc: setDoc1, label: tr('compare.doc1') }, { doc: doc2, setDoc: setDoc2, label: tr('compare.doc2') }].map(({ doc, setDoc, label }, idx) => (
          <div key={idx} style={{
            background: 'var(--bg-glass)', borderRadius: '14px', padding: '1rem 1.25rem',
            border: '1px solid var(--border-glass)', transition: 'border-color 0.3s',
          }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = 'rgba(74,158,255,0.2)'}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-glass)'}
          >
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '0.75rem' }}>{label}</p>
            <select
              value={doc?.filename || ''}
              onChange={(e) => { const selected = documents.find(d => d.filename === e.target.value); setDoc(selected || null); }}
              style={{
                width: '100%', background: '#ffffff', border: '1px solid var(--border-glass)',
                borderRadius: '10px', padding: '0.6rem 0.8rem', color: 'var(--text-primary)',
                fontSize: '0.85rem', fontFamily: 'var(--font-sans)', cursor: 'pointer', outline: 'none',
              }}
            >
              <option value="">{tr('compare.selectPlaceholder')}</option>
              {documents.map(d => (
                <option key={d.filename} value={d.filename}>
                  {d.filename} ({formatSize(d.size_bytes)})
                </option>
              ))}
            </select>
            {doc && (
              <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                <span style={{ fontSize: '1.2rem' }}>{getFileIcon(doc.extension)}</span>
                <span>{doc.extension?.toUpperCase()} • {formatSize(doc.size_bytes)}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={handleCompare}
        disabled={comparing || !doc1 || !doc2}
        style={{
          width: '100%', padding: '0.85rem',
          background: comparing ? 'rgba(74,158,255,0.05)' : 'linear-gradient(135deg, #7ee787 0%, #4a9eff 100%)',
          color: comparing ? 'var(--text-secondary)' : 'var(--bg-dark)',
          border: 'none', borderRadius: '12px', fontSize: '0.9rem', fontWeight: 600,
          cursor: comparing ? 'not-allowed' : 'pointer', opacity: comparing ? 0.5 : 1,
          transition: 'all 0.3s', fontFamily: 'var(--font-mono)',
        }}
        onMouseEnter={(e) => { if (!comparing) e.target.style.transform = 'translateY(-2px)'; }}
        onMouseLeave={(e) => { if (!comparing) e.target.style.transform = 'none'; }}
      >
        {comparing ? (
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            <div style={{ width: '16px', height: '16px', border: '2px solid #ffffff', borderTop: '2px solid var(--bg-dark)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
            {tr('compare.comparing')}
          </span>
        ) : (
          '🔍 ' + tr('compare.btn')
        )}
      </button>

      {/* Results */}
      {result && (
        <div style={{ marginTop: '1.5rem', animation: 'fadeInUp 0.4s ease-out' }}>
          {result.warnings?.length > 0 && (
            <div style={{
              marginBottom: '1rem',
              padding: '0.85rem 1rem',
              borderRadius: '12px',
              background: 'rgba(255, 166, 87, 0.08)',
              border: '1px solid rgba(255, 166, 87, 0.25)',
              color: '#ffa657',
              fontSize: '0.82rem',
              lineHeight: 1.5,
            }}>
              <div style={{ fontWeight: 600, marginBottom: '0.3rem' }}>⚠️ {tr('compare.notExtractable')}</div>
              {result.warnings.map((w, i) => (
                <div key={i} style={{ fontFamily: 'var(--font-mono)', opacity: 0.9 }}>
                  • <strong>{w.name}</strong>: {w.reason}
                </div>
              ))}
              <div style={{ marginTop: '0.4rem', opacity: 0.75 }}>
                {tr('compare.ocrHint')}:
                <code style={{ marginLeft: '0.3rem' }}>brew install tesseract poppler</code>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h3 style={{ color: 'var(--text-primary)', fontSize: '1.1rem', fontWeight: 600 }}>{tr('compare.results')}</h3>
            <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
              <span style={{ color: 'var(--accent-green)', background: 'rgba(126,231,135,0.1)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>✓ {result.same} {tr('compare.same')}</span>
              <span style={{ color: '#ffa657', background: 'rgba(255,166,87,0.1)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>⚡ {result.total - result.same} {tr('compare.different')}</span>
              {result.truncated && (
                <span style={{ color: '#ffa657', background: 'rgba(255,166,87,0.1)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                  ⚠️ {tr('compare.truncated')} {result.total} righe
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
            <div style={{ background: 'rgba(74,158,255,0.05)', border: '1px solid rgba(74,158,255,0.1)', borderRadius: '10px', padding: '0.75rem', textAlign: 'center' }}>
              <p style={{ color: 'var(--accent-blue)', fontSize: '0.85rem', fontWeight: 500 }}>{result.name1}</p>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                {result.totalLines1} righe totali
              </p>
            </div>
            <div style={{ background: 'rgba(255,108,0,0.05)', border: '1px solid rgba(255,108,0,0.1)', borderRadius: '10px', padding: '0.75rem', textAlign: 'center' }}>
              <p style={{ color: 'var(--accent-purple)', fontSize: '0.85rem', fontWeight: 500 }}>{result.name2}</p>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                {result.totalLines2} righe totali
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', maxHeight: '384px', overflowY: 'auto' }}>
            {result.diff.slice(0, 500).map((d, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', padding: '0.5rem 0.75rem',
                borderRadius: '8px', fontSize: '0.8rem', lineHeight: 1.5,
                background: d.type === 'same' ? 'rgba(31,41,55,0.03)' : 'rgba(255,166,87,0.12)',
                border: `1px solid ${d.type === 'same' ? 'rgba(31,41,55,0.08)' : 'rgba(255,166,87,0.3)'}`,
              }}>
                <div style={{ color: d.type === 'same' ? 'var(--text-primary)' : '#ffcc88', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: d.type === 'diff' ? 500 : 400 }}>{d.l1 || '-'}</div>
                <div style={{ color: d.type === 'same' ? 'var(--text-primary)' : '#ffcc88', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: d.type === 'diff' ? 500 : 400 }}>{d.l2 || '-'}</div>
              </div>
            ))}
            {result.diff.length > 500 && (
              <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                {tr('compare.showing500')} {result.diff.length} risultati
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default CompareDocuments;
