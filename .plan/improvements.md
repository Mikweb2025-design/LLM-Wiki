# Piano di Miglioramenti - LLM Wiki

## Problemi Trovati

### 1. BUG: AI Insights Dashboard non funziona
**Root cause**: L'endpoint `/api/documents/insights` chiama `search_documents("*", n_results=50)` — il wildcard `*` non funziona bene con la ricerca semantica (embeddings), quindi non torna risultati. Se poi IONOS e Ollama non sono disponibili, l'endpoint fallisce silenziosamente.

**Fix**:
- `backend/app/routers/documents.py`: Cambiare la query da `"*"` a una query reale basata sui nomi dei documenti indicizzati, oppure usare una ricerca vuota che estragga chunk casuali
- `backend/app/routers/documents.py`: Aggiungere fallback gracefully quando l'LLM non e' disponibile per insights
- `frontend/src/components/Dashboard.jsx`: Mostrare stato di caricamento e messaggio di errore chiaro quando insights non disponibili

### 2. BUG: chat.py models endpoint
**Root cause**: `backend/app/routers/chat.py:59` — `check_ionos_connection()` viene ritornato come `ollama_connected`, dovrebbe essere `check_ollama_connection()`

### 3. PERFORMANCE: Database senza connection pooling
**Root cause**: `database.py` apre/chiude una nuova connessione SQLite per ogni operazione.

**Fix**: Usare context manager con connessione riutilizzabile o connection pool.

### 4. PERFORMANCE: DocumentList carica tutti i documenti senza paginazione
**Fix**: Aggiungere paginazione lato server (`/api/documents/` con `offset` e `limit`)

### 5. PERFORMANCE: Molti file .bak in backend/app/utils/
**Fix**: Pulizia di 13 file `.bak` inutili

### 6. PERFORMANCE: Dashboard carica insights anche senza documenti
**Fix**: Skip insights call quando `total_documents === 0`

---

## Miglioramenti Sensati da Aggiungere

### 1. Document Stats API (word count, chunk info)
- Endpoint `/api/documents/stats` che ritorna anche conteggio parole totale e media per documento
- Dashboard mostra statistiche piu' ricche

### 2. Activity Timeline nella Dashboard
- Tracciare le ultime operazioni (upload, delete, scan, chat) nel database
- Mostrare una timeline nella Dashboard con le attivita' recenti

### 3. Batch Operations per Documenti
- Selezione multipla documenti nella DocumentList
- Eliminazione multipla con checkbox
- Reindicizzazione multipla selettiva

### 4. Document Similarity Finder
- Nuovo endpoint `/api/documents/similar/{filename}` che trova documenti simili
- Utile per trovare documenti duplicati o correlati

### 5. Search History con Timestamp
- salvare le ricerche effettuate con timestamp
- Mostrare recent searches nella SearchWithFilters

### 6. Export/Import Knowledge Base
- Endpoint per esportare la configurazione e i metadati dei documenti
- Endpoint per importare backup

---

## File da Modificare

### Backend
- `backend/app/routers/documents.py` — Fix insights + stats arricchite + similarity + activity
- `backend/app/routers/chat.py` — Fix ollama_connected bug
- `backend/app/utils/database.py` — Connection pooling + activity table + search_history table
- `backend/app/utils/vector_store.py` — Migliorare ricerca per insights
- `backend/app/models/schemas.py` — Aggiungere modelli per nuovi endpoint

### Frontend
- `frontend/src/components/Dashboard.jsx` — Fix insights + activity timeline + stats migliorate
- `frontend/src/components/DocumentList.jsx` — Batch operations + paginazione
- `frontend/src/components/SearchWithFilters.jsx` — Recent searches

### Cleanup
- Eliminare tutti i file `.bak` in `backend/app/utils/`

---

## Ordine di Esecuzione

1. Fix bug critici (insights, chat models)
2. Pulizia file .bak
3. Database improvements (connection pooling + tabelle nuove)
4. Backend: Activity tracking + enriched stats
5. Frontend: Dashboard improvements (activity timeline, insights fix)
6. Frontend: DocumentList batch operations
7. Search history feature
8. Test finale
