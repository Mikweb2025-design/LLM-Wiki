import axios from 'axios';

export const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

export const chatApi = {
  sendMessage: (message, history = [], model = null, lang = 'it') =>
    api.post('/api/chat/', { message, history, model, lang }),
  // streaming via fetch + SSE — lang is forwarded to backend for AI language
  // supports both old call (message,history,model,onToken,onDone) and new (message,history,model,lang,onToken,onDone)
  sendMessageStream: async (message, history = [], model = null, langOrToken, onTokenOrDone, onDoneMaybe) => {
    let lang = 'it', onToken, onDone;
    if (typeof langOrToken === 'function') { lang='it'; onToken=langOrToken; onDone=onTokenOrDone; }
    else if (typeof onTokenOrDone === 'function' && typeof onDoneMaybe === 'function') { lang=langOrToken||'it'; onToken=onTokenOrDone; onDone=onDoneMaybe; }
    else if (typeof langOrToken === 'string') { lang=langOrToken||'it'; onToken=onTokenOrDone; onDone=onDoneMaybe; }
    else { lang='it'; onToken=langOrToken; onDone=onTokenOrDone; }
    const res = await fetch(`${API_URL}/api/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history, model, lang }),
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
  scanHidrive: (path, max_files = 100) => api.post('/api/documents/scan-hidrive', { path, max_files }),
  scanStatus: () => api.get('/api/documents/scan-status'),
  count: () => api.get('/api/documents/count'),
  reindex: (filename) => api.post(`/api/documents/reindex/${encodeURIComponent(filename)}`),
  reindexAll: () => api.post('/api/documents/reindex-all'),
  preview: (filename) => api.get(`/api/documents/content/${encodeURIComponent(filename)}`),
  content: (filename) => api.get(`/api/documents/content/${encodeURIComponent(filename)}`),
  search: (query) => api.get('/api/documents/search', { params: { q: query } }),
  insights: (refresh = false, lang = 'it') => {
    const p = new URLSearchParams();
    if (refresh) p.set('refresh','1');
    if (lang) p.set('lang', lang);
    const qs = p.toString();
    return api.get(`/api/documents/insights${qs ? '?'+qs : ''}`);
  },
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

export const webdavApi = {
  listSources: () => api.get('/api/webdav/sources'),
  test: (url, username, password) => api.post('/api/webdav/test', { url, username, password }),
  connect: (url, username, password, name, remote_path) => api.post('/api/webdav/connect', { url, username, password, name, remote_path }),
  listFolders: (source_id, path = '/') => api.get('/api/webdav/folders', { params: { source_id, path } }),
  addFolder: (source_id, remote_path, name) => api.post('/api/webdav/add-folder', { source_id, remote_path, name }),
  deleteSource: (source_id) => api.delete(`/api/webdav/sources/${source_id}`),
  sync: (source_id, max_files = 100) => api.post('/api/webdav/sync', { source_id, max_files }),
  syncAll: (max_files = 100) => api.post('/api/webdav/sync', { all: true, max_files }),
  files: (source_id) => api.get('/api/webdav/files', { params: { source_id } }),
};

export const hidriveApi = {
  status: () => api.get('/api/documents/hidrive/status'),
  authUrl: (redirect_uri) => api.get('/api/documents/hidrive/auth-url', { params: { redirect_uri } }),
  exchange: (code, redirect_uri) => api.post('/api/documents/hidrive/exchange', { code, redirect_uri }),
  // stile Nextcloud: login + picker + cartelle + sync
  connect: (code, redirect_uri) => api.post('/api/hidrive/connect', { code, redirect_uri }),
  loginUrl: () => api.get('/api/hidrive/login-url'),
  browse: (path = '/') => api.get('/api/hidrive/browse', { params: { path } }),
  listFolders: () => api.get('/api/hidrive/folders'),
  addFolder: (remote_path, name) => api.post('/api/hidrive/folders', { remote_path, name }),
  deleteFolder: (folder_id) => api.delete(`/api/hidrive/folders/${folder_id}`),
  sync: (folder_id, max_files = 100) => api.post('/api/hidrive/sync', { folder_id, max_files }),
  syncAll: (max_files = 100) => api.post('/api/hidrive/sync', { all: true, max_files }),
  files: (folder_id) => api.get('/api/hidrive/files', { params: { folder_id } }),
};

export default api;