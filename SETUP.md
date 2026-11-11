# Puesta en marcha de LEVÍTICO Streetwear

Esta guía te lleva desde cero hasta la tienda publicada, con catálogo real y pedidos por WhatsApp. Se hace una sola vez y no cuesta nada en el plan gratuito.

Tiempo estimado: 30–40 minutos.

> **Estado actual:** `config.js` ya tiene los datos reales de la tienda y el proyecto de Supabase creado. Lo que falta es ejecutar `supabase/schema.sql` (paso 2) y crear el usuario administrador (paso 3). Los pasos 1 y 4 quedan como referencia por si algún día cambias de proyecto.

---

## 1. Crea el proyecto en Supabase

1. Entra a [supabase.com](https://supabase.com) y crea una cuenta (puedes usar GitHub o tu correo).
2. Pulsa **New project**.
3. Elige un nombre (por ejemplo `levitico`), una contraseña segura para la base de datos y la región más cercana (`South America (São Paulo)` es la habitual para Colombia).
4. Espera un par de minutos mientras se crea.

## 2. Crea las tablas y los permisos

1. En el menú izquierdo abre **SQL Editor**.
2. Pulsa **New query**.
3. Abre el archivo `supabase/schema.sql` de este proyecto, cópialo completo y pégalo en el editor.
4. Pulsa **Run** (o `Ctrl + Enter`).

El script crea las tablas `productos`, `pedidos` y `suscriptores`, activa las reglas de seguridad (RLS) y prepara el espacio de almacenamiento `productos`. Puedes volver a ejecutarlo sin romper nada.

Al terminar, comprueba en **Table Editor** que aparecen las tres tablas vacías.

## 3. Crea tu usuario administrador

1. Abre **Authentication → Users**.
2. Pulsa **Add user → Create new user**.
3. Escribe tu correo real y una contraseña de al menos 8 caracteres.
4. Marca la opción de confirmar el correo automáticamente (o confirma el enlace que llegue a tu bandeja).

Ese usuario es el único que puede entrar al panel. No hay registro público: nadie más puede crearse una cuenta.

> Guarda el correo y la contraseña. Son el acceso a `admin.html`.

## 4. Copia la URL y la clave pública

1. Ve a **Project Settings → API**.
2. Copia **Project URL** (algo como `https://abcdefghijklmno.supabase.co`).
3. Copia la clave **anon public**.

Abre `config.js` y completa:

```js
window.LEVITICO_CONFIG = {
  marca: 'LEVÍTICO',
  ciudad: 'Armenia',
  horario: 'Lun a sáb, 9:00 a.m. – 6:00 p.m. · Dom, 9:00 a.m. – 2:00 p.m.',

  whatsapp: '573237402006',              // solo dígitos, con indicativo del país
  email: 'soporte@leviticostreetwear.com',
  instagram: '',                          // sin @, o déjalo vacío

  supabaseUrl: 'https://TU-PROYECTO.supabase.co',
  supabaseAnonKey: 'TU-CLAVE-PUBLICA'
};
```

Qué es cada dato:

| Campo | Formato | Para qué sirve |
| --- | --- | --- |
| `ciudad` | Texto | Aparece en el hero y en el texto de la tienda |
| `horario` | Texto libre | Horario de atención del pie (se oculta si está vacío) |
| `whatsapp` | Solo dígitos, con indicativo del país. Colombia: `57` + 10 dígitos | Botón **Finalizar por WhatsApp** y contacto del pie |
| `email` | Correo completo | Enlace de contacto del pie (se oculta si está vacío) |
| `instagram` | Usuario sin `@` | Enlace de Instagram del pie (se oculta si está vacío) |
| `supabaseUrl` | `https://…supabase.co` | Conectar la tienda con la base de datos |
| `supabaseAnonKey` | Clave **publishable** (`sb_publishable_…`) o la `anon` antigua (`eyJ…`) | Clave pública de Supabase |

La clave pública es segura de exponer: las reglas del punto 2 limitan qué puede hacer un visitante. **Nunca pongas la clave `service_role` ni una `secret` en este archivo.**

## 5. Prueba en local

```powershell
python -m http.server 8123
```

- Tienda: `http://localhost:8123/`
- Panel: `http://localhost:8123/admin.html`

Entra al panel con el correo y la contraseña del punto 3. Carga tu primer producto con foto, precio y tallas. Mientras el catálogo esté vacío, la tienda muestra el estado «Próximamente».

Si algo falla, el panel lo dice con un mensaje concreto: configuración incompleta, permisos sin ejecutar o archivo demasiado grande.

## 6. Publica en internet

La tienda es estática: no necesita compilación ni servidor propio. Cualquiera de estas opciones es gratuita y admite dominio propio.

> **Ya está publicado.** Tienda: https://levitico-streetwear.vercel.app · Código: https://github.com/juansebproproinsano-source/levitico-streetwear. Los pasos siguientes quedan como referencia para volver a desplegar o cambiar de cuenta.

### GitHub + Vercel (recomendado)

1. Crea un repositorio vacío en GitHub (por ejemplo `levitico-streetwear`), sin README ni licencia.
2. Desde la carpeta del proyecto:

   ```powershell
   git remote add origin https://github.com/TU-USUARIO/levitico-streetwear.git
   git branch -M main
   git push -u origin main
   ```

3. Entra a [vercel.com](https://vercel.com), pulsa **Add New → Project** e importa ese repositorio.
4. Configuración del proyecto: **Framework Preset: Other**, sin *Build Command*, *Output Directory* en la raíz (`.`), *Root Directory* sin tocar.
5. Pulsa **Deploy**. En un minuto tendrás una URL `https://levitico-streetwear.vercel.app`.

Para que cada `git push` a `main` vuelva a publicar solo, conecta el repositorio desde el panel de Vercel: **Project → Settings → Git → Connect Git Repository**. La cuenta de Vercel debe tener acceso al repositorio de GitHub (autoriza la Vercel GitHub App sobre `levitico-streetwear`). Mientras no esté conectado, publica a mano con `vercel --prod`.

El archivo `vercel.json` añade cabeceras de seguridad y caché larga para las imágenes de `assets/`.

También puedes desplegar sin GitHub, desde la terminal:

```powershell
npm i -g vercel
vercel login
vercel --prod
```

### Netlify (alternativa)

1. Entra a [netlify.com](https://www.netlify.com) y crea una cuenta.
2. En el panel, arrastra la carpeta completa del proyecto a la zona de despliegue.
3. Netlify te da una URL del tipo `https://levitico.netlify.app`.

También puedes conectar el repositorio de GitHub. El archivo `netlify.toml` ya está configurado para publicar la carpeta raíz.

### Dominio propio

En Vercel o Netlify, abre la configuración de dominios y añade `leviticostreetwear.com`. Te dan los registros DNS que debes pegar en tu proveedor del dominio. El certificado HTTPS se genera solo.

> Cuando cambies de dominio, no necesitas tocar `config.js`: la URL de Supabase es independiente del dominio de la tienda.

## 7. Páginas del sitio

| Archivo | Qué es |
| --- | --- |
| `index.html` | Tienda: catálogo, drops, newsletter y carrito |
| `terminos.html` | Términos y Condiciones (texto legal del operador) |
| `admin.html` | Panel privado de administración |
| `config.js` | Único archivo con datos de la tienda |

El enlace a los términos aparece en el pie, en las notas del carrito y en la ficha de producto. Si editas el texto legal, cambia también la fecha de «Última actualización» en la cabecera de `terminos.html`.

## 8. Rutina del día a día

- **Publicar una prenda:** panel → llenar formulario → subir foto → *Guardar producto*. Aparece de inmediato en la tienda.
- **Marcar agotada una talla:** editar el producto y tocar el chip de la talla.
- **Quitar del catálogo sin borrar:** botón *Ocultar*. El producto queda archivado y puedes volver a publicarlo.
- **Eliminar de verdad:** botón *Eliminar* (pide confirmación en dos toques). También borra la foto del almacenamiento.
- **Revisar pedidos:** sección **Pedidos recientes**. Es el respaldo escrito de cada pedido enviado por WhatsApp; la conversación y el pago se cierran en WhatsApp.

## Problemas frecuentes

**«Faltan la URL y la clave pública de Supabase»**
`config.js` está vacío o no se guardó. Complétalo y recarga.

**El panel no entra y dice que el correo no está confirmado**
En Supabase, **Authentication → Users**, confirma el usuario o créalo con la confirmación automática.

**«La base de datos rechazó el cambio»**
No se ejecutó `supabase/schema.sql` completo. Vuelve al paso 2 y ejecútalo de nuevo.

**La foto no sube**
Debe ser JPG, PNG o WebP de menos de 12 MB. La compresión es automática; si falla, prueba con otra imagen.

**El correo del newsletter dice que ya estaba en la lista**
Es correcto: cada correo se guarda una sola vez.

**La tienda carga pero no muestra productos**
El catálogo está vacío o los productos están ocultos. Entra al panel y publica el primero.
