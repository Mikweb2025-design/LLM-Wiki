import React, { useState, useEffect } from 'react';
import { chatApi } from '../utils/api';
import { useI18n, t } from '../utils/i18n';

function ExportChat() {
  const { lang } = useI18n(); const tr = p => t(lang,p);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [format, setFormat] = useState('txt');

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const response = await chatApi.getHistory();
      setHistory(response.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const exportChat = () => {
    let content = '';
    const timestamp = new Date().toISOString().split('T')[0];

    if (format === 'txt') {
      content = `${tr('export.txtHeader')}\n`;
      content += `${tr('export.date')}: ${new Date().toLocaleDateString(lang === 'de' ? 'de-DE' : lang === 'en' ? 'en-GB' : 'it-IT')}\n`;
      content += '='.repeat(50) + '\n\n';
      history.forEach((item, idx) => {
        content += `[${idx + 1}] TU: ${item.user_message}\n`;
        content += `[${idx + 1}] AI: ${item.assistant_message}\n`;
        content += '-'.repeat(50) + '\n\n';
      });
      downloadFile(content, `chat-export-${timestamp}.txt`, 'text/plain');
    } else if (format === 'json') {
      content = JSON.stringify(history, null, 2);
      downloadFile(content, `chat-export-${timestamp}.json`, 'application/json');
    } else if (format === 'md') {
      content = `# ${tr('export.txtHeader')}\n\n`;
      history.forEach((item, idx) => {
        content += `## Domanda ${idx + 1}\n\n`;
        content += `**Tu:** ${item.user_message}\n\n`;
        content += `**AI:** ${item.assistant_message}\n\n---\n\n`;
      });
      downloadFile(content, `chat-export-${timestamp}.md`, 'text/markdown');
    }
  };

  const downloadFile = (content, filename, type) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
        <div style={{
          width: '36px', height: '36px',
          border: '3px solid rgba(74,158,255,0.1)', borderTop: '3px solid var(--accent-blue)',
          borderRadius: '50%', animation: 'spin 1s linear infinite', marginRight: '0.75rem',
        }}></div>
        {tr('export.loading')}
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
        <span style={{ fontSize: '1.2rem' }}>📋</span> {tr('export.title')}
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '0.5rem' }}>{tr('export.formatLabel')}</label>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            style={{
              width: '100%', maxWidth: '300px', background: '#ffffff',
              border: '1px solid var(--border-glass)', borderRadius: '10px', padding: '0.6rem 0.8rem',
              color: 'var(--text-primary)', fontSize: '0.85rem', fontFamily: 'var(--font-sans)',
              cursor: 'pointer', outline: 'none',
            }}
          >
            <option value="txt">{tr('export.formatTxt')}</option>
            <option value="md">{tr('export.formatMd')}</option>
            <option value="json">{tr('export.formatJson')}</option>
          </select>
        </div>

        <div style={{
          padding: '1rem 1.25rem', background: 'var(--bg-glass)', borderRadius: '12px',
          border: '1px solid var(--border-glass)', display: 'flex', alignItems: 'center', gap: '1rem',
        }}>
          <span style={{ fontSize: '1.6rem' }}>📊</span>
          <div>
            <p style={{ color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 500 }}>{history.length} {tr('export.count')}</p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '0.2rem' }}>{tr('export.hint')}</p>
          </div>
        </div>

        <button
          onClick={exportChat}
          disabled={history.length === 0}
          style={{
            width: '100%', padding: '0.85rem',
            background: history.length === 0 ? 'rgba(31,41,55,0.05)' : 'var(--accent-gradient)',
            color: history.length === 0 ? 'var(--text-secondary)' : 'var(--bg-dark)',
            border: 'none', borderRadius: '12px', fontSize: '0.9rem', fontWeight: 600,
            cursor: history.length === 0 ? 'not-allowed' : 'pointer', opacity: history.length === 0 ? 0.5 : 1,
            transition: 'all 0.3s', fontFamily: 'var(--font-mono)',
          }}
          onMouseEnter={(e) => { if (history.length > 0) e.target.style.transform = 'translateY(-2px)'; }}
          onMouseLeave={(e) => { if (history.length > 0) e.target.style.transform = 'none'; }}
        >
          📥 {tr('export.exportBtn')} {format.toUpperCase()}
        </button>
      </div>

      {/* Preview */}
      {history.length > 0 && (
        <div style={{ marginTop: '1.5rem', animation: 'fadeInUp 0.4s ease-out' }}>
          <h3 style={{ color: 'var(--text-primary)', fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem' }}>{tr('export.preview')}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '256px', overflowY: 'auto' }}>
            {history.slice(0, 5).map((item, idx) => (
              <div key={idx} style={{
                padding: '0.75rem 1rem', background: 'var(--bg-glass)', borderRadius: '10px',
                border: '1px solid var(--border-glass)', animation: `fadeInUp 0.3s ease-out ${idx * 0.05}s backwards`,
              }}>
                <p style={{ color: 'var(--accent-blue)', fontSize: '0.8rem', fontWeight: 500, marginBottom: '0.25rem' }}>Tu:</p>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.5 }}>{item.user_message}</p>
              </div>
            ))}
            {history.length > 5 && (
              <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
                +{history.length - 5} {tr('export.moreMessages')}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ExportChat;
