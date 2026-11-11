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
      imagen: f.imagen_url || '',
      video: f.video_url || '',
      sizes: Array.isArray(f.tallas) ? f.tallas : [],
      activo: f.activo !== false,
      orden: Number(f.orden) || 0
    };
  }

  /** Producto de la aplicación → fila para la base de datos. */
  function afila(p) {
    return {
      nombre: String(p.nombre || '').trim(),
      tipo: p.tipo || 'camiseta',
      publico: p.publico || 'unisex',
      precio: Math.round(Number(p.precio) || 0),
      precio_anterior: Math.round(Number(p.precioAnterior) || 0),
      estado: p.estado || 'disponible',
      nuevo: !!p.nuevo,
      limitado: !!p.limitado,
      color: p.color || 'Negro',
      descripcion: p.descripcion || '',
      imagen_url: p.imagen || '',
      video_url: p.video || '',
      tallas: Array.isArray(p.sizes) ? p.sizes : [],
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
    return Promise.resolve(cliente().auth.signOut()).then(function () { return true; });
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
   * @returns {Promise<{url: string, ruta: string}>}
   */
  function subirArchivo(archivo, opciones) {
    var comprimir = !opciones || opciones.comprimir !== false;
    var preparado = (comprimir && /^image\//.test(archivo.type))
      ? comprimirImagen(archivo)
      : Promise.resolve(archivo);

    return preparado.then(function (blob) {
      var tipo = blob.type || archivo.type || 'application/octet-stream';
      var ruta = 'productos/' + idUnico('m') + '.' + extensionDe(tipo);
      var sb = cliente();

      return Promise.resolve(
        sb.storage.from(BUCKET).upload(ruta, blob, { contentType: tipo, upsert: false })
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

  /** Guarda una copia del pedido en la base de datos. Nunca bloquea el checkout. */
  function registrarPedido(items, total) {
    if (!configurado().ok) return Promise.resolve(false);

    var filas = (items || []).map(function (i) {
      return {
        id: i.id,
        nombre: i.nombre,
        talla: i.talla,
        cantidad: Number(i.cantidad) || 0,
        precio: Number(i.precio) || 0
      };
    });

    return Promise.resolve(
      cliente().from('pedidos').insert({
        items: filas,
        total: Math.round(Number(total) || 0),
        origen: 'web'
      })
    )
      .then(function (res) {
        if (res.error) throw res.error;
        return true;
      })
      .catch(function () { return false; });
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

  /** Añade un correo a la lista de espera. */
  function suscribir(email) {
    var correo = String(email || '').trim().toLowerCase();
    if (!configurado().ok) return Promise.reject(new Error('sin-config'));

    return Promise.resolve(cliente().from('suscriptores').insert({ email: correo }))
      .then(function (res) {
        if (res.error) {
          if (res.error.code === '23505') return { nuevo: false };
          throw res.error;
        }
        return { nuevo: true };
      });
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
    alCambiarSesion: alCambiarSesion,
    subirArchivo: subirArchivo,
    borrarArchivo: borrarArchivo,
    registrarPedido: registrarPedido,
    cargarPedidos: cargarPedidos,
    suscribir: suscribir,
    tallasDe: tallasDe,
    tipoLabel: tipoLabel,
    publicoLabel: publicoLabel,
    precioCOP: precioCOP,
    idUnico: idUnico,
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
