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
          status: tr('roadmap.statusDone'),
          badge: 'WebDAV',
          details: lang === 'de'
            ? ['Login Nextcloud App-Passwort (PROPFIND Depth:1)', 'Folder-Picker mit Breadcrumb + ETag inkrementell', 'Cache data/webdav_cache/<id>/, Auto-Delete aus Index', 'Badge ☁️ Nextcloud vs 💾 Lokal in Dokumenten']
            : lang === 'en'
            ? ['Nextcloud App-password login (PROPFIND Depth:1)', 'Folder picker with breadcrumb + incremental ETag', 'Cache data/webdav_cache/<id>/, auto-delete from index', 'Badge ☁️ Nextcloud vs 💾 Local in Documents']
            : ['Login Nextcloud app-password (PROPFIND Depth:1)', 'Folder picker con breadcrumb + ETag incrementale', 'Cache data/webdav_cache/<id>/, auto-rimozione da indice', 'Badge ☁️ Nextcloud vs 💾 Locale in Documenti'],
        },
        {
          title: lang === 'de' ? 'Vollständige Übersetzung' : lang === 'en' ? 'Full Translation' : 'Traduzione Completa',
          desc: lang === 'de' ? 'Alle Menüpunkte + Inhalte IT/EN/DE (250+ Keys, 14 Komponenten, locale-aware).' : lang === 'en' ? 'All menu items + content IT/EN/DE (250+ keys, 14 components, locale-aware).' : 'Tutte le voci menu + contenuti IT/EN/DE (250+ chiavi, 14 componenti, locale-aware).',
          status: tr('roadmap.statusDone'),
          badge: 'i18n',
          details: lang === 'de'
            ? ['Dashboard, Chat, Dokumente, Ordner/WebDAV, Suche, Diagramme, Vergleich, Export, Status, Einstellungen', 'Flaggen-Switch oben rechts, 137 kB gz Build']
            : lang === 'en'
            ? ['Dashboard, Chat, Documents, Folders/WebDAV, Search, Charts, Compare, Export, Status, Settings', 'Flag switch top-right, 137 kB gz build']
            : ['Dashboard, Chat, Documenti, Cartelle/WebDAV, Ricerca, Grafici, Confronta, Esporta, Stato, Config', 'Flag switch in alto a destra, build 137 kB gz'],
        },
        {
          title: 'Grafici Intelligenti da Chat',
          desc: lang === 'de' ? '„Zeig ein Diagramm meiner Einnahmen“ → Auto-Chart im Chat.' : lang === 'en' ? '"Show me a chart of my earnings" → auto-chart in chat.' : '"Fammi un grafico dei miei guadagni" → auto-chart in chat.',
          status: tr('roadmap.statusDone'),
          badge: 'Charts',
          details: [],
        },
      ],
    },
    {
      quarter: tr('roadmap.q3'),
      color: 'var(--accent-blue)',
      items: [
        {
          title: 'OCR Hybrid',
          desc: lang === 'de' ? 'Tesseract lokal + IONOS Vision Fallback für Scans.' : lang === 'en' ? 'Tesseract local + IONOS Vision fallback for scans.' : 'Tesseract locale + IONOS Vision fallback per scansioni.',
          status: 'Backend done',
          badge: 'OCR',
          details: lang === 'de'
            ? ['pypdf Text → Tesseract je Seite → <50 Zeichen → IONOS Vision (Llama-3.2-11B-Vision)', 'Config IONOS_VISION_MODEL, OCR_HYBRID_ENABLED']
            : lang === 'en'
            ? ['pypdf text → Tesseract per page → <50 chars → IONOS Vision (Llama-3.2-11B-Vision)', 'Config IONOS_VISION_MODEL, OCR_HYBRID_ENABLED']
            : ['pypdf text → Tesseract per pagina → <50 chars → IONOS Vision (Llama-3.2-11B-Vision)', 'Config IONOS_VISION_MODEL, OCR_HYBRID_ENABLED'],
        },
        {
          title: 'Chat Citations 2.0',
          desc: lang === 'de' ? 'Quellen „file.pdf S.3“ + Highlight im Viewer.' : lang === 'en' ? 'Sources "file.pdf p.3" + highlight in viewer.' : 'Fonti "file.pdf p.3" + highlight nel viewer.',
          status: 'Backend done',
          badge: 'RAG',
          details: lang === 'de'
            ? ['Page-aware Chunks (metadata.page), LLM zitiert p.N, Sources mit page+highlight']
            : lang === 'en'
            ? ['Page-aware chunks (metadata.page), LLM cites p.N, sources with page+highlight']
            : ['Chunk page-aware (metadata.page), LLM cita p.N, fonti con page+highlight'],
        },
        {
          title: lang === 'de' ? 'Benutzer & Rollen' : lang === 'en' ? 'Users & Roles' : 'Utenti & Ruoli',
          desc: 'Nextcloud SSO → ruoli (viewer/editor/admin).',
          status: tr('roadmap.statusPlanned'),
          badge: 'Auth',
          details: [],
        },
        {
          title: lang === 'de' ? 'PDF Export' : lang === 'en' ? 'PDF Export' : 'Export PDF',
          desc: lang === 'de' ? 'Chat Q&A + Quellen + Chart als PDF (reportlab).' : lang === 'en' ? 'Chat Q&A + sources + chart as PDF (reportlab).' : 'Q&A chat + fonti + grafico come PDF (reportlab).',
          status: tr('roadmap.statusPlanned'),
          badge: 'Export',
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
          desc: lang === 'de' ? 'Jeder WebDAV-Server als Quelle (bereits via httpx+lxml).' : lang === 'en' ? 'Any WebDAV server as source (already via httpx+lxml).' : 'Qualsiasi server WebDAV come sorgente (già via httpx+lxml).',
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
        {
          title: 'Watch Mode',
          desc: lang === 'de' ? 'watchdog für lokale Ordner + WebDAV Poll (sync_interval_minutes).' : lang === 'en' ? 'watchdog for local folders + WebDAV poll (sync_interval_minutes).' : 'watchdog per cartelle locali + WebDAV poll (sync_interval_minutes).',
          status: tr('roadmap.statusPlanned'),
          badge: 'Watch',
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
