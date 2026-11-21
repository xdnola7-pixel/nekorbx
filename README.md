# NekoRBX

## Códigos digitales (Robux y otros servicios)

La página de códigos está en `/codigos/` y la administración del inventario en `/admin/codigos.html` (primero inicia sesión en `/admin/`). Desde ese panel puedes crear servicios, configurar su nombre/descripción/precio y cargar los códigos auténticos manualmente. El inventario se guarda en PostgreSQL; el sitio nunca fabrica códigos canjeables.

Cada cliente debe iniciar sesión, puede solicitar un código por servicio y el servidor lo entrega de forma atómica una sola vez. La API pública no expone los códigos disponibles. Las cargas administrativas se limitan a 500 por solicitud y las acciones quedan registradas en auditoría.

## Activación en Netlify

1. Publica/mezcla la rama de esta función en la rama que Netlify despliega.
2. Aplica la migración `netlify/database/migrations/20261121120000_add_gift_code_inventory/migration.sql` a la base PostgreSQL conectada al sitio (una vez).
3. Verifica que Netlify Identity y la variable de conexión de base de datos existentes sigan configuradas.
4. Inicia sesión en `/admin/`, abre `/admin/codigos.html`, crea un servicio y carga códigos reales.
5. Comparte `/codigos/` con los clientes.

La pantalla de administración está separada del panel general para no modificar sus rutas existentes; protege sus APIs con la misma sesión de administrador del panel.
