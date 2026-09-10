"""Auto-tagging per documenti — keyword trilingue (EN/IT/DE) → tag sempre in inglese.

Scoring: ogni keyword contribuisce con le sue occorrenze (cap 5);
hit nel filename vale +3. Brevi (<=5 char) solo su parola intera
per evitare falsi positivi ('iva' in 'generativa'). Si tengono i tag
con score >= 2 (top 3); se nessuno raggiunge la soglia → ['general'].
"""
import re
from pathlib import Path
from typing import List

# Tag EN → keyword EN/IT/DE (lowercase).
TAG_KEYWORDS = {
    # --- amministrativi ---
    "invoice": [
        "fattura", "invoice", "rechnung", "quittung", "receipt",
        "importo", "totale", "betrag", "iva", "vat", "mwst", "netto", "brutto",
    ],
    "payslip": [
        "stipendio", "busta paga", "payslip", "remuneration", "entgelt",
        "gehalt", "lohn", "salary", "verdienst", "pay statement", "lohnabrechnung",
    ],
    "contract": [
        "contratto", "contratti", "vertrag", "vertrags", "agreement",
        "auftrag", "cancellation",
    ],
    "insurance": [
        "versicherung", "assicurazione", "insurance", "haftpflicht",
        "polizza", "policy",
    ],
    "utilities": [
        "bolletta", "utenze", "utilities", "bill", "vattenfall",
        "strom", "gas", "wasser", "stromrechnung",
    ],
    "identity": [
        "identità", "identita", "identity", "ausweis", "passport",
        "personalausweis", "cie", "id card",
    ],
    "medical": [
        "medico", "doctor", "arzt", "krankenhaus", "hospital", "paziente",
        "patient", "terapia", "therapy", "diagnosi", "diagnosis", "ricetta",
        "rezept", "ospedale",
    ],
    "legal": [
        "avvocato", "legal", "lawyer", "anwalt", "gericht", "court",
        "tribunale", "widerspruch", "legge",
    ],
    "form": [
        "antrag", "formular", "modulo", "module", "form",
        "antragstellung", "anmeldung",
    ],
    "finance": [
        "fatturazione", "contabilità", "accounting", "bilancio", "budget",
        "tasse", "fisco", "commercialista", "interscambio", "scadenza",
    ],
    # --- temi ---
    "ai": [
        "intelligenza artificiale", "artificial intelligence", "llm",
        "language model", "modello linguistico", "machine learning",
        "embedding", "retrieval", "chatbot", "neural", "neurale",
        "allucinazioni", "prompt",
    ],
    "cloud": [
        "cloud", "hidrive", "nextcloud", "webdav", "storage", "sync",
        "sincronizzazione", "datacenter", "data center",
    ],
    "energy": [
        "fotovoltaico", "solar", "solare", "pannelli", "inverter",
        "batteria", "batterie", "accumulo", "kilowatt", "rinnovabile",
        "renewable", "pompa di calore", "incentivi",
    ],
    "cooking": [
        "cucina", "ricette", "recipe", "speck", "canederli", "strudel",
        "ingredienti", "forno", "impasto", "cuoco", "ristorante",
    ],
    "travel": [
        "dolomiti", "trekking", "hiking", "rifugio", "montagna", "mountain",
        "escursione", "sentiero", "ferrata", "unesco", "viaggio", "turismo",
        "alpi", "vita naturalistica",
    ],
    "security": [
        "cybersecurity", "sicurezza informatica", "phishing", "ransomware",
        "password", "firewall", "malware", "hacker", "vulnerab",
        "antivirus", "backup", "crittografia", "encryption",
    ],
    "history": [
        "storia", "history", "impero", "empire", "roma", "rome", "antico",
        "ancient", "secolo", "century", "medioevo", "repubblica",
    ],
    "devops": [
        "docker", "container", "kubernetes", "self-hosting", "homelab",
        "compose", "linux", "server", "infrastruttura", "deployment",
    ],
    "health": [
        "sonno", "sleep", "salute", "health", "benessere", "wellness",
        "stress", "melatonina", "insonnia", "insomnia",
    ],
    "photo": [
        ".png", ".jpg", ".jpeg", ".webp", ".tiff", ".bmp",
    ],
}

# Tag prioritari per UI (ordinati)
TAG_PRIORITY = [
    "invoice", "payslip", "contract", "insurance", "utilities",
    "identity", "medical", "legal", "form", "finance",
    "ai", "cloud", "energy", "cooking", "travel",
    "security", "history", "devops", "health", "photo", "general",
]

MIN_SCORE = 2
MAX_TAGS = 3


def _kw_count(kw: str, text: str) -> int:
    """Occorrenze di kw in text (parola intera se corta)."""
    if len(kw) <= 5:
        return len(re.findall(r"\b" + re.escape(kw) + r"\b", text))
    return text.count(kw)


def infer_tags(filename: str, text_snippet: str = "", max_tags: int = MAX_TAGS) -> List[str]:
    """
    Ritorna tag inglesi basati su filename + snippet, con scoring a frequenza.
    Se nessun tag raggiunge la soglia → ['general'] (mai 'altro').
    """
    haystack = f"{filename} {text_snippet}".lower()
    fname = filename.lower()
    ext = Path(filename).suffix.lower()
    scores = {}
    for tag, keywords in TAG_KEYWORDS.items():
        # photo solo su estensione
        if tag == "photo":
            if ext in keywords:
                scores[tag] = 10
            continue
        total = 0
        for kw in keywords:
            c = _kw_count(kw, haystack)
            if c:
                total += min(c, 5)
                if _kw_count(kw, fname):
                    total += 3
        if total >= MIN_SCORE:
            scores[tag] = total

    if not scores:
        return ["general"]

    # ordina per score desc, poi priorità
    ranked = sorted(
        scores.keys(),
        key=lambda t: (-scores[t], TAG_PRIORITY.index(t) if t in TAG_PRIORITY else 99),
    )
    return ranked[:max_tags]


def auto_tag_document(filename: str, file_path: str = None) -> List[str]:
    """
    Wrapper che legge snippet dal file e ritorna tag + li salva nel DB.
    Chiamato automaticamente dopo upload/scan.
    """
    from app.utils.document_processor import process_document
    from app.utils.database import add_tag, get_document_tags

    # evita di ritaggare se già ha tag (tranne "general")
    existing = []
    try:
        existing = get_document_tags(filename)
        if existing and "general" not in existing:
            # già taggato bene, non ritaggare
            return existing
    except:
        pass

    snippet = ""
    if file_path:
        try:
            # leggi solo primi 3000 char per velocità
            text = process_document(file_path)
            snippet = text[:3000] if text else ""
        except:
            pass
    else:
        # prova a recuperare dal DB path
        try:
            from app.utils.database import get_document
            doc = get_document(filename)
            if doc and doc.get("file_path"):
                text = process_document(doc["file_path"])
                snippet = text[:3000] if text else ""
        except:
            pass

    tags = infer_tags(filename, snippet)
    for tag in tags:
        try:
            add_tag(filename, tag)
        except:
            pass
    return tags
