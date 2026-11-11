# LEVÍTICO Streetwear

Tienda de streetwear conceptual («Viste tu Fe») construida con HTML, CSS y JavaScript puros, sin paso de compilación. El catálogo, las fotos, los pedidos y la lista de correos viven en Supabase; los pedidos se cierran por WhatsApp.

**Tienda publicada:** https://levitico-streetwear.vercel.app
**Código:** https://github.com/juansebproproinsano-source/levitico-streetwear
**Términos:** https://levitico-streetwear.vercel.app/terminos.html

> Antes de abrir al público falta ejecutar `supabase/schema.sql` en Supabase y crear el usuario administrador. La guía paso a paso está en [`SETUP.md`](SETUP.md).

## Cómo verla en local

Desde la carpeta del proyecto:

```powershell
python -m http.server 8123
```

Luego abre `http://localhost:8123/`. La tienda y el panel (`/admin.html`) funcionan con cualquier servidor estático.

## Estructura

```
index.html        Tienda
terminos.html     Términos y Condiciones
styles.css        Sistema de diseño y estilos de la tienda
script.js         Lógica de la tienda (menú, filtros, ficha, carrito)
config.js         Tus datos: WhatsApp, correo, horario, ciudad y claves de Supabase
store.js          Capa de datos compartida (Supabase, precios COP, carrito)
admin.html        Panel de administración
admin.css         Estilos del panel
admin.js          Lógica del panel (sesión, CRUD, subida de archivos)
fonts.css         Tipografías autoalojadas
assets/           Fotografías y fuentes
supabase/
  schema.sql      Tablas, permisos y almacenamiento — se ejecuta una vez
SETUP.md          Guía de instalación y publicación
vercel.json       Cabeceras de seguridad y caché para Vercel
netlify.toml      Configuración de despliegue en Netlify
```

## Qué es real y qué no

Lo que ya funciona de verdad:

- **Catálogo y fotos en Supabase.** Los productos se publican desde el panel y aparecen en la tienda en cualquier dispositivo.
- **Acceso al panel con Supabase Auth.** Correo y contraseña; el usuario administrador lo creas tú en Supabase. No hay registro público.
- **Pedidos por WhatsApp.** El cliente arma el carrito y el botón abre WhatsApp con el detalle del pedido listo para enviar. Cada pedido queda además registrado en la tabla `pedidos` como respaldo.
- **Lista de correos.** El formulario del newsletter guarda el correo en la tabla `suscriptores`.

Lo que no incluye:

- Cobro con tarjeta dentro del sitio. El pago se coordina en la conversación de WhatsApp: efectivo contra entrega en Armenia y zonas aledañas, transferencia bancaria a la cuenta autorizada o pasarela de pago autorizada.
- Cuentas de cliente, historial de compras o seguimiento de envíos.
- Inventario automático: el estado de cada producto y sus tallas los actualizas tú desde el panel.

## Panel de administración

Ruta: `admin.html`. Está enlazado discretamente en el pie de la tienda.

Funciones:

- **Crear, editar, publicar, ocultar y eliminar** productos (camiseta, pantalón, chaqueta, sudadera, gorra, accesorio, otro).
- **Foto obligatoria** con compresión automática antes de subirla al almacenamiento.
- **Video opcional** (MP4/WebM, hasta 50 MB).
- **Tallas por tipo de prenda**: XS–XXL en prendas, 28–36 en pantalones, única en gorras y accesorios. Cada talla se marca como disponible o agotada.
- **Precio y precio anterior en COP**, estado (disponible / últimas unidades / agotado) y etiquetas (nuevo, edición limitada).
- **Pedidos recientes** registrados desde el checkout por WhatsApp.

## Tienda

- Menú desplegable **Tienda** con paneles por columnas en escritorio (Nuevo, Hombre, Mujer, Gorras, Accesorios) y acordeón en móvil; al elegir una categoría se filtra el catálogo.
- Filtros por categoría, búsqueda en vivo y favoritos.
- Ficha de producto con foto o video, selector de tallas —las agotadas aparecen tachadas y deshabilitadas— y validación al añadir al carrito.
- Carrito lateral con cantidades, subtotal y checkout por WhatsApp.
- Precios con `Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' })`.
- Si el catálogo está vacío, la tienda muestra un estado «Próximamente» en lugar de una rejilla vacía.

## Términos y Condiciones

`terminos.html` recoge el texto legal del operador (LEVÍTICO Streetwear S.A.S.) en nueve secciones: aspectos generales, productos y drops, precios y pagos, envíos, cambios y garantías, propiedad intelectual, responsabilidad, modificaciones y contacto.

La página es independiente de `script.js`: solo carga `styles.css` y `fonts.css`, así que funciona aunque Supabase esté caído. Está enlazada desde el pie de la tienda, desde el carrito y desde la ficha de producto. Si cambias el texto, actualiza también la fecha de «Última actualización» en la cabecera.

## Dónde se guardan los datos

| Dato | Dónde | Quién puede leerlo |
| --- | --- | --- |
| Productos | Supabase, tabla `productos` | Todos (solo los publicados); el administrador ve todo |
| Fotos y videos | Supabase Storage, bucket `productos` | Lectura pública; escritura solo con sesión |
| Pedidos | Supabase, tabla `pedidos` | Solo el administrador puede leerlos |
| Correos del newsletter | Supabase, tabla `suscriptores` | Solo el administrador |
| Carrito y favoritos | `localStorage` del visitante | Solo ese navegador |

## Sistema de diseño

Los tokens están en `:root` dentro de `styles.css`:

| Token | Valor | Uso |
| --- | --- | --- |
| `--bg-base` | `#080808` | Fondo |
| `--bg-surface` | `#121212` | Tarjetas y paneles |
| `--bg-elevated` | `#1E1E1E` | Menús y elementos elevados |
| `--amarillo` | `#FFDE00` | Acento y CTA |
| `--amarillo-hover` | `#E6C800` | Hover del acento |
| `--texto` / `--texto-2` | `#FFFFFF` / `#A1A1AA` | Texto principal y secundario |
| `--exito` / `--alerta` / `--aviso` | `#22C55E` / `#EF4444` / `#F97316` | Estados |

Tipografías: *Permanent Marker* para la marca, *Bebas Neue* para titulares y precios, *Inter* para la interfaz. Todas autoalojadas en `assets/fonts` (sin CDN).

## Accesibilidad y detalles

- Navegación por teclado con foco visible, cierre con `Escape` y trampa de foco en la ficha de producto.
- Etiquetas ARIA en menús, filtros, tallas y carrito.
- `prefers-reduced-motion` desactiva animaciones.
- Rejilla de 2 columnas en móvil sin desbordamiento horizontal; 4 columnas en escritorio.
