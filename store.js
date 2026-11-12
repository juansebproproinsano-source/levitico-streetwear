/* ==========================================================================
   LEVÍTICO STREETWEAR — store.js
   Capa de datos compartida por la tienda (index.html) y el panel (admin.html).

   - Catálogo, pedidos y suscriptores en Supabase (PostgREST)
   - Fotos y videos en Supabase Storage (bucket "productos")
   - Sesión de administrador con Supabase Auth
   - Formato de precios en COP, utilidades de tallas y filtros
   - Carrito y favoritos locales (propios de cada visitante)
   ========================================================================== */
(function (global) {
  'use strict';

  /* ------------------------------ Configuración ------------------------------ */

  var RAW = global.LEVITICO_CONFIG || {};

  var CONFIG = {
    marca: RAW.marca || 'LEVÍTICO',
    marcaCompleta: RAW.marcaCompleta || 'LEVÍTICO STREETWEAR',
    claim: RAW.claim || 'Viste tu Fe',
    ciudad: RAW.ciudad || 'Armenia',
    horario: RAW.horario || '',
    whatsapp: String(RAW.whatsapp || '').replace(/\D/g, ''),
    email: String(RAW.email || '').trim(),
    instagram: String(RAW.instagram || '').replace(/^@/, '').trim(),
    supabaseUrl: String(RAW.supabaseUrl || '').trim().replace(/\/+$/, ''),
    supabaseAnonKey: String(RAW.supabaseAnonKey || '').trim()
  };

  var BUCKET = 'productos';
  var CARRITO_KEY = 'levitico:carrito:v2';
  var FAVS_KEY = 'levitico:favoritos:v2';

  /* --------------------------------- Tipos ---------------------------------- */

  var TIPOS = [
    { id: 'camiseta', label: 'Camiseta', tallas: ['XS', 'S', 'M', 'L', 'XL', 'XXL'] },
    { id: 'pantalon', label: 'Pantalón', tallas: ['28', '30', '32', '34', '36'] },
    { id: 'chaqueta', label: 'Chaqueta', tallas: ['S', 'M', 'L', 'XL', 'XXL'] },
    { id: 'sudadera', label: 'Sudadera', tallas: ['XS', 'S', 'M', 'L', 'XL', 'XXL'] },
    { id: 'gorra', label: 'Gorra', tallas: ['Única'] },
    { id: 'accesorio', label: 'Accesorio', tallas: ['Única'] },
    { id: 'otro', label: 'Otro', tallas: ['S', 'M', 'L', 'XL'] }
  ];

  var PUBLICOS = [
    { id: 'hombre', label: 'Hombre' },
    { id: 'mujer', label: 'Mujer' },
    { id: 'unisex', label: 'Unisex' }
  ];

  var ESTADOS = [
    { id: 'disponible', label: 'Disponible' },
    { id: 'ultimas', label: 'Últimas unidades' },
    { id: 'agotado', label: 'Agotado' }
  ];

  var CATEGORIAS = [
    { id: 'nuevo', label: 'Nuevo' },
    { id: 'hombre', label: 'Hombre' },
    { id: 'mujer', label: 'Mujer' },
    { id: 'gorras', label: 'Gorras' },
    { id: 'accesorios', label: 'Accesorios' }
  ];

  /* ------------------------------- Utilidades ------------------------------- */

  function tallasDe(tipo) {
    var t = TIPOS.filter(function (x) { return x.id === tipo; })[0];
    return t ? t.tallas.slice() : ['S', 'M', 'L', 'XL'];
  }

  function tipoLabel(tipo) {
    var t = TIPOS.filter(function (x) { return x.id === tipo; })[0];
    return t ? t.label : 'Producto';
  }

  function publicoLabel(p) {
    var x = PUBLICOS.filter(function (y) { return y.id === p; })[0];
    return x ? x.label : 'Unisex';
  }

  var formatoCOP = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0
  });

  function precioCOP(valor) {
    var n = Number(valor);
    if (!isFinite(n)) n = 0;
    // Intl devuelve "$ 149.900" — se normaliza el espacio duro a uno normal
    return formatoCOP.format(n).replace(/\u00a0/g, ' ');
  }

  function idUnico(prefijo) {
    var base = (prefijo || 'p') + '-' + Date.now().toString(36);
    var azar = Math.random().toString(36).slice(2, 8);
    return base + '-' + azar;
  }

  /**
   * Limpia un texto que viene de fuera: quita caracteres de control, recorta
   * espacios y limita el largo. No escapa HTML (de eso se encarga esc() en la
   * tienda y textContent en el panel).
   */
  function limpiar(texto, maximo) {
    return String(texto == null ? '' : texto)
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .trim()
      .slice(0, maximo || 500);
  }

  /**
   * Lista blanca de URLs para fotos y videos.
   * Solo se aceptan rutas internas, archivos de Supabase Storage de este
   * proyecto o rutas relativas. Cualquier otro dominio se descarta, así un
   * enlace pegado en el panel no puede cargar contenido ajeno.
   */
  var dominioSupabase = String(CONFIG.supabaseUrl || '')
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .toLowerCase();

  function urlSegura(valor) {
    var texto = String(valor == null ? '' : valor).trim();
    if (!texto) return '';

    // Ruta relativa del propio sitio (assets/..., ./foto.jpg).
    if (/^(?!\/\/)[./]/.test(texto) || /^assets\//.test(texto) || /^[\w-]+\.(jpg|jpeg|png|webp|mp4|webm|svg)$/i.test(texto)) {
      return texto;
    }

    var url;
    try {
      url = new URL(texto, global.location.href);
    } catch (err) {
      return '';
    }

    if (url.protocol !== 'https:') return '';

    var host = url.hostname.toLowerCase();
    if (host === dominioSupabase) return url.href;
    if (global.location && host === global.location.hostname.toLowerCase()) return url.href;

    return '';
  }

  /** Tipos de archivo que se pueden subir al bucket. */
  var MIMES_PERMITIDOS = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/webm'
  ];

  var TAMANO_MAXIMO = 50 * 1024 * 1024; // 50 MB, igual que el bucket

  /** Cuántas fotos y videos admite cada producto. */
  var MAX_FOTOS = 6;
  var MAX_VIDEOS = 2;

  /**
   * Convierte lo que venga de la base de datos (array, texto suelto o nada)
   * en una lista de URLs permitidas, sin vacías ni repetidas.
   */
  function listaUrls(valor) {
    var bruto = Array.isArray(valor) ? valor : (valor ? [valor] : []);
    var vistos = Object.create(null);
    var salida = [];

    bruto.forEach(function (elemento) {
      var limpia = urlSegura(elemento);
      if (limpia && !vistos[limpia]) {
        vistos[limpia] = true;
        salida.push(limpia);
      }
    });

    return salida;
  }

  /* ------------------------------- Encuadres -------------------------------- */

  /* Punto de enfoque (x, y en % del recuadro) y acercamiento (z, 1 = entero).
     Se guardan por foto y los respeta la tienda al recortar. */
  var ENCUADRE_BASE = { x: 50, y: 50, z: 1 };
  var ZOOM_MAXIMO = 2.5;

  /** Normaliza un encuadre suelto; devuelve null si no hay nada que usar. */
  function encuadreValido(valor) {
    if (!valor || typeof valor !== 'object') return null;

    var x = Number(valor.x);
    var y = Number(valor.y);
    var z = Number(valor.z);
    if (!isFinite(x) && !isFinite(y) && !isFinite(z)) return null;

    return {
      x: Math.min(100, Math.max(0, isFinite(x) ? x : 50)),
      y: Math.min(100, Math.max(0, isFinite(y) ? y : 50)),
      z: Math.min(ZOOM_MAXIMO, Math.max(1, isFinite(z) ? z : 1))
    };
  }

  /** Lista de encuadres alineada con las fotos; rellena con el centro. */
  function listaEncuadres(lista, cuantos) {
    var bruto = Array.isArray(lista) ? lista : [];
    var total = Number(cuantos) || 0;
    var salida = [];

    for (var i = 0; i < total; i++) {
      salida.push(encuadreValido(bruto[i]) || { x: 50, y: 50, z: 1 });
    }
    return salida;
  }

  /** Encuadre de una foto concreta ya guardada, o el centro si no tiene. */
  function encuadreEn(producto, indice) {
    var lista = producto && Array.isArray(producto.encuadres) ? producto.encuadres : [];
    return encuadreValido(lista[indice]) || { x: 50, y: 50, z: 1 };
  }

  /**
   * Aplica un encuadre a una imagen mediante variables CSS.
   * Se usa CSSOM (no el atributo style) para no chocar con la CSP.
   */
  function aplicarEncuadre(el, enc) {
    if (!el || !el.style) return;
    var e = encuadreValido(enc) || ENCUADRE_BASE;
    el.classList.add('img-encuadre');
    el.style.setProperty('--enc-x', e.x + '%');
    el.style.setProperty('--enc-y', e.y + '%');
    el.style.setProperty('--enc-z', String(e.z));
  }

  /* ---------------------------- Cliente Supabase ---------------------------- */

  var clienteCache = null;

  /** ¿Está todo listo para hablar con la base de datos? */
  function configurado() {
    if (!CONFIG.supabaseUrl || !CONFIG.supabaseAnonKey) {
      return { ok: false, motivo: 'sin-config' };
    }
    if (!/^https?:\/\//i.test(CONFIG.supabaseUrl)) {
      return { ok: false, motivo: 'url-invalida' };
    }
    if (!global.supabase || typeof global.supabase.createClient !== 'function') {
      return { ok: false, motivo: 'sin-libreria' };
    }
    return { ok: true, motivo: '' };
  }

  function cliente() {
    if (clienteCache) return clienteCache;
    var estado = configurado();
    if (!estado.ok) {
      throw new Error('Supabase no está configurado (' + estado.motivo + ').');
    }
    clienteCache = global.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
    return clienteCache;
  }

  /* -------------------------------- Catálogo -------------------------------- */

  var cache = [];
  var cargado = false;

  /** Fila de la base de datos → producto de la aplicación. */
  function desdeFila(f) {
    // Las listas mandan; si una fila vieja solo trae una portada, se usa esa.
    var imagenes = listaUrls(f.imagenes);
    if (!imagenes.length) imagenes = listaUrls(f.imagen_url);

    var videos = listaUrls(f.videos);
    if (!videos.length) videos = listaUrls(f.video_url);

    return {
      id: f.id,
      nombre: f.nombre || '',
      tipo: f.tipo || 'camiseta',
      publico: f.publico || 'unisex',
      precio: Number(f.precio) || 0,
      precioAnterior: Number(f.precio_anterior) || 0,
      estado: f.estado || 'disponible',
      nuevo: !!f.nuevo,
      limitado: !!f.limitado,
      color: f.color || '',
      descripcion: f.descripcion || '',
      imagenes: imagenes,
      encuadres: listaEncuadres(f.encuadres, imagenes.length),
      videos: videos,
      imagen: imagenes[0] || '',
      video: videos[0] || '',
      sizes: Array.isArray(f.tallas) ? f.tallas : [],
      activo: f.activo !== false,
      orden: Number(f.orden) || 0
    };
  }

  /** Producto de la aplicación → fila para la base de datos. */
  function afila(p) {
    var fotos = listaUrls(p.imagenes);
    if (!fotos.length) fotos = listaUrls(p.imagen);
    fotos = fotos.slice(0, MAX_FOTOS);

    var videos = listaUrls(p.videos);
    if (!videos.length) videos = listaUrls(p.video);
    videos = videos.slice(0, MAX_VIDEOS);

    var encuadres = listaEncuadres(p.encuadres, fotos.length);

    return {
      nombre: limpiar(p.nombre, 120),
      tipo: p.tipo || 'camiseta',
      publico: p.publico || 'unisex',
      precio: Math.round(Number(p.precio) || 0),
      precio_anterior: Math.round(Number(p.precioAnterior) || 0),
      estado: p.estado || 'disponible',
      nuevo: !!p.nuevo,
      limitado: !!p.limitado,
      color: limpiar(p.color, 40) || 'Negro',
      descripcion: limpiar(p.descripcion, 2000),
      // La portada se guarda también en las columnas sueltas: así la usan
      // la tarjeta, el carrito y cualquier consulta antigua.
      imagen_url: fotos[0] || '',
      video_url: videos[0] || '',
      imagenes: fotos,
      encuadres: encuadres,
      videos: videos,
      tallas: (Array.isArray(p.sizes) ? p.sizes : [])
        .map(function (t) {
          if (t && typeof t === 'object') {
            return { label: limpiar(t.label, 12), disponible: !!t.disponible };
          }
          return { label: limpiar(t, 12), disponible: true };
        })
        .filter(function (t) { return t.label; })
        .slice(0, 12),
      activo: p.activo === undefined ? true : !!p.activo,
      orden: Math.round(Number(p.orden) || 0)
    };
  }

  /**
   * Descarga el catálogo y lo deja en memoria.
   * @param {{incluirOcultos?: boolean}} opciones
   * @returns {Promise<Array>}
   */
  function cargarProductos(opciones) {
    var estado = configurado();
    if (!estado.ok) {
      return Promise.reject(new Error('Supabase no está configurado (' + estado.motivo + ').'));
    }

    var incluirOcultos = !!(opciones && opciones.incluirOcultos);
    var consulta = cliente().from('productos').select('*');
    if (!incluirOcultos) consulta = consulta.eq('activo', true);
    consulta = consulta
      .order('orden', { ascending: true })
      .order('creado_en', { ascending: false });

    return Promise.resolve(consulta).then(function (res) {
      if (res.error) {
        // La tabla todavía no existe (falta ejecutar supabase/schema.sql).
        // La tienda se muestra vacía en lugar de romperse.
        if (faltaEsquema(res.error)) {
          console.warn(
            'LEVÍTICO: la tabla "productos" no existe en Supabase. ' +
            'Abre el SQL Editor del proyecto y ejecuta supabase/schema.sql completo.'
          );
          cache = [];
          cargado = true;
          return [];
        }
        throw res.error;
      }
      var filas = Array.isArray(res.data) ? res.data : [];
      cache = filas.map(desdeFila);
      cargado = true;
      return cache.slice();
    });
  }

  /** ¿El error dice que falta la tabla (esquema sin ejecutar)? */
  function faltaEsquema(err) {
    var codigo = String((err && err.code) || '');
    var texto = String((err && err.message) || '');
    if (codigo === 'PGRST205' || codigo === '42P01') return true;
    return /could not find the table|does not exist|schema cache/i.test(texto);
  }

  /** Copia del catálogo ya descargado (lectura síncrona). */
  function listar() {
    return cache.slice();
  }

  function estaCargado() {
    return cargado;
  }

  function obtenerProducto(id) {
    return cache.filter(function (p) { return p.id === id; })[0] || null;
  }

  /** Crea o actualiza un producto. Devuelve el producto guardado. */
  function guardarProducto(producto) {
    var fila = afila(producto);
    var consulta = producto.id
      ? cliente().from('productos').update(fila).eq('id', producto.id).select().single()
      : cliente().from('productos').insert(fila).select().single();

    return Promise.resolve(consulta).then(function (res) {
      if (res.error) throw res.error;
      return desdeFila(res.data);
    });
  }

  /** Elimina el producto de forma permanente. */
  function eliminarProducto(id) {
    return Promise.resolve(cliente().from('productos').delete().eq('id', id)).then(function (res) {
      if (res.error) throw res.error;
      return true;
    });
  }

  /** Publica u oculta un producto sin borrarlo. */
  function cambiarActivo(id, activo) {
    return Promise.resolve(
      cliente().from('productos').update({ activo: !!activo }).eq('id', id)
    ).then(function (res) {
      if (res.error) throw res.error;
      return true;
    });
  }

  /* --------------------------------- Sesión --------------------------------- */

  function sesion() {
    if (!configurado().ok) return Promise.resolve(null);
    return Promise.resolve(cliente().auth.getSession()).then(function (res) {
      return res && res.data ? res.data.session || null : null;
    });
  }

  function iniciarSesion(email, clave) {
    return Promise.resolve(
      cliente().auth.signInWithPassword({ email: String(email || '').trim(), password: clave })
    ).then(function (res) {
      if (res.error) throw res.error;
      return res.data.session;
    });
  }

  function cerrarSesion() {
    // scope 'local': cierra esta pestaña y deja las demás abiertas.
    return Promise.resolve(cliente().auth.signOut({ scope: 'local' }))
      .catch(function () { return null; })
      .then(function () { return true; });
  }

  /**
   * Cierra la sesión en TODOS los dispositivos y revoca los tokens de
   * refresco. Sirve para cuando una contraseña pudo haberse visto.
   */
  function cerrarTodasLasSesiones() {
    return Promise.resolve(cliente().auth.signOut({ scope: 'global' }))
      .catch(function () { return null; })
      .then(function () { return true; });
  }

  function alCambiarSesion(callback) {
    var res = cliente().auth.onAuthStateChange(function (evento, s) {
      callback(evento, s);
    });
    // supabase-js v2 devuelve { data: { subscription } }
    return res && res.data ? res.data.subscription : null;
  }

  /* ------------------------------ Medios (Storage) -------------------------- */

  function extensionDe(mime) {
    if (/jpeg|jpg/.test(mime)) return 'jpg';
    if (/png/.test(mime)) return 'png';
    if (/webp/.test(mime)) return 'webp';
    if (/mp4/.test(mime)) return 'mp4';
    if (/webm/.test(mime)) return 'webm';
    return 'bin';
  }

  /** Comprime una imagen a JPEG antes de subirla (máx. 1200 px lado mayor). */
  function comprimirImagen(archivo, maxLado, calidad) {
    maxLado = maxLado || 1200;
    calidad = calidad || 0.82;
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var url = URL.createObjectURL(archivo);
      img.onload = function () {
        var escala = Math.min(1, maxLado / Math.max(img.width, img.height));
        var lienzo = document.createElement('canvas');
        lienzo.width = Math.round(img.width * escala);
        lienzo.height = Math.round(img.height * escala);
        var ctx = lienzo.getContext('2d');
        ctx.fillStyle = '#0b0b0b';
        ctx.fillRect(0, 0, lienzo.width, lienzo.height);
        ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
        URL.revokeObjectURL(url);
        lienzo.toBlob(function (blob) {
          if (blob) resolve(blob);
          else reject(new Error('No se pudo comprimir la imagen'));
        }, 'image/jpeg', calidad);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('No se pudo leer la imagen'));
      };
      img.src = url;
    });
  }

  /**
   * Sube un archivo al bucket y devuelve su URL pública.
   * Solo se aceptan imágenes/vídeos de la lista blanca y menos de 50 MB.
   * @returns {Promise<{url: string, ruta: string}>}
   */
  function subirArchivo(archivo, opciones) {
    if (!archivo) return Promise.reject(new Error('No hay archivo.'));

    var tipo = String(archivo.type || '').toLowerCase();
    if (MIMES_PERMITIDOS.indexOf(tipo) === -1) {
      return Promise.reject(new Error('Formato no permitido. Usa JPG, PNG, WEBP, MP4 o WEBM.'));
    }

    if (Number(archivo.size) > TAMANO_MAXIMO) {
      return Promise.reject(new Error('El archivo pasa de 50 MB.'));
    }

    var comprimir = !opciones || opciones.comprimir !== false;
    var preparado = (comprimir && /^image\//.test(tipo))
      ? comprimirImagen(archivo)
      : Promise.resolve(archivo);

    return preparado.then(function (blob) {
      var tipoFinal = String(blob.type || tipo || '').toLowerCase();
      if (MIMES_PERMITIDOS.indexOf(tipoFinal) === -1) {
        throw new Error('Formato no permitido. Usa JPG, PNG, WEBP, MP4 o WEBM.');
      }

      var ruta = 'productos/' + idUnico('m') + '.' + extensionDe(tipoFinal);
      var sb = cliente();

      return Promise.resolve(
        sb.storage.from(BUCKET).upload(ruta, blob, { contentType: tipoFinal, upsert: false })
      ).then(function (res) {
        if (res.error) throw res.error;
        var publica = sb.storage.from(BUCKET).getPublicUrl(ruta);
        return { url: publica.data.publicUrl, ruta: ruta };
      });
    });
  }

  /** Borra del bucket el archivo al que apunta una URL pública. */
  function borrarArchivo(url) {
    if (!url || !configurado().ok) return Promise.resolve(false);
    var marca = '/object/public/' + BUCKET + '/';
    var i = String(url).indexOf(marca);
    if (i === -1) return Promise.resolve(false);
    var ruta = String(url).slice(i + marca.length);

    return Promise.resolve(cliente().storage.from(BUCKET).remove([ruta]))
      .then(function (res) { return !res.error; })
      .catch(function () { return false; });
  }

  /* --------------------------- Pedidos y newsletter ------------------------- */

  /**
   * Registra el pedido en la base de datos.
   *
   * El total NO se envía desde el navegador: lo calcula la función
   * registrar_pedido() de PostgreSQL con los precios guardados en la tabla
   * "productos". Si alguien edita el carrito o la consola, el precio que queda
   * registrado sigue siendo el real.
   *
   * @param {Array} items  líneas del carrito ({ id, talla, cantidad })
   * @returns {Promise<object|false>}
   */
  function registrarPedido(items) {
    if (!configurado().ok) return Promise.resolve(false);

    var lineas = (items || []).map(function (i) {
      return {
        id: String(i.id || ''),
        talla: limpiar(i.talla, 12),
        cantidad: Math.max(1, Math.min(20, Math.round(Number(i.cantidad) || 1)))
      };
    }).filter(function (i) { return i.id; });

    if (!lineas.length) return Promise.resolve(false);

    return Promise.resolve(
      cliente().rpc('registrar_pedido', { p_items: lineas })
    )
      .then(function (res) {
        if (res.error) throw res.error;
        return res.data || true;
      })
      .catch(function (err) {
        console.warn('LEVÍTICO: no se pudo registrar el pedido en Supabase.', err && err.message);
        return false;
      });
  }

  /** Descarga los pedidos registrados (solo visible con sesión de administrador). */
  function cargarPedidos(limite) {
    var consulta = cliente()
      .from('pedidos')
      .select('*')
      .order('creado_en', { ascending: false })
      .limit(Math.max(1, Number(limite) || 50));

    return Promise.resolve(consulta).then(function (res) {
      if (res.error) throw res.error;
      return (res.data || []).map(function (f) {
        return {
          id: f.id,
          items: Array.isArray(f.items) ? f.items : [],
          total: Number(f.total) || 0,
          estado: f.estado || 'nuevo',
          nota: f.nota || '',
          creadoEn: f.creado_en || ''
        };
      });
    });
  }

  /**
   * Añade un correo a la lista de espera.
   *
   * Devuelve SIEMPRE la misma respuesta, esté el correo apuntado o no. Así
   * nadie puede averiguar qué direcciones están en la lista probando el
   * formulario.
   */
  function suscribir(email) {
    var correo = limpiar(email, 160).toLowerCase();
    if (!configurado().ok) return Promise.reject(new Error('sin-config'));
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(correo)) {
      return Promise.reject(new Error('correo-invalido'));
    }

    return Promise.resolve(cliente().rpc('suscribir_email', { p_email: correo }))
      .then(function (res) {
        if (res.error) throw res.error;
        return { ok: true };
      });
  }

  /** Anota un evento en el registro de auditoría (solo administradores). */
  function registrarEvento(tipo, ruta, detalle) {
    if (!configurado().ok) return Promise.resolve(false);
    return Promise.resolve(
      cliente().rpc('registrar_evento', {
        p_tipo: limpiar(tipo, 40),
        p_ruta: limpiar(ruta, 120),
        p_detalle: limpiar(detalle, 400)
      })
    )
      .then(function (res) { return !res.error; })
      .catch(function () { return false; });
  }

  /* --------------------------------- Filtros -------------------------------- */

  function coincideCategoria(producto, categoria) {
    if (!categoria || categoria === 'todos') return true;
    switch (categoria) {
      case 'nuevo':
        return !!producto.nuevo;
      case 'hombre':
        return producto.publico === 'hombre' || producto.publico === 'unisex';
      case 'mujer':
        return producto.publico === 'mujer' || producto.publico === 'unisex';
      case 'gorras':
        return producto.tipo === 'gorra';
      case 'accesorios':
        return producto.tipo === 'accesorio';
      default:
        return producto.tipo === categoria;
    }
  }

  function filtrarPorCategoria(lista, categoria) {
    return (lista || []).filter(function (p) { return coincideCategoria(p, categoria); });
  }

  /** Texto normalizado para búsquedas (sin tildes, minúsculas). */
  function normalizar(texto) {
    return String(texto || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function buscar(lista, termino) {
    var t = normalizar(termino).trim();
    if (!t) return lista || [];
    return (lista || []).filter(function (p) {
      var heno = [p.nombre, tipoLabel(p.tipo), publicoLabel(p.publico), p.color, p.descripcion].join(' ');
      return normalizar(heno).indexOf(t) !== -1;
    });
  }

  /* -------------------------- Carrito y favoritos --------------------------- */

  function leerCarrito() {
    try {
      var crudo = global.localStorage.getItem(CARRITO_KEY);
      var datos = crudo ? JSON.parse(crudo) : [];
      return Array.isArray(datos) ? datos : [];
    } catch (err) { return []; }
  }

  function guardarCarrito(items) {
    try { global.localStorage.setItem(CARRITO_KEY, JSON.stringify(items)); } catch (err) {}
  }

  function leerFavoritos() {
    try {
      var crudo = global.localStorage.getItem(FAVS_KEY);
      var datos = crudo ? JSON.parse(crudo) : [];
      return Array.isArray(datos) ? datos : [];
    } catch (err) { return []; }
  }

  function guardarFavoritos(ids) {
    try { global.localStorage.setItem(FAVS_KEY, JSON.stringify(ids)); } catch (err) {}
  }

  /* -------------------------------- Exportación ------------------------------ */

  global.LevíticoStore = {
    CONFIG: CONFIG,
    BUCKET: BUCKET,
    TIPOS: TIPOS,
    PUBLICOS: PUBLICOS,
    ESTADOS: ESTADOS,
    CATEGORIAS: CATEGORIAS,
    configurado: configurado,
    cliente: cliente,
    cargarProductos: cargarProductos,
    listar: listar,
    estaCargado: estaCargado,
    obtenerProducto: obtenerProducto,
    guardarProducto: guardarProducto,
    eliminarProducto: eliminarProducto,
    cambiarActivo: cambiarActivo,
    sesion: sesion,
    iniciarSesion: iniciarSesion,
    cerrarSesion: cerrarSesion,
    cerrarTodasLasSesiones: cerrarTodasLasSesiones,
    alCambiarSesion: alCambiarSesion,
    subirArchivo: subirArchivo,
    borrarArchivo: borrarArchivo,
    registrarPedido: registrarPedido,
    cargarPedidos: cargarPedidos,
    suscribir: suscribir,
    registrarEvento: registrarEvento,
    tallasDe: tallasDe,
    tipoLabel: tipoLabel,
    publicoLabel: publicoLabel,
    precioCOP: precioCOP,
    idUnico: idUnico,
    limpiar: limpiar,
    urlSegura: urlSegura,
    listaUrls: listaUrls,
    ENCUADRE_BASE: ENCUADRE_BASE,
    ZOOM_MAXIMO: ZOOM_MAXIMO,
    encuadreValido: encuadreValido,
    listaEncuadres: listaEncuadres,
    encuadreEn: encuadreEn,
    aplicarEncuadre: aplicarEncuadre,
    MIMES_PERMITIDOS: MIMES_PERMITIDOS,
    TAMANO_MAXIMO: TAMANO_MAXIMO,
    MAX_FOTOS: MAX_FOTOS,
    MAX_VIDEOS: MAX_VIDEOS,
    filtrarPorCategoria: filtrarPorCategoria,
    coincideCategoria: coincideCategoria,
    normalizar: normalizar,
    buscar: buscar,
    comprimirImagen: comprimirImagen,
    leerCarrito: leerCarrito,
    guardarCarrito: guardarCarrito,
    leerFavoritos: leerFavoritos,
    guardarFavoritos: guardarFavoritos
  };
})(window);
