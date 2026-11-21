/* NekoRBX — tienda: categorías, catálogo en vivo, carrito y pedidos. */
(() => {
  'use strict';
  const { api, auth, esc, fmt, cop, usd, errText, uuid } = window.Neko;
  const I = window.NekoI18n;
  const t = I.t;
  const $ = (id) => document.getElementById(id);

  const grid = $('grid');
  const catTabs = $('catTabs');
  const robuxTabs = $('robuxTabs');
  const CAT_ICON = { robux: 'i-robux', stream: 'i-stream', ai: 'i-ai', sparkle: 'i-sparkle', cart: 'i-cart', bolt: 'i-bolt' };
  const groupOf = (n) => (n <= 500 ? 'basic' : n <= 1700 ? 'medium' : 'large');

  let catalog = null; // datos de /api/catalog
  let offline = false;
  let currentCat = 'robux';
  let robuxFilter = 'all';

  /* ================= Carrito (persistido en el navegador) ================= */
  const CKEY = 'nekorbx.cart';
  const loadCart = () => {
    try {
      const c = JSON.parse(localStorage.getItem(CKEY) || 'null');
      if (c && Array.isArray(c.items)) return { items: c.items.filter((i) => Number.isInteger(i.productId) && Number.isInteger(i.quantity) && i.quantity > 0), code: c.code || '', idem: c.idem || uuid() };
    } catch { /* */ }
    return { items: [], code: '', idem: uuid() };
  };
  let cart = loadCart();
  let quote = null;
  let quoteError = '';
  let lastOrder = null;
  let busy = false;

  const saveCart = () => {
    try { localStorage.setItem(CKEY, JSON.stringify(cart)); } catch { /* */ }
    paintCount();
  };
  const productById = (id) => catalog?.products.find((p) => p.id === id);
  const cartQty = () => cart.items.reduce((s, i) => s + i.quantity, 0);

  function paintCount() {
    const n = cartQty();
    const el = $('cartCount');
    if (!el) return;
    el.hidden = n === 0;
    el.textContent = n > 99 ? '99+' : String(n);
  }

  function addToCart(id, qty = 1) {
    const p = productById(id);
    if (!p || !p.available) return false;
    const it = cart.items.find((i) => i.productId === id);
    if (it) it.quantity = Math.min(p.maxPerOrder, it.quantity + qty);
    else cart.items.push({ productId: id, quantity: Math.min(p.maxPerOrder, qty) });
    lastOrder = null;
    saveCart();
    requestQuote();
    return true;
  }

  /* ================= Utilidades de presentación ================= */
  const showUsd = () => !catalog || catalog.settings.showUsd;
  const usdLine = (p) => (showUsd() && p.priceUsd ? `<div class="card__usd">${esc(t('card.usdApprox', { v: usd(p.priceUsd) }))}</div>` : '');
  const nameOf = (p) => I.pick(p.name);

  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    el.classList.add('is-on');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { el.classList.remove('is-on'); setTimeout(() => { el.hidden = true; }, 300); }, 2200);
  }

  function cardHtml(p, i, offer) {
    const tag = offer ? t('card.promo') : p.tag ? I.pick(p.tag) : p.featured ? t('card.featured') : '';
    const sold = !p.available;
    const price = `
      <div class="card__divider"></div>
      ${p.regularPriceCop ? `<div class="card__regular">${esc(t('card.regular'))} <s>${cop(p.regularPriceCop)}</s></div>` : ''}
      <div class="card__cop">${cop(p.priceCop)}</div>
      ${usdLine(p)}`;
    const buttons = sold
      ? `<span class="card__btn card__btn--off">${esc(t('card.soldout'))}</span>`
      : `<button type="button" class="card__btn" data-buy="${p.id}" aria-label="${esc(`${t('card.buy')} ${nameOf(p)} — ${cop(p.priceCop)}`)}">${esc(t('card.buy'))} <svg aria-hidden="true"><use href="#i-arrow" /></svg></button>
         <button type="button" class="card__add" data-add="${p.id}"><svg aria-hidden="true"><use href="#i-cart" /></svg>${esc(t('card.add'))}</button>`;
    const head = offer ? `<div class="card__offer mono">${esc(I.pick(offer.title))}</div>` : '';

    if (p.robuxAmount) {
      return `<article class="card${sold ? ' is-sold' : ''}" style="--i:${i}" data-group="${groupOf(p.robuxAmount)}">
        ${tag ? `<span class="card__tag">${esc(tag)}</span>` : ''}
        ${head}
        <svg class="card__icon" aria-hidden="true"><use href="#i-robux" /></svg>
        <div class="card__amount">${fmt(p.robuxAmount)}</div>
        <div class="card__unit">${esc(t('card.unit'))}</div>
        ${price}
        ${buttons}
      </article>`;
    }
    const media = p.imageUrl
      ? `<img class="card__img" src="${esc(p.imageUrl)}" alt="" loading="lazy" width="54" height="54" />`
      : `<span class="card__glyph" aria-hidden="true"><svg><use href="#${CAT_ICON[p.icon] || 'i-sparkle'}" /></svg></span>`;
    return `<article class="card card--product${sold ? ' is-sold' : ''}" style="--i:${i}">
      ${tag ? `<span class="card__tag">${esc(tag)}</span>` : ''}
      ${head}
      ${media}
      <div class="card__name">${esc(nameOf(p))}</div>
      ${p.durationDays ? `<div class="card__unit">${esc(t('card.days', { n: p.durationDays }))}</div>` : ''}
      ${I.pick(p.description) ? `<p class="card__desc">${esc(I.pick(p.description))}</p>` : ''}
      ${sold ? `<div class="card__stock mono">${esc(t('card.soldout'))}</div>` : ''}
      ${price}
      ${buttons}
    </article>`;
  }

  /* ================= Catálogo ================= */
  function renderCatTabs() {
    if (!catalog) return;
    catTabs.innerHTML = catalog.categories.map((c) => `
      <button class="tab${c.slug === currentCat ? ' is-active' : ''}" role="tab" aria-selected="${c.slug === currentCat}" data-cat="${esc(c.slug)}">
        <svg aria-hidden="true"><use href="#${CAT_ICON[c.icon] || 'i-sparkle'}" /></svg>${esc(I.pick(c.name))}
      </button>`).join('');
  }

  function renderRobuxTabs(list) {
    const ranges = { all: list, basic: [], medium: [], large: [] };
    list.forEach((p) => ranges[groupOf(p.robuxAmount)].push(p));
    robuxTabs.querySelectorAll('[data-range]').forEach((el) => {
      const g = ranges[el.dataset.range];
      if (el.dataset.range === 'all') { el.textContent = `(${g.length})`; return; }
      const nums = g.map((p) => p.robuxAmount).sort((a, b) => a - b);
      el.textContent = nums.length ? `(${fmt(nums[0])} - ${fmt(nums[nums.length - 1])})` : '(0)';
      el.closest('.tab').hidden = nums.length === 0;
    });
  }

  function render() {
    const cat = catalog?.categories.find((c) => c.slug === currentCat) ?? catalog?.categories[0];
    if (catalog && cat) currentCat = cat.slug;
    const isRobux = currentCat === 'robux';
    $('shopTitle').textContent = isRobux ? t('shop.title.robux') : (cat ? I.pick(cat.name) : '');
    $('shopSub').textContent = isRobux ? t('shop.sub.robux') : (cat && I.pick(cat.description)) || t('shop.sub.other');
    robuxTabs.hidden = !isRobux;
    $('shopNote').hidden = !offline;
    if (offline) $('shopNote').textContent = t('shop.offline');

    if (offline) return renderFallback();
    let list = catalog.products.filter((p) => p.categoryId === cat?.id);
    if (isRobux) {
      list = list.filter((p) => p.robuxAmount);
      renderRobuxTabs(list);
      if (robuxFilter !== 'all') list = list.filter((p) => groupOf(p.robuxAmount) === robuxFilter);
    }
    grid.classList.toggle('grid--products', !isRobux);
    grid.innerHTML = list.length ? list.map((p, i) => cardHtml(p, i)).join('') : `<p class="shop-empty">${esc(t('shop.empty'))}</p>`;
  }

  // Sin API: los 21 paquetes de siempre con su enlace directo de WhatsApp.
  function renderFallback() {
    const F = window.NEKO_FALLBACK;
    if (!F) return;
    catTabs.hidden = true;
    const list = robuxFilter === 'all' ? F.PACKAGES : F.PACKAGES.filter((p) => p.group === robuxFilter);
    grid.innerHTML = list.map((p, i) => {
      const msg = `¡Hola NekoRBX! 🐾 Quiero comprar el paquete de ${fmt(p.robux)} Robux por COP $${fmt(p.cop)} (USD $${p.usd}).`;
      return `<article class="card" style="--i:${i}" data-group="${p.group}">
        ${F.TAGS[p.robux] ? `<span class="card__tag">${F.TAGS[p.robux]}</span>` : ''}
        <svg class="card__icon" aria-hidden="true"><use href="#i-robux" /></svg>
        <div class="card__amount">${fmt(p.robux)}</div>
        <div class="card__unit">Robux</div>
        <div class="card__divider"></div>
        <div class="card__cop">$ ${fmt(p.cop)} COP</div>
        <div class="card__usd">USD $${p.usd}</div>
        <a class="card__btn" href="${F.WHATSAPP}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">${esc(t('card.buy'))} <svg aria-hidden="true"><use href="#i-arrow" /></svg></a>
      </article>`;
    }).join('');
  }

  function renderOffers() {
    const box = $('offersLive');
    if (!catalog || !catalog.offers.length) { box.hidden = true; return; }
    const html = catalog.offers.map((o, i) => {
      const p = o.productId ? productById(o.productId) : null;
      if (p) return cardHtml(p, i, o);
      return `<article class="card card--product card--note" style="--i:${i}">
        <span class="card__glyph" aria-hidden="true"><svg><use href="#i-sparkle" /></svg></span>
        <div class="card__name">${esc(I.pick(o.title))}</div>
        ${I.pick(o.description) ? `<p class="card__desc">${esc(I.pick(o.description))}</p>` : ''}
        ${o.endsAt ? `<div class="card__unit mono">${esc(t('offers.until', { d: new Date(o.endsAt).toLocaleDateString(I.lang === 'en' ? 'en-US' : 'es-CO') }))}</div>` : ''}
      </article>`;
    }).join('');
    $('offersGrid').innerHTML = html;
    box.hidden = false;
  }

  async function loadCatalog() {
    try {
      const res = await fetch('/api/catalog', { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(String(res.status));
      catalog = await res.json();
      offline = false;
      const fromHash = new URLSearchParams(location.hash.split('?')[1] || '').get('cat');
      if (fromHash && catalog.categories.some((c) => c.slug === fromHash)) currentCat = fromHash;
      renderCatTabs();
    } catch {
      offline = true;
    }
    render();
    renderOffers();
    if (cart.items.length) requestQuote();
  }

  /* ---------- Eventos de la tienda ---------- */
  catTabs.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b || !catalog) return;
    currentCat = b.dataset.cat;
    robuxFilter = 'all';
    robuxTabs.querySelectorAll('.tab').forEach((x) => { x.classList.toggle('is-active', x.dataset.filter === 'all'); x.setAttribute('aria-selected', x.dataset.filter === 'all'); });
    renderCatTabs();
    render();
  });
  robuxTabs.addEventListener('click', (e) => {
    const b = e.target.closest('[data-filter]');
    if (!b) return;
    robuxFilter = b.dataset.filter;
    robuxTabs.querySelectorAll('.tab').forEach((x) => { x.classList.toggle('is-active', x === b); x.setAttribute('aria-selected', x === b); });
    render();
  });
  document.addEventListener('click', (e) => {
    const buy = e.target.closest('[data-buy]');
    const add = e.target.closest('[data-add]');
    if (buy) { if (addToCart(Number(buy.dataset.buy))) openCart(); }
    else if (add) {
      if (addToCart(Number(add.dataset.add))) {
        add.classList.add('is-done');
        add.lastChild.textContent = t('card.added');
        setTimeout(() => { add.classList.remove('is-done'); add.lastChild.textContent = t('card.add'); }, 1200);
        toast(`${nameOf(productById(Number(add.dataset.add)))} · ${t('card.added')}`);
      }
    }
  });

  /* ================= Panel del carrito ================= */
  const drawer = $('cart');
  const backdrop = $('cartBackdrop');
  const body = $('cartBody');

  function openCart() {
    drawer.classList.add('is-open');
    drawer.removeAttribute('inert');
    drawer.setAttribute('aria-hidden', 'false');
    backdrop.hidden = false;
    requestAnimationFrame(() => backdrop.classList.add('is-on'));
    $('cartBtn').setAttribute('aria-expanded', 'true');
    document.body.classList.add('no-scroll');
    renderCart();
    if (cart.items.length && !quote) requestQuote();
    setTimeout(() => $('cartClose').focus(), 50);
  }
  function closeCart() {
    drawer.classList.remove('is-open');
    drawer.setAttribute('inert', '');
    drawer.setAttribute('aria-hidden', 'true');
    backdrop.classList.remove('is-on');
    setTimeout(() => { backdrop.hidden = true; }, 250);
    $('cartBtn').setAttribute('aria-expanded', 'false');
    document.body.classList.remove('no-scroll');
  }
  $('cartBtn').addEventListener('click', openCart);
  $('cartClose').addEventListener('click', closeCart);
  backdrop.addEventListener('click', closeCart);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawer.classList.contains('is-open')) closeCart(); });

  let qTimer = null;
  let qSeq = 0;
  function requestQuote() {
    clearTimeout(qTimer);
    if (!cart.items.length) { quote = null; quoteError = ''; renderCart(); return; }
    qTimer = setTimeout(runQuote, 250);
  }
  async function runQuote(retry = 0) {
    const seq = ++qSeq;
    try {
      const q = await api('/api/cart/quote', { method: 'POST', body: { items: cart.items, code: cart.code || undefined } });
      if (seq !== qSeq) return;
      quote = q; quoteError = '';
    } catch (e) {
      if (seq !== qSeq) return;
      // Producto desactivado o eliminado: se retira del carrito y se recalcula.
      if ((e.code === 'product_unavailable' || e.code === 'product_not_found') && e.meta.productId && retry < 5) {
        cart.items = cart.items.filter((i) => i.productId !== e.meta.productId);
        saveCart();
        toast(t('cart.unavailable'));
        return cart.items.length ? runQuote(retry + 1) : renderCart();
      }
      if (e.code === 'quantity_exceeds_limit' && e.meta.productId && retry < 5) {
        const it = cart.items.find((i) => i.productId === e.meta.productId);
        if (it) { it.quantity = e.meta.max; saveCart(); return runQuote(retry + 1); }
      }
      if (e.code?.startsWith('code_')) {
        quoteError = errText(e);
        cart.code = '';
        saveCart();
        return runQuote(retry + 1).then(() => { quoteError = errText(e); renderCart(); });
      }
      quote = null;
      quoteError = errText(e);
    }
    renderCart();
  }

  function renderCart() {
    if (!body) return;
    if (lastOrder) return renderSuccess();
    if (!cart.items.length) {
      body.innerHTML = `<div class="cart-empty"><svg aria-hidden="true"><use href="#i-cart" /></svg><p>${esc(t('cart.empty'))}</p>
        <a href="#tienda" class="btn btn--pill btn--primary" data-close-cart>${esc(t('cart.browse'))}</a></div>`;
      return;
    }
    const lines = cart.items.map((it) => {
      const p = productById(it.productId);
      const ql = quote?.lines.find((l) => l.productId === it.productId);
      const name = p ? nameOf(p) : `#${it.productId}`;
      const max = p?.maxPerOrder ?? 10;
      return `<li class="cart-line">
        <span class="cart-line__icon" aria-hidden="true">${p?.robuxAmount ? '<svg><use href="#i-robux" /></svg>' : p?.imageUrl ? `<img src="${esc(p.imageUrl)}" alt="" />` : `<svg><use href="#${CAT_ICON[p?.icon] || 'i-sparkle'}" /></svg>`}</span>
        <span class="cart-line__info">
          <strong>${esc(name)}</strong>
          <span class="mono">${ql ? cop(ql.unitPriceCop) : p ? cop(p.priceCop) : ''}${p?.durationDays ? ` · ${esc(t('card.days', { n: p.durationDays }))}` : ''}</span>
        </span>
        <span class="qty" role="group" aria-label="${esc(t('cart.qty'))}">
          <button type="button" data-qty="-1" data-id="${it.productId}" aria-label="−" ${it.quantity <= 1 ? 'disabled' : ''}>−</button>
          <span class="mono">${it.quantity}</span>
          <button type="button" data-qty="1" data-id="${it.productId}" aria-label="+" ${it.quantity >= max ? 'disabled' : ''}>+</button>
        </span>
        <button type="button" class="cart-line__rm" data-rm="${it.productId}" aria-label="${esc(t('cart.remove'))}"><svg><use href="#i-trash" /></svg></button>
      </li>`;
    }).join('');
    const loggedIn = Boolean(auth.user || auth.session);
    body.innerHTML = `
      <ul class="cart-lines">${lines}</ul>
      <form class="cart-code" id="codeForm" autocomplete="off">
        <label for="codeInput" class="mono">${esc(t('cart.code'))}</label>
        <div class="cart-code__row">
          ${cart.code
            ? `<span class="cart-code__applied mono">${esc(t('cart.codeApplied', { c: cart.code }))}</span><button type="button" class="btn btn--pill btn--ghost" id="codeRemove">${esc(t('cart.removeCode'))}</button>`
            : `<input id="codeInput" class="input" maxlength="32" placeholder="NEKO" autocapitalize="characters" /><button class="btn btn--pill btn--border" type="submit">${esc(t('cart.apply'))}</button>`}
        </div>
        ${quoteError ? `<p class="form-error" role="alert">${esc(quoteError)}</p>` : ''}
      </form>
      <label class="cart-note"><span class="mono">${esc(t('cart.note'))}</span>
        <textarea id="cartNote" class="input" maxlength="300" rows="2" placeholder="${esc(t('cart.notePh'))}">${esc(sessionStorage.getItem('nekorbx.note') || '')}</textarea></label>
      <dl class="cart-sum">
        <div><dt>${esc(t('cart.subtotal'))}</dt><dd>${quote ? cop(quote.subtotalCop) : esc(t('cart.calc'))}</dd></div>
        ${quote?.discountCop ? `<div class="is-discount"><dt>${esc(t('cart.discount'))} (${esc(quote.discountCode)})</dt><dd>− ${cop(quote.discountCop)}</dd></div>` : ''}
        <div class="is-total"><dt>${esc(t('cart.total'))}</dt><dd>${quote ? cop(quote.totalCop) : '—'}</dd></div>
        ${quote && showUsd() && catalog ? `<div class="is-usd"><dt></dt><dd class="mono">${esc(t('card.usdApprox', { v: usd(quote.totalCop / catalog.settings.usdRate) }))}</dd></div>` : ''}
      </dl>
      <p class="cart-fine mono">${esc(t('cart.serverNote'))}${showUsd() ? ' ' + esc(t('cart.usdNote')) : ''}</p>
      <div class="cart-actions">
        ${loggedIn
          ? `<button type="button" class="btn btn--pill btn--primary" id="confirmOrder" ${!quote || busy ? 'disabled' : ''}>${esc(t('cart.confirm'))} <svg><use href="#i-arrow" /></svg></button>`
          : `<a class="btn btn--pill btn--primary" href="/acceso/?next=${encodeURIComponent('/#carrito')}">${esc(t('cart.loginToOrder'))} <svg><use href="#i-arrow" /></svg></a>`}
        <button type="button" class="btn btn--pill btn--ghost" id="clearCart">${esc(t('cart.clear'))}</button>
      </div>
      <p class="form-error" id="orderError" role="alert" hidden></p>`;
  }

  function renderSuccess() {
    const o = lastOrder;
    body.innerHTML = `<div class="cart-success">
      <span class="cart-success__icon" aria-hidden="true"><svg><use href="#i-shield" /></svg></span>
      <h3>${esc(t('cart.success'))}</h3>
      <button type="button" class="order-id mono" data-copy="${esc(o.id)}" title="${esc(t('cart.copy'))}">${esc(o.id)} <svg><use href="#i-copy" /></svg></button>
      <span class="status-pill" data-status="${esc(o.status)}">${esc(t('status.' + o.status))}</span>
      <p>${esc(t('cart.successSub'))}</p>
      <dl class="cart-sum">
        <div><dt>${esc(t('cart.subtotal'))}</dt><dd>${cop(o.subtotalCop)}</dd></div>
        ${o.discountCop ? `<div class="is-discount"><dt>${esc(t('cart.discount'))}${o.discountCode ? ` (${esc(o.discountCode)})` : ''}</dt><dd>− ${cop(o.discountCop)}</dd></div>` : ''}
        <div class="is-total"><dt>${esc(t('cart.total'))}</dt><dd>${cop(o.totalCop)}</dd></div>
      </dl>
      <a class="btn btn--pill btn--whatsapp" href="${esc(o.whatsappUrl)}" target="_blank" rel="noopener"><svg><use href="#i-whatsapp" /></svg> ${esc(t('cart.whatsapp'))}</a>
      <a class="btn btn--pill btn--ghost" href="/cuenta/#pedidos">${esc(t('cart.viewOrders'))}</a>
    </div>`;
  }

  body.addEventListener('click', async (e) => {
    const q = e.target.closest('[data-qty]');
    const rm = e.target.closest('[data-rm]');
    if (e.target.closest('[data-close-cart]')) return closeCart();
    if (q) {
      const it = cart.items.find((i) => i.productId === Number(q.dataset.id));
      const max = productById(it?.productId)?.maxPerOrder ?? 10;
      if (it) { it.quantity = Math.max(1, Math.min(max, it.quantity + Number(q.dataset.qty))); saveCart(); renderCart(); requestQuote(); }
    } else if (rm) {
      cart.items = cart.items.filter((i) => i.productId !== Number(rm.dataset.rm));
      saveCart(); renderCart(); requestQuote();
    } else if (e.target.closest('#clearCart')) {
      cart = { items: [], code: '', idem: uuid() };
      quote = null; quoteError = '';
      saveCart(); renderCart();
    } else if (e.target.closest('#codeRemove')) {
      cart.code = ''; quoteError = ''; saveCart(); requestQuote(); renderCart();
    } else if (e.target.closest('[data-copy]')) {
      const b = e.target.closest('[data-copy]');
      try { await navigator.clipboard.writeText(b.dataset.copy); toast(t('cart.copied')); } catch { /* */ }
    } else if (e.target.closest('#confirmOrder')) {
      confirmOrder();
    }
  });
  body.addEventListener('submit', (e) => {
    if (e.target.id !== 'codeForm') return;
    e.preventDefault();
    const v = ($('codeInput')?.value || '').trim().toUpperCase();
    if (!v) return;
    cart.code = v; quoteError = ''; saveCart(); requestQuote();
  });
  body.addEventListener('input', (e) => {
    if (e.target.id === 'cartNote') sessionStorage.setItem('nekorbx.note', e.target.value.slice(0, 300));
  });

  async function confirmOrder() {
    if (busy) return;
    busy = true;
    const btn = $('confirmOrder');
    if (btn) btn.disabled = true;
    const err = $('orderError');
    try {
      const res = await api('/api/orders', {
        method: 'POST',
        auth: 'required',
        body: { items: cart.items, code: cart.code || undefined, note: sessionStorage.getItem('nekorbx.note') || '', idempotencyKey: cart.idem },
      });
      lastOrder = res.order;
      cart = { items: [], code: '', idem: uuid() };
      quote = null;
      sessionStorage.removeItem('nekorbx.note');
      saveCart();
      renderCart();
    } catch (e) {
      if (e.code === 'unauthorized') { location.href = `/acceso/?next=${encodeURIComponent('/#carrito')}`; return; }
      if (e.code?.startsWith('code_') || e.code?.startsWith('product_') || e.code === 'quantity_exceeds_limit') { requestQuote(); }
      if (err) { err.hidden = false; err.textContent = errText(e); }
    } finally {
      busy = false;
      if (btn && document.body.contains(btn)) btn.disabled = false;
    }
  }

  /* ================= Inicio ================= */
  I.onChange(() => { renderCatTabs(); render(); renderOffers(); renderCart(); });
  auth.onChange(() => renderCart());
  window.addEventListener('storage', (e) => { if (e.key === CKEY) { cart = loadCart(); paintCount(); requestQuote(); } });
  paintCount();
  loadCatalog().then(() => { if (location.hash.startsWith('#carrito')) openCart(); });
})();
