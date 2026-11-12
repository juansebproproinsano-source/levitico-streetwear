-- ---------------------------------------------------------------------------
-- LEVÍTICO STREETWEAR — galería de fotos y videos por producto
--
-- Cómo usarlo:
--   1. Entra a https://supabase.com/dashboard y abre tu proyecto.
--   2. Menú izquierdo → SQL Editor → New query.
--   3. Pega este archivo completo y pulsa «Run».
--
-- Añade a la tabla "productos" las columnas donde el panel guarda hasta
-- 6 fotos y 2 videos por producto, más el encuadre de cada foto (punto de
-- enfoque y acercamiento). No borra ni cambia nada de lo que ya tienes: los
-- productos viejos conservan su foto en "imagen_url".
-- Se puede ejecutar más de una vez sin romper nada.
-- ---------------------------------------------------------------------------

alter table public.productos
  add column if not exists imagenes  jsonb not null default '[]'::jsonb,
  add column if not exists videos    jsonb not null default '[]'::jsonb,
  add column if not exists encuadres jsonb not null default '[]'::jsonb;

-- Hace que la API vea las columnas nuevas de inmediato, sin esperar
-- a que se reinicie sola (es lo que provoca el error de «schema cache»).
notify pgrst, 'reload schema';
