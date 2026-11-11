/* ==========================================================================
   LEVÍTICO STREETWEAR — config.js
   Datos reales de la tienda. Este es el único archivo que debes editar.
   Se carga antes de store.js.
   ========================================================================== */
window.LEVITICO_CONFIG = {
  marca: 'LEVÍTICO',
  marcaCompleta: 'LEVÍTICO Streetwear',
  claim: 'Viste tu Fe',
  ciudad: 'Armenia',

  // Horario de atención (se muestra en el pie de página)
  horario: 'Lun a sáb, 9:00 a.m. – 6:00 p.m. · Dom, 9:00 a.m. – 2:00 p.m.',

  // WhatsApp de la tienda: solo dígitos, con indicativo del país.
  whatsapp: '573237402006',

  // Correo de atención al cliente
  email: 'soporte@leviticostreetwear.com',

  // Usuario de Instagram (sin @). Déjalo vacío si no aplica.
  instagram: '',

  // --- Supabase (Project Settings → API) ---
  supabaseUrl: 'https://juuyxsrpcqhqamofwqrs.supabase.co',
  // Clave pública "publishable". Es segura de exponer: las reglas RLS
  // del archivo supabase/schema.sql limitan qué puede hacer un visitante.
  supabaseAnonKey: 'sb_publishable_8Rwz81FHg1I0siRwyChGgw_pUPmHi8e'
};
