"""Auto-tagging intelligente per documenti — keyword + euristica estensione."""
import re
from pathlib import Path
from typing import List

# Mappa tag → parole chiave (lowercase). Se una parola è nel filename o nei primi 3000 char, assegna tag.
TAG_KEYWORDS = {
    "fattura": [
        "fattura", "invoice", "rechnung", "quittung", "beleg", "receipt",
        "importo", "totale", "betrag", "iva", "vat", "mwst", "netto", "brutto",
        "remuneration", "entgelt", "payroll",
    ],
    "stipendio": [
        "stipendio", "busta paga", "busta", "payslip", "remuneration", "entgelt",
        "gehalt", "lohn", "salary", "verdien", "pay statement", "lohnabrechnung",
    ],
    "contratto": [
        "contratto", "vertrag", "agreement", "auftrag", "auftragsbestätigung",
        "kündigung", "cancellation", "widerruf", "muster", "schreiben",
    ],
    "assicurazione": [
        "versicherung", "assicurazione", "insurance", "kfz", "haftpflicht",
        "polizza", "policy", "kdg", "kdg+v",
    ],
    "bolletta": [
        "bolletta", "rechnung", "vattenfall", "strom", "gas", "wasser", "stromrechnung",
        "utenze", "utilities", "bill",
    ],
    "identità": [
        "carta d'identità", "identità", "ausweis", "passport", "id", "personalausweis",
        "identita", "documento identità", "cie",
    ],
    "medico": [
        "sterbeurkunde", "kindkrank", "arzt", "medico", "salute", "health", "krank",
        "bescheinigung", "attest", "ricetta", "rezept", "logopäd",
    ],
    "legale": [
        "widerruf", "widerspruch", "kündigung", "avvocato", "legal", "anwalt", "gericht",
        "musterschreiben",
    ],
    "modulo": [
        "antrag", "formular", "modulo", "antragstellung", "anmeldung",
    ],
    "foto": [
        ".png", ".jpg", ".jpeg", ".webp", ".tiff", ".bmp",
    ],
}

# Tag prioritari per UI (ordinati)
TAG_PRIORITY = ["fattura", "stipendio", "contratto", "assicurazione", "bolletta", "medico", "identità", "legale", "modulo", "foto", "altro"]


def infer_tags(filename: str, text_snippet: str = "", max_tags: int = 3) -> List[str]:
    """
    Ritorna lista di tag (max_tags) basata su filename + snippet.
    Usa keyword matching case-insensitive. Se nessun match → ["altro"].
    """
    haystack = f"{filename} {text_snippet}".lower()
    # normalizza estensione per tag foto
    ext = Path(filename).suffix.lower()
    scores = {}
    for tag, keywords in TAG_KEYWORDS.items():
        # foto tag solo su estensione
        if tag == "foto":
            if ext in keywords:
                scores[tag] = 10
            continue
        count = 0
        for kw in keywords:
            # per keyword multi-parola usa substring semplice
            if kw in haystack:
                # peso maggiore se nel filename
                if kw in filename.lower():
                    count += 2
                else:
                    count += 1
        if count > 0:
            scores[tag] = count

    if not scores:
        return ["altro"]

    # ordina per score desc, poi priorità
    sorted_tags = sorted(scores.keys(), key=lambda t: (-scores[t], TAG_PRIORITY.index(t) if t in TAG_PRIORITY else 99))
    # se più tag con stesso score alto, prendi top 2-3
    result = sorted_tags[:max_tags]
    # se "fattura" e "stipendio" entrambi → preferisci stipendio se filename contiene remuneration/entgelt
    if "fattura" in result and "stipendio" in result:
        low = filename.lower()
        if any(k in low for k in ["remuneration", "entgelt", "stipendio", "gehalt", "lohn"]):
            # mantieni stipendio, rimuovi fattura se troppi
            if len(result) > 2 and result[0] == "fattura":
                result.remove("fattura")
    return result


def auto_tag_document(filename: str, file_path: str = None) -> List[str]:
    """
    Wrapper che legge snippet dal file e ritorna tag + li salva nel DB.
    Chiamato automaticamente dopo upload/scan.
    """
    from app.utils.document_processor import process_document
    from app.utils.database import add_tag, get_document_tags

    # evita di ritaggare se già ha tag (tranne "altro")
    existing = []
    try:
        existing = get_document_tags(filename)
        if existing and "altro" not in existing:
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
