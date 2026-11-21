/* NekoRBX — panel /admin. Toda autorización se verifica en el servidor; esto solo es la interfaz. */
(() => {
  'use strict';
  const { auth, api, esc, cop, fmt, date } = window.Neko;
  const $ = (id) => document.getElementById(id);
  const view = $('view');
  const modal = $('modal');

  const STATUS = { pending_payment: 'Pendiente de pago', in_review: 'En revisión', payment_verified: 'Pago verificado', preparing: 'En preparación', delivered: 'Entregado', cancelled: 'Cancelado', refunded: 'Reembolsado' };
  const NEXT = { pending_payment: ['in_review', 'payment_verified', 'cancelled'], in_review: ['pending_payment', 'payment_verified', 'cancelled'], payment_verified: ['preparing', 'delivered', 'refunded'], preparing: ['delivered', 'refunded'], delivered: ['refunded'], cancelled: [], refunded: [] };
  const ICONS = { robux: 'Robux', stream: 'Streaming', ai: 'IA', sparkle: 'Destello', cart: 'Carrito', bolt: 'Rayo' };
  const ERR = {
    unauthorized: 'Tu sesión expiró. Vuelve a iniciar sesión.', forbidden: 'Esta cuenta no tiene permisos de administrador.', invalid_transition: 'Ese cambio de estado no está permitido.',
    conflict: 'Ya existe un registro con ese valor (código o slug repetido).', invalid_data: 'Datos inválidos.', invalid_slug: 'Slug inválido: minúsculas, números y guiones.', invalid_code_format: 'Código inválido: 3-32 caracteres A-Z, 0-9, _ o -.',
    percent_over_100: 'Un porcentaje no puede superar 100.', invalid_number: 'Revisa los números.', invalid_length: 'Revisa la longitud de los textos.', missing_field: 'Faltan campos obligatorios.', invalid_dates: 'La fecha final debe ser posterior a la inicial.',
    promo_requires_product: 'Un precio promocional necesita un producto.', image_too_large: 'La imagen supera 2 MB.', invalid_image_type: 'Formato no permitido (PNG, JPG, WEBP o GIF).', cannot_revoke_self: 'No puedes quitarte tu propio rol de administrador.',
    rate_limited: 'Demasiados intentos. Espera unos minutos.', invalid_code: 'Código incorrecto o vencido.', invalid_password: 'Correo o clave incorrectos.', email_not_configured: 'El envío de correos no está configurado (falta RESEND_API_KEY en Netlify).', network: 'Sin conexión con el servidor.', same_status: 'El pedido ya tiene ese estado.', invalid_rate: 'Tasa inválida.', invalid_whatsapp: 'Número de WhatsApp inválido.', invalid_email: 'Correo inválido.', invalid_percent: 'Porcentaje inválido (−90 a 500).',
  };
  const errMsg = (e) => ERR[e?.code] || `Error: ${e?.code || 'desconocido'}`;

  function toast(m) {
    const el = $('toast'); el.textContent = m; el.hidden = false; el.classList.add('is-on');
    clearTimeout(toast.t); toast.t = setTimeout(() => { el.classList.remove('is-on'); setTimeout(() => { el.hidden = true; }, 300); }, 2600);
  }
  const SK = 'nekorbx.adminSession';
  const getTok = () => { try { const v = JSON.parse(sessionStorage.getItem(SK) || 'null'); return v && v.exp > Date.now() ? v.token : null; } catch { return null; } };
  async function A(path, { method = 'GET', body, form } = {}) {
    const headers = {};
    const tk = getTok();
    if (tk) headers['X-Admin-Session'] = tk;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let res;
    try { res = await fetch('/api/admin' + path, { method, headers, body: form ?? (body !== undefined ? JSON.stringify(body) : undefined) }); }
    catch { throw Object.assign(new Error('network'), { code: 'network' }); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { if (res.status === 401) sessionStorage.removeItem(SK); const { error, ...meta } = data || {}; throw Object.assign(new Error(error), { code: error || 'server_error', status: res.status, meta }); }
    return data;
  }
  const authPost = (action, body, headers = {}) => fetch('/api/admin-auth/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })
    .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(d.error), { code: d.error || 'server_error' }); return d; });
  const pill = (s) => `<span class="status-pill" data-status="${esc(s)}">${esc(STATUS[s] || s)}</span>`;
  const toLocal = (d) => { if (!d) return ''; const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };
  const fromLocal = (v) => (v ? new Date(v).toISOString() : null);
  const dshort = (d) => (d ? new Date(d).toLocaleDateString('es-CO', { dateStyle: 'medium' }) : '—');
  const formData = (f) => Object.fromEntries(new FormData(f).entries());

  function openModal(title, html, onReady) {
    $('modalTitle').textContent = title;
    $('modalBody').innerHTML = html;
    if (!modal.open) modal.showModal();
    onReady && onReady($('modalBody'));
  }
  const closeModal = () => modal.open && modal.close();
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-close-modal]')) closeModal(); });

  /* ---------- Gráficas simples ---------- */
  function fillDays(series, days, key) {
    const map = new Map(series.map((s) => [s.d, s[key]]));
    const out = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const k = d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
      out.push({ d: k, v: map.get(k) || 0 });
    }
    return out;
  }
  function barChart(points, fmtV = fmt, label = '') {
    const W = 720, H = 220, P = { l: 8, r: 8, t: 14, b: 22 };
    const max = Math.max(1, ...points.map((p) => p.v));
    const bw = (W - P.l - P.r) / points.length;
    const step = Math.ceil(points.length / 8);
    const bars = points.map((p, i) => {
      const h = ((H - P.t - P.b) * p.v) / max;
      const x = P.l + i * bw;
      return `<rect class="bar" x="${x + bw * 0.15}" y="${H - P.b - h}" width="${Math.max(1, bw * 0.7)}" height="${Math.max(p.v ? 2 : 0, h)}" rx="2"><title>${esc(p.d)}: ${esc(fmtV(p.v))}</title></rect>
        ${i % step === 0 ? `<text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${esc(p.d.slice(5))}</text>` : ''}`;
    }).join('');
    const total = points.reduce((s, p) => s + p.v, 0);
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(label)}: total ${esc(fmtV(total))}">
      <line class="axis" x1="${P.l}" x2="${W - P.r}" y1="${H - P.b}" y2="${H - P.b}" />
      <text x="${P.l}" y="10">máx. ${esc(fmtV(max))}</text>${bars}</svg>`;
  }
  const hbars = (rows, fmtV = fmt) => {
    if (!rows.length) return '<p class="empty">Sin datos en este período.</p>';
    const max = Math.max(1, ...rows.map((r) => r.v));
    return `<div class="hbars">${rows.map((r) => `<div class="hbar"><span class="hbar__name" title="${esc(r.name)}">${esc(r.name)}</span><span class="hbar__track"><span class="hbar__fill" style="width:${(100 * r.v) / max}%"></span></span><span class="hbar__val">${esc(fmtV(r.v))}</span></div>`).join('')}</div>`;
  };

  /* ================= Secciones ================= */
  const S = {};
  let state = { days: 30, orderFilter: { status: '', q: '', page: 1 }, productCat: '', auditPage: 1 };
  let cache = { categories: [], products: [] };
  async function loadCatalog() {
    const [c, p] = await Promise.all([A('/categories'), A('/products')]);
    cache.categories = c.categories; cache.products = p.products;
  }
  const catName = (id) => cache.categories.find((c) => c.id === id)?.nameEs || '—';
  const prodName = (id) => cache.products.find((p) => p.id === id)?.nameEs || `#${id}`;

  /* ---------- Dashboard ---------- */
  S.dashboard = async () => {
    const d = await A(`/dashboard?days=${state.days}`);
    const tt = d.totals;
    view.innerHTML = `
      <div class="a-head"><div><h1><span class="bar"></span>Dashboard</h1><p class="lead">Resumen de la tienda. Los ingresos solo cuentan pedidos con pago verificado.</p></div>${periodSeg()}</div>
      <div class="kpis">
        ${kpi('Pedidos totales', fmt(tt.orders))}${kpi('Pendientes', fmt(tt.pending))}${kpi('Pagados', fmt(tt.paid))}${kpi('Entregados', fmt(tt.delivered))}
        ${kpi('Ingresos confirmados', cop(tt.revenueConfirmedCop), true)}${kpi(`Ingresos (${d.days} días)`, cop(tt.revenuePeriodCop), true)}${kpi(`Nuevos usuarios (${d.days} días)`, fmt(tt.newUsersPeriod))}
      </div>
      <div class="a-card"><h2>Ventas confirmadas por día (COP)</h2>${barChart(fillDays(d.salesSeries, Math.min(d.days, 90), 'v'), cop, 'Ventas confirmadas')}</div>
      <div class="grid-2">
        <div class="a-card"><h2>Productos más vendidos</h2>${hbars(d.topProducts.map((p) => ({ name: p.name, v: p.qty })), (v) => `${fmt(v)} u.`)}</div>
        <div class="a-card"><h2>Pedidos por estado</h2>${hbars(Object.entries(STATUS).map(([k, n]) => ({ name: n, v: d.byStatus[k] || 0 })).filter((r) => r.v))}</div>
      </div>
      <div class="a-card"><h2>Pendientes de revisión</h2><div id="dashPending"><p class="muted">Cargando…</p></div></div>`;
    const [p1, p2] = await Promise.all([A('/orders?status=in_review'), A('/orders?status=pending_payment')]);
    const list = [...p1.orders, ...p2.orders].slice(0, 10);
    $('dashPending').innerHTML = list.length ? ordersTable(list) : '<p class="empty">No hay pedidos pendientes.</p>';
  };
  const kpi = (label, value, accent) => `<div class="kpi${accent ? ' kpi--accent' : ''}"><div class="kpi__label">${esc(label)}</div><div class="kpi__value">${esc(value)}</div></div>`;
  const periodSeg = () => `<div class="seg" role="group" aria-label="Período">${[7, 30, 90, 365].map((n) => `<button type="button" data-days="${n}" class="${state.days === n ? 'is-active' : ''}">${n === 365 ? '1 año' : `${n} días`}</button>`).join('')}</div>`;

  /* ---------- Estadísticas ---------- */
  S.estadisticas = async () => {
    const d = await A(`/dashboard?days=${state.days}`);
    const n = Math.min(d.days, 120);
    const avg = d.totals.confirmedOrdersPeriod ? Math.round(d.totals.revenuePeriodCop / d.totals.confirmedOrdersPeriod) : 0;
    view.innerHTML = `
      <div class="a-head"><div><h1><span class="bar"></span>Estadísticas</h1><p class="lead">Ventas confirmadas, pedidos creados y registros.</p></div>${periodSeg()}</div>
      <div class="kpis">${kpi('Ingresos del período', cop(d.totals.revenuePeriodCop), true)}${kpi('Ventas confirmadas', fmt(d.totals.confirmedOrdersPeriod))}${kpi('Ticket promedio', cop(avg))}${kpi('Nuevos usuarios', fmt(d.totals.newUsersPeriod))}${kpi('Cancelados / reemb.', fmt(d.totals.cancelled))}</div>
      <div class="a-card"><h2>Ingresos confirmados por día</h2>${barChart(fillDays(d.salesSeries, n, 'v'), cop, 'Ingresos')}</div>
      <div class="grid-2">
        <div class="a-card"><h2>Pedidos creados por día</h2>${barChart(fillDays(d.ordersSeries, n, 'n'), fmt, 'Pedidos creados')}</div>
        <div class="a-card"><h2>Nuevos usuarios por día</h2>${barChart(fillDays(d.usersSeries, n, 'n'), fmt, 'Nuevos usuarios')}</div>
      </div>
      <div class="a-card"><h2>Ingresos por producto</h2>${hbars(d.topProducts.map((p) => ({ name: p.name, v: p.revenue })), cop)}</div>`;
  };

  /* ---------- Pedidos ---------- */
  const ordersTable = (list) => `<div class="table-wrap"><table class="t"><thead><tr><th>ID</th><th>Cliente</th><th>Productos</th><th>Total</th><th>Fecha</th><th>Estado</th><th>Ref. pago</th><th></th></tr></thead><tbody>
    ${list.map((o) => `<tr><td class="mono">${esc(o.id)}</td><td>${esc(o.customer.name)}<br><span class="muted" style="font-size:.78rem">${esc(o.customer.email)}</span></td>
      <td style="max-width:240px">${esc(o.items.join(', '))}</td><td class="num">${cop(o.totalCop)}</td><td class="num">${esc(date(o.createdAt))}</td><td>${pill(o.status)}</td>
      <td class="mono" style="font-size:.78rem">${esc(o.paymentReference || '—')}</td><td><button type="button" class="btn btn--pill btn--border btn-sm" data-order="${esc(o.id)}">Gestionar</button></td></tr>`).join('')}
    </tbody></table></div>`;

  S.pedidos = async () => {
    const f = state.orderFilter;
    const qs = new URLSearchParams({ page: f.page, ...(f.status ? { status: f.status } : {}), ...(f.q ? { q: f.q } : {}) });
    const d = await A(`/orders?${qs}`);
    const pages = Math.max(1, Math.ceil(d.total / d.pageSize));
    view.innerHTML = `
      <div class="a-head"><div><h1><span class="bar"></span>Pedidos</h1><p class="lead">${fmt(d.total)} pedidos. Verifica los pagos directamente en el proveedor antes de confirmarlos.</p></div></div>
      <form class="toolbar" id="orderFilter">
        <input class="input mono" name="q" placeholder="Buscar ID, correo o referencia" value="${esc(f.q)}" maxlength="80" />
        <select class="input" name="status"><option value="">Todos los estados</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${f.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <button class="btn btn--pill btn--primary" type="submit">Filtrar</button>
      </form>
      ${d.orders.length ? ordersTable(d.orders) : '<p class="empty">No hay pedidos con estos filtros.</p>'}
      <div class="pager"><button type="button" class="btn btn--pill btn--ghost btn-sm" data-page="${f.page - 1}" ${f.page <= 1 ? 'disabled' : ''}>Anterior</button><span>Página ${f.page} de ${pages}</span><button type="button" class="btn btn--pill btn--ghost btn-sm" data-page="${f.page + 1}" ${f.page >= pages ? 'disabled' : ''}>Siguiente</button></div>`;
  };

  async function orderModal(id) {
    const { order: o } = await A(`/orders/${encodeURIComponent(id)}`);
    const next = NEXT[o.status] || [];
    openModal(`Pedido ${o.id}`, `
      <div class="toolbar">${pill(o.status)}<span class="muted">${esc(date(o.createdAt))}</span></div>
      <dl class="kv">
        <dt>Cliente</dt><dd>${esc(o.customer?.name || '')} · ${esc(o.customer?.email || '')}</dd>
        <dt>Productos</dt><dd>${o.items.map((i) => `${i.quantity}x ${esc(i.productName)}${i.durationDays ? ` (${i.durationDays} días)` : ''} — ${cop(i.lineTotalCop)}`).join('<br>')}</dd>
        <dt>Subtotal</dt><dd>${cop(o.subtotalCop)}</dd>
        <dt>Descuento</dt><dd>${o.discountCop ? `− ${cop(o.discountCop)} (${esc(o.discountCode || '')})` : '—'}</dd>
        <dt>Total</dt><dd><strong>${cop(o.totalCop)}</strong></dd>
        <dt>Nota del cliente</dt><dd>${esc(o.customerNote || '—')}</dd>
        <dt>Ref. de pago</dt><dd class="mono">${esc(o.paymentReference || '—')}</dd>
      </dl>
      ${next.length ? `<form class="a-card" id="statusForm" style="margin-top:16px">
        <h2>Cambiar estado</h2>
        <div class="form-grid">
          <label class="field"><span>Nuevo estado</span><select class="input" name="status">${next.map((s) => `<option value="${s}">${STATUS[s]}</option>`).join('')}</select></label>
          <label class="field"><span>Referencia de pago (opcional)</span><input class="input mono" name="paymentReference" maxlength="120" value="${esc(o.paymentReference || '')}" /></label>
          <label class="field"><span>Método de pago (opcional)</span><input class="input" name="method" maxlength="60" placeholder="Ej.: Nequi, PayPal, transferencia" /></label>
          <label class="field"><span>Nota</span><input class="input" name="note" maxlength="500" /></label>
        </div>
        <p class="muted" style="font-size:.8rem">Marca «Pago verificado» solo después de comprobar la transacción en el proveedor.</p>
        <button class="btn btn--pill btn--primary" type="submit">Guardar estado</button>
      </form>` : '<p class="muted" style="margin-top:14px">Este pedido está cerrado; no admite más cambios de estado.</p>'}
      <form class="a-card" id="payForm">
        <h2>Registrar pago</h2>
        <div class="form-grid">
          <label class="field"><span>Referencia</span><input class="input mono" name="reference" required minlength="2" maxlength="120" /></label>
          <label class="field"><span>Monto COP</span><input class="input" name="amountCop" type="number" min="1" value="${o.totalCop}" /></label>
          <label class="field"><span>Método</span><input class="input" name="method" maxlength="60" /></label>
          <label class="field"><span>Estado del registro</span><select class="input" name="status"><option value="reported">Reportado</option><option value="verified">Verificado</option><option value="rejected">Rechazado</option></select></label>
          <label class="field full"><span>Notas</span><input class="input" name="notes" maxlength="500" /></label>
        </div>
        <button class="btn btn--pill btn--border" type="submit">Guardar registro</button>
        ${o.payments.length ? `<div class="table-wrap" style="margin-top:14px"><table class="t"><thead><tr><th>Fecha</th><th>Referencia</th><th>Monto</th><th>Método</th><th>Estado</th><th>Por</th></tr></thead><tbody>${o.payments.map((p) => `<tr><td class="num">${esc(date(p.createdAt))}</td><td class="mono">${esc(p.reference)}</td><td class="num">${p.amountCop ? cop(p.amountCop) : '—'}</td><td>${esc(p.method || '—')}</td><td>${esc(p.status)}</td><td style="font-size:.78rem">${esc(p.recordedByEmail || '')}</td></tr>`).join('')}</tbody></table></div>` : ''}
      </form>
      <form class="a-card" id="notesForm">
        <h2>Notas internas</h2>
        <textarea class="input" name="adminNotes" rows="3" maxlength="4000">${esc(o.adminNotes || '')}</textarea>
        <div class="form-actions"><button class="btn btn--pill btn--border" type="submit">Guardar notas</button></div>
      </form>
      <div class="a-card"><h2>Historial de cambios</h2><ol class="timeline">${o.history.map((h) => `<li>${esc(date(h.createdAt))} · <strong>${esc(STATUS[h.toStatus] || h.toStatus)}</strong>${h.fromStatus && h.fromStatus !== h.toStatus ? ` (desde ${esc(STATUS[h.fromStatus] || h.fromStatus)})` : ''} · ${esc(h.actorType === 'admin' ? h.changedByEmail || 'admin' : h.actorType === 'customer' ? 'cliente' : 'sistema')}${h.note ? ` — ${esc(h.note)}` : ''}</li>`).join('')}</ol></div>`,
    (root) => {
      root.querySelector('#statusForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const v = formData(e.target);
        if (v.status === 'payment_verified' && !confirm('¿Confirmas que verificaste el pago directamente en el proveedor?')) return;
        if (['cancelled', 'refunded'].includes(v.status) && !confirm(`¿Marcar el pedido como «${STATUS[v.status]}»?`)) return;
        try { await A(`/orders/${o.id}/status`, { method: 'POST', body: v }); toast('Estado actualizado'); orderModal(o.id); refresh(); } catch (err) { toast(errMsg(err)); }
      });
      root.querySelector('#payForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        try { await A(`/orders/${o.id}/payments`, { method: 'POST', body: formData(e.target) }); toast('Pago registrado'); orderModal(o.id); refresh(); } catch (err) { toast(errMsg(err)); }
      });
      root.querySelector('#notesForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        try { await A(`/orders/${o.id}/notes`, { method: 'PUT', body: formData(e.target) }); toast('Notas guardadas'); } catch (err) { toast(errMsg(err)); }
      });
    });
  }

  /* ---------- Productos y categorías ---------- */
  S.productos = async () => {
    await loadCatalog();
    const cats = cache.categories;
    const list = cache.products.filter((p) => !state.productCat || p.categoryId === Number(state.productCat));
    view.innerHTML = `
      <div class="a-head"><div><h1><span class="bar"></span>Productos</h1><p class="lead">Los cambios se publican al instante en la tienda. Archivar oculta el producto sin borrar el historial de pedidos.</p></div>
        <button type="button" class="btn btn--pill btn--primary" data-new-product>Nuevo producto</button></div>
      <div class="a-card"><div class="a-head" style="margin-bottom:10px"><h2 style="margin:0">Categorías</h2><button type="button" class="btn btn--pill btn--border btn-sm" data-new-cat>Nueva categoría</button></div>
        <div class="table-wrap"><table class="t"><thead><tr><th>Orden</th><th>Nombre</th><th>Slug</th><th>Estado</th><th>Productos</th><th></th></tr></thead><tbody>
        ${cats.map((c, i) => `<tr><td><div class="row-actions"><button type="button" class="btn btn--pill btn--ghost btn-sm" data-move="${c.id}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Subir">↑</button><button type="button" class="btn btn--pill btn--ghost btn-sm" data-move="${c.id}" data-dir="1" ${i === cats.length - 1 ? 'disabled' : ''} aria-label="Bajar">↓</button></div></td>
          <td><strong>${esc(c.nameEs)}</strong><br><span class="muted" style="font-size:.78rem">${esc(c.nameEn)}</span></td><td class="mono">${esc(c.slug)}</td>
          <td>${c.archivedAt ? '<span class="chip-s off">Archivada</span>' : c.isActive ? '<span class="chip-s on">Visible</span>' : '<span class="chip-s">Oculta</span>'}</td>
          <td class="num">${cache.products.filter((p) => p.categoryId === c.id && !p.archivedAt).length}</td>
          <td><div class="row-actions"><button type="button" class="btn btn--pill btn--border btn-sm" data-edit-cat="${c.id}">Editar</button><button type="button" class="btn btn--pill btn--ghost btn-sm" data-archive-cat="${c.id}" data-val="${c.archivedAt ? 'false' : 'true'}">${c.archivedAt ? 'Restaurar' : 'Archivar'}</button></div></td></tr>`).join('')}
        </tbody></table></div></div>
      <div class="toolbar"><select class="input" id="prodCat"><option value="">Todas las categorías</option>${cats.map((c) => `<option value="${c.id}" ${String(c.id) === String(state.productCat) ? 'selected' : ''}>${esc(c.nameEs)}</option>`).join('')}</select></div>
      <div class="table-wrap"><table class="t"><thead><tr><th></th><th>Producto</th><th>Categoría</th><th>Precio</th><th>Duración</th><th>Estado</th><th></th></tr></thead><tbody>
      ${list.map((p) => `<tr style="${p.archivedAt ? 'opacity:.5' : ''}"><td>${p.imageUrl ? `<img class="thumb" src="${esc(p.imageUrl)}" alt="" />` : ''}</td>
        <td><strong>${esc(p.nameEs)}</strong>${p.featured ? ' <span class="chip-s acc">Destacado</span>' : ''}<br><span class="muted mono" style="font-size:.74rem">${esc(p.slug)}</span></td>
        <td>${esc(catName(p.categoryId))}</td><td class="num">${cop(p.priceCop)}</td><td>${p.durationDays ? `${p.durationDays} días` : '—'}</td>
        <td>${p.archivedAt ? '<span class="chip-s off">Archivado</span>' : !p.isActive ? '<span class="chip-s">Oculto</span>' : p.status === 'sold_out' ? '<span class="chip-s off">Agotado</span>' : '<span class="chip-s on">Disponible</span>'}</td>
        <td><div class="row-actions"><button type="button" class="btn btn--pill btn--border btn-sm" data-edit-product="${p.id}">Editar</button><button type="button" class="btn btn--pill btn--ghost btn-sm" data-archive-product="${p.id}" data-val="${p.archivedAt ? 'false' : 'true'}">${p.archivedAt ? 'Restaurar' : 'Archivar'}</button></div></td></tr>`).join('')}
      </tbody></table></div>`;
  };

  function categoryModal(c) {
    openModal(c ? `Editar categoría ${c.nameEs}` : 'Nueva categoría', `<form id="catForm" class="form-grid">
      ${c ? '' : `<label class="field"><span>Slug (URL)</span><input class="input mono" name="slug" required pattern="[a-z0-9][a-z0-9-]{1,48}" maxlength="50" /></label>`}
      <label class="field"><span>Ícono</span><select class="input" name="icon">${Object.entries(ICONS).map(([k, v]) => `<option value="${k}" ${c?.icon === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="field"><span>Nombre (ES)</span><input class="input" name="nameEs" required maxlength="60" value="${esc(c?.nameEs || '')}" /></label>
      <label class="field"><span>Nombre (EN)</span><input class="input" name="nameEn" maxlength="60" value="${esc(c?.nameEn || '')}" /></label>
      <label class="field full"><span>Descripción (ES)</span><input class="input" name="descriptionEs" maxlength="300" value="${esc(c?.descriptionEs || '')}" /></label>
      <label class="field full"><span>Descripción (EN)</span><input class="input" name="descriptionEn" maxlength="300" value="${esc(c?.descriptionEn || '')}" /></label>
      <label class="check full"><input type="checkbox" name="isActive" ${!c || c.isActive ? 'checked' : ''} /> Visible en la tienda</label>
      <div class="form-actions full"><button class="btn btn--pill btn--primary" type="submit">Guardar</button></div></form>`, (root) => {
      root.querySelector('#catForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const v = formData(e.target); v.isActive = e.target.isActive.checked;
        if (c && !v.nameEn) v.nameEn = v.nameEs;
        try { await A(c ? `/categories/${c.id}` : '/categories', { method: c ? 'PUT' : 'POST', body: v }); closeModal(); toast('Categoría guardada'); refresh(); } catch (err) { toast(errMsg(err)); }
      });
    });
  }

  function productModal(p) {
    openModal(p ? `Editar ${p.nameEs}` : 'Nuevo producto', `<form id="prodForm" class="form-grid">
      <label class="field"><span>Categoría</span><select class="input" name="categoryId" required>${cache.categories.map((c) => `<option value="${c.id}" ${p?.categoryId === c.id ? 'selected' : ''}>${esc(c.nameEs)}</option>`).join('')}</select></label>
      <label class="field"><span>Slug (único)</span><input class="input mono" name="slug" required pattern="[a-z0-9][a-z0-9-]{1,48}" maxlength="50" value="${esc(p?.slug || '')}" /></label>
      <label class="field"><span>Nombre (ES)</span><input class="input" name="nameEs" required maxlength="80" value="${esc(p?.nameEs || '')}" /></label>
      <label class="field"><span>Nombre (EN)</span><input class="input" name="nameEn" maxlength="80" value="${esc(p?.nameEn || '')}" /></label>
      <label class="field full"><span>Descripción (ES)</span><textarea class="input" name="descriptionEs" maxlength="600" rows="2">${esc(p?.descriptionEs || '')}</textarea></label>
      <label class="field full"><span>Descripción (EN)</span><textarea class="input" name="descriptionEn" maxlength="600" rows="2">${esc(p?.descriptionEn || '')}</textarea></label>
      <label class="field"><span>Precio COP</span><input class="input" name="priceCop" type="number" min="1" required value="${p?.priceCop ?? ''}" /></label>
      <label class="field"><span>Precio USD fijo (vacío = usar tasa)</span><input class="input" name="priceUsd" inputmode="decimal" value="${esc(p?.priceUsd ?? '')}" /></label>
      <label class="field"><span>Duración en días (vacío = no aplica)</span><input class="input" name="durationDays" type="number" min="1" max="3650" value="${p?.durationDays ?? ''}" /></label>
      <label class="field"><span>Cantidad de Robux (solo Robux)</span><input class="input" name="robuxAmount" type="number" min="1" value="${p?.robuxAmount ?? ''}" /></label>
      <label class="field"><span>Ícono</span><select class="input" name="icon">${Object.entries(ICONS).map(([k, v]) => `<option value="${k}" ${(p?.icon || 'sparkle') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="field"><span>Disponibilidad</span><select class="input" name="status"><option value="available">Disponible</option><option value="sold_out" ${p?.status === 'sold_out' ? 'selected' : ''}>Agotado</option></select></label>
      <label class="field"><span>Etiqueta (ES)</span><input class="input" name="tagEs" maxlength="24" value="${esc(p?.tagEs || '')}" /></label>
      <label class="field"><span>Etiqueta (EN)</span><input class="input" name="tagEn" maxlength="24" value="${esc(p?.tagEn || '')}" /></label>
      <label class="field"><span>Orden</span><input class="input" name="sortOrder" type="number" value="${p?.sortOrder ?? 0}" /></label>
      <label class="field"><span>Máximo por pedido</span><input class="input" name="maxPerOrder" type="number" min="1" max="100" value="${p?.maxPerOrder ?? 10}" /></label>
      <div class="full"><label class="check"><input type="checkbox" name="isActive" ${!p || p.isActive ? 'checked' : ''} /> Visible y a la venta</label><label class="check"><input type="checkbox" name="featured" ${p?.featured ? 'checked' : ''} /> Destacado</label></div>
      ${p ? `<label class="field full"><span>Motivo del cambio de precio (si cambia)</span><input class="input" name="reason" maxlength="200" /></label>` : ''}
      <div class="form-actions full"><button class="btn btn--pill btn--primary" type="submit">Guardar</button></div>
    </form>
    ${p ? `<form class="a-card" id="imgForm" style="margin-top:16px"><h2>Imagen</h2>${p.imageUrl ? `<img class="thumb" style="width:72px;height:72px;margin-bottom:10px" src="${esc(p.imageUrl)}" alt="" />` : ''}
      <input class="input" type="file" name="file" accept="image/png,image/jpeg,image/webp,image/gif" required />
      <p class="muted" style="font-size:.78rem">PNG, JPG, WEBP o GIF, máximo 2 MB. Se valida el contenido real del archivo.</p>
      <div class="form-actions"><button class="btn btn--pill btn--border" type="submit">Subir imagen</button>${p.imageUrl ? '<button type="button" class="btn btn--pill btn-danger" id="imgRemove">Quitar imagen</button>' : ''}</div></form>` : ''}`,
    (root) => {
      root.querySelector('#prodForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target;
        const v = formData(f);
        v.isActive = f.isActive.checked; v.featured = f.featured.checked;
        if (!v.nameEn) v.nameEn = v.nameEs;
        if (p) { if (Number(v.priceCop) === p.priceCop) delete v.priceCop; if ((v.priceUsd || null) === (p.priceUsd || null)) delete v.priceUsd; }
        try { await A(p ? `/products/${p.id}` : '/products', { method: p ? 'PUT' : 'POST', body: v }); closeModal(); toast('Producto guardado'); refresh(); } catch (err) { toast(errMsg(err)); }
      });
      root.querySelector('#imgForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const file = e.target.file.files[0];
        if (!file) return;
        if (file.size > 2_000_000) return toast(ERR.image_too_large);
        const fd = new FormData(); fd.append('file', file);
        try { const r = await A(`/products/${p.id}/image`, { method: 'POST', form: fd }); toast('Imagen actualizada'); await loadCatalog(); productModal(r.product); refresh(); } catch (err) { toast(errMsg(err)); }
      });
      root.querySelector('#imgRemove')?.addEventListener('click', async () => {
        try { const r = await A(`/products/${p.id}/image`, { method: 'DELETE' }); toast('Imagen eliminada'); productModal(r.product); refresh(); } catch (err) { toast(errMsg(err)); }
      });
    });
  }

  /* ---------- Precios y ofertas ---------- */
  S.precios = async () => {
    await loadCatalog();
    const [{ products: list, promos }, { offers }] = await Promise.all([A('/prices'), A('/offers')]);
    const now = Date.now();
    const live = (o) => o.isActive && (!o.startsAt || new Date(o.startsAt) <= now) && (!o.endsAt || new Date(o.endsAt) > now);
    view.innerHTML = `
      <div class="a-head"><div><h1><span class="bar"></span>Precios</h1><p class="lead">Al guardar, el nuevo precio aplica de inmediato en la tienda, el carrito y los siguientes pedidos. Los pedidos anteriores conservan su importe.</p></div></div>
      <form class="a-card" id="bulkForm"><h2>Subir o bajar precios en bloque</h2><div class="toolbar">
        <input class="input" name="percent" type="number" step="0.1" min="-90" max="500" placeholder="% (ej.: 10 o -5)" required />
        <select class="input" name="categoryId"><option value="">Todas las categorías</option>${cache.categories.map((c) => `<option value="${c.id}">${esc(c.nameEs)}</option>`).join('')}</select>
        <select class="input" name="roundTo">${[1, 10, 50, 100, 500, 1000].map((n) => `<option value="${n}" ${n === 100 ? 'selected' : ''}>Redondear a ${fmt(n)}</option>`).join('')}</select>
        <button class="btn btn--pill btn--border" type="submit">Aplicar</button></div>
        <p class="muted" style="font-size:.78rem;margin:0">El ajuste en bloque quita los precios USD fijos (se usará la tasa configurada). Cada cambio queda en el historial.</p></form>
      <div class="table-wrap"><table class="t"><thead><tr><th>Producto</th><th>Categoría</th><th>COP</th><th>USD fijo</th><th>Promoción vigente</th><th></th></tr></thead><tbody>
      ${list.map((p) => { const pr = promos.filter((o) => o.productId === p.id && live(o)).sort((a, b) => a.promoPriceCop - b.promoPriceCop)[0]; return `<tr><td><strong>${esc(p.nameEs)}</strong></td><td>${esc(catName(p.categoryId))}</td>
        <td><input class="input" style="width:120px" type="number" min="1" value="${p.priceCop}" data-price-cop="${p.id}" /></td>
        <td><input class="input" style="width:90px" inputmode="decimal" value="${esc(p.priceUsd ?? '')}" placeholder="tasa" data-price-usd="${p.id}" /></td>
        <td>${pr ? `<span class="chip-s acc">${cop(pr.promoPriceCop)}</span>` : '—'}</td>
        <td><div class="row-actions"><button type="button" class="btn btn--pill btn--primary btn-sm" data-save-price="${p.id}">Guardar</button><button type="button" class="btn btn--pill btn--ghost btn-sm" data-history="${p.id}">Historial</button><button type="button" class="btn btn--pill btn--border btn-sm" data-promo="${p.id}">Promo</button></div></td></tr>`; }).join('')}
      </tbody></table></div>
      <div class="a-card" style="margin-top:20px"><div class="a-head" style="margin-bottom:10px"><div><h2 style="margin:0">Ofertas y precios promocionales</h2><p class="muted" style="margin:4px 0 0;font-size:.84rem">Se muestran en «Ofertas» solo mientras estén activas y dentro de sus fechas. El precio tachado es el precio normal real.</p></div><button type="button" class="btn btn--pill btn--primary btn-sm" data-new-offer>Nueva oferta</button></div>
        ${offers.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Título</th><th>Producto</th><th>Precio promo</th><th>Vigencia</th><th>Estado</th><th></th></tr></thead><tbody>
        ${offers.map((o) => `<tr><td><strong>${esc(o.titleEs)}</strong></td><td>${o.productId ? esc(prodName(o.productId)) : '—'}</td><td class="num">${o.promoPriceCop ? cop(o.promoPriceCop) : '—'}</td>
          <td style="font-size:.8rem">${dshort(o.startsAt)} → ${o.endsAt ? dshort(o.endsAt) : 'sin fin'}</td>
          <td>${live(o) ? '<span class="chip-s on">Activa</span>' : o.isActive && o.endsAt && new Date(o.endsAt) <= now ? '<span class="chip-s off">Vencida</span>' : o.isActive ? '<span class="chip-s">Programada</span>' : '<span class="chip-s">Inactiva</span>'}</td>
          <td><div class="row-actions"><button type="button" class="btn btn--pill btn--border btn-sm" data-edit-offer="${o.id}">Editar</button><button type="button" class="btn btn--pill btn--ghost btn-sm" data-toggle-offer="${o.id}">${o.isActive ? 'Desactivar' : 'Activar'}</button><button type="button" class="btn btn--pill btn-danger btn-sm" data-del-offer="${o.id}">Eliminar</button></div></td></tr>`).join('')}
        </tbody></table></div>` : '<p class="empty">No hay ofertas creadas.</p>'}</div>`;
    state.offers = offers;
  };

  async function historyModal(pid) {
    const { history } = await A(`/prices/${pid}/history`);
    openModal(`Historial de precios · ${prodName(pid)}`, history.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Fecha</th><th>Anterior</th><th>Nuevo</th><th>Motivo</th><th>Por</th><th></th></tr></thead><tbody>
      ${history.map((h) => `<tr><td class="num">${esc(date(h.createdAt))}</td><td class="num">${h.oldPriceCop ? cop(h.oldPriceCop) : '—'}${h.oldPriceUsd ? `<br><span class="muted">USD ${esc(h.oldPriceUsd)}</span>` : ''}</td><td class="num">${cop(h.newPriceCop)}${h.newPriceUsd ? `<br><span class="muted">USD ${esc(h.newPriceUsd)}</span>` : ''}</td>
        <td>${esc(h.reason)}</td><td style="font-size:.78rem">${esc(h.changedByEmail || 'sistema')}</td>
        <td><div class="row-actions">${h.oldPriceCop ? `<button type="button" class="btn btn--pill btn--ghost btn-sm" data-restore="${h.id}" data-which="old">Restaurar anterior</button>` : ''}<button type="button" class="btn btn--pill btn--ghost btn-sm" data-restore="${h.id}" data-which="new">Restaurar este</button></div></td></tr>`).join('')}
      </tbody></table></div>` : '<p class="empty">Sin historial.</p>', (root) => {
      root.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-restore]');
        if (!b) return;
        try { await A(`/prices/${pid}/restore`, { method: 'POST', body: { historyId: Number(b.dataset.restore), which: b.dataset.which } }); toast('Precio restaurado'); historyModal(pid); refresh(); } catch (err) { toast(errMsg(err)); }
      });
    });
  }

  function offerModal(o, productId) {
    const pid = o?.productId ?? productId ?? '';
    openModal(o ? 'Editar oferta' : 'Nueva oferta', `<form id="offerForm" class="form-grid">
      <label class="field full"><span>Producto (opcional si es solo un anuncio)</span><select class="input" name="productId"><option value="">— Ninguno —</option>${cache.products.filter((p) => !p.archivedAt).map((p) => `<option value="${p.id}" ${String(pid) === String(p.id) ? 'selected' : ''}>${esc(p.nameEs)} (${cop(p.priceCop)})</option>`).join('')}</select></label>
      <label class="field"><span>Título (ES)</span><input class="input" name="titleEs" required maxlength="100" value="${esc(o?.titleEs || '')}" /></label>
      <label class="field"><span>Título (EN)</span><input class="input" name="titleEn" maxlength="100" value="${esc(o?.titleEn || '')}" /></label>
      <label class="field full"><span>Descripción (ES)</span><input class="input" name="descriptionEs" maxlength="400" value="${esc(o?.descriptionEs || '')}" /></label>
      <label class="field full"><span>Descripción (EN)</span><input class="input" name="descriptionEn" maxlength="400" value="${esc(o?.descriptionEn || '')}" /></label>
      <label class="field"><span>Precio promocional COP (vacío = sin cambio de precio)</span><input class="input" name="promoPriceCop" type="number" min="1" value="${o?.promoPriceCop ?? ''}" /></label>
      <label class="field"><span>Orden</span><input class="input" name="sortOrder" type="number" value="${o?.sortOrder ?? 0}" /></label>
      <label class="field"><span>Inicio</span><input class="input" name="startsAt" type="datetime-local" value="${toLocal(o?.startsAt)}" /></label>
      <label class="field"><span>Fin</span><input class="input" name="endsAt" type="datetime-local" value="${toLocal(o?.endsAt)}" /></label>
      <label class="check full"><input type="checkbox" name="isActive" ${!o || o.isActive ? 'checked' : ''} /> Activa</label>
      <div class="form-actions full"><button class="btn btn--pill btn--primary" type="submit">Guardar</button></div></form>`, (root) => {
      root.querySelector('#offerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const v = formData(e.target);
        v.isActive = e.target.isActive.checked; v.startsAt = fromLocal(v.startsAt); v.endsAt = fromLocal(v.endsAt);
        try { await A(o ? `/offers/${o.id}` : '/offers', { method: o ? 'PUT' : 'POST', body: v }); closeModal(); toast('Oferta guardada'); refresh(); } catch (err) { toast(errMsg(err)); }
      });
    });
  }

  /* ---------- Descuentos ---------- */
  S.descuentos = async () => {
    await loadCatalog();
    const { discounts } = await A('/discounts');
    state.discounts = discounts;
    const now = Date.now();
    const st = (d) => d.archivedAt ? '<span class="chip-s off">Archivado</span>' : !d.isActive ? '<span class="chip-s">Inactivo</span>' : d.expiresAt && new Date(d.expiresAt) <= now ? '<span class="chip-s off">Vencido</span>' : d.maxUses && d.stats.uses >= d.maxUses ? '<span class="chip-s off">Agotado</span>' : '<span class="chip-s on">Activo</span>';
    view.innerHTML = `
      <div class="a-head"><div><h1><span class="bar"></span>Descuentos</h1><p class="lead">Un código por pedido, validado en el servidor. Los cambios aplican a compras nuevas; los pedidos anteriores no cambian.</p></div><button type="button" class="btn btn--pill btn--primary" data-new-discount>Nuevo código</button></div>
      <div class="table-wrap"><table class="t"><thead><tr><th>Código</th><th>Descuento</th><th>Estado</th><th>Usos</th><th>Vence</th><th>Aplica a</th><th>Confirmados</th><th>Descontado</th><th></th></tr></thead><tbody>
      ${discounts.map((d) => `<tr style="${d.archivedAt ? 'opacity:.55' : ''}"><td class="mono"><strong>${esc(d.code)}</strong><br><span class="muted" style="font-size:.74rem">${esc(d.description)}</span></td>
        <td class="num">${d.kind === 'percent' ? `${d.value}%` : cop(d.value)}</td><td>${st(d)}</td>
        <td class="num">${fmt(d.stats.uses)}${d.maxUses ? ` / ${fmt(d.maxUses)}` : ''}</td><td style="font-size:.8rem">${d.expiresAt ? esc(date(d.expiresAt)) : '—'}</td>
        <td style="font-size:.8rem;max-width:180px">${d.productIds.length || d.categoryIds.length ? esc([...d.categoryIds.map(catName), ...d.productIds.map(prodName)].join(', ')) : 'Todo'}</td>
        <td class="num">${fmt(d.stats.confirmed)}</td><td class="num">${cop(d.stats.discountedCop)}</td>
        <td><div class="row-actions"><button type="button" class="btn btn--pill btn--border btn-sm" data-edit-discount="${d.id}">Editar</button>
          ${d.archivedAt ? '' : `<button type="button" class="btn btn--pill btn--ghost btn-sm" data-toggle-discount="${d.id}">${d.isActive ? 'Desactivar' : 'Activar'}</button>`}
          <button type="button" class="btn btn--pill btn--ghost btn-sm" data-discount-orders="${d.id}">Pedidos</button>
          <button type="button" class="btn btn--pill ${d.archivedAt ? 'btn--ghost' : 'btn-danger'} btn-sm" data-archive-discount="${d.id}" data-val="${d.archivedAt ? 'false' : 'true'}">${d.archivedAt ? 'Restaurar' : 'Archivar'}</button></div></td></tr>`).join('')}
      </tbody></table></div>`;
  };

  function discountModal(d) {
    openModal(d ? `Editar ${d.code}` : 'Nuevo código de descuento', `<form id="discForm" class="form-grid">
      <label class="field"><span>Código</span><input class="input mono" name="code" ${d ? `value="${esc(d.code)}" disabled` : 'required'} maxlength="32" pattern="[A-Za-z0-9_-]{3,32}" placeholder="NAVIDAD20" style="text-transform:uppercase" /></label>
      <label class="field"><span>Descripción</span><input class="input" name="description" maxlength="200" value="${esc(d?.description || '')}" /></label>
      <label class="field"><span>Tipo</span><select class="input" name="kind"><option value="percent">Porcentaje (%)</option><option value="fixed" ${d?.kind === 'fixed' ? 'selected' : ''}>Importe fijo (COP)</option></select></label>
      <label class="field"><span>Valor</span><input class="input" name="value" type="number" min="1" required value="${d?.value ?? ''}" /></label>
      <label class="field"><span>Inicio (opcional)</span><input class="input" name="startsAt" type="datetime-local" value="${toLocal(d?.startsAt)}" /></label>
      <label class="field"><span>Vencimiento (opcional)</span><input class="input" name="expiresAt" type="datetime-local" value="${toLocal(d?.expiresAt)}" /></label>
      <label class="field"><span>Límite total de usos</span><input class="input" name="maxUses" type="number" min="1" value="${d?.maxUses ?? ''}" placeholder="Sin límite" /></label>
      <label class="field"><span>Límite por usuario</span><input class="input" name="maxUsesPerUser" type="number" min="1" value="${d?.maxUsesPerUser ?? ''}" placeholder="Sin límite" /></label>
      <label class="field"><span>Subtotal mínimo COP</span><input class="input" name="minSubtotalCop" type="number" min="1" value="${d?.minSubtotalCop ?? ''}" placeholder="Sin mínimo" /></label>
      <label class="check"><input type="checkbox" name="isActive" ${!d || d.isActive ? 'checked' : ''} /> Activo</label>
      <div class="field full"><span class="mono muted" style="font-size:.76rem">Restringir a categorías (vacío = todas)</span><div class="checklist">${cache.categories.map((c) => `<label class="check"><input type="checkbox" name="cat" value="${c.id}" ${d?.categoryIds.includes(c.id) ? 'checked' : ''} />${esc(c.nameEs)}</label>`).join('')}</div></div>
      <div class="field full"><span class="mono muted" style="font-size:.76rem">Restringir a productos (vacío = todos)</span><div class="checklist">${cache.products.filter((p) => !p.archivedAt).map((p) => `<label class="check"><input type="checkbox" name="prod" value="${p.id}" ${d?.productIds.includes(p.id) ? 'checked' : ''} />${esc(p.nameEs)}</label>`).join('')}</div></div>
      <div class="form-actions full"><button class="btn btn--pill btn--primary" type="submit">Guardar</button></div></form>`, (root) => {
      root.querySelector('#discForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target;
        const v = {
          description: f.description.value, kind: f.kind.value, value: f.value.value, isActive: f.isActive.checked,
          startsAt: fromLocal(f.startsAt.value), expiresAt: fromLocal(f.expiresAt.value),
          maxUses: f.maxUses.value || null, maxUsesPerUser: f.maxUsesPerUser.value || null, minSubtotalCop: f.minSubtotalCop.value || null,
          categoryIds: [...f.querySelectorAll('[name=cat]:checked')].map((x) => Number(x.value)),
          productIds: [...f.querySelectorAll('[name=prod]:checked')].map((x) => Number(x.value)),
        };
        if (!d) v.code = f.code.value.trim().toUpperCase();
        try { await A(d ? `/discounts/${d.id}` : '/discounts', { method: d ? 'PUT' : 'POST', body: v }); closeModal(); toast('Código guardado'); refresh(); } catch (err) { toast(errMsg(err)); }
      });
    });
  }

  /* ---------- Usuarios ---------- */
  S.usuarios = async () => {
    const q = state.userQ || '';
    const { users } = await A(`/users${q ? `?q=${encodeURIComponent(q)}` : ''}`);
    view.innerHTML = `
      <div class="a-head"><div><h1><span class="bar"></span>Usuarios</h1><p class="lead">Clientes registrados. Las contraseñas nunca se guardan aquí (las gestiona Netlify Identity).</p></div></div>
      <form class="toolbar" id="userSearch"><input class="input" name="q" placeholder="Buscar por nombre o correo" value="${esc(q)}" maxlength="80" /><button class="btn btn--pill btn--primary" type="submit">Buscar</button></form>
      ${users.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Nombre</th><th>Correo</th><th>Registro</th><th>Última visita</th><th>Pedidos</th><th>Compras confirmadas</th><th>Rol</th><th></th></tr></thead><tbody>
      ${users.map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td class="num">${dshort(u.createdAt)}</td><td class="num">${dshort(u.lastSeenAt)}</td><td class="num">${fmt(u.orders)}</td><td class="num">${cop(u.spentCop)}</td>
        <td>${u.isAdmin ? '<span class="chip-s acc">Admin</span>' : '<span class="chip-s">Cliente</span>'}</td>
        <td>${u.id === me.id ? '<span class="muted" style="font-size:.78rem">Tú</span>' : `<button type="button" class="btn btn--pill ${u.isAdmin ? 'btn-danger' : 'btn--ghost'} btn-sm" data-role="${esc(u.id)}" data-grant="${u.isAdmin ? 'false' : 'true'}" data-email="${esc(u.email)}">${u.isAdmin ? 'Quitar admin' : 'Hacer admin'}</button>`}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="empty">No hay usuarios.</p>'}`;
  };

  /* ---------- Configuración ---------- */
  S.configuracion = async () => {
    const [{ settings: s, emailConfigured }, { logs }] = await Promise.all([A('/settings'), A(`/audit?page=${state.auditPage}`)]);
    view.innerHTML = `
      <div class="a-head"><div><h1><span class="bar"></span>Configuración</h1><p class="lead">Ajustes generales de la tienda y registro de acciones administrativas.</p></div></div>
      <form class="a-card form-grid" id="settingsForm">
        <h2 class="full">Ajustes</h2>
        <label class="field"><span>Tasa: COP por 1 USD (precios USD aproximados)</span><input class="input" name="usdRate" type="number" step="0.01" min="100" max="100000" value="${s.usdRate}" /></label>
        <label class="field"><span>Número de WhatsApp (con indicativo, solo dígitos)</span><input class="input mono" name="whatsappNumber" value="${esc(s.whatsappNumber)}" maxlength="15" /></label>
        <label class="field"><span>Correo para notificaciones</span><input class="input" name="notifyEmail" type="email" value="${esc(s.notifyEmail)}" maxlength="120" /></label>
        <label class="check"><input type="checkbox" name="showUsd" ${s.showUsd ? 'checked' : ''} /> Mostrar precios aproximados en USD</label>
        <p class="full ${emailConfigured ? 'form-ok' : 'form-error'}" style="margin:0">${emailConfigured ? 'Envío de correos configurado.' : 'El envío de correos no está configurado todavía (falta la clave del proveedor de correo).'}</p>
        <div class="form-actions full"><button class="btn btn--pill btn--primary" type="submit">Guardar ajustes</button></div>
      </form>
      <div class="a-card"><h2>Seguridad de la cuenta</h2><p class="muted" style="margin:0">El acceso a /admin se comprueba en el servidor en cada operación. La recuperación de contraseña está disponible en la página de acceso. Netlify Identity no ofrece autenticación de dos factores; si en el futuro se habilita, se recomienda activarla en esta cuenta.</p></div>
      <div class="a-card"><h2>Registro de auditoría</h2>
        ${logs.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Fecha</th><th>Admin</th><th>Acción</th><th>Entidad</th><th>Detalles</th></tr></thead><tbody>
        ${logs.map((l) => `<tr><td class="num">${esc(date(l.createdAt))}</td><td style="font-size:.8rem">${esc(l.adminEmail)}</td><td class="mono" style="font-size:.78rem">${esc(l.action)}</td><td style="font-size:.8rem">${esc(l.entityType)} ${esc(l.entityId || '')}</td><td class="mono" style="font-size:.72rem;max-width:280px;overflow-wrap:anywhere">${esc(JSON.stringify(l.details)).slice(0, 220)}</td></tr>`).join('')}
        </tbody></table></div>` : '<p class="empty">Sin registros.</p>'}
        <div class="pager"><button type="button" class="btn btn--pill btn--ghost btn-sm" data-audit="${state.auditPage - 1}" ${state.auditPage <= 1 ? 'disabled' : ''}>Anterior</button><span>Página ${state.auditPage}</span><button type="button" class="btn btn--pill btn--ghost btn-sm" data-audit="${state.auditPage + 1}" ${logs.length < 50 ? 'disabled' : ''}>Siguiente</button></div>
      </div>`;
  };

  /* ================= Eventos de la vista ================= */
  view.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    const d = b.dataset;
    try {
      if (d.days) { state.days = Number(d.days); refresh(); }
      else if (d.order) orderModal(d.order);
      else if (d.page) { state.orderFilter.page = Number(d.page); refresh(); }
      else if (d.audit) { state.auditPage = Number(d.audit); refresh(); }
      else if ('newProduct' in d) productModal(null);
      else if (d.editProduct) productModal(cache.products.find((p) => p.id === Number(d.editProduct)));
      else if (d.archiveProduct) { await A(`/products/${d.archiveProduct}/archive`, { method: 'POST', body: { archived: d.val === 'true' } }); toast('Producto actualizado'); refresh(); }
      else if ('newCat' in d) categoryModal(null);
      else if (d.editCat) categoryModal(cache.categories.find((c) => c.id === Number(d.editCat)));
      else if (d.archiveCat) { await A(`/categories/${d.archiveCat}/archive`, { method: 'POST', body: { archived: d.val === 'true' } }); toast('Categoría actualizada'); refresh(); }
      else if (d.move) {
        const ids = cache.categories.map((c) => c.id);
        const i = ids.indexOf(Number(d.move)); const j = i + Number(d.dir);
        [ids[i], ids[j]] = [ids[j], ids[i]];
        await A('/categories/reorder', { method: 'POST', body: { ids } }); refresh();
      }
      else if (d.savePrice) {
        const priceCop = view.querySelector(`[data-price-cop="${d.savePrice}"]`).value;
        const priceUsd = view.querySelector(`[data-price-usd="${d.savePrice}"]`).value;
        const reason = prompt('Motivo del cambio (opcional):', '') ?? null;
        if (reason === null) return;
        await A(`/prices/${d.savePrice}`, { method: 'PUT', body: { priceCop, priceUsd, reason } }); toast('Precio guardado'); refresh();
      }
      else if (d.history) historyModal(Number(d.history));
      else if (d.promo) offerModal(null, Number(d.promo));
      else if ('newOffer' in d) offerModal(null);
      else if (d.editOffer) offerModal(state.offers.find((o) => o.id === Number(d.editOffer)));
      else if (d.toggleOffer) { const o = state.offers.find((x) => x.id === Number(d.toggleOffer)); await A(`/offers/${o.id}`, { method: 'PUT', body: { ...o, isActive: !o.isActive } }); refresh(); }
      else if (d.delOffer) { if (!confirm('¿Eliminar esta oferta?')) return; await A(`/offers/${d.delOffer}`, { method: 'DELETE' }); toast('Oferta eliminada'); refresh(); }
      else if ('newDiscount' in d) discountModal(null);
      else if (d.editDiscount) discountModal(state.discounts.find((x) => x.id === Number(d.editDiscount)));
      else if (d.toggleDiscount) { const x = state.discounts.find((y) => y.id === Number(d.toggleDiscount)); await A(`/discounts/${x.id}`, { method: 'PUT', body: { isActive: !x.isActive } }); refresh(); }
      else if (d.archiveDiscount) { await A(`/discounts/${d.archiveDiscount}/archive`, { method: 'POST', body: { archived: d.val === 'true' } }); toast('Código actualizado'); refresh(); }
      else if (d.discountOrders) {
        const { orders } = await A(`/discounts/${d.discountOrders}/orders`);
        const x = state.discounts.find((y) => y.id === Number(d.discountOrders));
        openModal(`Pedidos con ${x.code}`, orders.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>ID</th><th>Cliente</th><th>Total</th><th>Descuento</th><th>Estado</th><th>Fecha</th></tr></thead><tbody>${orders.map((o) => `<tr><td class="mono">${esc(o.id)}</td><td>${esc(o.email)}</td><td class="num">${cop(o.totalCop)}</td><td class="num">${cop(o.discountCop)}${o.redemption === 'voided' ? ' <span class="chip-s off">anulado</span>' : ''}</td><td>${pill(o.status)}</td><td class="num">${esc(date(o.createdAt))}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">Ningún pedido ha usado este código.</p>');
      }
      else if (d.role) {
        const grant = d.grant === 'true';
        if (!confirm(grant ? `¿Dar acceso de administrador a ${d.email}? Podrá gestionar toda la tienda.` : `¿Quitar el acceso de administrador a ${d.email}?`)) return;
        await A(`/users/${encodeURIComponent(d.role)}/admin`, { method: 'POST', body: { grant } }); toast('Rol actualizado'); refresh();
      }
    } catch (err) { toast(errMsg(err)); }
  });
  view.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      if (f.id === 'orderFilter') { state.orderFilter = { ...formData(f), page: 1 }; refresh(); }
      else if (f.id === 'userSearch') { state.userQ = f.q.value.trim(); refresh(); }
      else if (f.id === 'bulkForm') {
        const v = formData(f);
        if (!confirm(`¿Ajustar ${v.percent}% los precios${v.categoryId ? ' de la categoría seleccionada' : ' de todos los productos'}?`)) return;
        const r = await A('/prices/bulk', { method: 'POST', body: v }); toast(`${r.changed} precios actualizados`); refresh();
      }
      else if (f.id === 'settingsForm') {
        const v = formData(f); v.showUsd = f.showUsd.checked;
        await A('/settings', { method: 'PUT', body: v }); toast('Ajustes guardados'); refresh();
      }
    } catch (err) { toast(errMsg(err)); }
  });
  view.addEventListener('change', (e) => { if (e.target.id === 'prodCat') { state.productCat = e.target.value; refresh(); } });

  /* ================= Router y acceso ================= */
  let me = null;
  let current = 'dashboard';
  async function refresh() {
    try { await S[current](); } catch (err) {
      if (err.code === 'unauthorized' || err.code === 'forbidden') return gate(err);
      view.innerHTML = `<p class="form-error">${esc(errMsg(err))}</p>`;
    }
  }
  function route() {
    const sec = location.hash.slice(1) || 'dashboard';
    current = S[sec] ? sec : 'dashboard';
    document.querySelectorAll('#adminNav a').forEach((a) => a.classList.toggle('is-active', a.dataset.sec === current));
    closeModal();
    view.innerHTML = '<p class="muted">Cargando…</p>';
    refresh();
  }
  function gate(err) {
    $('adminNav').hidden = true;
    $('adminLogout').hidden = true;
    view.innerHTML = `<div class="denied panel" style="max-width:440px;margin:0 auto;text-align:left">
      <h1>Área privada</h1>
      <p class="lead">Escribe el correo y la clave administrativa.</p>
      <form id="admLogin" novalidate>
        <label class="field"><span>Correo administrativo</span><input class="input" type="email" name="email" required maxlength="120" autocomplete="username" /></label>
        <label class="field"><span>Clave</span><input class="input" type="password" name="password" required maxlength="200" autocomplete="current-password" /></label>
        <button class="btn btn--pill btn--primary" type="submit" style="width:100%">Entrar al panel</button></form>
      <p class="form-error" id="otpErr" hidden></p></div>`;
    const err2 = (m) => { $('otpErr').hidden = !m; $('otpErr').textContent = m || ''; };
    if (err && err.code && err.code !== 'unauthorized') err2(errMsg(err));
    $('admLogin').addEventListener('submit', async (e) => {
      e.preventDefault(); err2('');
      const f = e.target;
      const email = f.email.value.trim().toLowerCase();
      if (!email || !f.password.value) return err2('Completa el correo y la clave.');
      const btn = f.querySelector('button'); btn.disabled = true;
      try {
        const r = await authPost('login', { email, password: f.password.value });
        sessionStorage.setItem(SK, JSON.stringify({ token: r.token, exp: Date.now() + r.expiresIn * 1000 }));
        start();
      } catch (ex) { err2(errMsg(ex)); btn.disabled = false; f.password.value = ''; }
    });
  }
  $('adminLogout').addEventListener('click', async () => {
    const tk = getTok();
    sessionStorage.removeItem(SK);
    if (tk) await authPost('logout', {}, { 'X-Admin-Session': tk }).catch(() => {});
    location.replace('/admin/');
  });

  let routed = false;
  async function start() {
    if (!getTok()) return gate();
    try {
      const r = await A('/me');
      me = r.admin;
      $('adminWho').textContent = me.email;
      $('adminLogout').hidden = false;
      $('adminNav').hidden = false;
      if (!routed) { window.addEventListener('hashchange', route); routed = true; }
      route();
    } catch (err) { gate(err); }
  }
  start();
})();
