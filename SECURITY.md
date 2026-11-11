# Seguridad de LEVÍTICO Streetwear

Qué se aplicó, dónde vive cada defensa y qué quedó fuera porque no aplica a esta tienda.
Última revisión: 11 de noviembre de 2026.

## Cómo está hecha la tienda (y por qué algunas cosas no aplican)

El sitio son tres páginas estáticas (`index.html`, `terminos.html`, `admin.html`) más archivos JS y CSS. **No hay servidor propio**: Vercel solo entrega archivos y Supabase (PostgreSQL + Auth + Storage) guarda los datos. Esa arquitectura decide qué protecciones tienen sentido: las que dependen de un backend propio (sesiones en cookie, CSRF, webhooks, IA) no existen aquí, y las demás se resuelven en tres sitios: `vercel.json`, las reglas RLS de `supabase/schema.sql` y el código del panel.

La clave que se publica en `config.js` (`sb_publishable_…`) es pública a propósito. **El candado real no es esa clave, son las reglas RLS**: sin sesión de un administrador de la lista blanca, la base rechaza cualquier escritura.

## Los 19 puntos

| # | Punto | Estado |
| --- | --- | --- |
| 1 | HSTS | ✅ `vercel.json` |
| 2 | Tokens CSRF | — no aplica |
| 3 | Restablecer sesiones | ✅ botón **Salir** |
| 4 | Caducar enlaces | ✅ por diseño |
| 5 | Evitar enumeración | ✅ panel y newsletter |
| 6 | Lista blanca | ✅ tabla `administradores` |
| 7 | Verificar webhooks | — no aplica |
| 8 | Fijar precios en el servidor | ✅ función `registrar_pedido()` |
| 9 | Bloquear prompt injection | — no aplica |
| 10 | Limitar uso de IA | — no aplica |
| 11 | Limitar solicitudes | ✅ `limitar_solicitudes()` |
| 12 | Limitar recuperaciones | ✅ sin recuperación pública |
| 13 | Sanitizar datos | ✅ RLS + JS + `CHECK` |
| 14 | Restringir CORS | ✅ same-origin |
| 15 | Deshabilitar directorios | ✅ `.vercelignore` |
| 16 | Eliminar rutas admin | ✅ sin enlace, `noindex` |
| 17 | Bloquear intentos fallidos | ✅ panel + Supabase Auth |
| 18 | Registrar eventos | ✅ tabla `eventos` |
| 19 | Cookies seguras | ✅ no hay cookies |

## 1. Transporte y cabeceras (`vercel.json`)

Se aplican a **todas** las respuestas:

- **HSTS**: `max-age=63072000; includeSubDomains; preload` — el navegador no vuelve a hablar por `http://` en dos años.
- **CSP** (Content-Security-Policy): `default-src 'self'` y listas blancas explícitas. Scripts solo del propio sitio y de `cdn.jsdelivr.net` (la librería de Supabase). Estilos, fuentes e imágenes locales, más el dominio de Supabase para fotos y videos. `frame-ancestors 'none'` y `object-src 'none'`: nadie puede incrustar la tienda en un iframe ni cargar plugins.
- **`X-Frame-Options: DENY`** como respaldo para navegadores antiguos.
- **`X-Content-Type-Options: nosniff`**: el navegador no adivina tipos de archivo.
- **`Referrer-Policy: strict-origin-when-cross-origin`**: al salir a WhatsApp no se filtra la URL completa.
- **`Permissions-Policy`**: cámara, micrófono, geolocalización, pago, USB y sensores desactivados.
- **`Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`, `X-Permitted-Cross-Domain-Policies`**: aislamiento entre pestañas y bloqueo de contenido cruzado.

La CSP se cumple sin excepciones: no hay ni un `<script>` escrito dentro del HTML (el año del pie vive en `anio.js`), no hay `<style>` en línea, no hay `onclick=` ni `onerror=`, y las tres únicas etiquetas `style="…"` que quedaban se pasaron a clases CSS (`.e-linea--larga`, `.fila-prod__antes`). Por eso `script-src` y `style-src` no necesitan `'unsafe-inline'`. Verificado con `qa/qa-csp.js`, que inyecta la política real en las tres páginas y comprueba que no hay violaciones.

## 2. Acceso al panel

- **Lista blanca de administradores** (punto 6). La tabla `administradores` guarda el correo autorizado y la función `es_admin()` compara con el `email` del token. Todas las políticas de `productos`, `pedidos`, `suscriptores`, `eventos` y del bucket usan `es_admin()`; ya no basta con «cualquier usuario autenticado». Si algún día creas otro usuario en Authentication y no lo añades a esa tabla, podrá iniciar sesión pero no verá ni tocará nada.
- **Un solo mensaje de error** (punto 5). Cualquier fallo de acceso dice «Correo o contraseña incorrectos.», sin distinguir entre correo inexistente, contraseña mala o cuenta sin confirmar.
- **Bloqueo por intentos fallidos** (punto 17). A partir del quinto fallo el botón queda deshabilitado con una espera que se duplica (30 s, 1 min, 2 min… hasta 15 min) y no se libera ni escribiendo la contraseña correcta. El contador se guarda en `localStorage` (`levitico.admin.intentos`) y se borra al acertar.
  - Límite honesto: es una defensa de navegador; alguien que borre el almacenamiento local la salta. La barrera real contra la fuerza bruta es la de Supabase Auth, que limita los intentos por IP desde su lado. Por eso la contraseña del administrador debe ser larga y única.
- **Sesión que caduca sola** (punto 3). A los 20 minutos sin actividad se cierra la sesión y se avisa en pantalla.
- **Salir cierra en todos los dispositivos.** `cerrarTodasLasSesiones()` usa `signOut({ scope: 'global' })`, que revoca los tokens de refresco: si alguien copió la sesión, deja de servir. El cierre automático por inactividad usa `scope: 'local'` para no echar otras pestañas del mismo dueño.

## 3. Pedidos y precios

- **El total lo calcula la base de datos** (punto 8). El navegador solo manda `id`, `talla` y `cantidad`; la función `registrar_pedido()` lee el precio y el nombre reales de `productos`, comprueba que el producto siga activo y no agotado, recorta las cantidades a 1–20 y suma. Un carrito manipulado desde la consola no cambia lo que queda registrado. Verificado en `qa/qa-seguridad.js`: precio falseado a 1 COP y cantidad 999 → se guarda 149.900 × 20.
- **El visitante no puede escribir en `pedidos`.** Se eliminó la política de inserción pública; la única puerta es la función, con `security definer`.
- **El newsletter no delata correos** (punto 5). `suscribir_email()` responde igual exista o no la dirección (`on conflict do nothing`), y la tienda muestra siempre el mismo mensaje. Nadie puede averiguar qué direcciones están apuntadas.

## 4. Límites y registro

- **Límite por IP** (punto 11). Un trigger `before insert` cuenta las filas recientes de la misma IP: **5 pedidos por 10 minutos** y **3 altas de newsletter por 10 minutos**. Al pasarse, la base lanza un error que la tienda traduce a «Demasiados intentos seguidos. Espera unos minutos.» y anota el bloqueo.
  - La IP sale de las cabeceras de la petición (`cf-connecting-ip`, `x-real-ip` o `x-forwarded-for`) mediante `ip_solicitante()`.
- **Sin recuperación de contraseña pública** (punto 12). El panel no tiene formulario de «olvidé mi contraseña» ni enlaces mágicos, así que no hay nada que limitar: la contraseña se cambia desde el panel de Supabase, y esos enlaces caducan solos.
- **Registro de eventos** (punto 18). La tabla `eventos` guarda accesos correctos y fallidos, cierres de sesión, caducidad por inactividad, altas, ediciones, publicaciones, ocultaciones, borrados, pedidos creados y bloqueos por límite. Tiene RLS: **solo el administrador la lee y nadie puede escribirla desde el navegador** (se escribe desde funciones con permisos elevados). No hay políticas de `update` ni `delete`, así que el rastro no se puede alterar desde fuera.

## 5. Datos y archivos

- **Sanitización en tres capas** (punto 13): límites `CHECK` en la base (largos máximos, enums cerrados, URLs que empiezan por `https://`), `limpiar()` en `store.js` (quita caracteres de control, recorta y limita el largo de cada campo) y escape al pintar (`esc()` en la tienda, `textContent` en el panel).
- **Lista blanca de URLs.** `urlSegura()` solo acepta rutas internas, el dominio de este Supabase o el propio dominio. Se aplica al guardar y al leer, así que una URL pegada en el panel no puede cargar contenido de otro sitio. Rechaza `javascript:`, `data:`, `http://` sin cifrar y cualquier dominio ajeno.
- **Subidas acotadas.** Solo JPG, PNG, WebP, MP4 y WebM de menos de 50 MB, con la misma lista aplicada en el bucket (`allowed_mime_types`, `file_size_limit`).
- **Bucket público de lectura.** Las fotos se sirven por URL pública, igual que cualquier tienda: no subas documentos privados al bucket `productos`.
- **CSP estricta** (arriba) protege los tokens de sesión guardados en `localStorage`, que es donde los deja la librería de Supabase en este modo. No hay XSS por script en línea porque esa vía está cerrada.

## 6. Rutas y exposición

- **`.vercelignore`** (puntos 15 y 16): `supabase/`, `*.md`, `.env*`, `publicar.*`, `netlify.toml`, `node_modules/` y metadatos de git no se despliegan. `supabase/schema.sql` no es accesible por URL.
- **`robots.txt`** desautoriza `/admin`, `/admin.html` y `/supabase/`.
- **`X-Robots-Tag: noindex, nofollow, noarchive, nosnippet`** y `Cache-Control: no-store` en `/admin.html` y `/admin`.
- **El panel ya no está enlazado** en la tienda ni en los términos. Se entra escribiendo la dirección a mano o desde un marcador.
- **`cleanUrls` y `trailingSlash: false`**: una sola URL canónica por página; no hay listados de directorio que revelen archivos.
- Los archivos internos no existen en el despliegue, así que pedirlos devuelve 404 en lugar de servir su contenido.

## Lo que no aplica, y por qué

**2. Tokens CSRF.** No hay cookies de sesión ni formularios que un servidor propio procese. Supabase usa tokens JWT enviados en una cabecera `Authorization`, que un sitio externo no puede leer ni replicar (y el `SameSite` de las cookies no interviene porque no hay cookies). El riesgo de CSRF requiere acción con cookie ambiental; aquí no existe. Además `form-action 'self'` en la CSP evita que un formulario de la página envíe datos a otro dominio.

**7. Verificar webhooks.** La tienda no recibe webhooks: no hay pagos en línea ni integraciones entrantes. El pedido se cierra por WhatsApp y la confirmación la das tú.

**9 y 10. Prompt injection y uso de IA.** El sitio no usa modelos de lenguaje ni recibe texto para que una IA lo interprete. No hay superficie que proteger.

**14. CORS.** El sitio es estático y se sirve del mismo origen; no hay API propia que abrir o cerrar. Se añadieron `Cross-Origin-Resource-Policy: same-origin` y `Cross-Origin-Opener-Policy: same-origin`. El endpoint de Supabase acepta peticiones de cualquier origen por diseño (es un servicio multiinquilino), pero sin sesión válida y sin pasar RLS no devuelve ni escribe nada.

**19. Cookies seguras.** La tienda no crea cookies: ni analítica, ni sesión, ni preferencias. Todo lo que se guarda en el visitante vive en `localStorage` (carrito y favoritos) y la sesión del panel la gestiona Supabase. Si algún día añades algo que use cookies, deben llevar `Secure`, `HttpOnly` y `SameSite=Lax` o `Strict`.

## Lo que tienes que hacer tú en Supabase

Estas tres cosas no se pueden hacer desde el código; son de panel:

1. **Ejecutar `supabase/schema.sql`** en SQL Editor. Sin eso, la tienda sigue en «Próximamente» y las tablas devuelven 404.
2. **Crear el usuario administrador** en Authentication → Users con el **mismo correo** que quedó en la tabla `administradores` (por defecto `soporte@leviticostreetwear.com`). Si usas otro, edita la línea marcada `-- >>> CORREO DEL ADMINISTRADOR <<<` antes de ejecutar el script.
3. **Revisar los límites de Auth** en Authentication → Rate Limits. Los valores por defecto ya protegen; si vas a abrir el panel desde redes compartidas, bájalos.

## Límites conocidos (para que no haya sorpresas)

- El bloqueo de intentos es de navegador y se puede saltar borrando `localStorage`. La barrera real es la contraseña fuerte más los límites de Supabase Auth.
- El límite por IP depende de las cabeceras de la petición. Un atacante detrás de un proxy que las reescriba podría repartir solicitudes entre IPs falsas; el límite frena abusos casuales y bots simples, no un ataque distribuido dirigido.
- Las fotos del catálogo son públicas por definición (todo el mundo debe verlas).
- Si publicas la clave `service_role` o cualquier `secret` de Supabase en `config.js`, todas estas defensas dejan de valer. Esa clave nunca va en el navegador.
