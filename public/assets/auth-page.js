/* NekoRBX — página /acceso: registro, inicio de sesión, recuperación y enlaces del correo. */
(() => {
  'use strict';
  const { auth, errText } = window.Neko;
  const I = window.NekoI18n;
  const t = I.t;
  const $ = (id) => document.getElementById(id);
  const errEl = $('authError');
  const okEl = $('authOk');
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const PASS = (p) => p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p);

  const params = new URLSearchParams(location.search);
  // Solo rutas internas como destino (evita redirecciones abiertas).
  const nextRaw = params.get('next') || '/cuenta/';
  const next = /^\/(?!\/)[\w\-./#%?=&]*$/.test(nextRaw) ? nextRaw : '/cuenta/';

  let view = 'login';
  let pendingToken = null; // recovery / invite

  const TITLES = { login: ['auth.loginTitle', 'auth.loginSub'], register: ['auth.registerTitle', 'auth.registerSub'], recover: ['auth.recoverTitle', 'auth.recoverSub'], reset: ['auth.resetTitle', 'auth.resetSub'] };

  function show(v) {
    view = v;
    document.querySelectorAll('form[data-view]').forEach((f) => { f.hidden = f.dataset.view !== v; });
    $('authTitle').dataset.i18n = TITLES[v][0];
    $('authLead').dataset.i18n = TITLES[v][1];
    $('authTitle').textContent = t(TITLES[v][0]);
    $('authLead').textContent = t(TITLES[v][1]);
    document.querySelector('[data-go="register"]').hidden = v === 'register' || v === 'reset';
    document.querySelector('[data-go="login"]').hidden = v === 'login';
    document.querySelector('[data-go="recover"]').hidden = v !== 'login';
    msg();
    const first = document.querySelector(`form[data-view="${v}"] input`);
    if (first) setTimeout(() => first.focus(), 30);
  }
  function msg(error, ok) {
    errEl.hidden = !error; errEl.textContent = error || '';
    okEl.hidden = !ok; okEl.textContent = ok || '';
  }
  const busy = (form, on) => form.querySelectorAll('button, input').forEach((el) => { el.disabled = on; });

  document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => show(b.dataset.go)));

  $('f-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    const email = f.email.value.trim().toLowerCase();
    const password = f.password.value;
    if (!email || !password) return msg(t('err.required'));
    if (!EMAIL.test(email)) return msg(t('err.email'));
    busy(f, true);
    try {
      await auth.login(email, password);
      location.replace(next);
    } catch (err) {
      msg(errText(err));
    } finally { busy(f, false); }
  });

  $('f-register').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    const name = f.name.value.trim();
    const email = f.email.value.trim().toLowerCase();
    const p1 = f.password.value;
    if (!name || !email || !p1) return msg(t('err.required'));
    if (name.length < 2 || name.length > 40) return msg(t('err.name'));
    if (!EMAIL.test(email)) return msg(t('err.email'));
    if (!PASS(p1)) return msg(t('err.password'));
    if (p1 !== f.password2.value) return msg(t('err.password2'));
    busy(f, true);
    try {
      const r = await auth.signup(name, email, p1);
      if (r.confirmed) return location.replace(next);
      f.reset();
      show('login');
      msg('', t('auth.checkEmail'));
    } catch (err) {
      msg(errText(err));
    } finally { busy(f, false); }
  });

  $('f-recover').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    const email = f.email.value.trim().toLowerCase();
    if (!EMAIL.test(email)) return msg(t('err.email'));
    busy(f, true);
    try { await auth.recover(email); } catch (err) { if (err.code === 'network' || err.code === 'rate_limited') { busy(f, false); return msg(errText(err)); } }
    // Mismo mensaje exista o no la cuenta (no revela correos registrados).
    busy(f, false);
    msg('', t('auth.recoverSent'));
  });

  $('f-reset').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    const p1 = f.password.value;
    if (!PASS(p1)) return msg(t('err.password'));
    if (p1 !== f.password2.value) return msg(t('err.password2'));
    busy(f, true);
    try {
      if (pendingToken?.type === 'invite') await auth.verify('signup', pendingToken.token, p1);
      else await auth.update({ password: p1 });
      msg('', t('auth.resetDone'));
      setTimeout(() => location.replace(next), 900);
    } catch (err) {
      msg(errText(err));
    } finally { busy(f, false); }
  });

  /* ---------- Enlaces recibidos por correo ---------- */
  async function handleHash() {
    const h = new URLSearchParams(location.hash.slice(1));
    history.replaceState(null, '', location.pathname + location.search);
    try {
      if (h.get('confirmation_token')) {
        await auth.verify('signup', h.get('confirmation_token'));
        msg('', t('auth.verified'));
        setTimeout(() => location.replace(next), 900);
      } else if (h.get('recovery_token')) {
        await auth.verify('recovery', h.get('recovery_token'));
        pendingToken = { type: 'recovery' };
        show('reset');
      } else if (h.get('invite_token')) {
        pendingToken = { type: 'invite', token: h.get('invite_token') };
        show('reset');
      } else if (h.get('email_change_token')) {
        await auth.update({ email_change_token: h.get('email_change_token') });
        msg('', t('acc.saved'));
      } else if (h.get('error')) {
        msg(t('err.token'));
      }
    } catch (err) {
      msg(err.code === 'network' ? errText(err) : t('err.token'));
    }
  }

  I.onChange(() => show(view));
  if (params.get('view') === 'register') show('register');
  if (location.hash.length > 1) handleHash();
  else if (auth.session && !params.get('view')) location.replace(next);
})();
