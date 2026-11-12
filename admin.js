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
    fotos: [],   // { url, archivo, preview } — la primera es la portada
    videos: [],  // { url, archivo, preview }
    anteriores: [], // URLs guardadas del producto que se está editando
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
    reiniciarInactividad();
  }

  /* --------------------------------- Sesión --------------------------------- */

  /* -------------------- Bloqueo por intentos fallidos (17) ------------------ */

  var LLAVE_INTENTOS = 'levitico.admin.intentos';
  var MAX_INTENTOS = 5;

  function leerIntentos() {
    try {
      var datos = JSON.parse(window.localStorage.getItem(LLAVE_INTENTOS) || '{}') || {};
      return {
        fallos: Math.max(0, parseInt(datos.fallos, 10) || 0),
        hasta: Math.max(0, parseInt(datos.hasta, 10) || 0)
      };
    } catch (err) {
      return { fallos: 0, hasta: 0 };
    }
  }

  function guardarIntentos(datos) {
    try { window.localStorage.setItem(LLAVE_INTENTOS, JSON.stringify(datos)); } catch (err) {}
  }

  function segundosDeEspera() {
    return Math.max(0, Math.ceil((leerIntentos().hasta - Date.now()) / 1000));
  }

  /**
   * Suma un fallo y, a partir del quinto, impone una espera que se duplica:
   * 30 s, 1 min, 2 min, 4 min… hasta un tope de 15 min.
   */
  function anotarFallo() {
    var datos = leerIntentos();
    datos.fallos += 1;
    if (datos.fallos >= MAX_INTENTOS) {
      var nivel = Math.min(datos.fallos - MAX_INTENTOS, 5);
      datos.hasta = Date.now() + Math.min(30 * Math.pow(2, nivel), 900) * 1000;
    }
    guardarIntentos(datos);
    return datos;
  }

  function borrarIntentos() {
    try { window.localStorage.removeItem(LLAVE_INTENTOS); } catch (err) {}
  }

  /** Pinta el estado de bloqueo en el botón de acceso. Devuelve true si bloquea. */
  function pintarBloqueo() {
    var boton = $('loginBtn');
    var error = $('loginError');
    var restante = segundosDeEspera();

    if (restante <= 0) {
      boton.disabled = false;
      boton.textContent = 'Entrar al panel';
      return false;
    }

    boton.disabled = true;
    boton.textContent = 'Espera ' + restante + ' s';
    error.hidden = false;
    error.textContent =
      'Demasiados intentos fallidos. Por seguridad, espera ' + restante +
      ' segundos antes de volver a intentarlo.';
    $('loginClave').setAttribute('aria-invalid', 'true');

    setTimeout(pintarBloqueo, Math.min(restante * 1000, 15000));
    return true;
  }

  /* --------------- Cierre de sesión automático por inactividad (3) ---------- */

  var MINUTOS_INACTIVO = 20;
  var temporizadorInactivo = null;

  function reiniciarInactividad() {
    clearTimeout(temporizadorInactivo);
    if ($('appWrap').hidden) return;
    temporizadorInactivo = setTimeout(function () {
      saliendo = true;
      S.cerrarSesion()
        .then(function () { return S.registrarEvento('sesion_expirada', 'admin', 'Cierre por inactividad'); })
        .then(function () {
          saliendo = false;
          mostrarLogin();
          toast('Cerramos la sesión por inactividad.', 'error');
        })
        .catch(function () {
          saliendo = false;
          mostrarLogin();
        });
    }, MINUTOS_INACTIVO * 60 * 1000);
  }

  ['click', 'keydown', 'pointerdown', 'touchstart'].forEach(function (evento) {
    document.addEventListener(evento, reiniciarInactividad, { passive: true });
  });

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) reiniciarInactividad();
  });

  $('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();

    if (pintarBloqueo()) return;

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
        borrarIntentos();
        mostrarPanel(session);
        toast('Sesión iniciada.', 'ok');
        S.registrarEvento('sesion_iniciada', 'admin', 'Acceso correcto');
      })
      .catch(function (err) {
        console.error('Error de acceso:', err);
        var datos = anotarFallo();
        // Un solo mensaje para cualquier fallo: no se revela si el correo
        // existe, si está confirmado o si la contraseña es la incorrecta.
        error.hidden = false;
        error.textContent = 'Correo o contraseña incorrectos.';
        $('loginEmail').setAttribute('aria-invalid', 'true');
        $('loginClave').setAttribute('aria-invalid', 'true');
        $('loginClave').focus();
        S.registrarEvento('acceso_fallido', 'admin', 'Intento fallido n.º ' + datos.fallos);
      })
      .then(function () {
        boton.disabled = false;
        boton.textContent = 'Entrar al panel';
        pintarBloqueo();
      });
  });

  $('btnSalir').addEventListener('click', function () {
    saliendo = true;
    // Cierra la sesión en todos los dispositivos y revoca los tokens:
    // si alguien copió la sesión, deja de servir.
    S.cerrarTodasLasSesiones()
      .then(function () { return S.registrarEvento('sesion_cerrada', 'admin', 'Cierre manual'); })
      .then(function () {
        saliendo = false;
        mostrarLogin();
        toast('Sesión cerrada en todos los dispositivos.');
      })
      .catch(function () {
        saliendo = false;
        mostrarLogin();
        toast('Sesión cerrada.');
      });
  });

  /** Si la sesión caduca o se cierra en otra pestaña, vuelve al acceso. */
  function vigilarSesion() {
    try {
      S.alCambiarSesion(function (evento, session) {
        if (evento === 'TOKEN_REFRESHED' || evento === 'USER_UPDATED') {
          return;
        }
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

  /** Un medio del formulario: ya guardado (url), recién elegido (archivo) o ambos. */
  function nuevoMedio(url) {
    return { url: url || '', archivo: null, preview: '' };
  }

  function liberarMedio(m) {
    if (m && m.preview) URL.revokeObjectURL(m.preview);
  }

  function liberarLista(lista) {
    (lista || []).forEach(liberarMedio);
  }

  /** Botón cuadrado de una ficha (mover, portada, quitar). */
  function botonFicha(texto, etiqueta, atributo, valor) {
    var boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'media-ficha__accion';
    boton.textContent = texto;
    boton.setAttribute('aria-label', etiqueta);
    boton.title = etiqueta;
    if (atributo) boton.setAttribute(atributo, valor === undefined ? '' : valor);
    return boton;
  }

  /** Dibuja una tira de fichas; se reordenan arrastrando o con las flechas. */
  function pintarRejilla(contenedor, lista, tipo) {
    if (!contenedor) return;
    contenedor.innerHTML = '';

    var esVideo = tipo === 'video';
    var nombre = esVideo ? 'video' : 'foto';

    lista.forEach(function (m, i) {
      var src = m.preview || m.url;
      var ficha = document.createElement('figure');
      ficha.className = 'media-ficha';
      ficha.setAttribute('data-indice', String(i));
      ficha.setAttribute('draggable', 'true');
      ficha.title = 'Arrastra para cambiar el orden';

      var medio;
      if (esVideo) {
        medio = document.createElement('video');
        medio.src = src;
        medio.muted = true;
        medio.playsInline = true;
        medio.preload = 'metadata';
      } else {
        medio = document.createElement('img');
        medio.src = src;
        medio.alt = 'Foto ' + (i + 1) + ' del producto';
        medio.loading = 'lazy';
      }
      medio.setAttribute('draggable', 'false');
      ficha.appendChild(medio);

      if (i === 0) {
        var portada = document.createElement('span');
        portada.className = 'media-ficha__portada';
        portada.textContent = esVideo ? 'Principal' : 'Portada';
        ficha.appendChild(portada);
      }

      var quitar = botonFicha('✕', 'Quitar ' + nombre + ' ' + (i + 1), 'data-quitar');
      quitar.classList.add('media-ficha__quitar');
      ficha.appendChild(quitar);

      var acciones = document.createElement('div');
      acciones.className = 'media-ficha__acciones';

      var izquierda = botonFicha('←', 'Mover ' + nombre + ' ' + (i + 1) + ' a la izquierda', 'data-mover', '-1');
      izquierda.disabled = i === 0;
      acciones.appendChild(izquierda);

      var portadaBtn = botonFicha(
        '★',
        esVideo ? 'Usar como video principal' : 'Usar como portada',
        'data-portada'
      );
      portadaBtn.classList.add('media-ficha__accion--portada');
      portadaBtn.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');
      portadaBtn.disabled = i === 0;
      acciones.appendChild(portadaBtn);

      var derecha = botonFicha('→', 'Mover ' + nombre + ' ' + (i + 1) + ' a la derecha', 'data-mover', '1');
      derecha.disabled = i === lista.length - 1;
      acciones.appendChild(derecha);

      ficha.appendChild(acciones);
      contenedor.appendChild(ficha);
    });

    if (!lista.length) {
      var vacio = document.createElement('p');
      vacio.className = 'media-rejilla__vacio';
      vacio.textContent = esVideo ? 'Sin videos todavía.' : 'Sin fotos todavía.';
      contenedor.appendChild(vacio);
    }
  }

  function pintarMedios() {
    pintarRejilla($('rejillaFotos'), form.fotos, 'foto');
    pintarRejilla($('rejillaVideos'), form.videos, 'video');
  }

  /** Añade los archivos elegidos a una lista, validando tipo y tamaño. */
  function aceptarArchivos(clave, archivos) {
    var esVideo = clave === 'videos';
    var lista = form[clave];
    var maximo = esVideo ? S.MAX_VIDEOS : S.MAX_FOTOS;
    var espacio = maximo - lista.length;

    if (espacio <= 0) {
      toast('Ya tienes el máximo de ' + (esVideo ? 'videos' : 'fotos') + ' (' + maximo + ').', 'error');
      return;
    }

    var agregados = 0;
    var descartados = 0;

    Array.prototype.forEach.call(archivos, function (archivo) {
      if (agregados >= espacio) {
        descartados++;
        return;
      }

      var tipoValido = esVideo ? /^video\//.test(archivo.type) : /^image\//.test(archivo.type);
      if (!tipoValido) {
        toast(esVideo ? 'Solo se admiten videos MP4 o WebM.' : 'Solo se admiten fotos JPG, PNG o WebP.', 'error');
        return;
      }

      var topeMb = esVideo ? 50 : 12;
      if (archivo.size > topeMb * 1024 * 1024) {
        toast('«' + archivo.name + '» pasa de ' + topeMb + ' MB.', 'error');
        return;
      }

      lista.push({ url: '', archivo: archivo, preview: URL.createObjectURL(archivo) });
      agregados++;
    });

    if (agregados) {
      pintarMedios();
      $('errorImagen').hidden = true;
      toast(agregados === 1 ? 'Archivo listo para subir.' : agregados + ' archivos listos para subir.');
    }

    if (descartados) {
      toast('Máximo ' + maximo + ' por producto; sobraron ' + descartados + '.', 'error');
    }
  }

  /** Lleva un medio de una posición a otra: arrastrar, flechas o «portada». */
  function moverMedio(clave, desde, hasta) {
    var lista = form[clave];
    var d = Number(desde);
    var h = Number(hasta);
    if (!lista[d] || !(h >= 0 && h < lista.length) || d === h) return false;
    var medio = lista.splice(d, 1)[0];
    lista.splice(h, 0, medio);
    pintarMedios();
    return true;
  }

  /** Mueve, marca portada o quita un medio de la lista según el botón pulsado. */
  function accionMedio(clave, indice, boton) {
    var lista = form[clave];
    var i = Number(indice);
    if (!lista[i]) return;

    if (boton.hasAttribute('data-quitar')) {
      liberarMedio(lista[i]);
      lista.splice(i, 1);
      pintarMedios();
      if (clave === 'fotos') $('errorImagen').hidden = lista.length > 0;
      return;
    }

    if (boton.hasAttribute('data-portada')) {
      moverMedio(clave, i, 0);
      return;
    }

    moverMedio(clave, i, i + Number(boton.getAttribute('data-mover')));
  }

  function conectarRejilla(idRejilla, clave) {
    var rejilla = $(idRejilla);
    if (!rejilla) return;

    var arrastrado = null;

    function limpiarMarca() {
      Array.prototype.forEach.call(rejilla.children, function (hijo) {
        hijo.classList.remove('is-arrastrando', 'is-destino');
      });
    }

    rejilla.addEventListener('click', function (e) {
      var boton = e.target.closest('button');
      if (!boton || boton.disabled) return;
      var ficha = boton.closest('.media-ficha');
      if (!ficha) return;
      accionMedio(clave, ficha.getAttribute('data-indice'), boton);
    });

    rejilla.addEventListener('dragstart', function (e) {
      var ficha = e.target.closest('.media-ficha');
      if (!ficha) return;
      arrastrado = Number(ficha.getAttribute('data-indice'));
      ficha.classList.add('is-arrastrando');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(arrastrado));
      }
    });

    rejilla.addEventListener('dragover', function (e) {
      if (arrastrado === null) return;
      var ficha = e.target.closest('.media-ficha');
      if (!ficha) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      var destino = Number(ficha.getAttribute('data-indice'));
      Array.prototype.forEach.call(rejilla.children, function (hijo) {
        hijo.classList.toggle(
          'is-destino',
          hijo === ficha && Number(hijo.getAttribute('data-indice')) !== arrastrado && destino >= 0
        );
      });
    });

    rejilla.addEventListener('dragleave', function (e) {
      var ficha = e.target.closest('.media-ficha');
      if (ficha) ficha.classList.remove('is-destino');
    });

    rejilla.addEventListener('drop', function (e) {
      var ficha = e.target.closest('.media-ficha');
      if (!ficha || arrastrado === null) return;
      e.preventDefault();
      var desde = arrastrado;
      arrastrado = null;
      limpiarMarca();
      moverMedio(clave, desde, Number(ficha.getAttribute('data-indice')));
    });

    rejilla.addEventListener('dragend', function () {
      arrastrado = null;
      limpiarMarca();
    });
  }

  /* ------------------------------- Formulario ------------------------------- */

  function conectarFormulario() {
    $('tipo').addEventListener('change', function () {
      construirTallas($('tipo').value, null);
    });

    $('precio').addEventListener('input', actualizarPreviewPrecio);

    conectarRejilla('rejillaFotos', 'fotos');
    conectarRejilla('rejillaVideos', 'videos');

    $('archivoFotos').addEventListener('change', function (e) {
      var archivos = e.target.files;
      if (archivos && archivos.length) aceptarArchivos('fotos', archivos);
      e.target.value = '';
    });

    $('archivoVideos').addEventListener('change', function (e) {
      var archivos = e.target.files;
      if (archivos && archivos.length) aceptarArchivos('videos', archivos);
      e.target.value = '';
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

    var hayImagen = form.fotos.length > 0;
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
    if (codigo === 'PGRST204' || /could not find the .{0,40}column/i.test(texto)) {
      return 'A la base de datos le faltan las columnas de la galería (imagenes y videos). No se guardó nada para no perder las fotos extra. Abre el SQL Editor de Supabase, pega el archivo supabase/actualizar-galeria.sql y pulsa «Run»; después vuelve a guardar.';
    }
    if (/row-level security|permission denied|new row violates/i.test(texto)) {
      return 'La base de datos rechazó el cambio porque este correo no está en la lista de administradores. Añádelo en la tabla "administradores" de Supabase.';
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
    var anteriores = form.anteriores.slice(); // lo que ya estaba guardado
    var subidas = []; // lo que se subió en este intento

    /** Sube los medios pendientes de una lista y devuelve las URLs en orden. */
    function prepararLista(lista, comprimir) {
      return Promise.all(
        lista.map(function (m) {
          if (!m.archivo) return Promise.resolve(m.url);
          return S.subirArchivo(m.archivo, { comprimir: comprimir }).then(function (r) {
            subidas.push(r.url);
            return r.url;
          });
        })
      ).then(function (urls) {
        return urls.filter(function (u) { return !!u; });
      });
    }

    Promise.all([prepararLista(form.fotos, true), prepararLista(form.videos, false)])
      .then(function (listas) {
        var fotos = listas[0];
        var videos = listas[1];

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
          imagenes: fotos,
          videos: videos,
          sizes: S.tallasDe($('tipo').value).map(function (label) {
            return { label: label, disponible: !!form.tallas[label] };
          })
        };

        return S.guardarProducto(producto).then(function () {
          // Del almacenamiento solo se borra lo que el producto ya no usa.
          var enUso = fotos.concat(videos);
          anteriores.forEach(function (url) {
            if (url && enUso.indexOf(url) === -1) S.borrarArchivo(url);
          });
        });
      })
      .then(function () {
        toast(idEditando ? 'Producto actualizado.' : 'Producto publicado en la tienda.', 'ok');
        S.registrarEvento(
          idEditando ? 'producto_editado' : 'producto_creado',
          'productos',
          $('nombre').value.trim() || 'Producto'
        );
        limpiarFormulario();
        return cargarCatalogo();
      })
      .catch(function (err) {
        console.error('Error al guardar:', err);
        // Si algo falló después de subir, no dejamos archivos huérfanos.
        subidas.forEach(function (url) { S.borrarArchivo(url); });
        toast('No se pudo guardar: ' + mensajeError(err), 'error');
      })
      .finally(function () {
        boton.disabled = false;
        boton.textContent = form.id ? 'Actualizar producto' : 'Guardar producto';
      });
  }

  function limpiarFormulario() {
    liberarLista(form.fotos);
    liberarLista(form.videos);
    form.id = '';
    form.fotos = [];
    form.videos = [];
    form.anteriores = [];

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
    pintarMedios();
    actualizarPreviewPrecio();

    $('nombre').removeAttribute('aria-invalid');
    $('precio').removeAttribute('aria-invalid');

    ['errorNombre', 'errorPrecio', 'errorTallas', 'errorImagen'].forEach(function (id) {
      $(id).hidden = true;
    });

    $('formTitulo').textContent = 'Añadir producto';
    $('btnCancelar').hidden = true;
    $('btnGuardar').textContent = 'Guardar producto';
    $('archivoFotos').value = '';
    $('archivoVideos').value = '';
  }

  function editarProducto(id) {
    var p = S.obtenerProducto(id);
    if (!p) {
      toast('El producto ya no existe. Actualiza la lista.', 'error');
      return;
    }

    limpiarFormulario();

    form.id = p.id;
    form.fotos = S.listaUrls(p.imagenes && p.imagenes.length ? p.imagenes : p.imagen)
      .map(nuevoMedio);
    form.videos = S.listaUrls(p.videos && p.videos.length ? p.videos : p.video)
      .map(nuevoMedio);
    form.anteriores = form.fotos.concat(form.videos)
      .map(function (m) { return m.url; })
      .filter(Boolean);

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

    pintarMedios();

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
            S.registrarEvento(publicar ? 'producto_publicado' : 'producto_oculto', 'productos', id);
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
              S.listaUrls(producto.imagenes && producto.imagenes.length ? producto.imagenes : producto.imagen)
                .forEach(function (url) { S.borrarArchivo(url); });
              S.listaUrls(producto.videos && producto.videos.length ? producto.videos : producto.video)
                .forEach(function (url) { S.borrarArchivo(url); });
            }
            if (form.id === id) limpiarFormulario();
            toast('Producto eliminado definitivamente.', 'ok');
            S.registrarEvento('producto_eliminado', 'productos', (producto && producto.nombre) || id);
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
            (p.precioAnterior > p.precio ? ' <s class="fila-prod__antes">' + S.precioCOP(p.precioAnterior) + '</s>' : '') +
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
