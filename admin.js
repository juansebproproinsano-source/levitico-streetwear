/* ==========================================================================
   LEVÍTICO STREETWEAR — admin.js
   Panel real: sesión de Supabase, alta/edición/borrado de productos,
   subida de foto y video al almacenamiento, publicación y pedidos.
   ========================================================================== */
(function () {
  'use strict';

  var S = window.LevíticoStore;
  if (!S) {
    console.error('store.js no se cargó correctamente.');
    return;
  }

  var $ = function (id) { return document.getElementById(id); };

  var PLACEHOLDER = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="260"><rect width="200" height="260" fill="#141414"/><text x="100" y="134" font-family="Arial,Helvetica,sans-serif" font-size="12" letter-spacing="3" text-anchor="middle" fill="#3f3f46">LEVÍTICO</text></svg>'
  );

  function esc(texto) {
    return String(texto == null ? '' : texto)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* --------------------------------- Estado --------------------------------- */

  var form = {
    id: '',
    urlImagen: '',
    urlVideo: '',
    archivoImagen: null,
    archivoVideo: null,
    urlPreviewImagen: '',
    urlPreviewVideo: '',
    tallas: {}
  };

  var pedidos = [];
  var confirmaciones = Object.create(null);
  var saliendo = false;

  /* ---------------------------------- Toast --------------------------------- */

  var toastEl = $('adminToast');
  var toastTimer = null;

  function toast(mensaje, tipo) {
    if (!toastEl) return;
    toastEl.textContent = mensaje;
    toastEl.className = 'toast is-visible' + (tipo ? ' toast--' + tipo : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-visible'); }, 3600);
  }

  /* -------------------------------- Vistas ---------------------------------- */

  function mostrarSetup(motivo) {
    $('loginWrap').hidden = true;
    $('appWrap').hidden = true;
    $('setupWrap').hidden = false;

    var textos = {
      'sin-config': 'Faltan la URL y la clave pública de Supabase en config.js.',
      'url-invalida': 'La URL de Supabase en config.js no parece válida. Debe empezar por https://',
      'sin-libreria': 'No se pudo cargar la librería de Supabase. Revisa tu conexión y recarga la página.'
    };
    $('setupMotivo').textContent = textos[motivo] || textos['sin-config'];
  }

  function mostrarLogin() {
    $('setupWrap').hidden = true;
    $('appWrap').hidden = true;
    $('loginWrap').hidden = false;
    $('loginClave').value = '';
    setTimeout(function () { $('loginEmail').focus(); }, 60);
  }

  function mostrarPanel(session) {
    $('setupWrap').hidden = true;
    $('loginWrap').hidden = true;
    $('appWrap').hidden = false;

    $('adminCuenta').textContent = session && session.user ? session.user.email : '';

    inicializarPanel();
  }

  /* --------------------------------- Sesión --------------------------------- */

  $('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();

    var email = $('loginEmail').value.trim();
    var clave = $('loginClave').value;
    var error = $('loginError');
    var boton = $('loginBtn');

    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email) || clave.length < 6) {
      error.hidden = false;
      error.textContent = 'Escribe tu correo y la contraseña del administrador.';
      $('loginEmail').toggleAttribute('aria-invalid', !email);
      $('loginClave').toggleAttribute('aria-invalid', clave.length < 6);
      return;
    }

    error.hidden = true;
    $('loginEmail').removeAttribute('aria-invalid');
    $('loginClave').removeAttribute('aria-invalid');
    boton.disabled = true;
    boton.textContent = 'Entrando…';

    S.iniciarSesion(email, clave)
      .then(function (session) {
        mostrarPanel(session);
        toast('Sesión iniciada.', 'ok');
      })
      .catch(function (err) {
        console.error('Error de acceso:', err);
        var mensaje = String(err && err.message ? err.message : err);
        error.hidden = false;
        error.textContent = /invalid login credentials/i.test(mensaje)
          ? 'Correo o contraseña incorrectos.'
          : /email not confirmed/i.test(mensaje)
            ? 'El correo del administrador no está confirmado en Supabase.'
            : 'No se pudo iniciar sesión. Inténtalo de nuevo.';
        $('loginEmail').setAttribute('aria-invalid', 'true');
        $('loginClave').setAttribute('aria-invalid', 'true');
        $('loginClave').focus();
      })
      .finally(function () {
        boton.disabled = false;
        boton.textContent = 'Entrar al panel';
      });
  });

  $('btnSalir').addEventListener('click', function () {
    saliendo = true;
    S.cerrarSesion()
      .catch(function () {})
      .finally(function () {
        saliendo = false;
        mostrarLogin();
        toast('Sesión cerrada.');
      });
  });

  /** Si la sesión caduca o se cierra en otra pestaña, vuelve al acceso. */
  function vigilarSesion() {
    try {
      S.alCambiarSesion(function (evento, session) {
        if (saliendo) return;
        if (evento === 'SIGNED_OUT' && !$('appWrap').hidden) {
          mostrarLogin();
          toast('La sesión terminó. Vuelve a entrar.', 'error');
        }
        if (evento === 'SIGNED_IN' && $('appWrap').hidden && !$('loginWrap').hidden) {
          mostrarPanel(session);
        }
      });
    } catch (err) {
      console.warn('No se pudo escuchar la sesión:', err);
    }
  }

  /* ------------------------------ Inicialización ---------------------------- */

  var panelListo = false;

  function inicializarPanel() {
    if (!panelListo) {
      rellenarSelects();
      construirTallas('camiseta', null);
      conectarFormulario();
      conectarLista();
      conectarPedidos();
      panelListo = true;
    }
    limpiarFormulario();
    cargarCatalogo();
    cargarPedidos();
  }

  function rellenarSelects() {
    $('tipo').innerHTML = S.TIPOS.map(function (t) {
      return '<option value="' + t.id + '">' + t.label + '</option>';
    }).join('');

    $('publico').innerHTML = S.PUBLICOS.map(function (p) {
      return '<option value="' + p.id + '">' + p.label + '</option>';
    }).join('');

    $('estado').innerHTML = S.ESTADOS.map(function (e) {
      return '<option value="' + e.id + '">' + e.label + '</option>';
    }).join('');
  }

  /* --------------------------------- Tallas --------------------------------- */

  function construirTallas(tipo, disponibles) {
    form.tallas = {};

    var lista = S.tallasDe(tipo);
    var mapa = {};
    if (Array.isArray(disponibles)) {
      disponibles.forEach(function (t) { mapa[t.label] = !!t.disponible; });
    }

    var contenedor = $('tallas');
    contenedor.innerHTML = lista.map(function (label) {
      var activa = disponibles ? !!mapa[label] : true;
      form.tallas[label] = activa;
      return '<button type="button" class="chip-talla" data-talla="' + esc(label) + '" aria-pressed="' + (activa ? 'true' : 'false') + '">' + esc(label) + '</button>';
    }).join('');

    contenedor.querySelectorAll('.chip-talla').forEach(function (chip) {
      chip.addEventListener('click', function () {
        var label = chip.getAttribute('data-talla');
        var nuevo = chip.getAttribute('aria-pressed') !== 'true';
        chip.setAttribute('aria-pressed', nuevo ? 'true' : 'false');
        form.tallas[label] = nuevo;
        $('errorTallas').hidden = true;
      });
    });
  }

  function tallasSeleccionadas() {
    return Object.keys(form.tallas).filter(function (k) { return form.tallas[k]; });
  }

  /* --------------------------------- Media ---------------------------------- */

  function pintarPreviewImagen(src) {
    var caja = $('previewImagen');
    caja.innerHTML = '';
    if (src) {
      var img = document.createElement('img');
      img.src = src;
      img.alt = 'Vista previa de la foto';
      caja.appendChild(img);
      $('btnQuitarImagen').hidden = false;
    } else {
      var span = document.createElement('span');
      span.className = 'media__vacio';
      span.textContent = 'Sin foto';
      caja.appendChild(span);
      $('btnQuitarImagen').hidden = true;
    }
  }

  function pintarPreviewVideo(src) {
    var caja = $('previewVideo');
    caja.innerHTML = '';
    if (src) {
      var video = document.createElement('video');
      video.src = src;
      video.muted = true;
      video.playsInline = true;
      video.controls = true;
      caja.appendChild(video);
      $('btnQuitarVideo').hidden = false;
    } else {
      var span = document.createElement('span');
      span.className = 'media__vacio';
      span.textContent = 'Sin video';
      caja.appendChild(span);
      $('btnQuitarVideo').hidden = true;
    }
  }

  function revocarPreviews() {
    if (form.urlPreviewImagen) {
      URL.revokeObjectURL(form.urlPreviewImagen);
      form.urlPreviewImagen = '';
    }
    if (form.urlPreviewVideo) {
      URL.revokeObjectURL(form.urlPreviewVideo);
      form.urlPreviewVideo = '';
    }
  }

  /* ------------------------------- Formulario ------------------------------- */

  function conectarFormulario() {
    $('tipo').addEventListener('change', function () {
      construirTallas($('tipo').value, null);
    });

    $('precio').addEventListener('input', actualizarPreviewPrecio);

    $('archivoImagen').addEventListener('change', function (e) {
      var archivo = e.target.files && e.target.files[0];
      if (!archivo) return;

      if (!/^image\//.test(archivo.type)) {
        toast('El archivo debe ser una imagen (JPG, PNG o WebP).', 'error');
        e.target.value = '';
        return;
      }

      if (archivo.size > 12 * 1024 * 1024) {
        toast('La foto supera los 12 MB. Usa una imagen más ligera.', 'error');
        e.target.value = '';
        return;
      }

      form.archivoImagen = archivo;

      if (form.urlPreviewImagen) URL.revokeObjectURL(form.urlPreviewImagen);
      form.urlPreviewImagen = URL.createObjectURL(archivo);
      pintarPreviewImagen(form.urlPreviewImagen);
      $('errorImagen').hidden = true;
      toast('Foto lista para subir.');
    });

    $('btnQuitarImagen').addEventListener('click', function () {
      if (form.urlPreviewImagen) {
        URL.revokeObjectURL(form.urlPreviewImagen);
        form.urlPreviewImagen = '';
      }
      form.archivoImagen = null;
      form.urlImagen = '';
      $('archivoImagen').value = '';
      pintarPreviewImagen('');
    });

    $('archivoVideo').addEventListener('change', function (e) {
      var archivo = e.target.files && e.target.files[0];
      if (!archivo) return;

      if (!/^video\//.test(archivo.type)) {
        toast('El archivo debe ser un video (MP4 o WebM).', 'error');
        e.target.value = '';
        return;
      }

      if (archivo.size > 50 * 1024 * 1024) {
        toast('El video supera los 50 MB. Usa un archivo más ligero.', 'error');
        e.target.value = '';
        return;
      }

      form.archivoVideo = archivo;

      if (form.urlPreviewVideo) URL.revokeObjectURL(form.urlPreviewVideo);
      form.urlPreviewVideo = URL.createObjectURL(archivo);
      pintarPreviewVideo(form.urlPreviewVideo);
      toast('Video listo para subir.');
    });

    $('btnQuitarVideo').addEventListener('click', function () {
      if (form.urlPreviewVideo) {
        URL.revokeObjectURL(form.urlPreviewVideo);
        form.urlPreviewVideo = '';
      }
      form.archivoVideo = null;
      form.urlVideo = '';
      $('archivoVideo').value = '';
      pintarPreviewVideo('');
    });

    $('formProducto').addEventListener('submit', guardarFormulario);
    $('btnLimpiar').addEventListener('click', function () {
      limpiarFormulario();
      toast('Formulario limpio.');
    });
    $('btnCancelar').addEventListener('click', function () {
      limpiarFormulario();
      toast('Edición cancelada.');
    });
  }

  function actualizarPreviewPrecio() {
    var valor = Number($('precio').value) || 0;
    $('precioPreview').textContent = 'Se muestra como: ' + S.precioCOP(valor);
  }

  function marcarError(input, cajaError, activar) {
    if (!input) return;
    if (activar) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
    if (cajaError) cajaError.hidden = !activar;
  }

  function validar() {
    var ok = true;

    var nombre = $('nombre').value.trim();
    var nombreOk = nombre.length >= 3;
    marcarError($('nombre'), $('errorNombre'), !nombreOk);
    if (!nombreOk) ok = false;

    var precio = Number($('precio').value);
    var precioOk = isFinite(precio) && precio > 0;
    marcarError($('precio'), $('errorPrecio'), !precioOk);
    if (!precioOk) ok = false;

    var hayTalla = tallasSeleccionadas().length > 0;
    $('errorTallas').hidden = hayTalla;
    if (!hayTalla) ok = false;

    var hayImagen = !!form.archivoImagen || !!form.urlImagen;
    $('errorImagen').hidden = hayImagen;
    if (!hayImagen) ok = false;

    if (!ok) {
      var primerError = document.querySelector('[aria-invalid="true"]');
      if (primerError) primerError.focus();
      toast('Revisa los campos marcados.', 'error');
    }

    return ok;
  }

  function mensajeError(err) {
    var texto = String(err && err.message ? err.message : err || '');
    var codigo = String((err && err.code) || '');
    if (codigo === 'PGRST205' || /could not find the table/i.test(texto)) {
      return 'La base de datos todavía no tiene las tablas. Ejecuta supabase/schema.sql en el SQL Editor de Supabase.';
    }
    if (/row-level security|permission denied|new row violates/i.test(texto)) {
      return 'La base de datos rechazó el cambio. Revisa que ejecutaste supabase/schema.sql completo.';
    }
    if (/jwt|token/i.test(texto)) {
      return 'Tu sesión caducó. Vuelve a entrar al panel.';
    }
    if (/payload|too large/i.test(texto)) {
      return 'El archivo es demasiado grande para el almacenamiento.';
    }
    return texto || 'Error desconocido.';
  }

  function guardarFormulario(e) {
    e.preventDefault();
    if (!validar()) return;

    var boton = $('btnGuardar');
    boton.disabled = true;
    boton.textContent = 'Guardando…';

    var idEditando = form.id;
    var imagenVieja = form.urlImagen;
    var videoViejo = form.urlVideo;
    var subidaImagen = null;
    var subidaVideo = null;

    var prepararImagen = form.archivoImagen
      ? S.subirArchivo(form.archivoImagen).then(function (r) {
          subidaImagen = r.url;
          return r.url;
        })
      : Promise.resolve(form.urlImagen);

    var prepararVideo = form.archivoVideo
      ? S.subirArchivo(form.archivoVideo, { comprimir: false }).then(function (r) {
          subidaVideo = r.url;
          return r.url;
        })
      : Promise.resolve(form.urlVideo);

    Promise.all([prepararImagen, prepararVideo])
      .then(function (urls) {
        var producto = {
          id: idEditando || '',
          nombre: $('nombre').value.trim(),
          tipo: $('tipo').value,
          publico: $('publico').value,
          precio: Number($('precio').value) || 0,
          precioAnterior: Number($('precioAnterior').value) || 0,
          estado: $('estado').value,
          nuevo: $('nuevo').checked,
          limitado: $('limitado').checked,
          activo: $('activo').checked,
          color: $('color').value.trim() || 'Negro',
          descripcion: $('descripcion').value.trim(),
          imagen: urls[0] || '',
          video: urls[1] || '',
          sizes: S.tallasDe($('tipo').value).map(function (label) {
            return { label: label, disponible: !!form.tallas[label] };
          })
        };

        return S.guardarProducto(producto).then(function () {
          // Si se reemplazó el archivo, se borra el anterior del almacenamiento
          if (subidaImagen && imagenVieja && imagenVieja !== subidaImagen) S.borrarArchivo(imagenVieja);
          if (subidaVideo && videoViejo && videoViejo !== subidaVideo) S.borrarArchivo(videoViejo);
        });
      })
      .then(function () {
        toast(idEditando ? 'Producto actualizado.' : 'Producto publicado en la tienda.', 'ok');
        limpiarFormulario();
        return cargarCatalogo();
      })
      .catch(function (err) {
        console.error('Error al guardar:', err);
        // Si algo falló después de subir, no dejamos archivos huérfanos
        if (subidaImagen) S.borrarArchivo(subidaImagen);
        if (subidaVideo) S.borrarArchivo(subidaVideo);
        toast('No se pudo guardar: ' + mensajeError(err), 'error');
      })
      .finally(function () {
        boton.disabled = false;
        boton.textContent = form.id ? 'Actualizar producto' : 'Guardar producto';
      });
  }

  function limpiarFormulario() {
    form.id = '';
    form.urlImagen = '';
    form.urlVideo = '';
    form.archivoImagen = null;
    form.archivoVideo = null;
    revocarPreviews();

    var formulario = $('formProducto');
    formulario.reset();
    $('productoId').value = '';

    $('tipo').value = 'camiseta';
    $('publico').value = 'unisex';
    $('estado').value = 'disponible';
    $('color').value = 'Negro';
    $('precio').value = '';
    $('precioAnterior').value = '';
    $('nombre').value = '';
    $('descripcion').value = '';
    $('nuevo').checked = false;
    $('limitado').checked = false;
    $('activo').checked = true;

    construirTallas('camiseta', null);
    pintarPreviewImagen('');
    pintarPreviewVideo('');
    actualizarPreviewPrecio();

    $('nombre').removeAttribute('aria-invalid');
    $('precio').removeAttribute('aria-invalid');

    ['errorNombre', 'errorPrecio', 'errorTallas', 'errorImagen'].forEach(function (id) {
      $(id).hidden = true;
    });

    $('formTitulo').textContent = 'Añadir producto';
    $('btnCancelar').hidden = true;
    $('btnGuardar').textContent = 'Guardar producto';
    $('archivoImagen').value = '';
    $('archivoVideo').value = '';
  }

  function editarProducto(id) {
    var p = S.obtenerProducto(id);
    if (!p) {
      toast('El producto ya no existe. Actualiza la lista.', 'error');
      return;
    }

    limpiarFormulario();

    form.id = p.id;
    form.urlImagen = p.imagen || '';
    form.urlVideo = p.video || '';

    $('productoId').value = p.id;
    $('nombre').value = p.nombre || '';
    $('tipo').value = p.tipo || 'camiseta';
    $('publico').value = p.publico || 'unisex';
    $('estado').value = p.estado || 'disponible';
    $('color').value = p.color || '';
    $('precio').value = p.precio || '';
    $('precioAnterior').value = p.precioAnterior || '';
    $('descripcion').value = p.descripcion || '';
    $('nuevo').checked = !!p.nuevo;
    $('limitado').checked = !!p.limitado;
    $('activo').checked = p.activo !== false;

    construirTallas(p.tipo || 'camiseta', p.sizes || null);

    if (p.imagen) pintarPreviewImagen(p.imagen);
    if (p.video) pintarPreviewVideo(p.video);

    actualizarPreviewPrecio();
    $('formTitulo').textContent = 'Editar producto';
    $('btnCancelar').hidden = false;
    $('btnGuardar').textContent = 'Actualizar producto';

    $('formTitulo').scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(function () { $('nombre').focus(); }, 320);
    toast('Editando: ' + p.nombre);
  }

  /* --------------------------------- Listado -------------------------------- */

  function cargarCatalogo() {
    $('listaProductos').innerHTML = '<p class="lista__cargando">Cargando catálogo…</p>';

    return S.cargarProductos({ incluirOcultos: true })
      .then(function () {
        renderLista();
        actualizarResumen();
      })
      .catch(function (err) {
        console.error('Error al cargar el catálogo:', err);
        $('listaProductos').innerHTML = '';
        $('listaVacia').hidden = false;
        $('listaVacia').textContent = 'No se pudo cargar el catálogo: ' + mensajeError(err);
      });
  }

  function conectarLista() {
    $('buscarLista').addEventListener('input', renderLista);
    $('btnRecargar').addEventListener('click', function () {
      cargarCatalogo().then(function () { toast('Catálogo actualizado.'); });
    });

    $('listaProductos').addEventListener('click', function (e) {
      var boton = e.target.closest('[data-accion]');
      if (!boton) return;

      var id = boton.getAttribute('data-id');
      var accion = boton.getAttribute('data-accion');

      if (accion === 'editar') {
        editarProducto(id);
        return;
      }

      if (accion === 'publicar' || accion === 'ocultar') {
        var publicar = accion === 'publicar';
        boton.disabled = true;
        S.cambiarActivo(id, publicar)
          .then(function () {
            toast(publicar ? 'Producto publicado en la tienda.' : 'Producto oculto de la tienda.', 'ok');
            return cargarCatalogo();
          })
          .catch(function (err) {
            boton.disabled = false;
            toast('No se pudo cambiar: ' + mensajeError(err), 'error');
          });
        return;
      }

      if (accion === 'eliminar') {
        var producto = S.obtenerProducto(id);

        if (!confirmaciones[id]) {
          confirmaciones[id] = setTimeout(function () {
            delete confirmaciones[id];
            renderLista();
          }, 3200);

          boton.textContent = '¿Seguro?';
          boton.classList.add('boton-icono--confirmar');
          return;
        }

        clearTimeout(confirmaciones[id]);
        delete confirmaciones[id];
        boton.disabled = true;

        S.eliminarProducto(id)
          .then(function () {
            if (producto) {
              if (producto.imagen) S.borrarArchivo(producto.imagen);
              if (producto.video) S.borrarArchivo(producto.video);
            }
            if (form.id === id) limpiarFormulario();
            toast('Producto eliminado definitivamente.', 'ok');
            return cargarCatalogo();
          })
          .catch(function (err) {
            boton.disabled = false;
            toast('No se pudo eliminar: ' + mensajeError(err), 'error');
          });
      }
    });
  }

  function filaProducto(p) {
    var img = p.imagen || PLACEHOLDER;
    var tallas = (p.sizes || [])
      .filter(function (t) { return t.disponible; })
      .map(function (t) { return t.label; });

    var etiquetas = '';
    if (p.activo === false) etiquetas += '<span class="tag-mini tag-mini--oculto">Oculto</span>';
    if (p.nuevo) etiquetas += '<span class="tag-mini tag-mini--nuevo">Nuevo</span>';
    if (p.limitado) etiquetas += '<span class="tag-mini tag-mini--limitado">Limitado</span>';
    if (p.estado === 'ultimas') etiquetas += '<span class="tag-mini tag-mini--ultimas">Últimas</span>';
    if (p.estado === 'agotado') etiquetas += '<span class="tag-mini tag-mini--agotado">Agotado</span>';

    return '' +
      '<div class="fila-prod' + (p.activo === false ? ' fila-prod--oculto' : '') + '" data-fila="' + esc(p.id) + '">' +
        '<img class="fila-prod__img" src="' + esc(img) + '" alt="' + esc(p.nombre) + '" width="58" height="74" loading="lazy">' +
        '<div class="fila-prod__info">' +
          '<p class="fila-prod__nombre">' + esc(p.nombre) + '</p>' +
          '<p class="fila-prod__meta">' + esc(S.tipoLabel(p.tipo)) + ' · ' + esc(S.publicoLabel(p.publico)) + '</p>' +
          '<p class="fila-prod__precio">' + S.precioCOP(p.precio) +
            (p.precioAnterior > p.precio ? ' <s style="color:#71717a;font-size:11px">' + S.precioCOP(p.precioAnterior) + '</s>' : '') +
          '</p>' +
          '<p class="fila-prod__meta">Tallas: ' + (tallas.length ? esc(tallas.join(' · ')) : 'ninguna') + '</p>' +
          '<div class="fila-prod__tags">' + etiquetas + '</div>' +
        '</div>' +
        '<div class="fila-prod__acciones">' +
          '<button class="boton-icono" data-accion="editar" data-id="' + esc(p.id) + '">Editar</button>' +
          '<button class="boton-icono" data-accion="' + (p.activo === false ? 'publicar' : 'ocultar') + '" data-id="' + esc(p.id) + '">' +
            (p.activo === false ? 'Publicar' : 'Ocultar') +
          '</button>' +
          '<button class="boton-icono boton-icono--borrar" data-accion="eliminar" data-id="' + esc(p.id) + '">Eliminar</button>' +
        '</div>' +
      '</div>';
  }

  function renderLista() {
    var termino = $('buscarLista').value.trim();
    var lista = S.listar();
    if (termino) lista = S.buscar(lista, termino);

    $('listaProductos').innerHTML = lista.map(filaProducto).join('');
    $('listaVacia').hidden = lista.length > 0;
    $('listaVacia').textContent = termino
      ? 'No hay productos que coincidan con la búsqueda.'
      : 'Todavía no has cargado ningún producto. Usa el formulario para publicar el primero.';
  }

  function actualizarResumen() {
    var lista = S.listar();
    $('statTotal').textContent = lista.length;
    $('statPublicados').textContent = lista.filter(function (p) { return p.activo !== false; }).length;
    $('statOcultos').textContent = lista.filter(function (p) { return p.activo === false; }).length;
    $('statPedidos').textContent = pedidos.length;
  }

  /* --------------------------------- Pedidos -------------------------------- */

  function fechaCorta(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('es-CO', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
    });
  }

  function cargarPedidos() {
    $('listaPedidos').innerHTML = '<p class="lista__cargando">Cargando pedidos…</p>';

    return S.cargarPedidos(50)
      .then(function (lista) {
        pedidos = lista;
        renderPedidos();
        actualizarResumen();
      })
      .catch(function (err) {
        console.error('Error al cargar pedidos:', err);
        $('listaPedidos').innerHTML = '';
        $('pedidosVacio').hidden = false;
        $('pedidosVacio').textContent = 'No se pudieron cargar los pedidos: ' + mensajeError(err);
      });
  }

  function renderPedidos() {
    $('listaPedidos').innerHTML = pedidos.map(function (p) {
      var articulos = p.items.map(function (i) {
        return esc(i.nombre) + ' · ' + esc(i.talla || 'Única') + ' × ' + (Number(i.cantidad) || 0);
      }).join('<br>');

      return '' +
        '<div class="fila-pedido">' +
          '<div class="fila-pedido__info">' +
            '<p class="fila-pedido__fecha">' + esc(fechaCorta(p.creadoEn)) + '</p>' +
            '<p class="fila-pedido__items">' + (articulos || 'Sin artículos') + '</p>' +
          '</div>' +
          '<div class="fila-pedido__lado">' +
            '<span class="fila-pedido__total">' + S.precioCOP(p.total) + '</span>' +
            '<span class="tag-mini">' + esc(p.estado) + '</span>' +
          '</div>' +
        '</div>';
    }).join('');

    $('pedidosVacio').hidden = pedidos.length > 0;
    $('pedidosVacio').textContent = 'Todavía no hay pedidos registrados.';
  }

  function conectarPedidos() {
    $('btnRecargarPedidos').addEventListener('click', function () {
      cargarPedidos().then(function () { toast('Pedidos actualizados.'); });
    });
  }

  /* --------------------------------- Arranque -------------------------------- */

  var estado = S.configurado();
  if (!estado.ok) {
    mostrarSetup(estado.motivo);
    return;
  }

  vigilarSesion();

  S.sesion()
    .then(function (session) {
      if (session) mostrarPanel(session);
      else mostrarLogin();
    })
    .catch(function (err) {
      console.error('Error al comprobar la sesión:', err);
      mostrarLogin();
    });
})();
