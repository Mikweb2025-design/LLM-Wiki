import React from 'react';
import { useI18n } from '../utils/i18n';

export default function Roadmap() {
  const { t, lang } = useI18n();
  const tr = (p) => t(lang, p);

  const sections = [
    {
      quarter: tr('roadmap.q2'),
      color: 'var(--accent-green)',
      items: [
        {
          title: tr('roadmap.nextcloudTitle'),
          desc: tr('roadmap.nextcloudDesc'),
          status: tr('roadmap.statusPlanned'),
          badge: 'WebDAV',
          details: lang === 'de'
            ? ['Login mit Nextcloud-Benutzer/Passwort (App-Passwort)', 'Ordnerauswahl: welchen Nextcloud-Ordner indexieren', 'Auto-Sync via WebDAV PROPFIND + ETag', 'OAuth2 / Token später', 'Filter nach Dateityp (PDF, Office)']
            : lang === 'en'
            ? ['Nextcloud user/password (app password) login', 'Folder picker: which Nextcloud folder to index', 'Auto-sync via WebDAV PROPFIND + ETag', 'OAuth2 / Token later', 'Filter by file type (PDF, Office)']
            : ['Login Nextcloud utente/password (app password)', 'Selezione cartella: quale cartella Nextcloud indicizzare', 'Auto-sync via WebDAV PROPFIND + ETag', 'OAuth2 / Token in seguito', 'Filtro per tipo file (PDF, Office)'],
        },
        {
          title: lang === 'de' ? 'Mehrsprachigkeit' : lang === 'en' ? 'Multi-language' : 'Multi-lingua',
          desc: lang === 'de' ? 'Flaggen-Umschalter oben rechts (IT/EN/DE).' : lang === 'en' ? 'Flag switcher top-right (IT/EN/DE).' : 'Selettore bandiere in alto a destra (IT/EN/DE).',
          status: tr('roadmap.statusDone'),
          badge: 'i18n',
          details: [],
        },
      ],
    },
    {
      quarter: tr('roadmap.q3'),
      color: 'var(--accent-blue)',
      items: [
        {
          title: 'OCR Cloud + Local Hybrid',
          desc: lang === 'de' ? 'Tesseract lokal + IONOS Vision für gescannte PDFs.' : lang === 'en' ? 'Tesseract local + IONOS Vision for scanned PDFs.' : 'Tesseract locale + IONOS Vision per PDF scansionati.',
          status: tr('roadmap.statusPlanned'),
          badge: 'OCR',
          details: [],
        },
        {
          title: 'Chat Citations 2.0',
          desc: lang === 'de' ? 'Quellen mit Seitenzahl + Highlight im Viewer.' : lang === 'en' ? 'Sources with page number + highlight in viewer.' : 'Fonti con numero pagina + highlight nel viewer.',
          status: tr('roadmap.statusPlanned'),
          badge: 'RAG',
          details: [],
        },
        {
          title: lang === 'de' ? 'Benutzer & Rollen' : lang === 'en' ? 'Users & Roles' : 'Utenti & Ruoli',
          desc: 'Nextcloud SSO → ruoli (viewer/editor/admin).',
          status: tr('roadmap.statusPlanned'),
          badge: 'Auth',
          details: [],
        },
      ],
    },
    {
      quarter: tr('roadmap.q4'),
      color: 'var(--accent-purple)',
      items: [
        {
          title: 'WebDAV Generic (ownCloud, Seafile)',
          desc: lang === 'de' ? 'Jeder WebDAV-Server als Quelle.' : lang === 'en' ? 'Any WebDAV server as source.' : 'Qualsiasi server WebDAV come sorgente.',
          status: tr('roadmap.statusPlanned'),
          badge: 'WebDAV',
          details: [],
        },
        {
          title: lang === 'de' ? 'Offline-Pack' : lang === 'en' ? 'Offline Pack' : 'Offline Pack',
          desc: lang === 'de' ? 'Embeddings + LLM vollständig lokal (Ollama).' : lang === 'en' ? 'Fully local embeddings + LLM (Ollama).' : 'Embeddings + LLM completamente locali (Ollama).',
          status: tr('roadmap.statusPlanned'),
          badge: 'Local',
          details: [],
        },
      ],
    },
  ];

  return (
    <div className="glass-card" style={{ padding: '1.5rem' }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.3rem' }}>
        <span>🗺️</span> {tr('roadmap.title')}
      </h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>{tr('roadmap.subtitle')}</p>

      {sections.map((sec) => (
        <div key={sec.quarter} style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 700, color: sec.color, letterSpacing: '0.08em', marginBottom: '0.75rem', borderBottom: `1px solid ${sec.color}30`, paddingBottom: '0.4rem' }}>
            {sec.quarter}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {sec.items.map((it, i) => (
              <div key={i} style={{ background: 'var(--bg-glass)', border: '1px solid var(--border-glass)', borderRadius: '12px', padding: '1rem 1.2rem', transition: 'all 0.2s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.35rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>{it.title}</span>
                    <span style={{ fontSize: '0.65rem', padding: '0.15rem 0.45rem', borderRadius: '6px', background: `${sec.color}18`, color: sec.color, border: `1px solid ${sec.color}30`, fontFamily: 'var(--font-mono)' }}>{it.badge}</span>
                  </div>
                  <span style={{
                    fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '6px', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap',
                    background: it.status === tr('roadmap.statusDone') ? 'rgba(126,231,135,0.12)' : it.status === tr('roadmap.statusInProgress') ? 'rgba(74,158,255,0.12)' : 'rgba(255,166,87,0.10)',
                    color: it.status === tr('roadmap.statusDone') ? 'var(--accent-green)' : it.status === tr('roadmap.statusInProgress') ? 'var(--accent-blue)' : '#ffa657',
                    border: `1px solid ${it.status === tr('roadmap.statusDone') ? 'rgba(126,231,135,0.2)' : it.status === tr('roadmap.statusInProgress') ? 'rgba(74,158,255,0.2)' : 'rgba(255,166,87,0.2)'}`,
                  }}>{it.status}</span>
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5, marginBottom: it.details?.length ? '0.5rem' : 0 }}>{it.desc}</p>
                {it.details?.length > 0 && (
                  <ul style={{ margin: 0, paddingLeft: '1.1rem', color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.6 }}>
                    {it.details.map((d, j) => <li key={j}>{d}</li>)}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      <div style={{ marginTop: '1rem', padding: '0.85rem 1rem', borderRadius: '10px', background: 'rgba(74,158,255,0.06)', border: '1px solid rgba(74,158,255,0.15)', color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.5 }}>
        {lang === 'de' ? '💡 Nextcloud-Integration nutzt WebDAV (PROPFIND/GET) + inkrementellen Index. Kein Copy der Daten — nur Metadaten + Chunks im lokalen ChromaDB.' : lang === 'en' ? '💡 Nextcloud integration uses WebDAV (PROPFIND/GET) + incremental indexing. No data copy — only metadata + chunks in local ChromaDB.' : '💡 Integrazione Nextcloud via WebDAV (PROPFIND/GET) + indicizzazione incrementale. Nessuna copia dei dati — solo metadati + chunk nel ChromaDB locale.'}
      </div>
    </div>
  );
}
