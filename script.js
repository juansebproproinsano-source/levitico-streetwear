/* ==========================================================================
   LEVÍTICO STREETWEAR — script.js
   Tienda: mega menú, filtros, búsqueda, ficha de producto, carrito y favoritos.
   El catálogo se descarga de Supabase; el carrito vive en el navegador.
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
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#141414"/><text x="300" y="404" font-family="Arial,Helvetica,sans-serif" font-size="28" letter-spacing="6" text-anchor="middle" fill="#3f3f46">LEVÍTICO</text></svg>'
  );

  // Si una foto no se puede cargar (archivo borrado, URL caída), mostramos el marcador
  document.addEventListener('error', function (e) {
    var img = e.target;
    if (!img || img.tagName !== 'IMG' || img.dataset.fallback === '1') return;
    img.dataset.fallback = '1';
    img.classList.add('img--rota');
    img.removeAttribute('srcset');
    img.src = PLACEHOLDER;
  }, true);

  /* --------------------------------- Estado --------------------------------- */

  var estado = {
    categoria: 'todos',
    tipo: null,
    termino: '',
    soloFavoritos: false,
    favoritos: S.leerFavoritos(),
    carrito: S.leerCarrito(),
    productos: [],
    cargando: true,
    error: null,
    productoModal: null,
    tallaModal: null
  };

  function esc(texto) {
    return String(texto == null ? '' : texto)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ---------------------------------- Toast --------------------------------- */

  var toastEl = $('toast');
  var toastTimer = null;

  function toast(mensaje, tipo) {
    if (!toastEl) return;
    toastEl.textContent = mensaje;
    toastEl.className = 'toast is-visible' + (tipo ? ' toast--' + tipo : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove('is-visible');
    }, 3200);
  }

  /* -------------------------------- Contacto -------------------------------- */

  /** Rellena el pie con los datos reales de config.js y oculta lo que falte. */
  function pintarContacto() {
    var wa = $('footerWhatsapp');
    if (wa) {
      if (S.CONFIG.whatsapp) {
        wa.href = 'https://wa.me/' + S.CONFIG.whatsapp;
        wa.hidden = false;
      } else {
        wa.hidden = true;
      }
    }

    var mail = $('footerEmail');
    if (mail) {
      if (S.CONFIG.email) {
        mail.href = 'mailto:' + S.CONFIG.email;
        mail.textContent = S.CONFIG.email;
        mail.hidden = false;
      } else {
        mail.hidden = true;
      }
    }

    var ig = $('footerInstagram');
    var redes = $('footerRedes');
    if (ig) {
      if (S.CONFIG.instagram) {
        ig.href = 'https://instagram.com/' + S.CONFIG.instagram;
        if (redes) redes.hidden = false;
        ig.hidden = false;
      } else {
        ig.hidden = true;
        if (redes) redes.hidden = true;
      }
    }

    var horario = $('footerHorario');
    if (horario) {
      if (S.CONFIG.horario) {
        horario.textContent = S.CONFIG.horario;
        horario.hidden = false;
      } else {
        horario.hidden = true;
      }
    }

    // Sin ningún dato de contacto, la columna entera sobra (título incluido)
    var columna = $('footerContacto');
    var hayContacto = !!(S.CONFIG.whatsapp || S.CONFIG.email || S.CONFIG.instagram || S.CONFIG.horario);
    if (columna) columna.hidden = !hayContacto;
    var rejilla = document.querySelector('.footer__inner');
    if (rejilla) rejilla.classList.toggle('footer__inner--sin-contacto', !hayContacto);
  }

  /* ------------------------------ Cabecera / menú --------------------------- */

  var mega = $('megaMenu');
  var megaTrigger = $('megaTrigger');
  var temporizadorMega = null;
  var megaAbiertoEn = 0;

  function abrirMega() {
    if (!mega || window.innerWidth <= 1024) return;
    clearTimeout(temporizadorMega);
    if (!mega.classList.contains('is-open')) {
      mega.classList.add('is-open');
      megaAbiertoEn = Date.now();
    }
    megaTrigger.setAttribute('aria-expanded', 'true');
  }

  function cerrarMega() {
    if (!mega) return;
    mega.classList.remove('is-open');
    megaTrigger.setAttribute('aria-expanded', 'false');
  }

  function programarCierreMega() {
    clearTimeout(temporizadorMega);
    temporizadorMega = setTimeout(cerrarMega, 180);
  }

  if (mega && megaTrigger) {
    megaTrigger.addEventListener('click', function (e) {
      e.preventDefault();
      if (!mega.classList.contains('is-open')) {
        abrirMega();
        return;
      }
      // Si el hover acaba de abrirlo, el primer clic lo confirma en vez de cerrarlo
      if (Date.now() - megaAbiertoEn < 350) return;
      cerrarMega();
    });

    megaTrigger.addEventListener('mouseenter', abrirMega);
    megaTrigger.addEventListener('mouseleave', programarCierreMega);
    mega.addEventListener('mouseenter', abrirMega);
    mega.addEventListener('mouseleave', programarCierreMega);

    mega.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        cerrarMega();
        megaTrigger.focus();
      }
    });
  }

  document.addEventListener('click', function (e) {
    if (mega && mega.classList.contains('is-open') &&
        !mega.contains(e.target) && !megaTrigger.contains(e.target)) {
      cerrarMega();
    }

    var aviso = e.target.closest && e.target.closest('[data-aviso]');
    if (aviso) toast(aviso.getAttribute('data-aviso'));
  });

  /* ------------------------------- Menú móvil ------------------------------- */

  var menuMovil = $('menuMovil');
  var menuFondo = $('menuFondo');
  var btnMenu = $('btnMenu');
  var btnCerrarMenu = $('btnCerrarMenu');

  function abrirMenu() {
    menuMovil.classList.add('is-open');
    menuFondo.classList.add('is-open');
    menuMovil.setAttribute('aria-hidden', 'false');
    btnMenu.setAttribute('aria-expanded', 'true');
    document.body.classList.add('no-scroll');
  }

  function cerrarMenu() {
    menuMovil.classList.remove('is-open');
    menuFondo.classList.remove('is-open');
    menuMovil.setAttribute('aria-hidden', 'true');
    btnMenu.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('no-scroll');
  }

  btnMenu.addEventListener('click', function () {
    if (menuMovil.classList.contains('is-open')) cerrarMenu();
    else abrirMenu();
  });
  btnCerrarMenu.addEventListener('click', cerrarMenu);
  menuFondo.addEventListener('click', cerrarMenu);

  Array.prototype.forEach.call(document.querySelectorAll('[data-acordeon]'), function (acordeon) {
    var boton = acordeon.querySelector('.acordeon__btn');
    var panel = acordeon.querySelector('.acordeon__panel');
    boton.addEventListener('click', function () {
      var abierto = boton.getAttribute('aria-expanded') === 'true';
      boton.setAttribute('aria-expanded', abierto ? 'false' : 'true');
      panel.classList.toggle('is-open', !abierto);
    });
  });

  /* --------------------------------- Buscador ------------------------------- */

  var buscador = $('buscador');
  var inputBuscar = $('inputBuscar');
  var btnBuscar = $('btnBuscar');
  var pistaBusqueda = $('pistaBusqueda');

  function abrirBuscador() {
    buscador.classList.add('is-open');
    btnBuscar.setAttribute('aria-expanded', 'true');
    setTimeout(function () { inputBuscar.focus(); }, 220);
  }

  function cerrarBuscador() {
    buscador.classList.remove('is-open');
    btnBuscar.setAttribute('aria-expanded', 'false');
  }

  btnBuscar.addEventListener('click', function () {
    if (buscador.classList.contains('is-open')) cerrarBuscador();
    else abrirBuscador();
  });
  $('btnCerrarBuscador').addEventListener('click', cerrarBuscador);

  function actualizarPista() {
    if (estado.cargando) {
      pistaBusqueda.textContent = 'Cargando catálogo…';
      return;
    }
    if (!estado.termino.trim()) {
      pistaBusqueda.textContent = estado.productos.length
        ? 'Escribe para filtrar el catálogo en tiempo real.'
        : 'El catálogo está en preparación.';
      return;
    }
    var total = productosVisibles().length;
    pistaBusqueda.textContent = total === 1
      ? '1 pieza coincide con tu búsqueda.'
      : total + ' piezas coinciden con tu búsqueda.';
  }

  inputBuscar.addEventListener('input', function () {
    estado.termino = inputBuscar.value;
    renderCatalogo();
    actualizarPista();
  });

  inputBuscar.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      cerrarBuscador();
      irATienda();
    }
  });

  /* ------------------------------ Favoritos --------------------------------- */

  var btnFavoritos = $('btnFavoritos');

  btnFavoritos.addEventListener('click', function () {
    if (!estado.favoritos.length) {
      toast('Aún no tienes favoritos. Toca el corazón de una prenda.', 'error');
      return;
    }
    estado.soloFavoritos = !estado.soloFavoritos;
    btnFavoritos.setAttribute('aria-pressed', estado.soloFavoritos ? 'true' : 'false');
    renderCatalogo();
    irATienda();
    toast(estado.soloFavoritos ? 'Mostrando solo tus favoritos.' : 'Mostrando todo el catálogo.');
  });

  function alternarFavorito(id) {
    var i = estado.favoritos.indexOf(id);
    if (i === -1) {
      estado.favoritos.push(id);
      toast('Añadido a favoritos.');
    } else {
      estado.favoritos.splice(i, 1);
      toast('Quitado de favoritos.');
    }
    S.guardarFavoritos(estado.favoritos);
    renderCatalogo();
  }

  /* ------------------------------- Catálogo --------------------------------- */

  var grid = $('gridProductos');
  var vacio = $('vacio');
  var vacioTitulo = $('vacioTitulo');
  var vacioTexto = $('vacioTexto');
  var vacioIcono = $('vacioIcono');
  var btnVacio = $('btnLimpiarFiltros');
  var avisoFiltro = $('avisoFiltro');
  var estadoCatalogo = $('estadoCatalogo');
  var filtros = $('filtros');

  var accionVacio = 'limpiar';

  function productosVisibles() {
    var lista = estado.productos;

    if (estado.soloFavoritos) {
      lista = lista.filter(function (p) { return estado.favoritos.indexOf(p.id) !== -1; });
    }
    lista = S.filtrarPorCategoria(lista, estado.categoria);
    if (estado.tipo) {
      lista = lista.filter(function (p) { return p.tipo === estado.tipo; });
    }
    if (estado.termino.trim()) lista = S.buscar(lista, estado.termino);
    return lista;
  }

  function badges(p) {
    var html = '';
    if (p.limitado) html += '<span class="badge badge--limitado">Edición limitada</span>';
    if (p.estado === 'agotado') html += '<span class="badge badge--agotado">Agotado</span>';
    else if (p.estado === 'ultimas') html += '<span class="badge badge--ultimas">Últimas unidades</span>';
    else if (p.nuevo) html += '<span class="badge badge--nuevo">Nuevo</span>';
    return html;
  }

  function tarjeta(p) {
    var url = p.imagen || PLACEHOLDER;
    var fav = estado.favoritos.indexOf(p.id) !== -1;
    var agotado = p.estado === 'agotado';
    var oferta = p.precioAnterior > p.precio;

    return '' +
      '<article class="card' + (agotado ? ' card--agotado' : '') + '" data-id="' + esc(p.id) + '">' +
        '<div class="card__media">' +
          '<img class="card__img" src="' + esc(url) + '" alt="' + esc(p.nombre) + '" loading="lazy" width="900" height="1200">' +
          '<div class="card__badges">' + badges(p) + '</div>' +
          '<button class="card__fav' + (fav ? ' is-fav' : '') + '" data-fav="' + esc(p.id) + '" aria-pressed="' + (fav ? 'true' : 'false') + '" aria-label="' + (fav ? 'Quitar de favoritos' : 'Añadir a favoritos') + ': ' + esc(p.nombre) + '">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7.5-4.6-7.5-9.4A4.1 4.1 0 0 1 12 7.6a4.1 4.1 0 0 1 7.5 3C19.5 15.4 12 20 12 20z" fill="' + (fav ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>' +
          '</button>' +
          '<button class="card__quick" data-quick="' + esc(p.id) + '"' + (agotado ? ' disabled aria-disabled="true"' : '') + '>' +
            (agotado ? 'Agotado' : 'Añadir al carrito') +
          '</button>' +
        '</div>' +
        '<div class="card__cuerpo">' +
          '<h3 class="card__nombre">' + esc(p.nombre) + '</h3>' +
          '<p class="card__cat">' + esc(S.tipoLabel(p.tipo)) + ' · ' + esc(S.publicoLabel(p.publico)) + '</p>' +
          '<div class="card__precio-fila">' +
            '<span class="card__precio' + (oferta ? ' card__precio--oferta' : '') + '">' + S.precioCOP(p.precio) + '</span>' +
            (oferta ? '<span class="card__antes">' + S.precioCOP(p.precioAnterior) + '</span>' : '') +
          '</div>' +
        '</div>' +
      '</article>';
  }

  function esqueletos(cantidad) {
    var html = '';
    for (var i = 0; i < cantidad; i++) {
      html += '' +
        '<article class="card card--esqueleto" aria-hidden="true">' +
          '<div class="card__media esqueleto"></div>' +
          '<div class="card__cuerpo">' +
            '<div class="esqueleto e-linea" style="width:80%"></div>' +
            '<div class="esqueleto e-linea e-linea--corta"></div>' +
            '<div class="esqueleto e-linea" style="width:40%;margin-top:10px"></div>' +
          '</div>' +
        '</article>';
    }
    return html;
  }

  function actualizarAviso(total) {
    var etiquetas = [];
    if (estado.categoria !== 'todos') {
      var cat = S.CATEGORIAS.filter(function (c) { return c.id === estado.categoria; })[0];
      etiquetas.push(cat ? cat.label : estado.categoria);
    }
    if (estado.tipo) etiquetas.push(S.tipoLabel(estado.tipo));
    if (estado.termino.trim()) etiquetas.push('«' + estado.termino.trim() + '»');
    if (estado.soloFavoritos) etiquetas.push('Favoritos');

    if (!etiquetas.length) {
      avisoFiltro.hidden = true;
      return;
    }
    avisoFiltro.hidden = false;
    avisoFiltro.innerHTML = 'Filtrando por <strong>' + esc(etiquetas.join(' · ')) + '</strong> — ' +
      total + (total === 1 ? ' pieza' : ' piezas') + '.';
  }

  /** Configura el bloque vacío según el motivo. */
  function pintarVacio(tipo) {
    accionVacio = tipo;

    if (tipo === 'error') {
      vacioIcono.textContent = '!';
      vacioTitulo.textContent = 'No pudimos cargar el catálogo';
      vacioTexto.textContent = 'Revisa tu conexión y vuelve a intentarlo en un momento.';
      btnVacio.textContent = 'Reintentar';
      btnVacio.hidden = false;
      return;
    }

    if (tipo === 'filtro') {
      vacioIcono.textContent = '✳';
      vacioTitulo.textContent = 'Nada por aquí';
      vacioTexto.textContent = 'No encontramos prendas con ese filtro. Prueba con otra categoría.';
      btnVacio.textContent = 'Ver todo el catálogo';
      btnVacio.hidden = false;
      return;
    }

    // Catálogo vacío: la tienda todavía no tiene productos publicados
    vacioIcono.textContent = '✳';
    vacioTitulo.textContent = 'Próximamente';
    vacioTexto.textContent = 'Estamos preparando el primer drop. Déjanos tu correo y te avisamos antes que a nadie.';
    btnVacio.textContent = 'Avísame del próximo drop';
    btnVacio.hidden = false;
  }

  function renderCargando() {
    grid.hidden = false;
    grid.innerHTML = esqueletos(8);
    vacio.hidden = true;
    if (filtros) filtros.hidden = true;
    avisoFiltro.hidden = true;
    estadoCatalogo.textContent = 'Cargando catálogo…';
  }

  function renderCatalogo() {
    if (estado.cargando) {
      renderCargando();
      return;
    }

    if (estado.error) {
      grid.hidden = true;
      grid.innerHTML = '';
      vacio.hidden = false;
      if (filtros) filtros.hidden = true;
      avisoFiltro.hidden = true;
      estadoCatalogo.textContent = 'Catálogo no disponible';
      pintarVacio('error');
      return;
    }

    var lista = productosVisibles();
    var total = estado.productos.length;
    var hayFiltros = !!estado.termino.trim() || estado.categoria !== 'todos' ||
      !!estado.tipo || estado.soloFavoritos;

    grid.innerHTML = lista.map(tarjeta).join('');
    grid.hidden = lista.length === 0;
    if (filtros) filtros.hidden = total === 0;

    if (lista.length === 0) {
      vacio.hidden = false;
      pintarVacio(total === 0 ? 'vacio' : 'filtro');
    } else {
      vacio.hidden = true;
    }

    actualizarAviso(lista.length);

    estadoCatalogo.textContent = total === 0
      ? 'Catálogo en preparación'
      : (hayFiltros ? lista.length + ' de ' + total + ' piezas' : total + ' piezas disponibles');

    // Sincroniza las píldoras de filtro
    Array.prototype.forEach.call(document.querySelectorAll('.filtro'), function (f) {
      var activo = f.getAttribute('data-categoria') === estado.categoria;
      f.classList.toggle('is-activo', activo);
      f.setAttribute('aria-pressed', activo ? 'true' : 'false');
    });
  }

  /** Limpia del carrito lo que ya no existe y normaliza cantidades. */
  function sincronizarCarrito() {
    estado.carrito = estado.carrito
      .filter(function (i) { return !!S.obtenerProducto(i.id); })
      .map(function (i) {
        i.cantidad = Math.max(1, Number(i.cantidad) || 1);
        i.precio = Number(i.precio) || 0;
        return i;
      });
    S.guardarCarrito(estado.carrito);
  }

  /** Descarga el catálogo desde Supabase. */
  function cargarCatalogo() {
    estado.cargando = true;
    estado.error = null;
    renderCargando();

    // Sin Supabase configurado la tienda muestra su estado "Próximamente"
    if (!S.configurado().ok) {
      estado.productos = [];
      estado.cargando = false;
      estado.error = null;
      sincronizarCarrito();
      renderCarrito();
      renderCatalogo();
      actualizarPista();
      return Promise.resolve([]);
    }

    return S.cargarProductos()
      .then(function (lista) {
        estado.productos = lista;
        estado.cargando = false;
        estado.error = null;
        sincronizarCarrito();
        renderCarrito();
        renderCatalogo();
        actualizarPista();
      })
      .catch(function (err) {
        console.error('Error al cargar el catálogo:', err);
        estado.cargando = false;
        estado.error = err;
        renderCatalogo();
        actualizarPista();
      });
  }

  grid.addEventListener('click', function (e) {
    var botonFav = e.target.closest('[data-fav]');
    if (botonFav) {
      e.preventDefault();
      e.stopPropagation();
      alternarFavorito(botonFav.getAttribute('data-fav'));
      return;
    }

    var botonQuick = e.target.closest('[data-quick]');
    if (botonQuick) {
      e.preventDefault();
      e.stopPropagation();
      anadirRapido(botonQuick.getAttribute('data-quick'));
      return;
    }

    var card = e.target.closest('.card');
    if (card && card.getAttribute('data-id')) {
      abrirModal(card.getAttribute('data-id'));
    }
  });

  btnVacio.addEventListener('click', function () {
    if (accionVacio === 'error') {
      cargarCatalogo();
      return;
    }
    if (accionVacio === 'vacio') {
      var destino = document.querySelector('.newsletter');
      if (destino) destino.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    estado.categoria = 'todos';
    estado.tipo = null;
    estado.termino = '';
    estado.soloFavoritos = false;
    inputBuscar.value = '';
    btnFavoritos.setAttribute('aria-pressed', 'false');
    renderCatalogo();
    actualizarPista();
  });

  /* ----------------------------- Modal producto ----------------------------- */

  var modal = $('modalProducto');
  var modalImagen = $('modalImagen');
  var modalVideo = $('modalVideo');
  var modalTallas = $('modalTallas');
  var modalError = $('modalError');
  var modalAgregar = $('modalAgregar');
  var ultimoFoco = null;

  function elementosEnfocables(raiz) {
    return Array.prototype.slice.call(
      raiz.querySelectorAll('button:not(:disabled), [href], input, select, textarea, video[controls]')
    ).filter(function (el) { return el.offsetParent !== null; });
  }

  function abrirModal(id) {
    var p = S.obtenerProducto(id);
    if (!p) return;

    ultimoFoco = document.activeElement;
    estado.productoModal = p;
    estado.tallaModal = null;

    $('modalCategoria').textContent = S.tipoLabel(p.tipo) + ' · ' + S.publicoLabel(p.publico);
    $('modalNombre').textContent = p.nombre;
    $('modalPrecio').textContent = S.precioCOP(p.precio);

    var antes = $('modalPrecioAntes');
    if (p.precioAnterior > p.precio) {
      antes.hidden = false;
      antes.textContent = S.precioCOP(p.precioAnterior);
    } else {
      antes.hidden = true;
    }

    $('modalDescripcion').textContent = p.descripcion || '';
    $('modalMeta').textContent = 'Color: ' + (p.color || 'Negro') + ' · Ref. ' + String(p.id).slice(-6).toUpperCase();

    $('modalBadges').innerHTML = badges(p);

    // Imagen / video
    modalVideo.pause();
    modalVideo.removeAttribute('src');
    modalVideo.hidden = true;

    modalImagen.hidden = false;
    modalImagen.alt = p.nombre;
    modalImagen.src = p.imagen || PLACEHOLDER;

    if (p.video) {
      modalVideo.hidden = false;
      modalVideo.src = p.video;
    }

    // Tallas
    var tallas = Array.isArray(p.sizes) && p.sizes.length
      ? p.sizes
      : S.tallasDe(p.tipo).map(function (t) { return { label: t, disponible: true }; });

    modalTallas.innerHTML = tallas.map(function (t) {
      return '<button class="talla" type="button" data-talla="' + esc(t.label) + '"' +
        (t.disponible ? '' : ' disabled aria-disabled="true" title="Talla agotada"') +
        ' aria-pressed="false">' + esc(t.label) + '</button>';
    }).join('');

    var hayStock = tallas.some(function (t) { return t.disponible; });
    modalAgregar.disabled = !hayStock || p.estado === 'agotado';
    modalAgregar.textContent = (p.estado === 'agotado' || !hayStock) ? 'Producto agotado' : 'Añadir al carrito';
    modalError.hidden = true;

    modalTallas.querySelectorAll('.talla:not(:disabled)').forEach(function (b) {
      b.addEventListener('click', function () {
        seleccionarTalla(b.getAttribute('data-talla'));
      });
    });

    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('no-scroll');
    setTimeout(function () { $('modalCerrar').focus(); }, 60);
  }

  function seleccionarTalla(talla) {
    estado.tallaModal = talla;
    modalTallas.querySelectorAll('.talla').forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-talla') === talla ? 'true' : 'false');
    });
    modalError.hidden = true;
  }

  function cerrarModal() {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('no-scroll');
    modalVideo.pause();
    estado.productoModal = null;
    if (ultimoFoco && ultimoFoco.focus) setTimeout(function () { ultimoFoco.focus(); }, 60);
  }

  $('modalCerrar').addEventListener('click', cerrarModal);
  document.querySelector('[data-cerrar-modal]').addEventListener('click', cerrarModal);

  modal.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab') return;
    var enfocables = elementosEnfocables(modal);
    if (!enfocables.length) return;
    var primero = enfocables[0];
    var ultimo = enfocables[enfocables.length - 1];
    if (e.shiftKey && document.activeElement === primero) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primero.focus();
    }
  });

  $('btnGuiaTallas').addEventListener('click', function () {
    var p = estado.productoModal;
    if (!p) return;
    var disp = (p.sizes || []).filter(function (t) { return t.disponible; }).map(function (t) { return t.label; });
    toast(disp.length ? 'Tallas disponibles: ' + disp.join(', ') + '. Las tachadas están agotadas.' : 'Sin tallas disponibles por ahora.', 'ok');
  });

  modalAgregar.addEventListener('click', function () {
    var p = estado.productoModal;
    if (!p) return;
    if (!estado.tallaModal) {
      modalError.hidden = false;
      modalError.textContent = 'Selecciona una talla para continuar.';
      modalTallas.querySelectorAll('.talla:not(:disabled)').forEach(function (b) { b.focus(); });
      return;
    }
    agregarAlCarrito(p, estado.tallaModal, 1);
    cerrarModal();
    abrirCarrito();
  });

  /* --------------------------------- Carrito -------------------------------- */

  var panelCarrito = $('panelCarrito');
  var carritoItems = $('carritoItems');
  var carritoVacio = $('carritoVacio');
  var carritoPie = $('carritoPie');
  var carritoTotal = $('carritoTotal');
  var cartCount = $('cartCount');

  function claveItem(id, talla) { return id + '|' + talla; }

  function anadirRapido(id) {
    var p = S.obtenerProducto(id);
    if (!p || p.estado === 'agotado') {
      toast('Este producto está agotado.', 'error');
      return;
    }
    var disponibles = (p.sizes || []).filter(function (t) { return t.disponible; });
    if (disponibles.length === 1) {
      agregarAlCarrito(p, disponibles[0].label, 1);
      abrirCarrito();
      return;
    }
    abrirModal(id);
    toast('Elige tu talla para continuar.');
  }

  function agregarAlCarrito(p, talla, cantidad) {
    var clave = claveItem(p.id, talla);
    var unidades = Number(cantidad) > 0 ? Number(cantidad) : 1;
    var existente = estado.carrito.filter(function (i) { return i.clave === clave; })[0];

    if (existente) {
      existente.cantidad = (Number(existente.cantidad) || 0) + unidades;
    } else {
      estado.carrito.push({
        clave: clave,
        id: p.id,
        talla: talla,
        nombre: p.nombre,
        precio: Number(p.precio) || 0,
        imagen: p.imagen,
        tipo: p.tipo,
        cantidad: unidades
      });
    }

    S.guardarCarrito(estado.carrito);
    renderCarrito();
    toast('«' + p.nombre + '» añadido al carrito · Talla ' + talla, 'ok');
  }

  function totalCarrito() {
    return estado.carrito.reduce(function (acc, i) {
      return acc + (Number(i.precio) || 0) * (Number(i.cantidad) || 0);
    }, 0);
  }

  function renderCarrito() {
    var totalUnidades = estado.carrito.reduce(function (a, i) {
      return a + (Number(i.cantidad) || 0);
    }, 0);
    cartCount.textContent = totalUnidades;
    cartCount.hidden = totalUnidades === 0;

    carritoVacio.hidden = estado.carrito.length > 0;
    carritoPie.hidden = estado.carrito.length === 0;
    carritoItems.hidden = estado.carrito.length === 0;

    carritoItems.innerHTML = estado.carrito.map(function (i) {
      var img = i.imagen || PLACEHOLDER;
      return '' +
        '<div class="item" data-clave="' + esc(i.clave) + '">' +
          '<img class="item__img" src="' + esc(img) + '" alt="' + esc(i.nombre) + '" width="66" height="88">' +
          '<div class="item__info">' +
            '<p class="item__nombre">' + esc(i.nombre) + '</p>' +
            '<p class="item__meta">Talla ' + esc(i.talla) + '</p>' +
            '<p class="item__precio">' + S.precioCOP(i.precio) + '</p>' +
          '</div>' +
          '<div class="item__controles">' +
            '<div class="item__cantidad">' +
              '<button data-accion="menos" aria-label="Quitar una unidad de ' + esc(i.nombre) + '">−</button>' +
              '<span>' + i.cantidad + '</span>' +
              '<button data-accion="mas" aria-label="Añadir una unidad de ' + esc(i.nombre) + '">+</button>' +
            '</div>' +
            '<button class="item__quitar" data-accion="quitar">Quitar</button>' +
          '</div>' +
        '</div>';
    }).join('');

    carritoTotal.textContent = S.precioCOP(totalCarrito());
  }

  carritoItems.addEventListener('click', function (e) {
    var boton = e.target.closest('[data-accion]');
    if (!boton) return;
    var fila = boton.closest('.item');
    if (!fila) return;
    var clave = fila.getAttribute('data-clave');
    var item = estado.carrito.filter(function (i) { return i.clave === clave; })[0];
    if (!item) return;

    var accion = boton.getAttribute('data-accion');
    if (accion === 'mas') {
      item.cantidad = (Number(item.cantidad) || 0) + 1;
    } else if (accion === 'menos') {
      item.cantidad = (Number(item.cantidad) || 0) - 1;
      if (item.cantidad <= 0) {
        estado.carrito = estado.carrito.filter(function (i) { return i.clave !== clave; });
      }
    } else if (accion === 'quitar') {
      estado.carrito = estado.carrito.filter(function (i) { return i.clave !== clave; });
      toast('Producto eliminado del carrito.');
    }

    S.guardarCarrito(estado.carrito);
    renderCarrito();
  });

  function abrirCarrito() {
    panelCarrito.classList.add('is-open');
    panelCarrito.setAttribute('aria-hidden', 'false');
    document.body.classList.add('no-scroll');
    setTimeout(function () { $('btnCerrarCarrito').focus(); }, 80);
  }

  function cerrarCarrito() {
    panelCarrito.classList.remove('is-open');
    panelCarrito.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('no-scroll');
    $('btnCarrito').focus();
  }

  $('btnCarrito').addEventListener('click', abrirCarrito);
  $('btnCerrarCarrito').addEventListener('click', cerrarCarrito);
  Array.prototype.forEach.call(document.querySelectorAll('[data-cerrar-carrito]'), function (b) {
    b.addEventListener('click', cerrarCarrito);
  });

  $('btnVaciar').addEventListener('click', function () {
    if (!estado.carrito.length) return;
    estado.carrito = [];
    S.guardarCarrito([]);
    renderCarrito();
    toast('Carrito vaciado.');
  });

  $('btnWhatsapp').addEventListener('click', function () {
    if (!estado.carrito.length) {
      toast('Tu carrito está vacío.', 'error');
      return;
    }

    if (!S.CONFIG.whatsapp) {
      toast('El checkout por WhatsApp todavía no está configurado. Escríbenos por correo.', 'error');
      return;
    }

    var total = totalCarrito();
    var lineas = estado.carrito.map(function (i) {
      return '• ' + i.nombre + ' — Talla ' + i.talla + ' × ' + i.cantidad + ' — ' + S.precioCOP(i.precio * i.cantidad);
    });

    var mensaje = 'Hola ' + S.CONFIG.marca + ' 👋 Quiero hacer este pedido:\n\n' +
      lineas.join('\n') +
      '\n\nTotal: ' + S.precioCOP(total) +
      '\n\nTe confirmo mi nombre, la dirección de entrega y la forma de pago (efectivo contra entrega, transferencia bancaria o pasarela autorizada).';

    // Se abre en el mismo gesto del clic para que el navegador no lo bloquee
    window.open('https://wa.me/' + S.CONFIG.whatsapp + '?text=' + encodeURIComponent(mensaje), '_blank', 'noopener');

    // Copia del pedido en la base de datos (no bloquea ni interrumpe)
    S.registrarPedido(estado.carrito, total);

    toast('Abriendo WhatsApp con tu pedido…', 'ok');
  });

  /* -------------------------- Selección de categoría ------------------------ */

  function irATienda() {
    var destino = $('tienda');
    if (!destino) return;
    destino.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function aplicarCategoria(categoria, tipo) {
    estado.categoria = categoria || 'todos';
    estado.tipo = tipo || null;
    estado.soloFavoritos = false;
    btnFavoritos.setAttribute('aria-pressed', 'false');

    cerrarMega();
    cerrarMenu();
    cerrarBuscador();
    renderCatalogo();
    actualizarPista();

    requestAnimationFrame(function () { irATienda(); });
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-categoria]'), function (b) {
    if (b.classList.contains('filtro') || b.id === 'btnLimpiarFiltros') return;
    b.addEventListener('click', function (e) {
      e.preventDefault();
      aplicarCategoria(b.getAttribute('data-categoria'), b.getAttribute('data-tipo'));
    });
  });

  document.querySelectorAll('.filtro').forEach(function (f) {
    f.addEventListener('click', function () {
      estado.categoria = f.getAttribute('data-categoria');
      estado.tipo = null;
      estado.soloFavoritos = false;
      btnFavoritos.setAttribute('aria-pressed', 'false');
      renderCatalogo();
      actualizarPista();
    });
  });

  /* ------------------------------- Newsletter ------------------------------- */

  var formNewsletter = $('newsletterForm');
  var inputNewsletter = $('newsletterEmail');
  var msgNewsletter = $('newsletterMsg');
  var btnNewsletter = formNewsletter.querySelector('button[type="submit"]');

  formNewsletter.addEventListener('submit', function (e) {
    e.preventDefault();
    var valor = inputNewsletter.value.trim();
    var valido = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(valor);

    if (!valido) {
      inputNewsletter.setAttribute('aria-invalid', 'true');
      msgNewsletter.textContent = 'Escribe un correo válido, por ejemplo tucorreo@ejemplo.com';
      msgNewsletter.className = 'newsletter__msg es-error';
      inputNewsletter.focus();
      return;
    }

    if (!S.configurado().ok) {
      inputNewsletter.removeAttribute('aria-invalid');
      msgNewsletter.textContent = 'La lista de espera abre con el próximo drop.';
      msgNewsletter.className = 'newsletter__msg es-error';
      return;
    }

    inputNewsletter.removeAttribute('aria-invalid');
    btnNewsletter.disabled = true;
    btnNewsletter.textContent = 'Enviando…';

    S.suscribir(valor)
      .then(function (r) {
        msgNewsletter.textContent = r.nuevo
          ? '¡Listo! Te avisamos en el próximo drop.'
          : 'Ese correo ya estaba en la lista.';
        msgNewsletter.className = 'newsletter__msg es-ok';
        formNewsletter.reset();
        toast(r.nuevo ? 'Te añadimos a la lista de espera.' : 'Ya estabas en la lista.', 'ok');
      })
      .catch(function (err) {
        console.error('Error al suscribir:', err);
        msgNewsletter.textContent = 'No pudimos guardar tu correo. Inténtalo de nuevo.';
        msgNewsletter.className = 'newsletter__msg es-error';
      })
      .finally(function () {
        btnNewsletter.disabled = false;
        btnNewsletter.textContent = 'Unirme';
      });
  });

  /* ---------------------------------- Escape -------------------------------- */

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;

    if (modal.classList.contains('is-open')) { cerrarModal(); return; }
    if (panelCarrito.classList.contains('is-open')) { cerrarCarrito(); return; }
    if (buscador.classList.contains('is-open')) { cerrarBuscador(); return; }
    if (menuMovil.classList.contains('is-open')) { cerrarMenu(); return; }
    if (mega && mega.classList.contains('is-open')) { cerrarMega(); }
  });

  /* -------------------------------- Arranque -------------------------------- */

  $('anioActual').textContent = new Date().getFullYear();

  pintarContacto();
  renderCarrito();
  cargarCatalogo();

  // Refresca el catálogo si el dueño publica cambios desde el panel
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) return;
    if (!S.configurado().ok) return;
    estado.favoritos = S.leerFavoritos();
    S.cargarProductos()
      .then(function (lista) {
        if (estado.cargando) return;
        estado.productos = lista;
        sincronizarCarrito();
        renderCarrito();
        renderCatalogo();
        actualizarPista();
      })
      .catch(function () {});
  });
})();
