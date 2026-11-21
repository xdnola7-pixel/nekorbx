# NekoRBX

NekoRBX es el sitio web de una tienda de Robux. Los visitantes ven 21 paquetes con precios en COP y USD, los filtran por tamaño y compran con un clic: se abre WhatsApp con un mensaje ya escrito que incluye los datos exactos del paquete. Las ofertas y sorteos se publican en el Discord de la comunidad.

## Tecnologías

- HTML, CSS y JavaScript puro, sin framework ni paso de compilación
- Netlify como hosting estático (`netlify.toml` publica la carpeta `public/`)
- Fuentes Inter y JetBrains Mono (Google Fonts)

## Ejecutar en local

```bash
npx netlify dev --port 8889
# o cualquier servidor estático, por ejemplo:
npx serve public
```

## Estructura

- `public/index.html`: página principal (navbar, hero, tienda, ofertas, redes, footer)
- `public/assets/styles.css`: tema, animaciones y diseño responsivo
- `public/assets/app.js`: datos de los paquetes, tarjetas, pestañas de filtro, menú y gatito que persigue el cursor
- `public/terminos.html`, `public/privacidad.html`: páginas legales

## Pendiente

- Cambiar los enlaces de TikTok e Instagram (en `public/index.html`, atributo `data-social`) por los perfiles reales.
