import React, { useState, useEffect, useCallback } from 'react';
import { webdavApi, hidriveApi } from '../utils/api';
import { useI18n, t } from '../utils/i18n';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

function WebDAVPanel({ showToast }) {
  const { lang } = useI18n(); const tr = p => t(lang, p);
  const [sources, setSources] = useState([]);
  const [url, setUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [connName, setConnName] = useState('');
  const [pickerPath, setPickerPath] = useState('/');
  const [pickerFolders, setPickerFolders] = useState([]);
  const [pickerError, setPickerError] = useState('');
  const [connectedSourceId, setConnectedSourceId] = useState(null);
  const [connectedUrl, setConnectedUrl] = useState('');
  const [browsingPath, setBrowsingPath] = useState('/');
  const [browseItems, setBrowseItems] = useState([]);
  const [loadingConnect, setLoadingConnect] = useState(false);
  const [syncingId, setSyncingId] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const loadSources = useCallback(async () => {
    try {
      const res = await webdavApi.listSources();
      setSources(res.data.sources || []);
    } catch {}
  }, []);
  useEffect(() => { loadSources(); }, [loadSources]);

  const handleConnect = async () => {
    if (!url.trim() || !username.trim() || !password) { showToast?.(tr('folders.webdavFillAll'),'warning'); return; }
    setLoadingConnect(true); setPickerError('');
    try {
      const res = await webdavApi.connect(url.trim(), username.trim(), password, connName.trim() || undefined, pickerPath);
      const data = res.data;
      setConnectedSourceId(data.source_id);
      setConnectedUrl(data.url);
      setBrowsingPath(data.picker_path || '/');
      setPickerFolders(data.folders || []);
      if (data.picker_error) setPickerError(data.picker_error);
      showToast?.(tr('folders.webdavConnected'),'success');
      loadSources();
      // after connect, browse current path for picker
      if (data.source_id) {
        try {
          const br = await webdavApi.listFolders(data.source_id, data.picker_path || '/');
          setBrowseItems(br.data.all || []);
          setBrowsingPath(br.data.path || '/');
        } catch {}
      }
    } catch (e) {
      const msg = e.response?.data?.detail || e.message;
      setPickerError(msg); showToast?.(msg,'error');
    } finally { setLoadingConnect(false); }
  };

  const browsePath = async (path) => {
    if (!connectedSourceId) return;
    try {
      const res = await webdavApi.listFolders(connectedSourceId, path);
      setBrowseItems(res.data.all || []);
      setBrowsingPath(res.data.path || path);
      setPickerError('');
    } catch (e) {
      setPickerError(e.response?.data?.detail || e.message);
    }
  };

  const addFolderFromPicker = async (remotePath, nameHint) => {
    if (!connectedSourceId) return;
    try {
      const res = await webdavApi.addFolder(connectedSourceId, remotePath, nameHint);
      showToast?.(`Cartella WebDAV aggiunta: ${res.data.name} → sync disponibile`,'success');
      loadSources();
    } catch (e) {
      showToast?.(e.response?.data?.detail || e.message,'error');
    }
  };

  const handleSync = async (id) => {
    setSyncingId(id);
    try {
      const res = await webdavApi.sync(id);
      const d = res.data;
      showToast?.(`Sync: +${d.added} nuovi ~${d.updated} aggiornati -${d.deleted} rimossi`,'success');
      loadSources();
    } catch (e) {
      showToast?.(e.response?.data?.detail || e.message,'error');
    } finally { setSyncingId(null); }
  };
  const handleSyncAll = async () => {
    setSyncingId('all');
    try {
      const res = await webdavApi.syncAll();
      const tot = (res.data.results||[]).reduce((s,r)=>s+(r.added||0),0);
      showToast?.(`Sync tutte: ${tot} nuovi file`,'success');
      loadSources();
    } catch (e) { showToast?.(e.response?.data?.detail||e.message,'error'); }
    finally { setSyncingId(null); }
  };
  const handleDelete = async (id, name) => {
    if (!confirm(`${tr('folders.confirmRemove')} "${name}"? I documenti già indicizzati resteranno.`)) return;
    try { await webdavApi.deleteSource(id); showToast?.(tr('common.remove'),'success'); loadSources(); } catch (e){ showToast?.(e.response?.data?.detail||e.message,'error'); }
  };

  // breadcrumb for browsingPath
  const crumbs = browsingPath.split('/').filter(Boolean);
  const breadPaths = ['/', ...crumbs.map((_,i)=>'/' + crumbs.slice(0,i+1).join('/'))];

  return (
    <div style={{ background:'var(--bg-glass)', border:'1px solid var(--border-glass)', borderRadius:'14px', padding:'1.25rem', marginBottom:'1.5rem' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.85rem' }}>
        <h3 style={{ fontFamily:'var(--font-display)', fontSize:'1.05rem', fontWeight:600, color:'var(--text-primary)', display:'flex', alignItems:'center', gap:'0.5rem', margin:0 }}>
          <span style={{ background:'linear-gradient(135deg,#4a9eff,#38bdf8)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>☁️</span> {tr('folders.webdavTitle')}
          <span style={{ fontSize:'0.65rem', padding:'0.15rem 0.45rem', borderRadius:'6px', background:'rgba(74,158,255,0.12)', color:'var(--accent-blue)', border:'1px solid rgba(74,158,255,0.2)', fontFamily:'var(--font-mono)' }}>NEW</span>
        </h3>
        {sources.length>0 && <button onClick={handleSyncAll} disabled={syncingId==='all'} style={{ fontSize:'0.75rem', background: syncingId==='all'?'rgba(74,158,255,0.08)':'rgba(74,158,255,0.12)', color:'var(--accent-blue)', border:'1px solid rgba(74,158,255,0.2)', borderRadius:'8px', padding:'0.3rem 0.7rem', cursor: syncingId==='all'?'not-allowed':'pointer', opacity: syncingId==='all'?0.6:1 }}>{syncingId==='all'?`⏳ ${tr('folders.syncing')}`:`🔄 ${tr('folders.syncAll')}`}</button>}
      </div>
      <p style={{ color:'var(--text-secondary)', fontSize:'0.78rem', lineHeight:1.5, margin:'0 0 0.9rem 0' }}>
        {tr('folders.webdavDesc')}
      </p>

      {/* Connect form */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.6rem', marginBottom:'0.7rem' }}>
        <input value={url} onChange={e=>setUrl(e.target.value)} placeholder={tr('folders.webdavUrlPlaceholder')} style={{ gridColumn:'1 / -1', background:'#ffffff', border:'1px solid var(--border-glass)', borderRadius:'10px', padding:'0.6rem 0.9rem', color:'var(--text-primary)', fontSize:'0.82rem', fontFamily:'var(--font-mono)' }} />
        <input value={username} onChange={e=>setUsername(e.target.value)} placeholder={tr('folders.webdavUser')} style={{ background:'#ffffff', border:'1px solid var(--border-glass)', borderRadius:'10px', padding:'0.6rem 0.9rem', color:'var(--text-primary)', fontSize:'0.85rem' }} />
        <input value={password} onChange={e=>setPassword(e.target.value)} type="password" placeholder={tr('folders.webdavPass')} style={{ background:'#ffffff', border:'1px solid var(--border-glass)', borderRadius:'10px', padding:'0.6rem 0.9rem', color:'var(--text-primary)', fontSize:'0.85rem' }} />
      </div>
      <div style={{ display:'flex', gap:'0.6rem', marginBottom:'0.6rem', flexWrap:'wrap', alignItems:'center' }}>
        <input value={connName} onChange={e=>setConnName(e.target.value)} placeholder={tr('folders.webdavNamePlaceholder')} style={{ flex:'1 1 180px', background:'#ffffff', border:'1px solid var(--border-glass)', borderRadius:'10px', padding:'0.5rem 0.8rem', color:'var(--text-primary)', fontSize:'0.82rem' }} />
        <input value={pickerPath} onChange={e=>setPickerPath(e.target.value)} placeholder="/" title="Percorso iniziale per picker" style={{ width:'120px', background:'#ffffff', border:'1px solid var(--border-glass)', borderRadius:'10px', padding:'0.5rem 0.8rem', color:'var(--text-primary)', fontSize:'0.82rem', fontFamily:'var(--font-mono)' }} />
        <button onClick={handleConnect} disabled={loadingConnect} style={{ padding:'0.55rem 1.1rem', background: loadingConnect?'rgba(74,158,255,0.08)':'linear-gradient(135deg, rgba(74,158,255,0.18), rgba(56,189,248,0.18))', color:'var(--accent-blue)', border:'1px solid rgba(74,158,255,0.25)', borderRadius:'10px', fontWeight:600, cursor: loadingConnect?'not-allowed':'pointer', opacity: loadingConnect?0.6:1 }}>
          {loadingConnect?`⏳ ${tr('folders.webdavConnecting')}`:`🔌 ${tr('folders.webdavConnect')}`}
        </button>
      </div>
      {pickerError && <div style={{ background:'rgba(255,85,85,0.08)', border:'1px solid rgba(255,85,85,0.18)', color:'#ff8a8a', borderRadius:'8px', padding:'0.5rem 0.8rem', fontSize:'0.78rem', marginBottom:'0.7rem' }}>⚠ {pickerError}</div>}
      <div style={{ fontSize:'0.72rem', color:'var(--text-secondary)', marginBottom:'0.8rem' }}>
        {tr('folders.webdavAppPassHint')}
      </div>

      {/* Browse picker after connect */}
      {connectedSourceId && (
        <div style={{ background:'#ffffff', border:'1px solid var(--border-glass)', borderRadius:'12px', padding:'0.9rem 1rem', marginBottom:'0.9rem' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.6rem', flexWrap:'wrap', gap:'0.4rem' }}>
            <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.75rem', color:'var(--text-secondary)' }}>📂 {tr('folders.browseTitle')}</span>
            <div style={{ display:'flex', gap:'0.3rem', flexWrap:'wrap' }}>
              {breadPaths.map((p,i)=>(
                <button key={p} onClick={()=>browsePath(p)} style={{ background: p===browsingPath?'rgba(74,158,255,0.15)':'rgba(31,41,55,0.04)', color: p===browsingPath?'var(--accent-blue)':'var(--text-secondary)', border:'1px solid var(--border-glass)', borderRadius:'6px', padding:'0.15rem 0.45rem', fontSize:'0.72rem', cursor:'pointer', fontFamily:'var(--font-mono)' }}>{i===0?tr('folders.browseRoot'):p.split('/').pop()}</button>
              ))}
            </div>
          </div>
          <div style={{ display:'flex', gap:'0.5rem', marginBottom:'0.6rem', flexWrap:'wrap' }}>
            <button onClick={()=>addFolderFromPicker(browsingPath, browsingPath.split('/').pop()||'root')} style={{ fontSize:'0.78rem', background:'rgba(126,231,135,0.12)', color:'var(--accent-green)', border:'1px solid rgba(126,231,135,0.25)', borderRadius:'8px', padding:'0.35rem 0.75rem', cursor:'pointer', fontWeight:600 }}>＋ {tr('folders.indexThisFolder')} ({browsingPath})</button>
            <span style={{ fontSize:'0.72rem', color:'var(--text-secondary)', alignSelf:'center' }}>{browseItems.length} {tr('folders.elements')}</span>
          </div>
          <div style={{ maxHeight:'220px', overflowY:'auto', display:'flex', flexDirection:'column', gap:'0.25rem' }}>
            {browseItems.filter(it=>it.is_collection).length===0 && browseItems.length>0 && <span style={{ fontSize:'0.78rem', color:'var(--text-secondary)' }}>{tr('folders.noSubfolders')}</span>}
            {browseItems.filter(it=>it.is_collection).map(it=> {
              const hrefPath = (()=>{ try{ const u=new URL('http://x'+it.href); return decodeURIComponent(u.pathname); }catch{ return it.href; }})();
              // ricostruisci remote path relativo a dav root: usa href tail
              // più semplice: usa it.href decoded e cerca di estrarre remote_path-like: prendi filename e ricostruisci browsingPath + filename
              const childPath = (browsingPath.replace(/\/$/,'') || '') + '/' + it.filename;
              return (
                <div key={it.href} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0.4rem 0.6rem', borderRadius:'8px', background:'rgba(31,41,55,0.03)', border:'1px solid transparent' }}>
                  <button onClick={()=>browsePath(childPath)} style={{ background:'none', border:'none', color:'var(--accent-blue)', cursor:'pointer', fontSize:'0.85rem', textAlign:'left' }}>📁 {it.filename}</button>
                  <button onClick={()=>addFolderFromPicker(childPath, it.filename)} style={{ fontSize:'0.72rem', background:'rgba(74,158,255,0.1)', color:'var(--accent-blue)', border:'1px solid rgba(74,158,255,0.2)', borderRadius:'6px', padding:'0.2rem 0.5rem', cursor:'pointer' }}>＋ {tr('folders.indexThisFolder')}</button>
                </div>
              );
            })}
            {/* file preview */}
            {browseItems.filter(it=>!it.is_collection).slice(0,8).map(it=> (
              <div key={it.href} style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.2rem 0.6rem', fontSize:'0.78rem', color:'var(--text-secondary)' }}>
                <span>📄 {it.filename}</span><span style={{ fontFamily:'var(--font-mono)', fontSize:'0.7rem' }}>{(it.size_bytes/1024).toFixed(1)} KB</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sources list */}
      {sources.length===0 ? (
        <div style={{ textAlign:'center', padding:'1.2rem', color:'var(--text-secondary)', fontSize:'0.85rem', border:'1px dashed var(--border-glass)', borderRadius:'10px' }}>
          {tr('folders.noSources')}
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
          {sources.map(s=> (
            <div key={s.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0.85rem 1rem', background:'#ffffff', borderRadius:'12px', border:'1px solid var(--border-glass)', gap:'0.75rem', flexWrap:'wrap' }}>
              <div style={{ flex:1, minWidth:'180px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', flexWrap:'wrap' }}>
                  <span style={{ fontWeight:600, color:'var(--text-primary)', fontSize:'0.9rem' }}>☁️ {s.name}</span>
                  <span style={{ fontSize:'0.65rem', padding:'0.15rem 0.4rem', borderRadius:'6px', background:'rgba(74,158,255,0.12)', color:'var(--accent-blue)', border:'1px solid rgba(74,158,255,0.2)', fontFamily:'var(--font-mono)' }}>WebDAV</span>
                  <span style={{ fontSize:'0.7rem', padding:'0.15rem 0.45rem', borderRadius:'6px', background: s.last_status?.startsWith('ok')?'rgba(126,231,135,0.1)': s.last_status?'rgba(255,166,87,0.1)':'rgba(31,41,55,0.05)', color: s.last_status?.startsWith('ok')?'var(--accent-green)': s.last_status?'#ffa657':'var(--text-secondary)', border:`1px solid ${s.last_status?.startsWith('ok')?'rgba(126,231,135,0.2)':'var(--border-glass)'}`, fontFamily:'var(--font-mono)' }}>{s.last_status || 'mai sincronizzato'}</span>
                </div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.72rem', color:'var(--text-secondary)', marginTop:'0.25rem', wordBreak:'break-all' }}>{s.url}{s.remote_path}</div>
                {s.last_sync && <div style={{ fontSize:'0.7rem', color:'var(--text-secondary)', marginTop:'0.15rem' }}>{tr('folders.lastSync')}: {new Date(s.last_sync).toLocaleString(lang === 'de' ? 'de-DE' : lang === 'en' ? 'en-US' : 'it-IT')}</div>}
              </div>
              <div style={{ display:'flex', gap:'0.4rem', alignItems:'center' }}>
                <button onClick={()=>handleSync(s.id)} disabled={syncingId===s.id} style={{ padding:'0.4rem 0.8rem', background: syncingId===s.id?'rgba(74,158,255,0.06)':'rgba(74,158,255,0.12)', color:'var(--accent-blue)', border:'1px solid rgba(74,158,255,0.2)', borderRadius:'8px', fontSize:'0.8rem', cursor: syncingId===s.id?'not-allowed':'pointer', opacity: syncingId===s.id?0.6:1 }}>{syncingId===s.id?`⏳ ${tr('folders.syncing')}`:`🔄 ${tr('folders.syncNow')}`}</button>
                <button onClick={()=>handleDelete(s.id, s.name)} style={{ padding:'0.4rem 0.7rem', background:'rgba(255,85,85,0.06)', color:'#ff7a7a', border:'1px solid rgba(255,85,85,0.18)', borderRadius:'8px', fontSize:'0.8rem', cursor:'pointer' }}>{tr('common.remove')}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HiDrivePanel({ showToast }) {
  const { lang } = useI18n(); const tr = p => t(lang, p);
  const [connected, setConnected] = useState(false);
  const [account, setAccount] = useState('');
  const [code, setCode] = useState('');
  const [authUrl, setAuthUrl] = useState('');
  const [folders, setFolders] = useState([]);
  const [browsingPath, setBrowsingPath] = useState('/');
  const [browseItems, setBrowseItems] = useState([]);
  const [loadingConnect, setLoadingConnect] = useState(false);
  const [syncingId, setSyncingId] = useState(null);
  const [pickerError, setPickerError] = useState('');

  const loadStatus = useCallback(async () => {
    try {
      const res = await hidriveApi.connect(null);
      // connect senza code: se token presente -> connected + picker root
      if (res.data.status === 'connected') {
        setConnected(true);
        setAccount(res.data.account || '');
        setBrowsingPath('/');
        browsePath('/');
      } else if (res.data.status === 'need_code') {
        setAuthUrl(res.data.authorize_url || '');
      }
    } catch {
      // backend non raggiungibile o non connesso: resta in stato login
    }
    try {
      const fl = await hidriveApi.listFolders();
      setFolders(fl.data.folders || []);
    } catch {}
  }, []);
  useEffect(() => { loadStatus(); }, [loadStatus]);

  const handleConnect = async () => {
    setLoadingConnect(true); setPickerError('');
    try {
      // login seamless via popup (come Clumoove): il callback scambia da solo
      const res = await hidriveApi.loginUrl();
      const popup = window.open(res.data.authorize_url, 'hidrive-login', 'width=620,height=720');
      if (!popup) {
        setPickerError('Popup bloccato: consenti i popup per questo sito e riprova.');
        setLoadingConnect(false);
        return;
      }
      showToast?.(tr('folders.hidriveNeedCode'), 'info');
      // fallback sempre visibile: link + incolla-code (se il popup dà errore redirect_uri)
      try {
        const fb = await hidriveApi.connect(null);
        if (fb.data.status === 'need_code' && fb.data.authorize_url) setAuthUrl(fb.data.authorize_url);
      } catch {}
      const onMsg = async (ev) => {
        if (ev.origin !== 'https://migration.mikweb.eu' && ev.origin !== window.location.origin) return;
        if (!ev.data || ev.data.hidrive !== 'connected') return;
        window.removeEventListener('message', onMsg);
        setConnected(true);
        setCode('');
        showToast?.(tr('folders.hidriveConnected'), 'success');
        try {
          const st = await hidriveApi.connect(null);
          if (st.data.status === 'connected') {
            setAccount(st.data.account || '');
            browsePath('/');
          }
        } catch {}
        const fl = await hidriveApi.listFolders();
        setFolders(fl.data.folders || []);
        setLoadingConnect(false);
      };
      window.addEventListener('message', onMsg);
      // se il popup viene chiuso senza login, sblocca dopo un po'
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          window.removeEventListener('message', onMsg);
          setLoadingConnect(false);
        }
      }, 1000);
    } catch (e) {
      // fallback: link + code incollato (redirect_uri Clumoove già registrato)
      try {
        const res = await hidriveApi.connect(null);
        if (res.data.status === 'need_code' && res.data.authorize_url) {
          setAuthUrl(res.data.authorize_url);
          showToast?.(tr('folders.hidriveNeedCode'), 'info');
        } else {
          showToast?.(e.response?.data?.detail || e.message, 'error');
        }
      } catch (e2) {
        const msg = e2.response?.data?.detail || e2.message;
        setPickerError(msg); showToast?.(msg, 'error');
      } finally { setLoadingConnect(false); }
    }
  };

  const handleConfirmCode = async () => {
    setLoadingConnect(true); setPickerError('');
    try {
      const res = await hidriveApi.connect(code.trim() || null);
      const data = res.data;
      if (data.status === 'need_code') {
        setAuthUrl(data.authorize_url || '');
        showToast?.(tr('folders.hidriveNeedCode'), 'info');
      } else {
        setConnected(true);
        setAccount(data.account || '');
        setCode('');
        showToast?.(tr('folders.hidriveConnected'), 'success');
        browsePath('/');
      }
      const fl = await hidriveApi.listFolders();
      setFolders(fl.data.folders || []);
    } catch (e) {
      const msg = e.response?.data?.detail || e.message;
      setPickerError(msg); showToast?.(msg, 'error');
    } finally { setLoadingConnect(false); }
  };

  const browsePath = async (path) => {
    try {
      const res = await hidriveApi.browse(path);
      setBrowseItems(res.data.all || []);
      setBrowsingPath(res.data.path || path);
      setPickerError('');
    } catch (e) {
      setPickerError(e.response?.data?.detail || e.message);
    }
  };

  const addFolderFromPicker = async (remotePath, nameHint) => {
    try {
      const res = await hidriveApi.addFolder(remotePath, nameHint);
      showToast?.(`Cartella HiDrive aggiunta: ${res.data.name} → sync disponibile`, 'success');
      const fl = await hidriveApi.listFolders();
      setFolders(fl.data.folders || []);
    } catch (e) {
      showToast?.(e.response?.data?.detail || e.message, 'error');
    }
  };

  const handleSync = async (id) => {
    setSyncingId(id);
    try {
      const res = await hidriveApi.sync(id);
      const d = res.data;
      showToast?.(`Sync: +${d.added} nuovi ~${d.updated} aggiornati -${d.deleted} rimossi`, 'success');
      const fl = await hidriveApi.listFolders();
      setFolders(fl.data.folders || []);
    } catch (e) {
      showToast?.(e.response?.data?.detail || e.message, 'error');
    } finally { setSyncingId(null); }
  };
  const handleSyncAll = async () => {
    setSyncingId('all');
    try {
      const res = await hidriveApi.syncAll();
      const tot = (res.data.results || []).reduce((s, r) => s + (r.added || 0), 0);
      showToast?.(`Sync tutte: ${tot} nuovi file`, 'success');
      const fl = await hidriveApi.listFolders();
      setFolders(fl.data.folders || []);
    } catch (e) { showToast?.(e.response?.data?.detail || e.message, 'error'); }
    finally { setSyncingId(null); }
  };
  const handleDelete = async (id, name) => {
    if (!confirm(`${tr('folders.confirmRemove')} "${name}"? I documenti già indicizzati resteranno.`)) return;
    try { await hidriveApi.deleteFolder(id); showToast?.(tr('common.remove'), 'success'); const fl = await hidriveApi.listFolders(); setFolders(fl.data.folders || []); } catch (e) { showToast?.(e.response?.data?.detail || e.message, 'error'); }
  };

  const crumbs = browsingPath.split('/').filter(Boolean);
  const breadPaths = ['/', ...crumbs.map((_, i) => '/' + crumbs.slice(0, i + 1).join('/'))];

  return (
    <div style={{ background:'#ffffff', border:'1px solid #ffd9bd', borderRadius:'14px', padding:'1.25rem', marginBottom:'1.5rem', boxShadow:'0 2px 12px rgba(255,108,0,0.08)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', fontWeight:700, color:'#222222', display:'flex', alignItems:'center', gap:'0.5rem', margin:0 }}>
          <span style={{ display:'inline-flex', width:'28px', height:'28px' }}><svg viewBox="0 0 24 24" width="28" height="28"><defs><linearGradient id="hdg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ff8a00"/><stop offset="1" stopColor="#ff5e00"/></linearGradient></defs><path fill="url(#hdg)" d="M7 19a4 4 0 0 1-.6-7.95A5.5 5.5 0 0 1 17 8.6 4.25 4.25 0 0 1 17.5 19H7z"/></svg></span> {tr('folders.hidriveTitle')}
          {connected && <span style={{ fontSize: '0.65rem', padding: '0.15rem 0.45rem', borderRadius: '6px', background: 'rgba(126,231,135,0.12)', color: 'var(--accent-green)', border: '1px solid rgba(126,231,135,0.2)', fontFamily: 'var(--font-mono)' }}>{account || '✓'}</span>}
        </h3>
        {folders.length > 0 && <button onClick={handleSyncAll} disabled={syncingId === 'all'} style={{ fontSize: '0.75rem', background: syncingId === 'all' ? 'rgba(74,158,255,0.08)' : 'rgba(74,158,255,0.12)', color: 'var(--accent-blue)', border: '1px solid rgba(74,158,255,0.2)', borderRadius: '8px', padding: '0.3rem 0.7rem', cursor: syncingId === 'all' ? 'not-allowed' : 'pointer', opacity: syncingId === 'all' ? 0.6 : 1 }}>{syncingId === 'all' ? `⏳ ${tr('folders.syncing')}` : `🔄 ${tr('folders.syncAll')}`}</button>}
      </div>
      <p style={{ color:'#6b7280', fontSize:'0.78rem', lineHeight:1.5, margin:'0 0 0.9rem 0' }}>
        {tr('folders.hidriveDesc')}
      </p>

      {/* Login OAuth */}
      {!connected && (
        <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={handleConnect} disabled={loadingConnect} style={{ padding: '0.55rem 1.1rem', background: loadingConnect ? '#ffe3c7' : 'linear-gradient(135deg, #ff8a00, #ff5e00)', color:'#ffffff', border:'1px solid #ff6c00', borderRadius: '10px', fontWeight: 600, cursor: loadingConnect ? 'not-allowed' : 'pointer', opacity: loadingConnect ? 0.6 : 1 }}>
            {loadingConnect ? `⏳ ${tr('folders.hidriveConnecting')}` : `🔌 ${tr('folders.hidriveConnect')}`}
          </button>
          {authUrl && <a href={authUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.8rem', color: 'var(--accent-blue)' }}>🔗 {tr('folders.hidriveOpenAuth')}</a>}
        </div>
      )}
      {!connected && authUrl && (
        <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={code} onChange={e => setCode(e.target.value)} placeholder={tr('folders.hidriveCodePlaceholder')} style={{ flex: '1 1 220px', background:'#ffffff', border:'1px solid #e5e7eb', borderRadius:'10px', padding:'0.55rem 0.9rem', color:'#222222', fontSize:'0.82rem', fontFamily:'var(--font-mono)' }} />
          <button onClick={handleConfirmCode} disabled={loadingConnect || !code.trim()} style={{ padding: '0.55rem 1.1rem', background: 'rgba(126,231,135,0.12)', color: 'var(--accent-green)', border: '1px solid rgba(126,231,135,0.25)', borderRadius: '10px', fontWeight: 600, cursor: (loadingConnect || !code.trim()) ? 'not-allowed' : 'pointer', opacity: (loadingConnect || !code.trim()) ? 0.6 : 1 }}>
            {tr('folders.hidriveConfirmCode')}
          </button>
        </div>
      )}
      {pickerError && <div style={{ background: 'rgba(255,85,85,0.08)', border: '1px solid rgba(255,85,85,0.18)', color: '#ff8a8a', borderRadius: '8px', padding: '0.5rem 0.8rem', fontSize: '0.78rem', marginBottom: '0.7rem' }}>⚠ {pickerError}</div>}

      {/* Browse picker dopo login */}
      {connected && (
        <div style={{ background:'#fff4ea', border:'1px solid #ffd9bd', borderRadius:'12px', padding:'0.9rem 1rem', marginBottom:'0.9rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem', flexWrap: 'wrap', gap: '0.4rem' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#6b7280' }}>📂 {tr('folders.hidriveBrowseTitle')}</span>
            <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
              {breadPaths.map((p, i) => (
                <button key={p} onClick={() => browsePath(p)} style={{ background: p === browsingPath ? '#ff6c00' : '#ffffff', color: p === browsingPath ? '#ffffff' : '#6b7280', border:'1px solid #ffd9bd', borderRadius: '6px', padding: '0.15rem 0.45rem', fontSize: '0.72rem', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>{i === 0 ? tr('folders.browseRoot') : p.split('/').pop()}</button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
            <button onClick={() => addFolderFromPicker(browsingPath, browsingPath.split('/').pop() || 'root')} style={{ fontSize: '0.78rem', background: 'rgba(126,231,135,0.12)', color: 'var(--accent-green)', border: '1px solid rgba(126,231,135,0.25)', borderRadius: '8px', padding: '0.35rem 0.75rem', cursor: 'pointer', fontWeight: 600 }}>＋ {tr('folders.indexThisFolder')} ({browsingPath})</button>
            <span style={{ fontSize: '0.72rem', color: '#6b7280', alignSelf: 'center' }}>{browseItems.length} {tr('folders.elements')}</span>
          </div>
          <div style={{ maxHeight: '220px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {browseItems.filter(it => it.is_collection).length === 0 && browseItems.length > 0 && <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>{tr('folders.noSubfolders')}</span>}
            {browseItems.filter(it => it.is_collection).map(it => {
              const childPath = (browsingPath.replace(/\/$/, '') || '') + '/' + it.filename;
              return (
                <div key={it.href} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0.4rem 0.6rem', borderRadius:'8px', background:'#ffffff', border:'1px solid #f3e2cf' }}>
                  <button onClick={() => browsePath(childPath)} style={{ background:'none', border:'none', color:'#ff6c00', cursor:'pointer', fontSize:'0.85rem', textAlign:'left', fontWeight:600 }}>📁 {it.filename}</button>
                  <button onClick={() => addFolderFromPicker(childPath, it.filename)} style={{ fontSize:'0.72rem', background:'#ffffff', color:'#ff6c00', border:'1px solid #ff6c00', borderRadius:'6px', padding:'0.2rem 0.5rem', cursor:'pointer', fontWeight:600 }}>＋ {tr('folders.indexThisFolder')}</button>
                </div>
              );
            })}
            {browseItems.filter(it => !it.is_collection).slice(0, 8).map(it => (
              <div key={it.href} style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.2rem 0.6rem', fontSize:'0.78rem', color:'#6b7280' }}>
                <span>📄 {it.filename}</span><span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>{(it.size_bytes / 1024).toFixed(1)} KB</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Folders list */}
      {folders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '1.2rem', color: '#6b7280', fontSize: '0.85rem', border: '1px dashed #ffd9bd', borderRadius: '10px' }}>
          {tr('folders.hidriveNoFolders')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {folders.map(s => (
            <div key={s.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0.85rem 1rem', background:'#ffffff', borderRadius:'12px', border:'1px solid #f3e2cf', gap:'0.75rem', flexWrap:'wrap' }}>
              <div style={{ flex: 1, minWidth: '180px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight:700, color:'#222222', fontSize:'0.9rem' }}>☁️ {s.name}</span>
                  <span style={{ fontSize:'0.65rem', padding:'0.15rem 0.4rem', borderRadius:'6px', background:'#ff6c00', color:'#ffffff', fontFamily:'var(--font-mono)', fontWeight:700 }}>HiDrive</span>
                  <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.45rem', borderRadius: '6px', background: s.last_status?.startsWith('ok') ? 'rgba(126,231,135,0.1)' : s.last_status ? 'rgba(255,166,87,0.1)' : 'rgba(31,41,55,0.05)', color: s.last_status?.startsWith('ok') ? 'var(--accent-green)' : s.last_status ? '#ffa657' : 'var(--text-secondary)', border: `1px solid ${s.last_status?.startsWith('ok') ? 'rgba(126,231,135,0.2)' : 'var(--border-glass)'}`, fontFamily: 'var(--font-mono)' }}>{s.last_status || 'mai sincronizzato'}</span>
                </div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.72rem', color:'#6b7280', marginTop:'0.25rem', wordBreak:'break-all' }}>hidrive:{s.remote_path} · 🔄 {tr('folders.hidriveAutoEvery')} {s.sync_interval_minutes || 60} min</div>
                {s.last_sync && <div style={{ fontSize:'0.7rem', color:'#6b7280', marginTop:'0.15rem' }}>{tr('folders.lastSync')}:{new Date(s.last_sync).toLocaleString(lang === 'de' ? 'de-DE' : lang === 'en' ? 'en-US' : 'it-IT')}</div>}
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <button onClick={() => handleSync(s.id)} disabled={syncingId === s.id} style={{ padding: '0.4rem 0.8rem', background: syncingId === s.id ? 'rgba(74,158,255,0.06)' : 'rgba(74,158,255,0.12)', color: 'var(--accent-blue)', border: '1px solid rgba(74,158,255,0.2)', borderRadius: '8px', fontSize: '0.8rem', cursor: syncingId === s.id ? 'not-allowed' : 'pointer', opacity: syncingId === s.id ? 0.6 : 1 }}>{syncingId === s.id ? `⏳ ${tr('folders.syncing')}` : `🔄 ${tr('folders.syncNow')}`}</button>
                <button onClick={() => handleDelete(s.id, s.name)} style={{ padding: '0.4rem 0.7rem', background: 'rgba(255,85,85,0.06)', color: '#ff7a7a', border: '1px solid rgba(255,85,85,0.18)', borderRadius: '8px', fontSize: '0.8rem', cursor: 'pointer' }}>{tr('common.remove')}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Folders({ showToast }) {
  const { lang } = useI18n(); const tr = p => t(lang,p);
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
      showToast?.(tr('folders.enterPath'), 'error');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/documents/folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: newFolderPath, name: newFolderName || newFolderPath.split('/').pop() })
      });
      if (res.ok) {
        showToast?.(tr('folders.added'), 'success');
        setNewFolderPath(''); setNewFolderName('');
        loadFolders();
      } else {
        const data = await res.json();
        showToast?.(data.detail || tr('common.error'), 'error');
      }
    } catch (err) {
      showToast?.(`${tr('common.error')}: ` + err.message, 'error');
    }
  };

  const removeFolder = async (name) => {
    if (!confirm(`${tr('folders.confirmRemove')} "${name}"?`)) return;
    try {
      const res = await fetch(`${API_URL}/api/documents/folders/${name}`, { method: 'DELETE' });
      if (res.ok) {
        showToast?.(tr('common.remove'), 'success');
        loadFolders();
      }
    } catch (err) {
      showToast?.(`${tr('common.error')}: ` + err.message, 'error');
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
            if (r.new_files > 0) showToast?.(`${tr('folders.scanComplete')}: ${r.new_files} nuovi documenti`, 'success');
            else showToast?.(tr('folders.scanComplete'), 'info');
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
  }, [showToast, lang]);

  const scanFolder = async (name) => {
    setScanning(name);
    try {
      const res = await fetch(`${API_URL}/api/documents/folders/${name}/scan`, { method: 'POST' });
      const data = await res.json();
      showToast?.(`${tr('folders.scan')}...`, 'info');
      pollScanStatus(() => setScanning(null));
    } catch (err) {
      if (err.message?.includes('409')) showToast?.(tr('common.warning'), 'warning');
      else showToast?.(`${tr('common.error')}: ` + err.message, 'error');
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
        {tr('folders.loading')}
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
        <span style={{ fontSize: '1.2rem' }}>📂</span> {tr('folders.title')}
      </h2>

      {/* WebDAV Panel — NEW */}
      <WebDAVPanel showToast={showToast} />

      {/* HiDrive Panel — OAuth login + folder picker + sync */}
      <HiDrivePanel showToast={showToast} />

      <div style={{ height:'1px', background:'var(--border-glass)', margin:'1.2rem 0' }} />

      <h3 style={{ fontFamily:'var(--font-display)', fontSize:'1rem', fontWeight:600, color:'var(--text-primary)', marginBottom:'0.9rem', display:'flex', alignItems:'center', gap:'0.4rem' }}>💾 {tr('folders.titleLocalSection')}</h3>

      <div style={{
        background: 'var(--bg-glass)', borderRadius: '14px', border: '1px solid var(--border-glass)',
        padding: '1.25rem', marginBottom: '1.5rem',
      }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          <input
            type="text" placeholder={tr('folders.inputPath')}
            value={newFolderPath} onChange={(e) => setNewFolderPath(e.target.value)}
            style={{
              flex: 1, minWidth: '200px', background: '#ffffff',
              border: '1px solid var(--border-glass)', borderRadius: '10px',
              padding: '0.65rem 1rem', color: 'var(--text-primary)',
              fontSize: '0.85rem', fontFamily: 'var(--font-mono)', outline: 'none', transition: 'border-color 0.2s',
            }}
            onFocus={(e) => e.target.style.borderColor = 'var(--accent-purple)'}
            onBlur={(e) => e.target.style.borderColor = 'var(--border-glass)'}
          />
          <input
            type="text" placeholder={tr('folders.inputName')}
            value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)}
            style={{
              width: '180px', background: '#ffffff',
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
              background: 'linear-gradient(135deg, rgba(255,108,0,0.15) 0%, rgba(255,138,0,0.15) 100%)',
              color: 'var(--accent-purple)', border: '1px solid rgba(255,108,0,0.2)',
              borderRadius: '10px', fontSize: '0.85rem', fontWeight: 500,
              cursor: 'pointer', transition: 'all 0.3s', fontFamily: 'var(--font-sans)',
            }}
            onMouseEnter={(e) => { e.target.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={(e) => { e.target.style.transform = 'none'; }}
          >{tr('folders.add')}</button>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
          💡 {tr('folders.indexHint')}
        </p>
        <button
          onClick={() => setShowHelp(!showHelp)}
          style={{
            background: 'none', border: 'none', color: 'var(--accent-blue)',
            fontSize: '0.75rem', cursor: 'pointer', padding: '0.25rem 0',
            textDecoration: 'underline',
          }}
        >
          {showHelp ? `▼ ${tr('folders.hidePaths')}` : `▶ ${tr('folders.showPaths')}`}
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
                    textAlign: 'left', padding: '0.4rem 0.6rem', background: 'rgba(31,41,55,0.03)',
                    border: '1px solid var(--border-glass)', borderRadius: '6px', color: 'var(--text-secondary)',
                    fontSize: '0.75rem', fontFamily: 'var(--font-mono)', cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => { e.target.style.background = 'rgba(74,158,255,0.1)'; e.target.style.color = 'var(--accent-blue)'; }}
                  onMouseLeave={(e) => { e.target.style.background = 'rgba(31,41,55,0.03)'; e.target.style.color = 'var(--text-secondary)'; }}
                >
                  {path}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {folders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: '2.2rem', marginBottom: '0.6rem', opacity: 0.6 }}>📁</div>
          <p style={{ fontSize: '0.95rem', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
            {tr('folders.noLocalFolders')}
          </p>
          <p style={{ fontSize: '0.82rem' }}>{tr('folders.noLocalFoldersHint')}</p>
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
              e.currentTarget.style.borderColor = 'rgba(255,108,0,0.2)';
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
                  background: folder.active ? 'rgba(126,231,135,0.1)' : 'rgba(31,41,55,0.05)',
                  color: folder.active ? 'var(--accent-green)' : 'var(--text-secondary)',
                  border: `1px solid ${folder.active ? 'rgba(126,231,135,0.2)' : 'var(--border-glass)'}`,
                  fontFamily: 'var(--font-mono)',
                }}>
                  {folder.active ? tr('folders.active') : tr('folders.inactive')}
                </span>
                <button
                  onClick={() => scanFolder(folder.name)}
                  disabled={scanning === folder.name}
                  style={{
                    padding: '0.4rem 0.8rem',
                    background: scanning === folder.name ? 'rgba(255,108,0,0.05)' : 'rgba(255,108,0,0.08)',
                    color: 'var(--accent-purple)', border: '1px solid rgba(255,108,0,0.15)',
                    borderRadius: '8px', fontSize: '0.8rem', cursor: scanning === folder.name ? 'not-allowed' : 'pointer',
                    opacity: scanning === folder.name ? 0.5 : 1, transition: 'all 0.2s',
                  }}
                >
                  {scanning === folder.name ? '⏳' : `🔍 ${tr('folders.scan')}`}
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
                >{tr('common.remove')}</button>
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
          <div style={{ width: '100%', height: '6px', background: 'rgba(31,41,55,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ width: `${scanProgress.pct}%`, height: '100%', background: 'linear-gradient(90deg, #ff6c00, #ff8a00)', borderRadius: '3px', transition: 'width 0.5s ease' }} />
          </div>
        </div>
      )}

      <div style={{
        marginTop: '1.5rem', padding: '1rem 1.25rem',
        background: 'rgba(74,158,255,0.03)', borderRadius: '12px',
        border: '1px solid rgba(74,158,255,0.08)',
      }}>
        <p style={{
          color: 'var(--accent-blue)', fontSize: '0.8rem', fontWeight: 500,
          marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
        }}><span>💡</span> {tr('folders.howItWorks')}</p>
        <ul style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.8, paddingLeft: '1.25rem' }}>
          <li>{tr('folders.howItWorksLocal')}</li>
          <li>{tr('folders.howItWorksNextcloud')}</li>
          <li>{tr('folders.howItWorksHidrive')}</li>
          <li>{tr('folders.howItWorksDelete')}</li>
        </ul>
      </div>
    </div>
  );
}
