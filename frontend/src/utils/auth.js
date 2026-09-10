import { API_URL } from './api';

const KEY = 'llmwiki_token';

export const getToken = () => {
  try { return localStorage.getItem(KEY) || ''; } catch { return ''; }
};
export const setToken = (t) => { try { localStorage.setItem(KEY, t); } catch {} };
export const clearToken = () => { try { localStorage.removeItem(KEY); } catch {} };
export const authHeaders = () => {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
};

export async function login(username, password) {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    let msg = 'Credenziali non valide';
    try { const j = await res.json(); if (j.detail) msg = j.detail; } catch {}
    throw new Error(msg);
  }
  const data = await res.json();
  if (data.token) setToken(data.token);
  return data;
}

export async function checkMe() {
  const t = getToken();
  if (!t) return null;
  const res = await fetch(`${API_URL}/api/auth/me`, { headers: authHeaders() });
  if (!res.ok) { clearToken(); return null; }
  try { return await res.json(); } catch { return null; }
}

export function logout() {
  clearToken();
  try { window.location.reload(); } catch {}
}
