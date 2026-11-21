/* NekoRBX — textos de la interfaz (ES predeterminado / EN). Los nombres comerciales no se traducen. */
(() => {
  'use strict';
  const DICT = {
    es: {
      'nav.home': 'Inicio', 'nav.shop': 'Tienda', 'nav.offers': 'Ofertas', 'nav.social': 'Redes Sociales', 'nav.contact': 'Contacto',
      'nav.menu': 'Abrir menú', 'nav.cart': 'Abrir carrito', 'nav.order': 'Tu pedido', 'nav.login': 'Iniciar sesión', 'nav.account': 'Mi cuenta', 'nav.lang': 'Cambiar idioma',
      'hero.eyebrow': 'Tienda de Robux · Colombia',
      'hero.title': 'Robux, sin <span class="accent">complicaciones.</span>',
      'hero.sub': 'Elige tu paquete, realiza tu pedido y recibe tus Robux de forma rápida y segura.',
      'hero.cta': 'Ver paquetes', 'hero.write': 'Escríbenos', 'hero.fast': 'Entrega rápida', 'hero.safe': '100% seguro',
      'hero.tag': 'Más Robux,<br />más diversión.',
      'shop.title.robux': 'Paquetes de Robux', 'shop.sub.robux': 'Selecciona el paquete que necesitas.',
      'shop.sub.other': 'Elige tu suscripción.', 'shop.categories': 'Categorías de la tienda',
      'shop.all': 'Todos', 'shop.basic': 'Básicos', 'shop.medium': 'Medianos', 'shop.large': 'Grandes', 'shop.filter': 'Filtrar paquetes',
      'shop.empty': 'No hay productos disponibles en esta categoría por ahora.',
      'shop.offline': 'No pudimos cargar el catálogo en vivo. Mostrando los paquetes de Robux; escríbenos por WhatsApp para comprar.',
      'shop.custom.title': '¿Buscas otra cantidad o más paquetes?', 'shop.custom.sub': 'Escríbenos a nuestro WhatsApp y consulta el precio personalizado.', 'shop.custom.btn': 'Consultar por WhatsApp',
      'card.buy': 'Comprar', 'card.add': 'Añadir al carrito', 'card.added': '¡Añadido!', 'card.soldout': 'Agotado', 'card.days': '{n} días', 'card.usdApprox': '≈ USD ${v}',
      'card.regular': 'Antes', 'card.promo': 'Oferta', 'card.unit': 'Robux', 'card.featured': 'Destacado',
      'offers.title': 'Ofertas activas', 'offers.sub': 'Promociones vigentes por tiempo limitado.', 'offers.until': 'Hasta el {d}', 'offers.see': 'Ver producto',
      'offers.label': 'EXCLUSIVO COMUNIDAD', 'offers.discord.title': 'Ofertas Especiales y Sorteos <span>(Solo disponibles en Discord)</span>',
      'offers.discord.sub': 'Únete a la comunidad NekoRBX para enterarte primero de descuentos, códigos y sorteos de Robux.', 'offers.discord.btn': 'Unirme al Discord',
      'social.sub': 'Síguenos y habla con nosotros.', 'social.discord': 'Ofertas, sorteos y comunidad', 'social.whatsapp': 'WhatsApp Directo', 'social.tiktok': 'Videos y novedades', 'social.instagram': 'Historias y entregas', 'social.discordName': 'Discord Oficial',
      'footer.tagline': 'Tu tienda de Robux', 'footer.terms': 'Términos y condiciones', 'footer.privacy': 'Privacidad', 'footer.contact': 'Contáctanos',
      'footer.rights': '© 2026 NekoRBX. Todos los derechos reservados.', 'footer.disclaimer': 'NekoRBX no está afiliado a Roblox Corporation ni a los servicios mencionados. Las marcas pertenecen a sus respectivos dueños.',
      'cart.title': 'Tu carrito', 'cart.close': 'Cerrar carrito', 'cart.empty': 'Tu carrito está vacío.', 'cart.browse': 'Ver productos',
      'cart.remove': 'Eliminar', 'cart.qty': 'Cantidad', 'cart.subtotal': 'Subtotal', 'cart.discount': 'Descuento', 'cart.total': 'Total',
      'cart.code': 'Código de descuento', 'cart.apply': 'Aplicar', 'cart.removeCode': 'Quitar', 'cart.codeApplied': 'Código {c} aplicado',
      'cart.note': 'Nota para tu pedido (opcional)', 'cart.notePh': 'Ej.: usuario de Roblox o correo de la cuenta',
      'cart.confirm': 'Confirmar pedido', 'cart.clear': 'Vaciar carrito', 'cart.loginToOrder': 'Inicia sesión para confirmar tu pedido',
      'cart.calc': 'Calculando…', 'cart.serverNote': 'Los importes se calculan y validan en el servidor.', 'cart.usdNote': 'Precios en USD aproximados.',
      'cart.success': '¡Pedido creado!', 'cart.successSub': 'Tu pedido quedó en «Pendiente de pago». Continúa por WhatsApp para recibir el enlace de pago.',
      'cart.whatsapp': 'Continuar por WhatsApp', 'cart.viewOrders': 'Ver mis pedidos', 'cart.copy': 'Copiar ID', 'cart.copied': '¡Copiado!',
      'cart.unavailable': 'Algunos productos ya no están disponibles y se quitaron del carrito.',
      'status.pending_payment': 'Pendiente de pago', 'status.in_review': 'En revisión', 'status.payment_verified': 'Pago verificado', 'status.preparing': 'En preparación', 'status.delivered': 'Entregado', 'status.cancelled': 'Cancelado', 'status.refunded': 'Reembolsado',
      'auth.loginTitle': 'Iniciar sesión', 'auth.registerTitle': 'Crear cuenta', 'auth.recoverTitle': 'Recuperar contraseña', 'auth.resetTitle': 'Nueva contraseña',
      'auth.loginSub': 'Accede para confirmar pedidos y consultar tu historial.', 'auth.registerSub': 'Solo necesitamos tu nombre, correo y una contraseña.', 'auth.recoverSub': 'Te enviaremos un enlace para restablecer tu contraseña.', 'auth.resetSub': 'Escribe tu nueva contraseña.',
      'auth.name': 'Nombre o usuario', 'auth.email': 'Correo electrónico', 'auth.password': 'Contraseña', 'auth.password2': 'Repite la contraseña', 'auth.passwordHint': 'Mínimo 8 caracteres, con letras y números.',
      'auth.login': 'Entrar', 'auth.register': 'Registrarme', 'auth.recover': 'Enviar enlace', 'auth.reset': 'Guardar contraseña',
      'auth.toRegister': '¿No tienes cuenta? Regístrate', 'auth.toLogin': '¿Ya tienes cuenta? Inicia sesión', 'auth.forgot': '¿Olvidaste tu contraseña?', 'auth.back': 'Volver a la tienda',
      'auth.checkEmail': 'Te enviamos un correo para verificar tu cuenta. Abre el enlace para activarla.', 'auth.recoverSent': 'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.',
      'auth.verified': '¡Correo verificado! Ya iniciaste sesión.', 'auth.resetDone': 'Contraseña actualizada.', 'auth.logout': 'Cerrar sesión',
      'err.required': 'Completa todos los campos.', 'err.email': 'Escribe un correo válido.', 'err.password': 'La contraseña debe tener al menos 8 caracteres, con letras y números.', 'err.password2': 'Las contraseñas no coinciden.', 'err.name': 'El nombre debe tener entre 2 y 40 caracteres.',
      'err.invalid_grant': 'Correo o contraseña incorrectos.', 'err.not_confirmed': 'Debes verificar tu correo antes de iniciar sesión.', 'err.exists': 'Ya existe una cuenta con ese correo.', 'err.locked': 'Demasiados intentos. Espera {s} segundos.',
      'err.network': 'No hay conexión con el servidor. Inténtalo de nuevo.', 'err.server_error': 'Ocurrió un error. Inténtalo de nuevo.', 'err.unauthorized': 'Tu sesión expiró. Inicia sesión de nuevo.', 'err.forbidden': 'No tienes permiso para esta acción.',
      'err.rate_limited': 'Demasiadas solicitudes. Espera un momento.', 'err.token': 'El enlace no es válido o ya expiró.',
      'err.code_invalid': 'El código no existe.', 'err.code_inactive': 'El código no está activo.', 'err.code_expired': 'El código expiró.', 'err.code_not_started': 'El código aún no está vigente.', 'err.code_exhausted': 'El código alcanzó su límite de usos.', 'err.code_user_limit': 'Ya usaste este código el máximo de veces.', 'err.code_min_subtotal': 'El pedido no alcanza el mínimo para este código.', 'err.code_not_applicable': 'El código no aplica a los productos del carrito.',
      'err.product_unavailable': 'Un producto del carrito ya no está disponible.', 'err.product_not_found': 'Un producto del carrito ya no existe.', 'err.quantity_exceeds_limit': 'Superaste la cantidad máxima permitida de un producto.', 'err.cart_empty': 'Tu carrito está vacío.', 'err.too_many_pending_orders': 'Tienes demasiados pedidos pendientes. Págalos o cancélalos primero.',
      'err.order_not_found': 'No encontramos ese pedido en tu cuenta.', 'err.cannot_cancel': 'Este pedido ya no se puede cancelar.', 'err.invalid_length': 'Revisa la longitud del texto.',
      'acc.title': 'Mi cuenta', 'acc.sub': 'Tu información, tus pedidos y soporte.', 'acc.profile': 'Perfil', 'acc.orders': 'Mis pedidos', 'acc.support': 'Soporte',
      'acc.name': 'Nombre', 'acc.email': 'Correo', 'acc.since': 'Miembro desde', 'acc.save': 'Guardar', 'acc.saved': 'Guardado', 'acc.noOrders': 'Aún no tienes pedidos.', 'acc.search': 'Buscar por ID (NEKO-XXXXXX)',
      'acc.date': 'Fecha', 'acc.items': 'Productos', 'acc.details': 'Ver detalle', 'acc.hide': 'Ocultar', 'acc.history': 'Historial', 'acc.cancel': 'Cancelar pedido', 'acc.cancelConfirm': '¿Seguro que quieres cancelar este pedido?',
      'acc.reportPay': 'Ya pagué', 'acc.reference': 'Referencia o comprobante del pago', 'acc.send': 'Enviar', 'acc.supportText': '¿Tienes dudas con un pedido? Escríbenos por WhatsApp con tu ID de pedido.', 'acc.contact': 'Contactar soporte',
      'acc.admin': 'Panel administrativo', 'acc.loading': 'Cargando…',
    },
    en: {
      'nav.home': 'Home', 'nav.shop': 'Shop', 'nav.offers': 'Offers', 'nav.social': 'Social', 'nav.contact': 'Contact',
      'nav.menu': 'Open menu', 'nav.cart': 'Open cart', 'nav.order': 'Your order', 'nav.login': 'Sign in', 'nav.account': 'My account', 'nav.lang': 'Change language',
      'hero.eyebrow': 'Robux store · Colombia',
      'hero.title': 'Robux, without <span class="accent">the hassle.</span>',
      'hero.sub': 'Pick your package, place your order and get your Robux quickly and safely.',
      'hero.cta': 'See packages', 'hero.write': 'Message us', 'hero.fast': 'Fast delivery', 'hero.safe': '100% safe',
      'hero.tag': 'More Robux,<br />more fun.',
      'shop.title.robux': 'Robux packages', 'shop.sub.robux': 'Choose the package you need.',
      'shop.sub.other': 'Choose your subscription.', 'shop.categories': 'Store categories',
      'shop.all': 'All', 'shop.basic': 'Basic', 'shop.medium': 'Medium', 'shop.large': 'Large', 'shop.filter': 'Filter packages',
      'shop.empty': 'No products available in this category right now.',
      'shop.offline': "We couldn't load the live catalog. Showing Robux packages; message us on WhatsApp to buy.",
      'shop.custom.title': 'Looking for another amount or more packages?', 'shop.custom.sub': 'Message us on WhatsApp for a custom price.', 'shop.custom.btn': 'Ask on WhatsApp',
      'card.buy': 'Buy', 'card.add': 'Add to cart', 'card.added': 'Added!', 'card.soldout': 'Sold out', 'card.days': '{n} days', 'card.usdApprox': '≈ USD ${v}',
      'card.regular': 'Was', 'card.promo': 'Deal', 'card.unit': 'Robux', 'card.featured': 'Featured',
      'offers.title': 'Active offers', 'offers.sub': 'Limited-time promotions.', 'offers.until': 'Until {d}', 'offers.see': 'See product',
      'offers.label': 'COMMUNITY EXCLUSIVE', 'offers.discord.title': 'Special Offers & Giveaways <span>(Discord only)</span>',
      'offers.discord.sub': 'Join the NekoRBX community to be the first to hear about discounts, codes and Robux giveaways.', 'offers.discord.btn': 'Join the Discord',
      'social.sub': 'Follow us and talk to us.', 'social.discord': 'Offers, giveaways and community', 'social.whatsapp': 'Direct WhatsApp', 'social.tiktok': 'Videos and news', 'social.instagram': 'Stories and deliveries', 'social.discordName': 'Official Discord',
      'footer.tagline': 'Your Robux store', 'footer.terms': 'Terms and conditions', 'footer.privacy': 'Privacy', 'footer.contact': 'Contact us',
      'footer.rights': '© 2026 NekoRBX. All rights reserved.', 'footer.disclaimer': 'NekoRBX is not affiliated with Roblox Corporation or the services listed. Trademarks belong to their respective owners.',
      'cart.title': 'Your cart', 'cart.close': 'Close cart', 'cart.empty': 'Your cart is empty.', 'cart.browse': 'Browse products',
      'cart.remove': 'Remove', 'cart.qty': 'Quantity', 'cart.subtotal': 'Subtotal', 'cart.discount': 'Discount', 'cart.total': 'Total',
      'cart.code': 'Discount code', 'cart.apply': 'Apply', 'cart.removeCode': 'Remove', 'cart.codeApplied': 'Code {c} applied',
      'cart.note': 'Order note (optional)', 'cart.notePh': 'E.g. Roblox username or account email',
      'cart.confirm': 'Place order', 'cart.clear': 'Empty cart', 'cart.loginToOrder': 'Sign in to place your order',
      'cart.calc': 'Calculating…', 'cart.serverNote': 'Amounts are calculated and validated on the server.', 'cart.usdNote': 'USD prices are approximate.',
      'cart.success': 'Order created!', 'cart.successSub': 'Your order is "Pending payment". Continue on WhatsApp to receive the payment link.',
      'cart.whatsapp': 'Continue on WhatsApp', 'cart.viewOrders': 'View my orders', 'cart.copy': 'Copy ID', 'cart.copied': 'Copied!',
      'cart.unavailable': 'Some products are no longer available and were removed from your cart.',
      'status.pending_payment': 'Pending payment', 'status.in_review': 'In review', 'status.payment_verified': 'Payment verified', 'status.preparing': 'Preparing', 'status.delivered': 'Delivered', 'status.cancelled': 'Cancelled', 'status.refunded': 'Refunded',
      'auth.loginTitle': 'Sign in', 'auth.registerTitle': 'Create account', 'auth.recoverTitle': 'Reset password', 'auth.resetTitle': 'New password',
      'auth.loginSub': 'Sign in to place orders and see your history.', 'auth.registerSub': 'We only need your name, email and a password.', 'auth.recoverSub': "We'll email you a link to reset your password.", 'auth.resetSub': 'Enter your new password.',
      'auth.name': 'Name or username', 'auth.email': 'Email', 'auth.password': 'Password', 'auth.password2': 'Repeat password', 'auth.passwordHint': 'At least 8 characters, with letters and numbers.',
      'auth.login': 'Sign in', 'auth.register': 'Sign up', 'auth.recover': 'Send link', 'auth.reset': 'Save password',
      'auth.toRegister': "Don't have an account? Sign up", 'auth.toLogin': 'Already have an account? Sign in', 'auth.forgot': 'Forgot your password?', 'auth.back': 'Back to the store',
      'auth.checkEmail': 'We sent you an email to verify your account. Open the link to activate it.', 'auth.recoverSent': "If the email is registered, you'll receive a link to reset your password.",
      'auth.verified': 'Email verified! You are signed in.', 'auth.resetDone': 'Password updated.', 'auth.logout': 'Sign out',
      'err.required': 'Please fill in all fields.', 'err.email': 'Enter a valid email.', 'err.password': 'Password must be at least 8 characters, with letters and numbers.', 'err.password2': "Passwords don't match.", 'err.name': 'Name must be 2 to 40 characters.',
      'err.invalid_grant': 'Wrong email or password.', 'err.not_confirmed': 'Please verify your email before signing in.', 'err.exists': 'An account with that email already exists.', 'err.locked': 'Too many attempts. Wait {s} seconds.',
      'err.network': "Can't reach the server. Please try again.", 'err.server_error': 'Something went wrong. Please try again.', 'err.unauthorized': 'Your session expired. Please sign in again.', 'err.forbidden': "You don't have permission for this action.",
      'err.rate_limited': 'Too many requests. Please wait a moment.', 'err.token': 'The link is invalid or has expired.',
      'err.code_invalid': "That code doesn't exist.", 'err.code_inactive': 'That code is not active.', 'err.code_expired': 'That code has expired.', 'err.code_not_started': 'That code is not valid yet.', 'err.code_exhausted': 'That code has reached its usage limit.', 'err.code_user_limit': "You've used this code the maximum number of times.", 'err.code_min_subtotal': "Your order doesn't reach this code's minimum.", 'err.code_not_applicable': "That code doesn't apply to the products in your cart.",
      'err.product_unavailable': 'A product in your cart is no longer available.', 'err.product_not_found': 'A product in your cart no longer exists.', 'err.quantity_exceeds_limit': 'You exceeded the maximum quantity for a product.', 'err.cart_empty': 'Your cart is empty.', 'err.too_many_pending_orders': 'You have too many pending orders. Pay or cancel them first.',
      'err.order_not_found': "We couldn't find that order in your account.", 'err.cannot_cancel': 'This order can no longer be cancelled.', 'err.invalid_length': 'Check the text length.',
      'acc.title': 'My account', 'acc.sub': 'Your info, your orders and support.', 'acc.profile': 'Profile', 'acc.orders': 'My orders', 'acc.support': 'Support',
      'acc.name': 'Name', 'acc.email': 'Email', 'acc.since': 'Member since', 'acc.save': 'Save', 'acc.saved': 'Saved', 'acc.noOrders': "You don't have any orders yet.", 'acc.search': 'Search by ID (NEKO-XXXXXX)',
      'acc.date': 'Date', 'acc.items': 'Products', 'acc.details': 'View details', 'acc.hide': 'Hide', 'acc.history': 'History', 'acc.cancel': 'Cancel order', 'acc.cancelConfirm': 'Are you sure you want to cancel this order?',
      'acc.reportPay': 'I paid', 'acc.reference': 'Payment reference or receipt', 'acc.send': 'Send', 'acc.supportText': 'Questions about an order? Message us on WhatsApp with your order ID.', 'acc.contact': 'Contact support',
      'acc.admin': 'Admin panel', 'acc.loading': 'Loading…',
    },
  };

  const KEY = 'nekorbx.lang';
  let lang = (() => { try { return localStorage.getItem(KEY) === 'en' ? 'en' : 'es'; } catch { return 'es'; } })();
  const listeners = new Set();

  const t = (key, vars) => {
    let s = DICT[lang][key] ?? DICT.es[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
    return s;
  };

  function apply(root = document) {
    document.documentElement.lang = lang;
    root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    root.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); }); // solo textos propios del diccionario
    root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
      el.dataset.i18nAttr.split(';').forEach((pair) => {
        const [attr, key] = pair.split(':');
        if (attr && key) el.setAttribute(attr.trim(), t(key.trim()));
      });
    });
    root.querySelectorAll('[data-lang-label]').forEach((el) => { el.textContent = lang === 'es' ? 'EN' : 'ES'; });
  }

  function setLang(next) {
    lang = next === 'en' ? 'en' : 'es';
    try { localStorage.setItem(KEY, lang); } catch { /* sin almacenamiento */ }
    apply();
    listeners.forEach((fn) => fn(lang));
  }

  window.NekoI18n = {
    t, apply, setLang,
    get lang() { return lang; },
    toggle: () => setLang(lang === 'es' ? 'en' : 'es'),
    onChange: (fn) => listeners.add(fn),
    pick: (obj) => (obj ? obj[lang] || obj.es || '' : ''),
  };
})();
