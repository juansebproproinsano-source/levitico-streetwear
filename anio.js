/* ==========================================================================
   LEVÍTICO STREETWEAR — anio.js
   Escribe el año actual en el pie de página.
   Va en un archivo aparte a propósito: así la política de seguridad (CSP)
   puede bloquear cualquier script escrito dentro del HTML y no hace falta
   abrir una excepción.
   ========================================================================== */
(function () {
  'use strict';

  var anio = document.getElementById('anioActual');
  if (anio) anio.textContent = String(new Date().getFullYear());
})();
