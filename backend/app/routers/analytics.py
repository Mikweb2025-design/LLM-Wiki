"""Analytics — estrazione dati strutturati + aggregazioni per grafici fatture/spese.

Configurabile dall'utente: sceglie template (fatture/spese/custom) e campi da estrarre.
Per Excel/CSV: parsing diretto colonne.
Per PDF/DOCX/immagini: LLM extraction (JSON) con fallback regex.
"""
import re
import json
import time
import threading
from typing import List, Dict, Optional
from pathlib import Path
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

# Cache per estrazione LLM — evita di richiamare LLM per stesso file/preset (TTL 1h)
_EXTRACT_CACHE: Dict[str, tuple] = {}  # key -> (ts, result)
_EXTRACT_LOCK = threading.Lock()
_EXTRACT_TTL = 3600.0

def _cache_key(file_path: str, preset: str) -> str:
    try:
        import os
        mtime = os.path.getmtime(file_path)
        return f"{file_path}:{preset}:{mtime}"
    except:
        return f"{file_path}:{preset}"

def _cache_get(key: str):
    with _EXTRACT_LOCK:
        hit = _EXTRACT_CACHE.get(key)
        if hit and (time.monotonic() - hit[0]) < _EXTRACT_TTL:
            return hit[1]
    return None

def _cache_set(key: str, value):
    with _EXTRACT_LOCK:
        if len(_EXTRACT_CACHE) > 200:
            # evict oldest
            oldest = min(_EXTRACT_CACHE, key=lambda k: _EXTRACT_CACHE[k][0])
            _EXTRACT_CACHE.pop(oldest, None)
        _EXTRACT_CACHE[key] = (time.monotonic(), value)

# Preset configurabili — l'utente li sceglie nel frontend
PRESETS = {
    "fatture": {
        "label": "Fatture",
        "fields": ["data", "importo", "fornitore", "numero_fattura"],
        "prompt": "Estrai da questo documento fattura: data (YYYY-MM-DD), importo totale (numero con virgola), fornitore, numero fattura. Rispondi SOLO con JSON {\"data\":\"...\",\"importo\":123.45,\"fornitore\":\"...\",\"numero_fattura\":\"...\"} — se campo manca usa null.",
    },
    "spese": {
        "label": "Spese",
        "fields": ["data", "importo", "categoria", "descrizione"],
        "prompt": "Estrai da questo documento spesa/scontrino: data (YYYY-MM-DD), importo (numero), categoria (es. cibo, trasporti, utenze, affitto), descrizione breve. JSON {\"data\":\"...\",\"importo\":123.45,\"categoria\":\"...\",\"descrizione\":\"...\"}",
    },
    "stipendi": {
        "label": "Stipendi / Buste paga",
        "fields": ["data", "importo_netto", "importo_lordo", "mese"],
        "prompt": "Estrai da busta paga: data (YYYY-MM-DD), importo netto, importo lordo, mese di riferimento. JSON {\"data\":\"...\",\"importo_netto\":123.45,\"importo_lordo\":123.45,\"mese\":\"...\"}",
    },
    "custom": {
        "label": "Personalizzato",
        "fields": [],
        "prompt": None,  # costruito dinamicamente
    },
}

AMOUNT_RE = re.compile(r'(\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})|\d+\.\d{2}|\d+,\d{2})\s*(?:€|EUR)?', re.I)
DATE_RE = re.compile(r'(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}-\d{2}-\d{2})')


def _regex_fallback(text: str) -> Dict:
    """Fallback veloce senza LLM: cerca importo + data con regex."""
    # importo: cerca il più grande importo con € o con virgola
    amounts = []
    for m in AMOUNT_RE.finditer(text):
        raw = m.group(1).replace('.', '').replace(' ', '').replace(',', '.')
        try:
            v = float(raw)
            if 0.5 < v < 1_000_000:
                amounts.append(v)
        except: pass
    importo = max(amounts) if amounts else None

    m = DATE_RE.search(text)
    data = m.group(1) if m else None
    # normalizza data in YYYY-MM-DD se possibile (fix precedence bug: prima era `data and '/' in data or '.' in data` → crash su None)
    if data and ('/' in data or '.' in data or '-' in data):
        try:
            parts = re.split(r'[./-]', data)
            if len(parts) == 3:
                if len(parts[2]) == 2: parts[2] = '20' + parts[2]
                # assume DD/MM/YYYY se anno in fondo, altrimenti YYYY-MM-DD
                if len(parts[0]) == 4:  # YYYY-MM-DD già ok
                    data = f"{parts[0]}-{parts[1].zfill(2)}-{parts[2].zfill(2)}"
                else:
                    data = f"{parts[2]}-{parts[1].zfill(2)}-{parts[0].zfill(2)}"
        except: pass

    return {"data": data, "importo": importo, "categoria": None, "descrizione": None, "fornitore": None}


def _llm_extract(text: str, prompt: str) -> Optional[Dict]:
    """Chiama LLM per estrazione JSON. Ritorna dict o None. Timeout 40s, JSON robusto."""
    try:
        from app.utils.llm_handler import chat_with_llm
        # Usa snippet più grande ma con limite per non saturare prompt
        snippet = text[:5000]
        # Prompt più esplicito per JSON pulito
        full_prompt = prompt + " Rispondi SOLO con un oggetto JSON valido, senza testo extra."
        raw = chat_with_llm(full_prompt, [{"content": snippet, "metadata": {"filename": "doc"}}])
        if not raw or raw.startswith("Errore"):
            return None
        # estrai JSON dal testo (LLM a volte aggiunge spiegazioni/markdown)
        # prova blocco ```json
        m = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', raw, re.DOTALL)
        if m:
            j = json.loads(m.group(1))
        else:
            m = re.search(r'\{.*\}', raw, re.DOTALL)
            if not m:
                return None
            j = json.loads(m.group(0))
        # normalizza importo: gestisce "1.234,56 €" / "1234.56"
        for k in list(j.keys()):
            if 'importo' in k and isinstance(j[k], str):
                v = j[k].replace('€', '').replace('EUR', '').strip()
                # rimuovi separatore migliaia
                if ',' in v and '.' in v:
                    # 1.234,56 → 1234.56
                    v = v.replace('.', '').replace(',', '.')
                elif ',' in v:
                    v = v.replace(',', '.')
                try:
                    j[k] = float(v)
                except: pass
        return j
    except Exception as e:
        print(f"[WARN] LLM extract failed: {e}")
        return None


def _extract_excel_rows(file_path: str) -> List[Dict]:
    """Per Excel/CSV: ritorna righe come dict (header → value)."""
    ext = Path(file_path).suffix.lower()
    try:
        if ext == '.csv':
            import csv
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                sample = f.read(4096); f.seek(0)
                try:
                    dialect = csv.Sniffer().sniff(sample, delimiters=[',', ';', '\t', '|'])
                except: dialect = csv.excel
                reader = csv.DictReader(f, dialect=dialect)
                return [dict(r) for _, r in zip(range(200), reader) if any(r.values())]
        else:
            import openpyxl
            wb = openpyxl.load_workbook(file_path, data_only=True, read_only=True)
            ws = wb.active
            rows = list(ws.iter_rows(values_only=True))
            if not rows: return []
            headers = [str(c).strip() if c else f"col{i}" for i, c in enumerate(rows[0])]
            out = []
            for r in rows[1:]:
                if not any(c is not None and str(c).strip() for c in r): continue
                out.append({headers[i]: r[i] for i in range(min(len(headers), len(r)))})
                if len(out) >= 200: break
            try: wb.close()
            except: pass
            return out
    except Exception as e:
        print(f"[WARN] excel extract: {e}")
    return []


@router.get("/presets")
async def list_presets():
    """Lista template disponibili."""
    return {"presets": {k: {"label": v["label"], "fields": v["fields"]} for k, v in PRESETS.items()}}


@router.post("/extract")
async def extract_data(payload: dict):
    """
    Body: {
      filenames: ["a.pdf", "b.xlsx"],
      preset: "fatture" | "spese" | "custom",
      custom_fields: ["data","importo","fornitore"]  // solo se preset=custom
      custom_prompt: "..." // opzionale
      use_llm: true/false (default true)
    }
    Ritorna: [{filename, extracted: {...}|[...], source: "llm"|"regex"|"excel"}]
    """
    from app.utils.document_processor import process_document
    from app.utils.database import get_document

    filenames: List[str] = payload.get("filenames") or []
    preset_key: str = payload.get("preset", "fatture")
    custom_fields: List[str] = payload.get("custom_fields") or []
    custom_prompt: Optional[str] = payload.get("custom_prompt")
    use_llm: bool = payload.get("use_llm", True)

    if not filenames:
        raise HTTPException(status_code=400, detail="Nessun file specificato")
    if preset_key not in PRESETS:
        raise HTTPException(status_code=400, detail=f"Preset sconosciuto: {preset_key}")

    preset = PRESETS[preset_key]
    # costruisci prompt
    if preset_key == "custom":
        fields = custom_fields or ["data", "importo", "descrizione"]
        if custom_prompt:
            prompt = custom_prompt
        else:
            prompt = f"Estrai questi campi in JSON: {', '.join(fields)}. Rispondi SOLO con JSON con chiavi {fields}. Se campo manca usa null."
    else:
        prompt = preset["prompt"]
        fields = preset["fields"]

    # Excel/CSV veloci → gestiti subito sequenziali
    results = []
    pdf_jobs = []  # (fname, fpath)

    for fname in filenames:
        doc = get_document(fname)
        if not doc:
            results.append({"filename": fname, "error": "Documento non trovato", "extracted": None})
            continue
        fpath = doc["file_path"]
        ext = Path(fpath).suffix.lower()
        if ext in (".xlsx", ".xls", ".csv"):
            rows = _extract_excel_rows(fpath)
            if rows and preset_key in ("fatture", "spese"):
                mapped = []
                for r in rows:
                    low = {str(k).lower(): v for k, v in r.items()}
                    imp = None
                    for k in ["importo", "betrag", "amount", "totale", "summe", "netto", "lordo", "total"]:
                        if k in low:
                            try: imp = float(str(low[k]).replace(',', '.').replace('€',''))
                            except: pass
                            if imp is not None: break
                    dat = low.get("data") or low.get("datum") or low.get("date")
                    mapped.append({"data": str(dat) if dat else None, "importo": imp, "_raw": r})
                results.append({"filename": fname, "extracted": mapped[:50], "source": "excel", "fields": fields})
            else:
                results.append({"filename": fname, "extracted": rows[:50], "source": "excel", "fields": list(rows[0].keys()) if rows else []})
        else:
            # PDF/DOCX/IMG → cache hit veloce, altrimenti job parallelo
            cache_key = _cache_key(fpath, preset_key)
            cached = _cache_get(cache_key) if use_llm else None
            if cached is not None:
                results.append({"filename": fname, "extracted": cached["extracted"], "source": cached["source"] + "+cache", "fields": fields})
            else:
                pdf_jobs.append((fname, fpath, cache_key))

    # Esegui LLM extraction in parallelo (4 worker) — da 30s a ~8s per 12 file
    if pdf_jobs:
        import asyncio
        import concurrent.futures

        def _process_one(args):
            fname, fpath, cache_key = args
            try:
                text = process_document(fpath)
            except Exception as e:
                return {"filename": fname, "error": str(e), "extracted": None, "source": "error", "fields": fields}
            if not text or not text.strip():
                return {"filename": fname, "error": "Testo non estraibile", "extracted": None, "source": "error", "fields": fields}
            # Fast-path: prova regex prima (0.1ms vs 3s LLM) — se trova importo+data validi, salta LLM
            regex_try = _regex_fallback(text)
            fast_ok = regex_try.get("importo") is not None and regex_try.get("data") is not None
            # per preset stipendi, regex non ha importo_lordo, quindi non considerarlo fast_ok se preset è stipendi
            if preset_key == "stipendi" and fast_ok:
                # regex per stipendi produce solo importo generico, non lordo/netto — serve LLM
                fast_ok = False
            if fast_ok:
                extracted = regex_try
                source = "regex-fast"
            else:
                extracted = None
                source = "regex"
                if use_llm:
                    extracted = _llm_extract(text, prompt)
                    if extracted is not None:
                        source = "llm"
                if extracted is None:
                    extracted = regex_try
                    source = "regex"
            try:
                _cache_set(cache_key, {"extracted": extracted, "source": source})
            except: pass
            return {"filename": fname, "extracted": extracted, "source": source, "fields": fields}

        # max 4 paralleli per non saturare IONOS rate-limit
        loop = asyncio.get_event_loop()
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
            futures = [loop.run_in_executor(executor, _process_one, job) for job in pdf_jobs]
            pdf_results = await asyncio.gather(*futures)
            results.extend(pdf_results)

    return {"results": results, "preset": preset_key, "fields": fields if 'fields' in locals() else preset["fields"]}


@router.post("/aggregate")
async def aggregate_data(payload: dict):
    """
    Aggrega risultati di /extract in dati pronti per grafici.

    Body: {
      filenames: [...],
      preset: "fatture",
      group_by: "month" | "categoria" | "fornitore" | "none",
      sum_field: "importo" (default),
      custom_fields: [...] // se preset=custom
    }
    """
    # riusa extract
    payload["use_llm"] = payload.get("use_llm", True)
    data = await extract_data(payload)
    results = data["results"]
    group_by = payload.get("group_by", "month")
    sum_field = payload.get("sum_field", "importo")

    # raccogli righe flat
    rows = []
    for r in results:
        extd = r.get("extracted")
        if extd is None: continue
        if isinstance(extd, list):
            # excel rows
            for row in extd:
                rows.append(row)
        elif isinstance(extd, dict):
            rows.append({"filename": r["filename"], **extd})

    if not rows:
        return {"chart_data": [], "rows": [], "group_by": group_by, "total": 0}

    # normalizza importi — fallback intelligente se sum_field mancante o zero (es. stipendi → importo_lordo/netto)
    for row in rows:
        v = row.get(sum_field)
        # se 0/None prova alternative con valore >0
        if v is None or (isinstance(v, (int,float)) and v == 0):
            for alt in ["importo_lordo", "importo_netto", "importo", "betrag", "total", "amount"]:
                av = row.get(alt)
                if av is not None and not (isinstance(av, (int,float)) and av == 0):
                    # se stringa, prova a parsare prima di decidere
                    if isinstance(av, str):
                        tmp = av.replace('€','').replace('EUR','').strip()
                        if ',' in tmp and '.' in tmp:
                            tmp = tmp.replace('.','').replace(',','.')
                        elif ',' in tmp:
                            tmp = tmp.replace(',','.')
                        try:
                            if float(tmp) != 0:
                                v = av
                                sum_field = alt
                                break
                        except: continue
                    else:
                        v = av
                        sum_field = alt
                        break
                elif av is not None and isinstance(av, str) and av.strip():
                    v = av
                    sum_field = alt
                    break
        if isinstance(v, str):
            vv = v.replace('€', '').replace('EUR', '').strip()
            if ',' in vv and '.' in vv:
                vv = vv.replace('.', '').replace(',', '.')
            elif ',' in vv:
                vv = vv.replace(',', '.')
            try: row[sum_field] = float(vv)
            except: row[sum_field] = 0
        elif v is None:
            row[sum_field] = 0
        else:
            try: row[sum_field] = float(v)
            except: row[sum_field] = 0

    # aggregazione
    from collections import defaultdict
    agg = defaultdict(float)
    count = defaultdict(int)

    for row in rows:
        key = "Totale"
        if group_by == "month":
            d = row.get("data") or ""
            # estrai YYYY-MM
            m = re.search(r'(\d{4}-\d{2})', str(d))
            if m: key = m.group(1)
            else:
                # prova DD/MM/YYYY
                m2 = re.search(r'(\d{1,2})[./-](\d{1,2})[./-](\d{4})', str(d))
                if m2:
                    key = f"{m2.group(3)}-{m2.group(2).zfill(2)}"
                else:
                    key = str(d)[:7] if d else "Senza data"
        elif group_by == "categoria":
            key = str(row.get("categoria") or row.get("category") or "Altro")
        elif group_by == "fornitore":
            key = str(row.get("fornitore") or row.get("vendor") or row.get("supplier") or "Sconosciuto")
        elif group_by == "none":
            # ogni riga è un punto
            key = row.get("filename", "")[:20] + f" #{len(agg)+1}"

        agg[key] += float(row.get(sum_field, 0) or 0)
        count[key] += 1

    chart_data = [{"label": k, "value": round(v, 2), "count": count[k]} for k, v in sorted(agg.items())]
    total = round(sum(agg.values()), 2)

    return {
        "chart_data": chart_data,
        "rows": rows[:100],
        "group_by": group_by,
        "sum_field": sum_field,
        "total": total,
        "count": len(rows),
    }
