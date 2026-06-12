-- Recetario multiusuario: recetarios compartidos por invitacion.
-- Ejecutar en el SQL Editor del proyecto Supabase del recetario.

-- ============================================================
-- Tablas
-- ============================================================

create table public.cookbooks (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  owner_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.cookbook_members (
  cookbook_id uuid not null references public.cookbooks (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'editor' check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (cookbook_id, user_id)
);

-- Una receta por fila. "data" guarda el JSON completo de la receta con el
-- mismo esquema que usa la app (title, carpetas, categories, ingredients,
-- steps, notes, sourceUrl, photo en base64, ...). "id" es el slug que ya
-- genera la app (p. ej. "tiramisu"), unico dentro de cada recetario.
create table public.recipes (
  cookbook_id uuid not null references public.cookbooks (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 120),
  data jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id),
  deleted_at timestamptz,
  primary key (cookbook_id, id)
);

create index recipes_cookbook_updated_idx on public.recipes (cookbook_id, updated_at desc);

create table public.cookbook_invites (
  code text primary key check (char_length(code) between 6 and 40),
  cookbook_id uuid not null references public.cookbooks (id) on delete cascade,
  role text not null default 'editor' check (role in ('editor', 'viewer')),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  used_by uuid references auth.users (id),
  used_at timestamptz
);

-- ============================================================
-- Funciones auxiliares (security definer para evitar recursion RLS)
-- ============================================================

create or replace function public.is_cookbook_member(p_cookbook uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from cookbook_members
    where cookbook_id = p_cookbook and user_id = auth.uid()
  );
$$;

create or replace function public.is_cookbook_editor(p_cookbook uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from cookbook_members
    where cookbook_id = p_cookbook
      and user_id = auth.uid()
      and role in ('owner', 'editor')
  );
$$;

create or replace function public.is_cookbook_owner(p_cookbook uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from cookbooks
    where id = p_cookbook and owner_id = auth.uid()
  );
$$;

-- El creador de un recetario queda como miembro "owner" automaticamente.
create or replace function public.handle_new_cookbook()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into cookbook_members (cookbook_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict do nothing;
  return new;
end;
$$;

create trigger on_cookbook_created
  after insert on public.cookbooks
  for each row execute function public.handle_new_cookbook();

-- updated_at automatico en recetas.
create or replace function public.handle_recipe_updated()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger on_recipe_write
  before insert or update on public.recipes
  for each row execute function public.handle_recipe_updated();

-- Canjear una invitacion: valida el codigo y crea la membresia.
-- security definer porque el usuario aun no es miembro y las policies
-- no le dejarian ni leer la invitacion ni insertarse a si mismo.
create or replace function public.redeem_invite(p_code text)
returns table (cookbook_id uuid, cookbook_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite cookbook_invites%rowtype;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'No hay sesion';
  end if;

  select * into v_invite
  from cookbook_invites
  where code = lower(trim(p_code))
  for update;

  if not found then
    raise exception 'Codigo no valido';
  end if;
  if v_invite.used_at is not null then
    raise exception 'Este codigo ya se ha usado';
  end if;
  if v_invite.expires_at < now() then
    raise exception 'Este codigo ha caducado';
  end if;

  insert into cookbook_members (cookbook_id, user_id, role)
  values (v_invite.cookbook_id, auth.uid(), v_invite.role)
  on conflict (cookbook_id, user_id) do nothing;

  update cookbook_invites
  set used_by = auth.uid(), used_at = now()
  where code = v_invite.code;

  select name into v_name from cookbooks where id = v_invite.cookbook_id;
  return query select v_invite.cookbook_id, v_name;
end;
$$;

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.cookbooks enable row level security;
alter table public.cookbook_members enable row level security;
alter table public.recipes enable row level security;
alter table public.cookbook_invites enable row level security;

-- cookbooks: los miembros lo ven; cualquiera autenticado puede crear el suyo
-- (el registro esta cerrado, asi que "cualquiera" = familia invitada);
-- solo el dueno renombra o borra.
create policy "cookbooks_select_members" on public.cookbooks
  for select to authenticated
  using (public.is_cookbook_member(id) or owner_id = auth.uid());

create policy "cookbooks_insert_own" on public.cookbooks
  for insert to authenticated
  with check (owner_id = auth.uid());

create policy "cookbooks_update_owner" on public.cookbooks
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "cookbooks_delete_owner" on public.cookbooks
  for delete to authenticated
  using (owner_id = auth.uid());

-- cookbook_members: los miembros ven la lista; el dueno gestiona;
-- cualquiera puede salirse de un recetario.
create policy "members_select_members" on public.cookbook_members
  for select to authenticated
  using (public.is_cookbook_member(cookbook_id));

create policy "members_insert_owner" on public.cookbook_members
  for insert to authenticated
  with check (public.is_cookbook_owner(cookbook_id));

create policy "members_delete_owner_or_self" on public.cookbook_members
  for delete to authenticated
  using (public.is_cookbook_owner(cookbook_id) or user_id = auth.uid());

-- recipes: leer cualquier miembro; escribir owner/editor.
create policy "recipes_select_members" on public.recipes
  for select to authenticated
  using (public.is_cookbook_member(cookbook_id));

create policy "recipes_insert_editors" on public.recipes
  for insert to authenticated
  with check (public.is_cookbook_editor(cookbook_id));

create policy "recipes_update_editors" on public.recipes
  for update to authenticated
  using (public.is_cookbook_editor(cookbook_id))
  with check (public.is_cookbook_editor(cookbook_id));

create policy "recipes_delete_editors" on public.recipes
  for delete to authenticated
  using (public.is_cookbook_editor(cookbook_id));

-- invites: solo el dueno del recetario los crea, ve y revoca.
-- El canje pasa por redeem_invite (security definer).
create policy "invites_select_owner" on public.cookbook_invites
  for select to authenticated
  using (public.is_cookbook_owner(cookbook_id));

create policy "invites_insert_owner" on public.cookbook_invites
  for insert to authenticated
  with check (public.is_cookbook_owner(cookbook_id) and created_by = auth.uid());

create policy "invites_delete_owner" on public.cookbook_invites
  for delete to authenticated
  using (public.is_cookbook_owner(cookbook_id));
