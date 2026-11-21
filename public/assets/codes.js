(() => {
  'use strict';
  const { api, auth, esc, cop } = window.Neko;
  const list = document.getElementById('codeServices');
  const error = document.getElementById('codesError');
  let currentCode = '';
  async function load() {
    try {
      const {services} = await api('/api/codes',{auth:false});
      list.innerHTML = services.length ? services.map((s) => `<article class="card card--product"><span class="card__glyph"><svg><use href="/assets/icons.svg#i-sparkle" /></svg></span><div class="card__name">${esc(s.name)}</div>${s.description ? `<p class="card__desc">${esc(s.description)}</p>` : ''}<div class="card__divider"></div><div class="card__cop">${Number(s.price_cop) ? cop(s.price_cop) : 'Disponible'}</div><div class="card__unit">${Number(s.available) ? `${Number(s.available)} disponibles` : 'Agotado'}</div><button class="card__btn" data-claim="${esc(s.slug)}" ${!Number(s.available)?'disabled':''}>Solicitar código</button></article>`).join('') : '<p class="shop-empty">No hay servicios publicados por ahora.</p>';
    } catch { list.innerHTML='<p class="form-error">No se pudo cargar el catálogo de códigos.</p>'; }
  }
  list.addEventListener('click', async (event) => {
    const button=event.target.closest('[data-claim]'); if(!button) return;
    error.hidden=true;
    if(!auth.user) { location.href=`/acceso/?next=${encodeURIComponent('/codigos/')}`; return; }
    button.disabled=true;
    try {
      const {claim}=await api(`/api/codes/${encodeURIComponent(button.dataset.claim)}`,{method:'POST',auth:'required'});
      currentCode=claim.code;
      document.getElementById('claimTitle').textContent=`Código de ${claim.service}`;
      document.getElementById('claimCode').textContent=currentCode;
      document.getElementById('claimResult').hidden=false;
      document.getElementById('claimResult').scrollIntoView({behavior:'smooth',block:'center'});
      await load();
    } catch(e) {
      const messages={already_claimed:'Ya solicitaste el código de este servicio.',out_of_stock:'No quedan códigos disponibles.',rate_limited:'Alcanzaste el límite diario de solicitudes.',unauthorized:'Inicia sesión para solicitar un código.'};
      error.textContent=messages[e.code]||'No se pudo entregar el código. Inténtalo más tarde.'; error.hidden=false;
    } finally { button.disabled=false; }
  });
  document.getElementById('copyClaim').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(currentCode);document.getElementById('copyClaim').textContent='Copiado';}catch{}});
  load();
})();
