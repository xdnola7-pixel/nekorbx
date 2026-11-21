/* NekoRBX — sesión (Netlify Identity vía API REST), llamadas a la API y utilidades. JS puro, sin dependencias. */
(() => {
  'use strict';
  const ID = '/.netlify/identity';
  const SKEY = 'nekorbx.session';
  const I = () => window.NekoI18n;

  /* ---------- Utilidades ---------- */
  const fmt = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const cop = (n) => `$ ${fmt(n)} COP`;
  const usd = (n) => (Number(n) || 0).toFixed(2).replace('.', ',');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const date = (d) => new Date(d).toLocaleString(I()?.lang === 'en' ? 'en-US' : 'es-CO', { dateStyle: 'medium', timeStyle: 'short' });
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12));

  class ApiError extends Error {
    constructor(code, status, meta = {}) { super(code); this.code = code; this.status = status; this.meta = meta; }
  }
  const errText = (e) => {
    const code = e?.code || 'server_error';
    const key = `err.${code}`;
    const txt = I().t(key, e?.meta?.retryAfter ? { s: e.meta.retryAfter } : undefined);
    return txt === key ? I().t('err.server_error') : txt;
  };

  /* ---------- Sesión ---------- */
  let session = null;
  try { session = JSON.parse(localStorage.getItem(SKEY) || 'null'); } catch { session = null; }
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => { try { fn(session); } catch (e) { console.error(e); } });

  function save(tok, user) {
    session = tok ? {
      access_token: tok.access_token,
      refresh_token: tok.refresh_token,
      expires_at: Date.now() + (Number(tok.expires_in) || 3600) * 1000,
      user: user ?? session?.user ?? null,
    } : null;
    try { session ? localStorage.setItem(SKEY, JSON.stringify(session)) : localStorage.removeItem(SKEY); } catch { /* */ }
    emit();
  }

  async function idFetch(path, opts = {}) {
    let res;
    try { res = await fetch(ID + path, opts); } catch { throw new ApiError('network', 0); }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = String(body.error_description || body.msg || body.error || '').toLowerCase();
      let code = 'server_error';
      if (msg.includes('not confirmed')) code = 'not_confirmed';
      else if (body.error === 'invalid_grant' || msg.includes('password invalid') || msg.includes('no user found')) code = 'invalid_grant';
      else if (msg.includes('already') && msg.includes('registered')) code = 'exists';
      else if (res.status === 429) code = 'rate_limited';
      else if (res.status === 404 || msg.includes('token')) code = 'token';
      throw new ApiError(code, res.status);
    }
    return body;
  }

  const tokenRequest = (params) => idFetch('/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });

  let refreshing = null;
  async function accessToken() {
    if (!session) return null;
    if (session.expires_at - Date.now() > 60_000) return session.access_token;
    if (!refreshing) {
      refreshing = tokenRequest({ grant_type: 'refresh_token', refresh_token: session.refresh_token })
        .then((tok) => { save(tok); return tok.access_token; })
        .catch((e) => { if (e.status === 400 || e.status === 401 || e.status === 404) save(null); return session?.access_token ?? null; })
        .finally(() => { refreshing = null; });
    }
    return refreshing;
  }

  async function loadUser() {
    const tk = await accessToken();
    if (!tk) return null;
    const u = await idFetch('/user', { headers: { Authorization: `Bearer ${tk}` } });
    session.user = { id: u.id, email: u.email, name: u.user_metadata?.full_name || '', created_at: u.created_at };
    try { localStorage.setItem(SKEY, JSON.stringify(session)); } catch { /* */ }
    emit();
    return session.user;
  }

  // Bloqueo local tras varios intentos fallidos (además de los límites del propio Identity).
  const LOCK = 'nekorbx.loginFails';
  const lockState = () => { try { return JSON.parse(localStorage.getItem(LOCK) || '{"n":0,"t":0}'); } catch { return { n: 0, t: 0 }; } };
  const lockedFor = () => { const s = lockState(); return s.n >= 5 ? Math.max(0, Math.ceil((s.t + 60_000 - Date.now()) / 1000)) : 0; };

  const auth = {
    get session() { return session; },
    get user() { return session?.user ?? null; },
    onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    accessToken,
    loadUser,
    async login(email, password) {
      const wait = lockedFor();
      if (wait > 0) throw new ApiError('locked', 429, { retryAfter: wait });
      try {
        const tok = await tokenRequest({ grant_type: 'password', username: email, password });
        localStorage.removeItem(LOCK);
        save(tok, null);
        await loadUser();
        return session.user;
      } catch (e) {
        if (e.code === 'invalid_grant') {
          const s = lockState();
          const n = s.n >= 5 ? 1 : s.n + 1;
          localStorage.setItem(LOCK, JSON.stringify({ n, t: Date.now() }));
        }
        throw e;
      }
    },
    async signup(name, email, password) {
      const u = await idFetch('/signup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, data: { full_name: name } }),
      });
      // Con autoconfirmación activada se inicia sesión directamente.
      if (u.confirmed_at) { await auth.login(email, password); return { confirmed: true }; }
      return { confirmed: false };
    },
    recover: (email) => idFetch('/recover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }),
    async verify(type, token, password) {
      const tok = await idFetch('/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(password ? { type, token, password } : { type, token }),
      });
      save(tok, null);
      await loadUser();
      return session.user;
    },
    async update(attrs) {
      const tk = await accessToken();
      if (!tk) throw new ApiError('unauthorized', 401);
      await idFetch('/user', { method: 'PUT', headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' }, body: JSON.stringify(attrs) });
      return loadUser();
    },
    async logout() {
      const tk = session?.access_token;
      save(null);
      if (tk) fetch(ID + '/logout', { method: 'POST', headers: { Authorization: `Bearer ${tk}` } }).catch(() => {});
    },
  };

  /* ---------- API propia ---------- */
  async function api(path, opts = {}) {
    const { method = 'GET', body, auth: needAuth = true, form } = opts;
    const headers = {};
    const tk = await accessToken();
    if (tk) headers.Authorization = `Bearer ${tk}`;
    else if (needAuth === 'required') throw new ApiError('unauthorized', 401);
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let res;
    try {
      res = await fetch(path, { method, headers, body: form ?? (body !== undefined ? JSON.stringify(body) : undefined) });
    } catch { throw new ApiError('network', 0); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && tk && !opts._retried) {
        session.expires_at = 0;
        const fresh = await accessToken();
        if (fresh) return api(path, { ...opts, _retried: true });
      }
      const { error, ...meta } = data || {};
      throw new ApiError(error || 'server_error', res.status, meta);
    }
    return data;
  }

  /* ---------- Enlaces de correo (#confirmation_token, #recovery_token, ...) ---------- */
  const hash = location.hash;
  if (/^#(confirmation_token|recovery_token|invite_token|email_change_token|error)=/.test(hash) && !location.pathname.startsWith('/acceso')) {
    location.replace('/acceso/' + hash);
  }

  /* ---------- Controles compartidos de la barra (idioma y cuenta) ---------- */
  function bindNav() {
    document.querySelectorAll('[data-lang-toggle]').forEach((b) => b.addEventListener('click', () => I().toggle()));
    const paint = () => {
      document.querySelectorAll('[data-account-btn]').forEach((a) => {
        const u = auth.user;
        a.href = u ? '/cuenta/' : `/acceso/?next=${encodeURIComponent(location.pathname + location.hash)}`;
        const label = a.querySelector('[data-account-label]');
        if (label) label.textContent = u ? (u.name || u.email.split('@')[0]).slice(0, 16) : I().t('nav.login');
        a.setAttribute('aria-label', u ? I().t('nav.account') : I().t('nav.login'));
        a.classList.toggle('is-auth', Boolean(u));
      });
      document.querySelectorAll('[data-order-btn]').forEach((a) => {
        a.href = auth.user ? '/cuenta/#pedidos' : '/acceso/?next=%2Fcuenta%2F%23pedidos';
      });
    };
    paint();
    auth.onChange(paint);
    I().onChange(paint);
    if (session && !session.user) loadUser().catch(() => {});
  }

  window.Neko = { auth, api, ApiError, errText, fmt, cop, usd, esc, date, uuid, bindNav };
  document.addEventListener('DOMContentLoaded', () => { I().apply(); bindNav(); });
})();
