import axios from 'axios';

export const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

export const chatApi = {
  sendMessage: (message, history = [], model = null) =>
    api.post('/api/chat/', { message, history, model }),
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
  list: () => api.get('/api/documents/'),
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
  activity: (limit = 20) => api.get('/api/documents/activity', { params: { limit } }),
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