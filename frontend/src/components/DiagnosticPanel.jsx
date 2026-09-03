import React, { useEffect, useRef, useState, useCallback } from 'react';
import { healthApi } from '../utils/api';
import { useI18n, t } from '../utils/i18n';

/**
 * Pannello diagnostica:
 * - Badge compatto Online / Degraded / Offline (sostituisce il vecchio badge)
 * - Click → popover con 4 indicatori (Ollama / IONOS / Chroma / DB), uptime, request count
 * - Bottone "Refresh" → POST /api/status/refresh + re-fetch immediato
 * - Auto-refresh ogni 15s
 */
export default function DiagnosticPanel() {
  const { lang } = useI18n(); const tr = p => t(lang,p);
  const [data, setData] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reachable, setReachable] = useState(false);
  const popRef = useRef(null);
  const btnRef = useRef(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [h, m] = await Promise.all([
        healthApi.full().catch(() => null),
        healthApi.metrics().catch(() => null),
      ]);
      setData(h?.data || null);
      setMetrics(m?.data || null);
      setReachable(!!h?.data);
    } catch {
      setReachable(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, 15000);
    return () => clearInterval(id);
  }, [fetchAll]);

  // chiudi popover cliccando fuori
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (popRef.current?.contains(e.target)) return;
      if (btnRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const handleRefresh = async (e) => {
    e.stopPropagation();
    setLoading(true);
    try {
      await healthApi.refresh();
    } catch (_) { /* ignore */ }
    await fetchAll();
  };

  // Stato aggregato per il colore del badge
  const overallStatus = (() => {
    if (!reachable) return 'offline';
    if (!data) return 'offline';
    return data.status === 'healthy' ? 'online' : 'degraded';
  })();

  const palette = {
    online:   { dot: 'var(--accent-blue)',   bg: 'rgba(74, 158, 255, 0.08)', bd: 'rgba(74, 158, 255, 0.2)',  fg: 'var(--accent-blue)',   label: tr('diagnostic.online') },
    degraded: { dot: '#facc15',              bg: 'rgba(250, 204, 21, 0.08)', bd: 'rgba(250, 204, 21, 0.3)',  fg: '#facc15',              label: tr('diagnostic.degraded') },
    offline:  { dot: 'var(--accent-orange)', bg: 'rgba(255, 166, 87, 0.08)', bd: 'rgba(255, 166, 87, 0.2)',  fg: 'var(--accent-orange)', label: tr('diagnostic.offline') },
  }[overallStatus];

  const fmtUptime = (s) => {
    if (s == null) return '—';
    if (s < 60) return `${Math.round(s)}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}h ${m}m`;
  };

  const c = data?.components || {};
  const indicators = [
    { key: 'ollama',   label: 'Ollama',   ok: c.ollama?.ok,   sub: tr('diagnostic.ollamaSub') },
    { key: 'ionos',    label: 'IONOS',    ok: c.ionos?.ok,    sub: c.ionos?.configured ? tr('diagnostic.cloudSub') : tr('diagnostic.notConfigured'), dim: !c.ionos?.configured },
    { key: 'chroma',   label: 'ChromaDB', ok: c.chroma?.ok,   sub: c.chroma?.total_chunks != null ? `${c.chroma.total_chunks} ${tr('diagnostic.chunks')}` : tr('diagnostic.vectorStore') },
    { key: 'database', label: 'Database', ok: c.database?.ok, sub: c.database?.total_documents != null ? `${c.database.total_documents} ${tr('diagnostic.docs')}` : tr('diagnostic.sqlite') },
  ];

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        title={tr('diagnostic.showTitle')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.35rem 0.9rem',
          borderRadius: '9999px',
          fontSize: '0.75rem',
          fontWeight: 500,
          background: palette.bg,
          color: palette.fg,
          border: `1px solid ${palette.bd}`,
          cursor: 'pointer',
          transition: 'all 0.2s',
        }}
      >
        <span style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: palette.dot,
          animation: overallStatus === 'online' ? 'glowPulse 2s infinite' : 'none',
          display: 'inline-block',
        }} />
        <span>{palette.label}</span>
        <span style={{ opacity: 0.55, fontSize: '0.65rem' }}>▾</span>
      </button>

      {open && (
        <div
          ref={popRef}
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: '280px',
            background: 'var(--bg-glass, rgba(20, 22, 30, 0.95))',
            backdropFilter: 'blur(16px)',
            border: '1px solid var(--border-glass, rgba(255,255,255,0.08))',
            borderRadius: '14px',
            padding: '0.9rem',
            boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
            zIndex: 1000,
            color: 'var(--text-primary, #e7e9ee)',
          }}
        >
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.7rem',
          }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, letterSpacing: '0.02em' }}>
              {tr('diagnostic.title')}
            </span>
            <button
              onClick={handleRefresh}
              disabled={loading}
              style={{
                background: 'transparent',
                border: '1px solid var(--border-glass, rgba(255,255,255,0.12))',
                color: 'var(--text-secondary, #aab0bf)',
                fontSize: '0.7rem',
                padding: '0.2rem 0.55rem',
                borderRadius: '8px',
                cursor: loading ? 'wait' : 'pointer',
                opacity: loading ? 0.6 : 1,
              }}
              title={tr('diagnostic.forceRefresh')}
            >
              {loading ? '…' : `↻ ${tr('diagnostic.refresh')}`}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
            {indicators.map((ind) => (
              <Row key={ind.key} ind={ind} />
            ))}
          </div>

          <div style={{
            marginTop: '0.85rem',
            paddingTop: '0.7rem',
            borderTop: '1px solid var(--border-glass, rgba(255,255,255,0.08))',
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '0.7rem',
            color: 'var(--text-secondary, #aab0bf)',
          }}>
            <span>{tr('diagnostic.uptime')} <strong style={{ color: 'var(--text-primary, #e7e9ee)' }}>{fmtUptime(data?.uptime_seconds ?? metrics?.uptime_seconds)}</strong></span>
            <span>{tr('diagnostic.requests')} <strong style={{ color: 'var(--text-primary, #e7e9ee)' }}>{metrics?.request_count ?? '—'}</strong></span>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ ind }) {
  const { lang: _langRow } = useI18n(); const _trRow = p => t(_langRow,p);
  const ok = ind.ok === true;
  const unknown = ind.ok === null || ind.ok === undefined;
  const color = unknown ? '#6b7280' : (ok ? '#34d399' : '#f87171');
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.6rem',
      padding: '0.4rem 0.55rem',
      borderRadius: '10px',
      background: 'rgba(255,255,255,0.025)',
      opacity: ind.dim ? 0.55 : 1,
    }}>
      <span style={{
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: color,
        boxShadow: ok ? `0 0 6px ${color}` : 'none',
        flexShrink: 0,
      }} />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: '0.78rem', fontWeight: 500 }}>{ind.label}</span>
        <span style={{ fontSize: '0.66rem', color: 'var(--text-secondary, #aab0bf)' }}>{ind.sub}</span>
      </div>
      <span style={{
        fontSize: '0.65rem',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color,
        fontWeight: 600,
      }}>
        {unknown ? _trRow('diagnostic.na') : (ok ? _trRow('diagnostic.ok') : _trRow('diagnostic.down'))}
      </span>
    </div>
  );
}
