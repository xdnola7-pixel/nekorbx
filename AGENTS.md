# AGENTS.md — NekoRBX

## Arquitectura
Sitio estático sin compilación. Netlify publica `public/` (ver `netlify.toml`). No hay backend: todas las compras se hacen por enlaces `wa.me` con el texto ya escrito.

## Archivos clave
- `public/assets/app.js`: un IIFE.
  - `PACKAGES` es la **única fuente de verdad** de cantidades y precios; las 21 tarjetas se renderizan desde ahí. Para editar precios, cambia este array, no el HTML.
  - Grupos: `basic` ≤ 500, `medium` ≤ 1700, `large` para el resto. Las etiquetas de las pestañas en `index.html` tienen los conteos y rangos escritos a mano, así que actualízalas si cambian los rangos.
  - `fmt()` usa "." como separador de miles (estilo colombiano) sin depender de la configuración regional. Los precios en USD son cadenas con coma decimal.
  - El mensaje de WhatsApp debe seguir el formato exacto: `¡Hola NekoRBX! 🐾 Quiero comprar el paquete de N Robux por COP $X (USD $Y).`
  - Gatito: un bucle `requestAnimationFrame` con `lerp` hacia el cursor; las clases `is-running` e `is-resting` (sin movimiento > 2 s) controlan las animaciones CSS. Las huellitas son elementos `.paw` que se eliminan solos en `animationend` (0,8 s). `oneko.js` se carga desde el CDN **solo como respaldo** si falla el gatito propio, para no mostrar dos gatos. En pantallas táctiles el gatito está desactivado.
- `public/assets/styles.css`: variables de color en `:root`. Los efectos hover de las tarjetas están en `.card*`.
- Los íconos son `<symbol>` SVG en línea al inicio de `index.html` (`#i-robux`, `#i-discord`, etc.).

## Convenciones
- Todo el texto visible está en español.
- Paleta: fondo #07060b, tarjetas #111018, bordes #222030, acento #8b5cf6, Discord #5865F2.
- Mantener JS puro, sin dependencias ni paso de compilación.
