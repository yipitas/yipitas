-- =====================================================
-- YIPITAS - Schema de base de datos
-- Ejecutar en Supabase > SQL Editor
-- =====================================================

-- Productos
create table if not exists productos (
  id uuid default gen_random_uuid() primary key,
  nombre text not null,
  categoria text not null default 'Otro',
  talla text not null,
  color text,
  precio numeric(10,2) not null default 0,
  stock integer not null default 0,
  created_at timestamptz default now()
);

-- Clientes
create table if not exists clientes (
  id uuid default gen_random_uuid() primary key,
  nombre text not null,
  telefono text,
  email text,
  created_at timestamptz default now()
);

-- Ventas
create table if not exists ventas (
  id uuid default gen_random_uuid() primary key,
  cliente_id uuid references clientes(id) on delete set null,
  user_id uuid references auth.users(id),
  total numeric(10,2) not null default 0,
  metodo_pago text not null default 'efectivo',
  created_at timestamptz default now()
);

-- Items de cada venta
create table if not exists venta_items (
  id uuid default gen_random_uuid() primary key,
  venta_id uuid references ventas(id) on delete cascade not null,
  producto_id uuid references productos(id) on delete set null,
  cantidad integer not null default 1,
  precio_unitario numeric(10,2) not null,
  created_at timestamptz default now()
);

-- =====================================================
-- Row Level Security (RLS) - solo usuarios autenticados
-- =====================================================

alter table productos enable row level security;
alter table clientes enable row level security;
alter table ventas enable row level security;
alter table venta_items enable row level security;

-- Policies: cualquier usuario autenticado puede ver y modificar
create policy "Authenticated full access" on productos
  for all using (auth.role() = 'authenticated');

create policy "Authenticated full access" on clientes
  for all using (auth.role() = 'authenticated');

create policy "Authenticated full access" on ventas
  for all using (auth.role() = 'authenticated');

create policy "Authenticated full access" on venta_items
  for all using (auth.role() = 'authenticated');
