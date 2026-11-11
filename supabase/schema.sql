-- ============================================================================
-- LEVÍTICO STREETWEAR — esquema de base de datos (Supabase / PostgreSQL)
--
-- Cómo usarlo:
--   1. Supabase → SQL Editor → New query
--   2. Pega TODO este archivo y pulsa "Run"
--   3. Si tu proyecto ya tenía estas tablas, el script las limpia y las recrea.
--
-- Es idempotente: puedes volver a ejecutarlo sin romper nada.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. PRODUCTOS
-- ---------------------------------------------------------------------------
create table if not exists public.productos (
  id               uuid primary key default gen_random_uuid(),
  nombre           text not null check (char_length(trim(nombre)) >= 3),
  tipo             text not null default 'camiseta',
  publico          text not null default 'unisex',
  precio           numeric(12, 0) not null default 0 check (precio >= 0),
  precio_anterior  numeric(12, 0) not null default 0 check (precio_anterior >= 0),
  estado           text not null default 'disponible'
                     check (estado in ('disponible', 'ultimas', 'agotado')),
  nuevo            boolean not null default false,
  limitado         boolean not null default false,
  color            text not null default 'Negro',
  descripcion      text not null default '',
  imagen_url       text not null default '',
  video_url        text not null default '',
  tallas           jsonb not null default '[]'::jsonb,
  activo           boolean not null default true,
  orden            integer not null default 0,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now()
);

create index if not exists productos_activo_orden_idx
  on public.productos (activo, orden, creado_en desc);

-- Mantiene actualizado_en al día
create or replace function public.marcar_actualizado()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

drop trigger if exists productos_actualizado on public.productos;
create trigger productos_actualizado
  before update on public.productos
  for each row execute function public.marcar_actualizado();

-- RLS: el público ve solo productos activos; el admin ve todo
alter table public.productos enable row level security;

drop policy if exists "productos_lectura_publica" on public.productos;
create policy "productos_lectura_publica"
  on public.productos for select
  to anon
  using (activo = true);

drop policy if exists "productos_lectura_admin" on public.productos;
create policy "productos_lectura_admin"
  on public.productos for select
  to authenticated
  using (true);

drop policy if exists "productos_escritura_admin" on public.productos;
create policy "productos_escritura_admin"
  on public.productos for insert
  to authenticated
  with check (true);

drop policy if exists "productos_actualizacion_admin" on public.productos;
create policy "productos_actualizacion_admin"
  on public.productos for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "productos_borrado_admin" on public.productos;
create policy "productos_borrado_admin"
  on public.productos for delete
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- 2. PEDIDOS (registro de lo que el cliente envió por WhatsApp)
-- ---------------------------------------------------------------------------
create table if not exists public.pedidos (
  id           uuid primary key default gen_random_uuid(),
  items        jsonb not null default '[]'::jsonb,
  total        numeric(12, 0) not null default 0,
  origen       text not null default 'web',
  estado       text not null default 'nuevo'
                 check (estado in ('nuevo', 'contactado', 'pagado', 'enviado', 'cancelado')),
  nota         text not null default '',
  creado_en    timestamptz not null default now()
);

create index if not exists pedidos_creado_idx on public.pedidos (creado_en desc);

alter table public.pedidos enable row level security;

-- Cualquier visitante puede registrar un pedido, pero nadie puede leerlos
-- sin haber iniciado sesión como administrador.
drop policy if exists "pedidos_crear_publico" on public.pedidos;
create policy "pedidos_crear_publico"
  on public.pedidos for insert
  to anon, authenticated
  with check (true);

drop policy if exists "pedidos_lectura_admin" on public.pedidos;
create policy "pedidos_lectura_admin"
  on public.pedidos for select
  to authenticated
  using (true);

drop policy if exists "pedidos_actualizacion_admin" on public.pedidos;
create policy "pedidos_actualizacion_admin"
  on public.pedidos for update
  to authenticated
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- 3. SUSCRIPTORES (lista de espera del newsletter)
-- ---------------------------------------------------------------------------
create table if not exists public.suscriptores (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique check (email ~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$'),
  creado_en  timestamptz not null default now()
);

alter table public.suscriptores enable row level security;

drop policy if exists "suscriptores_alta_publica" on public.suscriptores;
create policy "suscriptores_alta_publica"
  on public.suscriptores for insert
  to anon, authenticated
  with check (true);

drop policy if exists "suscriptores_lectura_admin" on public.suscriptores;
create policy "suscriptores_lectura_admin"
  on public.suscriptores for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- 4. ALMACENAMIENTO DE FOTOS Y VIDEOS
--    Bucket público de lectura, escritura solo para administradores.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'productos',
  'productos',
  true,
  52428800, -- 50 MB
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "media_lectura_publica" on storage.objects;
create policy "media_lectura_publica"
  on storage.objects for select
  using (bucket_id = 'productos');

drop policy if exists "media_subida_admin" on storage.objects;
create policy "media_subida_admin"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'productos');

drop policy if exists "media_actualizacion_admin" on storage.objects;
create policy "media_actualizacion_admin"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'productos');

drop policy if exists "media_borrado_admin" on storage.objects;
create policy "media_borrado_admin"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'productos');

-- ============================================================================
-- LISTO. El catálogo arranca vacío: carga el primer producto desde
-- /admin.html después de crear tu usuario administrador.
-- ============================================================================
