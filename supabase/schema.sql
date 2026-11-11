-- ============================================================================
-- LEVÍTICO STREETWEAR — esquema de base de datos (Supabase / PostgreSQL)
--
-- Cómo usarlo:
--   1. Supabase → SQL Editor → New query
--   2. Pega TODO este archivo y pulsa "Run"
--   3. Si tu proyecto ya tenía estas tablas, el script las actualiza sin
--      borrar datos. Es idempotente: puedes volver a ejecutarlo sin romper nada.
--
-- ----------------------------------------------------------------------------
-- ¡IMPORTANTE! LISTA BLANCA DE ADMINISTRADORES
--
-- Solo los correos que estén en la tabla "administradores" pueden crear,
-- editar o borrar productos, ver pedidos y subir fotos. Si el correo con el
-- que creaste tu usuario en Authentication → Users NO es
-- soporte@leviticostreetwear.com, cámbialo en la línea marcada como
-- ">>> CORREO DEL ADMINISTRADOR <<<" antes de pulsar Run.
-- ----------------------------------------------------------------------------
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 0. UTILIDADES DE SEGURIDAD
-- ---------------------------------------------------------------------------

-- IP del visitante tal como la ve PostgREST (detrás de Vercel/Supabase).
-- Si no hay cabeceras se devuelve 'desconocida' para no romper nada.
create or replace function public.ip_solicitante()
returns text
language plpgsql
stable
as $$
declare
  cabeceras json;
  reenviada text;
begin
  begin
    cabeceras := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    cabeceras := null;
  end;

  if cabeceras is null then
    return 'desconocida';
  end if;

  reenviada := coalesce(
    cabeceras ->> 'cf-connecting-ip',
    cabeceras ->> 'x-real-ip',
    cabeceras ->> 'x-forwarded-for',
    ''
  );

  if reenviada = '' then
    return 'desconocida';
  end if;

  -- x-forwarded-for puede traer varias IPs: la primera es la del cliente.
  return left(split_part(reenviada, ',', 1), 90);
end;
$$;

revoke all on function public.ip_solicitante() from public, anon;
grant execute on function public.ip_solicitante() to authenticated;

-- ---------------------------------------------------------------------------
-- 1. LISTA BLANCA DE ADMINISTRADORES
--    Sustituye a "cualquier usuario autenticado". Es el candado real del panel.
-- ---------------------------------------------------------------------------
create table if not exists public.administradores (
  email      text primary key check (email ~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$'),
  creado_en  timestamptz not null default now()
);

-- Solo accesible desde funciones con permisos elevados; nadie puede leerla
-- ni escribirla con la clave pública.
alter table public.administradores enable row level security;

-- >>> CORREO DEL ADMINISTRADOR <<<  cámbialo si tu usuario es otro.
insert into public.administradores (email)
values ('soporte@leviticostreetwear.com')
on conflict (email) do nothing;

create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.administradores a
     where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.es_admin() from public, anon;
grant execute on function public.es_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. CONTADOR DE SOLICITUDES (límite por IP)
--    Nadie puede leerla ni escribirla con la clave pública.
-- ---------------------------------------------------------------------------
create table if not exists public.contador_solicitudes (
  ip         text not null,
  tipo       text not null,
  creado_en  timestamptz not null default now()
);

create index if not exists contador_solicitudes_ip_idx
  on public.contador_solicitudes (ip, tipo, creado_en desc);

alter table public.contador_solicitudes enable row level security;

-- ---------------------------------------------------------------------------
-- 3. REGISTRO DE EVENTOS (auditoría)
-- ---------------------------------------------------------------------------
create table if not exists public.eventos (
  id         uuid primary key default gen_random_uuid(),
  tipo       text not null,
  ruta       text not null default '',
  detalle    text not null default '',
  actor      text not null default '',
  ip         text not null default '',
  creado_en  timestamptz not null default now()
);

create index if not exists eventos_creado_idx on public.eventos (creado_en desc);

alter table public.eventos enable row level security;

drop policy if exists "eventos_lectura_admin" on public.eventos;
create policy "eventos_lectura_admin"
  on public.eventos for select
  to authenticated
  using (public.es_admin());

-- No hay política de INSERT ni de UPDATE/DELETE: solo se escribe desde
-- funciones con permisos elevados. El registro no se puede manipular ni borrar
-- desde el navegador.

-- Anota un evento. Los visitantes no pueden llamarla; el panel sí.
create or replace function public.registrar_evento(
  p_tipo    text,
  p_ruta    text default '',
  p_detalle text default ''
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.eventos (tipo, ruta, detalle, actor, ip)
  values (
    left(coalesce(p_tipo, ''), 40),
    left(coalesce(p_ruta, ''), 120),
    left(coalesce(p_detalle, ''), 400),
    coalesce(auth.uid()::text, 'anon'),
    public.ip_solicitante()
  );
end;
$$;

revoke all on function public.registrar_evento(text, text, text) from public, anon;
grant execute on function public.registrar_evento(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. LIMITADOR DE SOLICITUDES POR IP
--    Se usa como trigger: (minutos, máximo de intentos en esa ventana).
-- ---------------------------------------------------------------------------
create or replace function public.limitar_solicitudes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  minutos    integer := greatest(1, coalesce(nullif(tg_argv[1], '')::integer, 10));
  maximo     integer := greatest(1, coalesce(nullif(tg_argv[2], '')::integer, 8));
  origen     text    := public.ip_solicitante();
  recientes  integer;
begin
  new.ip := origen;

  -- Limpieza oportunista: la tabla no crece sin control.
  delete from public.contador_solicitudes
   where creado_en < now() - interval '1 day';

  select count(*) into recientes
    from public.contador_solicitudes c
   where c.ip = origen
     and c.tipo = tg_table_name
     and c.creado_en > now() - make_interval(mins => minutos);

  if recientes >= maximo then
    insert into public.eventos (tipo, ruta, detalle, actor, ip)
    values ('limite_alcanzado', left(tg_table_name, 120),
            'Bloqueado por exceso de solicitudes (' || maximo::text || ' en ' || minutos::text || ' min).',
            coalesce(auth.uid()::text, 'anon'), origen);

    raise exception 'Demasiadas solicitudes seguidas. Espera unos minutos e inténtalo otra vez.'
      using errcode = 'P0001';
  end if;

  insert into public.contador_solicitudes (ip, tipo) values (origen, tg_table_name);

  return new;
end;
$$;

revoke all on function public.limitar_solicitudes() from public, anon;

-- ---------------------------------------------------------------------------
-- 5. PRODUCTOS
-- ---------------------------------------------------------------------------
create table if not exists public.productos (
  id               uuid primary key default gen_random_uuid(),
  nombre           text not null check (char_length(trim(nombre)) between 3 and 120),
  tipo             text not null default 'camiseta'
                     check (tipo in ('camiseta', 'buzo', 'chaqueta', 'sudadera', 'gorra', 'accesorio', 'otro')),
  publico          text not null default 'unisex'
                     check (publico in ('hombre', 'mujer', 'unisex')),
  precio           numeric(12, 0) not null default 0 check (precio >= 0),
  precio_anterior  numeric(12, 0) not null default 0 check (precio_anterior >= 0),
  estado           text not null default 'disponible'
                     check (estado in ('disponible', 'ultimas', 'agotado')),
  nuevo            boolean not null default false,
  limitado         boolean not null default false,
  color            text not null default 'Negro' check (char_length(color) <= 40),
  descripcion      text not null default '' check (char_length(descripcion) <= 2000),
  imagen_url       text not null default '' check (imagen_url = '' or imagen_url ~* '^https://'),
  video_url        text not null default '' check (video_url = '' or video_url ~* '^https://'),
  tallas           jsonb not null default '[]'::jsonb,
  activo           boolean not null default true,
  orden            integer not null default 0,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now()
);

-- Columnas que pudieran faltar si la tabla ya existía de antes.
alter table public.productos add column if not exists imagen_url text not null default '';
alter table public.productos add column if not exists video_url  text not null default '';

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

alter table public.productos enable row level security;

-- Lectura: el público ve solo lo activo. El administrador lo ve todo.
drop policy if exists "productos_lectura_publica" on public.productos;
create policy "productos_lectura_publica"
  on public.productos for select
  to anon
  using (activo = true);

drop policy if exists "productos_lectura_admin" on public.productos;
create policy "productos_lectura_admin"
  on public.productos for select
  to authenticated
  using (public.es_admin());

-- Escritura: SOLO el correo de la lista blanca.
drop policy if exists "productos_escritura_admin" on public.productos;
create policy "productos_escritura_admin"
  on public.productos for insert
  to authenticated
  with check (public.es_admin());

drop policy if exists "productos_actualizacion_admin" on public.productos;
create policy "productos_actualizacion_admin"
  on public.productos for update
  to authenticated
  using (public.es_admin())
  with check (public.es_admin());

drop policy if exists "productos_borrado_admin" on public.productos;
create policy "productos_borrado_admin"
  on public.productos for delete
  to authenticated
  using (public.es_admin());

-- ---------------------------------------------------------------------------
-- 6. PEDIDOS
--    El visitante NO puede escribir en esta tabla directamente: solo a través
--    de la función registrar_pedido(), que calcula el total con los precios
--    guardados en la base de datos. Manipular el carrito en el navegador no
--    cambia el precio que se registra.
-- ---------------------------------------------------------------------------
create table if not exists public.pedidos (
  id         uuid primary key default gen_random_uuid(),
  items      jsonb not null default '[]'::jsonb
               check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 30),
  total      numeric(12, 0) not null default 0 check (total >= 0),
  origen     text not null default 'web' check (origen in ('web', 'whatsapp', 'manual')),
  estado     text not null default 'nuevo'
               check (estado in ('nuevo', 'contactado', 'pagado', 'enviado', 'cancelado')),
  nota       text not null default '' check (char_length(nota) <= 2000),
  ip         text not null default '',
  creado_en  timestamptz not null default now()
);

alter table public.pedidos add column if not exists ip text not null default '';

create index if not exists pedidos_creado_idx on public.pedidos (creado_en desc);

alter table public.pedidos enable row level security;

-- SIN política de INSERT pública: la única puerta de entrada es la función.
drop policy if exists "pedidos_crear_publico" on public.pedidos;

drop policy if exists "pedidos_lectura_admin" on public.pedidos;
create policy "pedidos_lectura_admin"
  on public.pedidos for select
  to authenticated
  using (public.es_admin());

drop policy if exists "pedidos_actualizacion_admin" on public.pedidos;
create policy "pedidos_actualizacion_admin"
  on public.pedidos for update
  to authenticated
  using (public.es_admin())
  with check (public.es_admin());

-- Límite: máximo 5 pedidos por IP cada 10 minutos.
drop trigger if exists a_pedidos_limite on public.pedidos;
create trigger a_pedidos_limite
  before insert on public.pedidos
  for each row execute function public.limitar_solicitudes('10', '5');

-- Auditoría: cada pedido registrado deja rastro en "eventos".
create or replace function public.auditar_pedido()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.eventos (tipo, ruta, detalle, actor, ip)
  values (
    'pedido_creado',
    'pedidos',
    'Total ' || new.total::text || ' · ' || jsonb_array_length(new.items)::text || ' línea(s)',
    coalesce(auth.uid()::text, 'anon'),
    coalesce(nullif(new.ip, ''), public.ip_solicitante())
  );
  return new;
end;
$$;

drop trigger if exists z_pedidos_auditoria on public.pedidos;
create trigger z_pedidos_auditoria
  after insert on public.pedidos
  for each row execute function public.auditar_pedido();

-- Precios calculados en el servidor.
create or replace function public.registrar_pedido(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  elemento  jsonb;
  fila      record;
  talla     text;
  cantidad  integer;
  lineas    jsonb := '[]'::jsonb;
  total     numeric(12, 0) := 0;
  ident     uuid;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'El carrito está vacío.' using errcode = '22023';
  end if;

  if jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 20 then
    raise exception 'El carrito debe tener entre 1 y 20 productos.' using errcode = '22023';
  end if;

  for elemento in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(elemento) <> 'object' then
      raise exception 'Hay un producto inválido en el carrito.' using errcode = '22023';
    end if;

    if coalesce(elemento ->> 'id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Hay un producto inválido en el carrito.' using errcode = '22023';
    end if;

    ident := (elemento ->> 'id')::uuid;

    select p.id, p.nombre, p.precio, p.estado, p.activo
      into fila
      from public.productos p
     where p.id = ident;

    if not found or fila.activo is not true then
      raise exception 'Uno de los productos ya no está disponible.' using errcode = '22023';
    end if;

    if fila.estado = 'agotado' then
      raise exception 'Uno de los productos está agotado.' using errcode = '22023';
    end if;

    cantidad := greatest(1, least(20, coalesce((elemento ->> 'cantidad')::integer, 1)));
    talla    := left(coalesce(elemento ->> 'talla', ''), 12);

    total  := total + (fila.precio * cantidad);
    lineas := lineas || jsonb_build_object(
      'producto_id', fila.id,
      'nombre',      fila.nombre,   -- nombre real, no el que mandó el navegador
      'talla',       talla,
      'cantidad',    cantidad,
      'precio',      fila.precio,   -- precio real, no el que mandó el navegador
      'subtotal',    fila.precio * cantidad
    );
  end loop;

  insert into public.pedidos (items, total, origen)
  values (lineas, total, 'web')
  returning id into ident;

  return jsonb_build_object('id', ident, 'total', total, 'items', lineas);
end;
$$;

revoke all on function public.registrar_pedido(jsonb) from public, anon;
grant execute on function public.registrar_pedido(jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. SUSCRIPTORES (lista de espera del newsletter)
--    La función responde igual exista o no el correo: no se puede averiguar
--    qué direcciones están apuntadas.
-- ---------------------------------------------------------------------------
create table if not exists public.suscriptores (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique
               check (char_length(email) <= 160 and email ~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$'),
  ip         text not null default '',
  creado_en  timestamptz not null default now()
);

alter table public.suscriptores add column if not exists ip text not null default '';

alter table public.suscriptores enable row level security;

drop policy if exists "suscriptores_alta_publica" on public.suscriptores;

drop policy if exists "suscriptores_lectura_admin" on public.suscriptores;
create policy "suscriptores_lectura_admin"
  on public.suscriptores for select
  to authenticated
  using (public.es_admin());

-- Límite: máximo 3 altas por IP cada 10 minutos.
drop trigger if exists a_suscriptores_limite on public.suscriptores;
create trigger a_suscriptores_limite
  before insert on public.suscriptores
  for each row execute function public.limitar_solicitudes('10', '3');

create or replace function public.suscribir_email(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  correo text := lower(trim(coalesce(p_email, '')));
begin
  if char_length(correo) > 160
     or correo !~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' then
    raise exception 'Escribe un correo válido.' using errcode = '22023';
  end if;

  insert into public.suscriptores (email)
  values (correo)
  on conflict (email) do nothing;

  -- Respuesta idéntica exista o no el correo.
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.suscribir_email(text) from public, anon;
grant execute on function public.suscribir_email(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. ALMACENAMIENTO DE FOTOS Y VIDEOS
--    Bucket público de lectura, escritura solo para el administrador.
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
  with check (bucket_id = 'productos' and public.es_admin());

drop policy if exists "media_actualizacion_admin" on storage.objects;
create policy "media_actualizacion_admin"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'productos' and public.es_admin());

drop policy if exists "media_borrado_admin" on storage.objects;
create policy "media_borrado_admin"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'productos' and public.es_admin());

-- ============================================================================
-- LISTO. El catálogo arranca vacío: carga el primer producto desde
-- /admin.html después de crear tu usuario administrador.
--
-- Recuerda: ese usuario debe tener como correo el que está en la tabla
-- "administradores" (por defecto soporte@leviticostreetwear.com).
-- ============================================================================
