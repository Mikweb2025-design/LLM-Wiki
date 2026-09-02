import React, { useState, useEffect } from 'react';
import { documentsApi } from '../utils/api';
import { useI18n } from '../utils/i18n';

const API = 'http://127.0.0.1:8000';

// Minimal SVG Bar/Line chart senza dipendenze esterne
function BarChart({ data, color = 'var(--accent-blue)' }) {
  if (!data || data.length === 0) return <div style={{ textAlign:'center', color:'var(--text-secondary)', padding:'2rem' }}>Nessun dato</div>;
  const max = Math.max(...data.map(d => d.value), 1);
  const w = 700, h = 320, pad = 40, barGap = 8;
  const barW = (w - pad*2 - barGap*(data.length-1)) / data.length;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width:'100%', height:'320px', background:'rgba(15,15,25,0.5)', borderRadius:'12px', border:'1px solid var(--border-glass)' }}>
      {/* grid */}
      {[0,0.25,0.5,0.75,1].map(f => (
        <line key={f} x1={pad} x2={w-pad} y1={h-pad - f*(h-pad*2)} y2={h-pad - f*(h-pad*2)} stroke="rgba(255,255,255,0.06)" strokeDasharray="4 4" />
      ))}
      {data.map((d,i) => {
        const bh = (d.value/max)*(h-pad*2);
        const x = pad + i*(barW+barGap);
        const y = h - pad - bh;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={bh} rx="6" fill={color} opacity="0.85" />
            <text x={x+barW/2} y={h-pad+14} textAnchor="middle" fontSize="9" fill="var(--text-secondary)" fontFamily="var(--font-mono)">{d.label.length>10?d.label.slice(0,10)+'…':d.label}</text>
            <text x={x+barW/2} y={y-6} textAnchor="middle" fontSize="10" fill="var(--text-primary)" fontWeight="600">{d.value.toLocaleString('it-IT')}€</text>
          </g>
        );
      })}
    </svg>
  );
}

function LineChart({ data, color = 'var(--accent-purple)' }) {
  if (!data || data.length <2) return <BarChart data={data} color={color} />;
  const max = Math.max(...data.map(d=>d.value),1);
  const min = Math.min(...data.map(d=>d.value),0);
  const range = max-min || 1;
  const w=700,h=320,pad=40;
  const stepX = (w-pad*2)/(data.length-1);
  const pts = data.map((d,i) => {
    const x = pad + i*stepX;
    const y = h-pad - ((d.value-min)/range)*(h-pad*2);
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width:'100%', height:'320px', background:'rgba(15,15,25,0.5)', borderRadius:'12px', border:'1px solid var(--border-glass)' }}>
      {[0,0.25,0.5,0.75,1].map(f => (
        <line key={f} x1={pad} x2={w-pad} y1={h-pad - f*(h-pad*2)} y2={h-pad - f*(h-pad*2)} stroke="rgba(255,255,255,0.06)" strokeDasharray="4 4" />
      ))}
      <polyline fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" points={pts} />
      {data.map((d,i)=>{
        const x=pad+i*stepX;
        const y=h-pad - ((d.value-min)/range)*(h-pad*2);
        return <g key={i}><circle cx={x} cy={y} r="4" fill={color} stroke="white" strokeWidth="1.5" /><text x={x} y={h-pad+14} textAnchor="middle" fontSize="9" fill="var(--text-secondary)">{d.label.slice(0,7)}</text></g>;
      })}
    </svg>
  );
}

function PieChart({ data }) {
  if (!data || data.length===0) return <div style={{textAlign:'center', color:'var(--text-secondary)', padding:'2rem'}}>Nessun dato</div>;
  const total = data.reduce((s,d)=>s+d.value,0) || 1;
  const colors = ['#4a9eff','#a855f7','#ec4899','#7ee787','#ffa657','#38bdf8','#f87171','#34d399'];
  let acc=0;
  const cx=160, cy=160, r=110;
  return (
    <div style={{ display:'flex', gap:'1.5rem', alignItems:'center', flexWrap:'wrap', justifyContent:'center' }}>
      <svg viewBox="0 0 320 320" style={{ width:'280px', height:'280px', flexShrink:0 }}>
        {data.map((d,i)=>{
          const start = acc/total*2*Math.PI - Math.PI/2;
          const end = (acc+d.value)/total*2*Math.PI - Math.PI/2;
          acc+=d.value;
          const large = (end-start) > Math.PI ? 1:0;
          const x1 = cx + r*Math.cos(start), y1 = cy + r*Math.sin(start);
          const x2 = cx + r*Math.cos(end), y2 = cy + r*Math.sin(end);
          return <path key={i} d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`} fill={colors[i%colors.length]} stroke="rgba(15,15,25,0.8)" strokeWidth="2" />;
        })}
        <circle cx={cx} cy={cy} r="58" fill="rgba(15,15,25,0.95)" />
        <text x={cx} y={cy-6} textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--text-primary)">{total.toLocaleString('it-IT')}€</text>
        <text x={cx} y={cy+10} textAnchor="middle" fontSize="9" fill="var(--text-secondary)">Totale</text>
      </svg>
      <div style={{ display:'flex', flexDirection:'column', gap:'0.4rem' }}>
        {data.map((d,i)=>(
          <div key={i} style={{ display:'flex', alignItems:'center', gap:'0.6rem', fontSize:'0.82rem' }}>
            <span style={{ width:'12px', height:'12px', borderRadius:'3px', background: colors[i%colors.length] }} />
            <span style={{ color:'var(--text-primary)', fontWeight:500 }}>{d.label}</span>
            <span style={{ color:'var(--text-secondary)' }}>{d.value.toLocaleString('it-IT')}€ ({((d.value/total)*100).toFixed(1)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Analytics({ showToast }) {
  const { lang } = useI18n();
  const [docs, setDocs] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [preset, setPreset] = useState('fatture');
  const [customFields, setCustomFields] = useState('data, importo, fornitore');
  const [customPrompt, setCustomPrompt] = useState('');
  const [groupBy, setGroupBy] = useState('month');
  const [chartType, setChartType] = useState('bar');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [presets, setPresets] = useState({});

  useEffect(()=>{
    documentsApi.list({limit:100}).then(r=>setDocs(r.data||[])).catch(()=>{});
    fetch(`${API}/api/analytics/presets`).then(r=>r.json()).then(d=>setPresets(d.presets||{})).catch(()=>{});
  },[]);

  const toggle = (f) => setSelected(prev=>{
    const n=new Set(prev);
    if(n.has(f)) n.delete(f); else n.add(f);
    return n;
  });

  const handleGenerate = async () => {
    if(selected.size===0){ showToast?.('Seleziona almeno un documento','warning'); return; }
    setLoading(true); setResult(null);
    try {
      const payload = {
        filenames: Array.from(selected),
        preset,
        group_by: groupBy,
        custom_fields: preset==='custom' ? customFields.split(',').map(s=>s.trim()).filter(Boolean) : undefined,
        custom_prompt: customPrompt || undefined,
      };
      const res = await fetch(`${API}/api/analytics/aggregate`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)
      });
      if(!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setResult(data);
      showToast?.(`Grafico pronto: ${data.count} righe → ${data.chart_data.length} gruppi`,'success');
    } catch(e){
      showToast?.('Errore: '+e.message,'error');
    } finally { setLoading(false);}
  };

  const t = (it,en,de) => lang==='de'?de : lang==='en'?en : it;

  return (
    <div className="glass-card" style={{ padding:'1.5rem', display:'flex', flexDirection:'column', gap:'1.25rem' }}>
      <div>
        <h2 style={{ fontFamily:'var(--font-display)', fontSize:'1.35rem', fontWeight:700, color:'var(--text-primary)', display:'flex', alignItems:'center', gap:'0.5rem' }}>
          <span style={{ background:'var(--accent-gradient)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>📊</span>
          {t('Grafici da Documenti','Charts from Documents','Diagramme aus Dokumenten')}
        </h2>
        <p style={{ color:'var(--text-secondary)', fontSize:'0.85rem', marginTop:'0.3rem' }}>
          {t('Seleziona fatture/spese e genera grafici configurabili.','Select invoices/expenses and generate configurable charts.','Wähle Rechnungen/Ausgaben und erstelle konfigurierbare Diagramme.')}
        </p>
      </div>

      {/* Document selector */}
      <div style={{ background:'var(--bg-glass)', border:'1px solid var(--border-glass)', borderRadius:'14px', padding:'1rem 1.2rem' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.6rem' }}>
          <span style={{ fontSize:'0.85rem', fontWeight:600, color:'var(--text-primary)' }}>{t('Documenti','Documents','Dokumente')} ({docs.length})</span>
          <div style={{ display:'flex', gap:'0.4rem' }}>
            <button onClick={()=>setSelected(new Set(docs.map(d=>d.filename)))} style={{ fontSize:'0.75rem', background:'rgba(74,158,255,0.1)', color:'var(--accent-blue)', border:'1px solid rgba(74,158,255,0.2)', borderRadius:'8px', padding:'0.25rem 0.6rem', cursor:'pointer' }}>{t('Tutti','All','Alle')}</button>
            <button onClick={()=>setSelected(new Set())} style={{ fontSize:'0.75rem', background:'var(--bg-glass)', color:'var(--text-secondary)', border:'1px solid var(--border-glass)', borderRadius:'8px', padding:'0.25rem 0.6rem', cursor:'pointer' }}>{t('Nessuno','None','Keine')}</button>
          </div>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:'0.3rem', maxHeight:'220px', overflowY:'auto', paddingRight:'0.3rem' }}>
          {docs.map(d=>(
            <label key={d.filename} style={{ display:'flex', alignItems:'center', gap:'0.6rem', padding:'0.35rem 0.5rem', borderRadius:'8px', background: selected.has(d.filename)?'rgba(74,158,255,0.08)':'transparent', border:`1px solid ${selected.has(d.filename)?'rgba(74,158,255,0.15)':'transparent'}`, cursor:'pointer' }}>
              <input type="checkbox" checked={selected.has(d.filename)} onChange={()=>toggle(d.filename)} style={{ accentColor:'var(--accent-blue)' }} />
              <span style={{ fontSize:'0.82rem', color:'var(--text-primary)', flex:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{d.filename}</span>
              <span style={{ fontSize:'0.7rem', color:'var(--text-secondary)', fontFamily:'var(--font-mono)' }}>{d.extension}</span>
            </label>
          ))}
        </div>
        <div style={{ marginTop:'0.5rem', fontSize:'0.75rem', color:'var(--text-secondary)' }}>{selected.size} {t('selezionati','selected','ausgewählt')}</div>
      </div>

      {/* Config */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:'0.75rem' }}>
        <div>
          <label style={{ fontSize:'0.75rem', color:'var(--text-secondary)', fontFamily:'var(--font-mono)' }}>Template</label>
          <select value={preset} onChange={e=>setPreset(e.target.value)} style={{ width:'100%', marginTop:'0.25rem', background:'rgba(15,15,25,0.8)', border:'1px solid var(--border-glass)', borderRadius:'10px', padding:'0.55rem 0.7rem', color:'var(--text-primary)', fontSize:'0.85rem' }}>
            {Object.entries(presets).map(([k,v])=> <option key={k} value={k}>{v.label} — {v.fields.join(', ')}</option>)}
            <option value="fatture">Fatture — data, importo, fornitore, numero_fattura</option>
            <option value="spese">Spese — data, importo, categoria, descrizione</option>
            <option value="stipendi">Stipendi — data, importo_netto, importo_lordo, mese</option>
            <option value="custom">Personalizzato…</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize:'0.75rem', color:'var(--text-secondary)', fontFamily:'var(--font-mono)' }}>{t('Raggruppa per','Group by','Gruppieren nach')}</label>
          <select value={groupBy} onChange={e=>setGroupBy(e.target.value)} style={{ width:'100%', marginTop:'0.25rem', background:'rgba(15,15,25,0.8)', border:'1px solid var(--border-glass)', borderRadius:'10px', padding:'0.55rem 0.7rem', color:'var(--text-primary)', fontSize:'0.85rem' }}>
            <option value="month">{t('Mese (YYYY-MM)','Month (YYYY-MM)','Monat (YYYY-MM)')}</option>
            <option value="categoria">{t('Categoria','Category','Kategorie')}</option>
            <option value="fornitore">{t('Fornitore','Vendor','Lieferant')}</option>
            <option value="none">{t('Nessun raggruppamento','No grouping','Keine Gruppierung')}</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize:'0.75rem', color:'var(--text-secondary)', fontFamily:'var(--font-mono)' }}>{t('Tipo grafico','Chart type','Diagrammtyp')}</label>
          <select value={chartType} onChange={e=>setChartType(e.target.value)} style={{ width:'100%', marginTop:'0.25rem', background:'rgba(15,15,25,0.8)', border:'1px solid var(--border-glass)', borderRadius:'10px', padding:'0.55rem 0.7rem', color:'var(--text-primary)', fontSize:'0.85rem' }}>
            <option value="bar">Barre</option>
            <option value="line">Linee</option>
            <option value="pie">Torta</option>
            <option value="table">Tabella</option>
          </select>
        </div>
      </div>

      {preset==='custom' && (
        <div style={{ background:'var(--bg-glass)', border:'1px solid var(--border-glass)', borderRadius:'12px', padding:'0.9rem 1rem', display:'flex', flexDirection:'column', gap:'0.6rem' }}>
          <input value={customFields} onChange={e=>setCustomFields(e.target.value)} placeholder="campi separati da virgola, es: data, importo, fornitore" style={{ background:'rgba(15,15,25,0.8)', border:'1px solid var(--border-glass)', borderRadius:'8px', padding:'0.5rem 0.7rem', color:'var(--text-primary)', fontSize:'0.85rem' }} />
          <textarea value={customPrompt} onChange={e=>setCustomPrompt(e.target.value)} placeholder={t('Prompt LLM opzionale — lascia vuoto per auto','Optional LLM prompt — leave empty for auto','Optionaler LLM-Prompt — leer lassen für Auto')} rows={2} style={{ background:'rgba(15,15,25,0.8)', border:'1px solid var(--border-glass)', borderRadius:'8px', padding:'0.5rem 0.7rem', color:'var(--text-primary)', fontSize:'0.82rem', resize:'vertical' }} />
          <span style={{ fontSize:'0.7rem', color:'var(--text-secondary)' }}>{t('Esempio: Estrai data, importo e descrizione in JSON.','Example: Extract date, amount and description as JSON.','Beispiel: Extrahiere Datum, Betrag und Beschreibung als JSON.')}</span>
        </div>
      )}

      <button onClick={handleGenerate} disabled={loading} style={{ padding:'0.85rem', background: loading?'rgba(74,158,255,0.1)':'var(--accent-gradient)', color: loading?'var(--text-secondary)':'white', border:'none', borderRadius:'12px', fontWeight:600, cursor: loading?'not-allowed':'pointer', opacity: loading?0.6:1 }}>
        {loading ? '⏳ ' + t('Estrazione in corso…','Extracting…','Extrahiere…') : '📊 ' + t('Genera Grafico','Generate Chart','Diagramm erstellen')}
      </button>

      {/* Results */}
      {result && (
        <div style={{ animation:'fadeInUp 0.4s ease-out' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.75rem', flexWrap:'wrap', gap:'0.5rem' }}>
            <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.8rem', color:'var(--text-secondary)' }}>
              Totale: <strong style={{ color:'var(--text-primary)' }}>{result.total?.toLocaleString('it-IT')}€</strong> su {result.count} righe • {result.chart_data.length} gruppi ({result.group_by})
            </span>
            <button onClick={()=>{ navigator.clipboard.writeText(JSON.stringify(result.chart_data,null,2)); showToast?.('Copiato JSON','success'); }} style={{ fontSize:'0.75rem', background:'var(--bg-glass)', border:'1px solid var(--border-glass)', color:'var(--text-secondary)', borderRadius:'8px', padding:'0.25rem 0.6rem', cursor:'pointer' }}>📋 JSON</button>
          </div>

          {chartType==='bar' && <BarChart data={result.chart_data} />}
          {chartType==='line' && <LineChart data={result.chart_data} />}
          {chartType==='pie' && <PieChart data={result.chart_data} />}
          {chartType==='table' && (
            <div style={{ background:'rgba(15,15,25,0.5)', border:'1px solid var(--border-glass)', borderRadius:'12px', overflow:'hidden' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.82rem' }}>
                <thead><tr style={{ background:'rgba(255,255,255,0.04)', textAlign:'left' }}><th style={{ padding:'0.6rem 0.8rem', color:'var(--text-secondary)' }}>{groupBy}</th><th style={{ padding:'0.6rem 0.8rem', color:'var(--text-secondary)', textAlign:'right' }}>Importo</th><th style={{ padding:'0.6rem 0.8rem', color:'var(--text-secondary)', textAlign:'center' }}>#</th></tr></thead>
                <tbody>{result.chart_data.map((r,i)=><tr key={i} style={{ borderTop:'1px solid var(--border-glass)' }}><td style={{ padding:'0.5rem 0.8rem', color:'var(--text-primary)' }}>{r.label}</td><td style={{ padding:'0.5rem 0.8rem', color:'var(--accent-green)', textAlign:'right', fontWeight:600 }}>{r.value.toLocaleString('it-IT')}€</td><td style={{ padding:'0.5rem 0.8rem', textAlign:'center', color:'var(--text-secondary)' }}>{r.count}</td></tr>)}</tbody>
              </table>
            </div>
          )}

          {/* raw rows preview */}
          <details style={{ marginTop:'0.75rem' }}>
            <summary style={{ cursor:'pointer', color:'var(--text-secondary)', fontSize:'0.8rem', fontFamily:'var(--font-mono)' }}>Mostra righe estratte ({result.rows?.length})</summary>
            <pre style={{ marginTop:'0.5rem', background:'rgba(15,15,25,0.8)', border:'1px solid var(--border-glass)', borderRadius:'10px', padding:'0.8rem', fontSize:'0.75rem', color:'var(--text-secondary)', maxHeight:'200px', overflow:'auto', whiteSpace:'pre-wrap' }}>{JSON.stringify(result.rows.slice(0,10), null, 2)}</pre>
          </details>
        </div>
      )}
    </div>
  );
}
