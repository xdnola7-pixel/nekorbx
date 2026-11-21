(() => {
  'use strict';

  const WHATSAPP = 'https://wa.me/573247359023';

  /* ============================================================
   * Paquetes de Robux (cantidad, COP, USD) — copia de respaldo.
   * La fuente de verdad ahora es la base de datos (tabla products),
   * editable desde /admin sin redesplegar.
   * ============================================================ */
  const PACKAGES = [
    [50, 2500, '0,79'], [100, 5000, '1,58'], [150, 7000, '2,21'], [200, 10000, '3,16'],
    [300, 13100, '4,14'], [400, 17100, '5,41'], [500, 19500, '6,17'],
    [600, 24500, '7,75'], [800, 32500, '10,28'], [1000, 40900, '12,93'], [1200, 48000, '15,18'],
    [1300, 53000, '16,76'], [1500, 60400, '19,10'], [1700, 67500, '21,34'],
    [2000, 78800, '24,92'], [2500, 98300, '31,08'], [2800, 110400, '34,91'], [3000, 124700, '39,43'],
    [3500, 138200, '43,70'], [4000, 160700, '50,82'], [4500, 180100, '56,95'],
  ].map(([robux, cop, usd]) => ({
    robux, cop, usd,
    group: robux <= 500 ? 'basic' : robux <= 1700 ? 'medium' : 'large',
  }));

  const TAGS = { 400: 'Popular', 1000: 'Top', 4500: 'Mejor valor' };

  // Respaldo: si la API del catálogo no responde, shop.js muestra estos paquetes
  // con el enlace directo de WhatsApp de siempre. Los precios en vivo vienen de la base de datos.
  window.NEKO_FALLBACK = { WHATSAPP, PACKAGES, TAGS };

  /* ---------- Menú móvil ---------- */
  const burger = document.getElementById('burger');
  const menu = document.getElementById('menu');
  if (burger && menu) {
    burger.addEventListener('click', () => {
      const open = menu.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', open);
    });
    menu.addEventListener('click', (e) => {
      if (e.target.closest('a')) { menu.classList.remove('is-open'); burger.setAttribute('aria-expanded', 'false'); }
    });
  }

  /* ---------- Enlace activo según la sección visible ---------- */
  const links = [...document.querySelectorAll('.nav__link')];
  const sections = links.map((l) => { const h = l.getAttribute('href') || ''; return /^#[\w-]+$/.test(h) ? document.querySelector(h) : null; }).filter(Boolean);
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        links.forEach((l) => l.classList.toggle('is-active', l.getAttribute('href') === `#${en.target.id}`));
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach((s) => io.observe(s));
  }

  /* ============================================================
   * Gatito que persigue el cursor (requestAnimationFrame + lerp)
   * ============================================================ */
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function loadOnekoFallback() {
    if (document.querySelector('script[data-oneko]')) return;
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/gh/adryd325/oneko.js@main/oneko.js';
    s.dataset.oneko = '';
    s.dataset.cat = 'https://cdn.jsdelivr.net/gh/adryd325/oneko.js@main/oneko.gif';
    document.body.appendChild(s);
  }

  function initNeko() {
    const neko = document.getElementById('neko');
    if (!neko || typeof requestAnimationFrame !== 'function') throw new Error('neko unavailable');

    const PAW_SVG = '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="15.5" rx="5" ry="4.3" fill="currentColor"/><ellipse cx="5.6" cy="10" rx="2.1" ry="2.7" fill="currentColor"/><ellipse cx="9.6" cy="5.8" rx="2.1" ry="2.8" fill="currentColor"/><ellipse cx="14.4" cy="5.8" rx="2.1" ry="2.8" fill="currentColor"/><ellipse cx="18.4" cy="10" rx="2.1" ry="2.7" fill="currentColor"/></svg>';
    const LERP = 0.085;
    const REST_AFTER = 2000;
    const PAW_STEP = 34;

    const target = { x: innerWidth / 2, y: innerHeight / 2 };
    const pos = { x: target.x, y: target.y };
    let tilt = 0;
    let facing = 1;
    let lastMove = performance.now();
    let travelled = 0;
    let pawSide = 1;
    let started = false;

    const lerp = (a, b, t) => a + (b - a) * t;

    function spawnPaw(x, y, angle) {
      const paw = document.createElement('div');
      paw.className = 'paw';
      const off = 6 * pawSide;
      pawSide *= -1;
      const ox = Math.cos(angle + Math.PI / 2) * off;
      const oy = Math.sin(angle + Math.PI / 2) * off;
      paw.style.transform = `translate(${x + ox}px, ${y + oy}px) rotate(${angle + Math.PI / 2}rad)`;
      paw.innerHTML = PAW_SVG;
      document.body.appendChild(paw);
      paw.addEventListener('animationend', () => paw.remove(), { once: true });
    }

    window.addEventListener('mousemove', (e) => {
      target.x = e.clientX;
      target.y = e.clientY;
      lastMove = performance.now();
      if (!started) {
        started = true;
        pos.x = target.x - 80;
        pos.y = target.y + 40;
        neko.classList.add('is-ready');
      }
    }, { passive: true });
    document.addEventListener('mouseleave', () => { lastMove = 0; });

    function frame(now) {
      const prevX = pos.x;
      const prevY = pos.y;
      // El gatito se detiene un poco antes del cursor para no taparlo
      const dx = target.x - pos.x;
      const dy = target.y - pos.y;
      const dist = Math.hypot(dx, dy);
      const stopAt = 26;
      if (dist > stopAt) {
        const k = (dist - stopAt) / dist;
        pos.x = lerp(pos.x, pos.x + dx * k, LERP);
        pos.y = lerp(pos.y, pos.y + dy * k, LERP);
      }

      const vx = pos.x - prevX;
      const vy = pos.y - prevY;
      const speed = Math.hypot(vx, vy);
      const running = speed > 0.6;

      if (Math.abs(vx) > 0.4) facing = vx > 0 ? -1 : 1;
      tilt = lerp(tilt, Math.max(-18, Math.min(18, vx * 1.6)), 0.15);

      const resting = started && now - lastMove > REST_AFTER && !running;
      neko.classList.toggle('is-running', running);
      neko.classList.toggle('is-resting', resting);

      neko.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0) rotate(${resting ? 0 : tilt}deg) scaleX(${facing})`;

      if (running && !reduceMotion) {
        travelled += speed;
        if (travelled >= PAW_STEP) {
          travelled = 0;
          spawnPaw(pos.x, pos.y + 4, Math.atan2(vy, vx));
        }
      }

      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  if (finePointer) {
    try { initNeko(); } catch (err) { loadOnekoFallback(); }
  }

})();
