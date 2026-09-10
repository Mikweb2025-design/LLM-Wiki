import React, { useState } from 'react';
import { login } from '../utils/auth';

export default function Login({ onOk, lang = 'it' }) {
  const [user, setUser] = useState('');
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const STR = {
    it: { sub: 'Knowledge Base privata', title: 'Bentornato', desc: 'Accedi per continuare nella tua wiki intelligente.', u: 'Nome utente', p: 'Password', btn: 'Accedi', wait: 'Accesso…', bad: 'Credenziali non valide', hint: 'Area riservata Mikweb' },
    en: { sub: 'Private Knowledge Base', title: 'Welcome back', desc: 'Sign in to continue to your smart wiki.', u: 'Username', p: 'Password', btn: 'Sign in', wait: 'Signing in…', bad: 'Invalid credentials', hint: 'Mikweb private area' },
    de: { sub: 'Private Wissensdatenbank', title: 'Willkommen zurück', desc: 'Melde dich an, um fortzufahren.', u: 'Benutzername', p: 'Passwort', btn: 'Anmelden', wait: 'Anmeldung…', bad: 'Ungültige Zugangsdaten', hint: 'Mikweb Privatbereich' },
  }[lang] || {};

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setErr('');
    setBusy(true);
    try {
      await login(user.trim(), pw);
      onOk && onOk();
    } catch (ex) {
      setErr(ex.message || STR.bad);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem', background: 'var(--bg-dark)', position: 'relative', overflow: 'hidden' }}>
      {/* orbs */}
      <div style={{ position: 'fixed', top: '-15%', left: '-8%', width: '480px', height: '480px', background: 'radial-gradient(circle, rgba(255,108,0,0.16) 0%, transparent 70%)', borderRadius: '50%', filter: 'blur(60px)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', bottom: '-18%', right: '-8%', width: '560px', height: '560px', background: 'radial-gradient(circle, rgba(37,99,235,0.10) 0%, transparent 70%)', borderRadius: '50%', filter: 'blur(70px)', pointerEvents: 'none' }} />

      <div className="glass-card" style={{ width: '100%', maxWidth: '400px', padding: '2.5rem 2.25rem 2rem', position: 'relative', zIndex: 1, animation: 'fadeInUp 0.5s cubic-bezier(0.16,1,0.3,1)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '1.6rem' }}>
          <div style={{ width: '64px', height: '64px', background: 'var(--accent-gradient)', borderRadius: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--glow-purple)', animation: 'glowPulse 3s ease-in-out infinite', marginBottom: '1rem' }}>
            <svg viewBox="0 0 24 24" width="34" height="34"><path fill="#ffffff" d="M7 19a4 4 0 0 1-.6-7.95A5.5 5.5 0 0 1 17 8.6 4.25 4.25 0 0 1 17.5 19H7z" /></svg>
          </div>
          <div style={{ fontSize: '0.72rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 500 }}>{STR.sub}</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.9rem', fontWeight: 700, margin: '0.3rem 0 0.2rem', background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>LLM Wiki</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}><b style={{ color: 'var(--text-primary)' }}>{STR.title}.</b> {STR.desc}</p>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            {STR.u}
            <input value={user} onChange={(e) => setUser(e.target.value)} autoComplete="username" autoFocus placeholder="Mikweb"
              style={{ padding: '0.7rem 0.9rem', borderRadius: '12px', border: '1px solid var(--border-glass)', fontSize: '0.95rem', outline: 'none', background: '#fbfaf8', color: 'var(--text-primary)' }}
              onFocus={(e) => e.target.style.borderColor = '#ff6c00'} onBlur={(e) => e.target.style.borderColor = 'var(--border-glass)'} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            {STR.p}
            <div style={{ position: 'relative' }}>
              <input value={pw} onChange={(e) => setPw(e.target.value)} type={show ? 'text' : 'password'} autoComplete="current-password" placeholder="••••••••"
                style={{ width: '100%', padding: '0.7rem 2.8rem 0.7rem 0.9rem', borderRadius: '12px', border: '1px solid var(--border-glass)', fontSize: '0.95rem', outline: 'none', background: '#fbfaf8', color: 'var(--text-primary)' }}
                onFocus={(e) => e.target.style.borderColor = '#ff6c00'} onBlur={(e) => e.target.style.borderColor = 'var(--border-glass)'} />
              <button type="button" onClick={() => setShow(!show)} style={{ position: 'absolute', right: '0.6rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.05rem', opacity: 0.6 }} title={show ? 'Nascondi' : 'Mostra'}>{show ? '🙈' : '👁️'}</button>
            </div>
          </label>

          {err && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '0.82rem', borderRadius: '10px', padding: '0.6rem 0.8rem', animation: 'fadeInUp 0.3s' }}>⚠️ {err}</div>}

          <button type="submit" disabled={busy || !user.trim() || !pw} className="btn-glow"
            style={{ marginTop: '0.3rem', padding: '0.8rem', borderRadius: '12px', border: 'none', cursor: busy ? 'wait' : 'pointer', fontSize: '0.95rem', fontWeight: 700, color: '#fff', background: busy ? '#c9c9c9' : 'var(--accent-gradient)', boxShadow: busy ? 'none' : 'var(--glow-purple)', opacity: (!user.trim() || !pw) && !busy ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            {busy && <span style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.4)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />}
            {busy ? STR.wait : STR.btn + '  →'}
          </button>
        </form>

        <div style={{ marginTop: '1.4rem', textAlign: 'center', fontSize: '0.72rem', color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>🔒 {STR.hint} &middot; LLM Wiki &copy; 2026</div>
      </div>
    </div>
  );
}
