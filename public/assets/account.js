/* NekoRBX — /cuenta: perfil, historial de pedidos y soporte. */
(() => {
  'use strict';
  const { auth, api, esc, cop, date, errText } = window.Neko;
  const I = window.NekoI18n;
  const t = I.t;
  const $ = (id) => document.getElementById(id);

  if (!auth.session) { location.replace('/acceso/?next=' + encodeURIComponent('/cuenta/' + location.hash)); return; }

  let me = null;
  let orders = [];
  const details = new Map(); // id -> detalle cargado
  const open = new Set();
  let whatsapp = '573247359023';

  function toast(m) {
    const el = $('toast'); el.textContent = m; el.hidden = false; el.classList.add('is-on');
    clearTimeout(toast.t); toast.t = setTimeout(() => { el.classList.remove('is-on'); setTimeout(() => { el.hidden = true; }, 300); }, 2000);
  }

  function paintProfile() {
    $('accEmail').textContent = me.email;
    $('accSince').textContent = new Date(me.createdAt).toLocaleDateString(I.lang === 'en' ? 'en-US' : 'es-CO', { dateStyle: 'long' });
    if (document.activeElement !== $('accName')) $('accName').value = me.name;
  }

  const itemText = (i) => `${i.quantity}x ${i.productName}${i.durationDays ? ` (${t('card.days', { n: i.durationDays })})` : ''}`;

  function orderHtml(o) {
    const d = details.get(o.id);
    const isOpen = open.has(o.id);
    const canPay = o.status === 'pending_payment';
    const canCancel = ['pending_payment', 'in_review'].includes(o.status);
    return `<li class="order" data-id="${esc(o.id)}">
      <div class="order__top">
        <button type="button" class="order__id" data-copy="${esc(o.id)}" title="${esc(t('cart.copy'))}">${esc(o.id)} <svg><use href="#i-copy" /></svg></button>
        <span class="status-pill" data-status="${esc(o.status)}">${esc(t('status.' + o.status))}</span>
      </div>
      <p class="order__meta">${esc(date(o.createdAt))} · ${esc(o.items.map(itemText).join(', '))}</p>
      <div class="order__top" style="margin-top:8px">
        <span class="order__total">${cop(o.totalCop)}${o.discountCop ? ` <span class="muted mono" style="font-size:.75rem;font-weight:500">(−${cop(o.discountCop)} ${esc(o.discountCode || '')})</span>` : ''}</span>
        <button type="button" class="link" data-toggle="${esc(o.id)}">${esc(isOpen ? t('acc.hide') : t('acc.details'))}</button>
      </div>
      ${isOpen ? `<div class="order__detail">${d ? detailHtml(d, canPay, canCancel) : esc(t('acc.loading'))}</div>` : ''}
    </li>`;
  }

  function detailHtml(d, canPay, canCancel) {
    return `<ul>${d.items.map((i) => `<li>${esc(itemText(i))} — ${cop(i.lineTotalCop)}</li>`).join('')}</ul>
      <dl class="kv">
        <dt>${esc(t('cart.subtotal'))}</dt><dd>${cop(d.subtotalCop)}</dd>
        <dt>${esc(t('cart.discount'))}</dt><dd>${d.discountCop ? `− ${cop(d.discountCop)} (${esc(d.discountCode || '')})` : cop(0)}</dd>
        <dt>${esc(t('cart.total'))}</dt><dd><strong>${cop(d.totalCop)}</strong></dd>
      </dl>
      <p class="mono muted" style="font-size:.75rem;margin:14px 0 4px">${esc(t('acc.history'))}</p>
      <ol class="timeline">${d.history.map((h) => `<li>${esc(date(h.createdAt))} · <strong>${esc(t('status.' + h.toStatus))}</strong></li>`).join('')}</ol>
      <div class="order__actions">
        ${canPay ? `<a class="btn btn--pill btn--whatsapp" href="${esc(d.whatsappUrl)}" target="_blank" rel="noopener"><svg><use href="#i-whatsapp" /></svg> ${esc(t('cart.whatsapp'))}</a>` : ''}
        ${canPay ? `<button type="button" class="btn btn--pill btn--border" data-report="${esc(d.id)}">${esc(t('acc.reportPay'))}</button>` : ''}
        ${canCancel ? `<button type="button" class="btn btn--pill btn--ghost" data-cancel="${esc(d.id)}">${esc(t('acc.cancel'))}</button>` : ''}
      </div>
      <form class="report-form" data-report-form="${esc(d.id)}" hidden style="margin-top:12px">
        <label class="field"><span>${esc(t('acc.reference'))}</span><input class="input" name="reference" required minlength="3" maxlength="120" /></label>
        <button class="btn btn--pill btn--primary" type="submit">${esc(t('acc.send'))}</button>
      </form>
      <p class="form-error" data-err="${esc(d.id)}" hidden></p>`;
  }

  function paintOrders() {
    const q = $('orderSearch').value.trim().toUpperCase();
    const list = q ? orders.filter((o) => o.id.includes(q)) : orders;
    $('orders').innerHTML = list.map(orderHtml).join('');
    $('noOrders').hidden = orders.length > 0;
  }

  async function loadDetail(id) {
    try {
      const { order } = await api(`/api/orders/${encodeURIComponent(id)}`, { auth: 'required' });
      details.set(id, order);
      const o = orders.find((x) => x.id === id);
      if (o) o.status = order.status;
    } catch (e) {
      toast(errText(e));
      open.delete(id);
    }
    paintOrders();
  }

  $('orders').addEventListener('click', async (e) => {
    const copy = e.target.closest('[data-copy]');
    const tog = e.target.closest('[data-toggle]');
    const cancel = e.target.closest('[data-cancel]');
    const report = e.target.closest('[data-report]');
    if (copy) {
      try { await navigator.clipboard.writeText(copy.dataset.copy); toast(t('cart.copied')); } catch { /* */ }
    } else if (tog) {
      const id = tog.dataset.toggle;
      if (open.has(id)) open.delete(id); else { open.add(id); if (!details.has(id)) loadDetail(id); }
      paintOrders();
    } else if (cancel) {
      if (!confirm(t('acc.cancelConfirm'))) return;
      cancel.disabled = true;
      try {
        const { order } = await api(`/api/orders/${encodeURIComponent(cancel.dataset.cancel)}/cancel`, { method: 'POST', body: {}, auth: 'required' });
        details.set(order.id, order);
        orders.find((o) => o.id === order.id).status = order.status;
        paintOrders();
      } catch (err) { toast(errText(err)); cancel.disabled = false; }
    } else if (report) {
      const f = document.querySelector(`[data-report-form="${report.dataset.report}"]`);
      f.hidden = !f.hidden;
      if (!f.hidden) f.reference.focus();
    }
  });
  $('orders').addEventListener('submit', async (e) => {
    const f = e.target.closest('[data-report-form]');
    if (!f) return;
    e.preventDefault();
    const id = f.dataset.reportForm;
    const err = document.querySelector(`[data-err="${id}"]`);
    try {
      const { order } = await api(`/api/orders/${encodeURIComponent(id)}/payment-report`, { method: 'POST', body: { reference: f.reference.value.trim() }, auth: 'required' });
      details.set(id, order);
      orders.find((o) => o.id === id).status = order.status;
      paintOrders();
    } catch (ex) { err.hidden = false; err.textContent = errText(ex); }
  });
  $('orderSearch').addEventListener('input', paintOrders);

  $('nameForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('accName').value.trim();
    $('nameError').hidden = true; $('nameOk').hidden = true;
    if (name.length < 2 || name.length > 40) { $('nameError').hidden = false; $('nameError').textContent = t('err.name'); return; }
    try {
      const r = await api('/api/me', { method: 'PUT', body: { name }, auth: 'required' });
      me = r.user;
      auth.update({ data: { full_name: name } }).catch(() => {});
      $('nameOk').hidden = false; $('nameOk').textContent = t('acc.saved');
      paintProfile();
    } catch (ex) { $('nameError').hidden = false; $('nameError').textContent = errText(ex); }
  });

  $('logoutBtn').addEventListener('click', async () => { await auth.logout(); location.replace('/'); });

  async function init() {
    try {
      const [meRes, ordRes, cat] = await Promise.all([
        api('/api/me', { auth: 'required' }),
        api('/api/orders', { auth: 'required' }),
        fetch('/api/catalog').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      me = meRes.user;
      orders = ordRes.orders;
      if (cat?.settings?.whatsappNumber) whatsapp = cat.settings.whatsappNumber;
      $('supportLink').href = `https://wa.me/${whatsapp}?text=${encodeURIComponent('Hola, NekoRBX. Necesito ayuda con mi pedido.')}`;
      $('adminLink').hidden = !meRes.isAdmin;
      $('accLoading').hidden = true;
      $('account').hidden = false;
      paintProfile();
      paintOrders();
      if (location.hash === '#pedidos') $('pedidos').scrollIntoView({ behavior: 'smooth' });
    } catch (e) {
      if (e.code === 'unauthorized' && !auth.session) { location.replace('/acceso/?next=%2Fcuenta%2F'); return; }
      $('accLoading').textContent = errText(e);
    }
  }

  I.onChange(() => { if (me) { paintProfile(); paintOrders(); } });
  init();
})();
