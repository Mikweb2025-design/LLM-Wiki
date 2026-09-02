import axios from 'axios';

export const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

export const chatApi = {
  sendMessage: (message, history = [], model = null) =>
    api.post('/api/chat/', { message, history, model }),
  // streaming via fetch + SSE
  sendMessageStream: async (message, history = [], model = null, onToken, onDone) => {
    const res = await fetch(`${API_URL}/api/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history, model }),
    });
    if (!res.ok) throw new Error(`Stream failed ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        try {
          const data = JSON.parse(line.slice(5).trim());
          if (data.token) onToken?.(data.token);
          if (data.done) onDone?.(data);
        } catch {}
      }
    }
  },
  getHistory: () => api.get('/api/chat/history'),
  getModels: () => api.get('/api/chat/models'),
};

export const documentsApi = {
  upload: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/api/documents/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  list: (params = {}) => api.get('/api/documents/', { params }),
  listPaginated: (limit = 50, offset = 0) => api.get('/api/documents/paginated', { params: { limit, offset } }),
  delete: (filename) => api.delete(`/api/documents/${encodeURIComponent(filename)}`),
  batchDelete: (filenames) => api.delete('/api/documents/batch', { data: { filenames } }),
  batchReindex: (filenames) => api.post('/api/documents/batch-reindex', { filenames }),
  scan: () => api.post('/api/documents/scan'),
  scanCustom: (directory) => api.post('/api/documents/scan-custom', { directory }),
  scanStatus: () => api.get('/api/documents/scan-status'),
  count: () => api.get('/api/documents/count'),
  reindex: (filename) => api.post(`/api/documents/reindex/${encodeURIComponent(filename)}`),
  reindexAll: () => api.post('/api/documents/reindex-all'),
  preview: (filename) => api.get(`/api/documents/content/${encodeURIComponent(filename)}`),
  content: (filename) => api.get(`/api/documents/content/${encodeURIComponent(filename)}`),
  search: (query) => api.get('/api/documents/search', { params: { q: query } }),
  insights: (refresh = false) => api.get(`/api/documents/insights${refresh ? '?refresh=1' : ''}`),
  summary: (filename) => api.get(`/api/documents/summary/${encodeURIComponent(filename)}`),
  stats: () => api.get('/api/documents/stats'),
  similar: (filename) => api.get(`/api/documents/similar/${encodeURIComponent(filename)}`),
  related: (filename) => api.get(`/api/documents/${encodeURIComponent(filename)}/related`),
  activity: (limit = 20) => api.get('/api/documents/activity', { params: { limit } }),
  // tags / favorites
  getTags: () => api.get('/api/documents/tags'),
  getDocsByTag: (tag) => api.get(`/api/documents/tags/${encodeURIComponent(tag)}`),
  getDocTags: (filename) => api.get(`/api/documents/${encodeURIComponent(filename)}/tags`),
  addTag: (filename, tag) => api.post(`/api/documents/${encodeURIComponent(filename)}/tags`, { tag }),
  removeTag: (filename, tag) => api.delete(`/api/documents/${encodeURIComponent(filename)}/tags/${encodeURIComponent(tag)}`),
  getFavorites: () => api.get('/api/documents/favorites/list'),
  toggleFavorite: (filename) => api.post(`/api/documents/${encodeURIComponent(filename)}/favorite`),
};

export const statusApi = {
  get: () => api.get('/api/status/'),
};

export const healthApi = {
  basic: () => api.get('/health'),
  full: () => api.get('/health/full'),
  metrics: () => api.get('/metrics'),
  refresh: () => api.post('/api/status/refresh'),
};

export const voiceApi = {
  transcribe: (audioBlob, ext = 'webm') => {
    const formData = new FormData();
    formData.append('file', audioBlob, `audio.${ext}`);
    return api.post('/api/voice/transcribe', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

export default api;