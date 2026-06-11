create extension if not exists pgcrypto;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  nome_fantasia text not null,
  razao_social text,
  ativo boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.companies (id, nome_fantasia, razao_social)
values ('00000000-0000-0000-0000-000000000001', 'Easy Frotas Demo', 'Easy Frotas Demo LTDA')
on conflict (id) do nothing;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text not null unique,
  perfil text not null check (perfil in ('gestor', 'utilizador')),
  ativo boolean not null default true,
  empresa_id uuid not null references public.companies(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_profiles_empresa_id on public.profiles (empresa_id);
create index if not exists idx_profiles_perfil on public.profiles (perfil);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.companies(id),
  placa text not null,
  modelo text not null,
  marca text,
  ano int,
  cor text,
  foto_url text,
  km_atual numeric(12,2) not null default 0 check (km_atual >= 0),
  status text not null default 'disponivel' check (status in ('disponivel', 'em_uso', 'manutencao', 'inativo')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint vehicles_unique_placa_per_company unique (empresa_id, placa)
);

drop trigger if exists trg_generate_vehicle_qr_code on public.vehicles;
drop function if exists public.generate_vehicle_qr_code();
drop index if exists idx_vehicles_qr_code;
alter table public.vehicles drop column if exists qr_code;

create index if not exists idx_vehicles_empresa_id on public.vehicles (empresa_id);
create index if not exists idx_vehicles_status on public.vehicles (status);

drop trigger if exists trg_vehicles_updated_at on public.vehicles;
create trigger trg_vehicles_updated_at
before update on public.vehicles
for each row execute function public.set_updated_at();

create table if not exists public.vehicle_nfc_tags (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.companies(id),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  tag_uid text not null unique,
  tag_label text,
  tag_payload text,
  ativo boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint vehicle_nfc_tags_tag_uid_not_blank check (length(trim(tag_uid)) > 0)
);

create index if not exists idx_vehicle_nfc_tags_empresa_id on public.vehicle_nfc_tags (empresa_id);
create index if not exists idx_vehicle_nfc_tags_vehicle_id on public.vehicle_nfc_tags (vehicle_id);
create index if not exists idx_vehicle_nfc_tags_ativo on public.vehicle_nfc_tags (ativo);
create unique index if not exists idx_vehicle_nfc_tags_tag_payload_unique
on public.vehicle_nfc_tags (tag_payload)
where tag_payload is not null;

drop trigger if exists trg_vehicle_nfc_tags_updated_at on public.vehicle_nfc_tags;
create trigger trg_vehicle_nfc_tags_updated_at
before update on public.vehicle_nfc_tags
for each row execute function public.set_updated_at();

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id),
  user_id uuid not null references public.profiles(id),
  empresa_id uuid not null references public.companies(id),
  started_at timestamptz not null default timezone('utc', now()),
  ended_at timestamptz,
  km_inicial numeric(12,2) not null check (km_inicial >= 0),
  km_final numeric(12,2),
  distancia_total numeric(12,2),
  destino text,
  observacao_inicio text,
  observacao_fim text,
  status text not null default 'em_andamento' check (status in ('em_andamento', 'finalizada', 'cancelada')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint trips_km_valido check (km_final is null or km_final >= km_inicial)
);

alter table public.trips add column if not exists destino text;

create index if not exists idx_trips_empresa_id on public.trips (empresa_id);
create index if not exists idx_trips_user_id on public.trips (user_id);
create index if not exists idx_trips_vehicle_id on public.trips (vehicle_id);
create index if not exists idx_trips_status on public.trips (status);
create index if not exists idx_trips_created_at on public.trips (created_at);

drop trigger if exists trg_trips_updated_at on public.trips;
create trigger trg_trips_updated_at
before update on public.trips
for each row execute function public.set_updated_at();

create table if not exists public.trip_occurrences (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  tipo text not null check (tipo in ('abastecimento', 'manutencao', 'outros')),
  descricao text,
  status text not null default 'pendente' check (status in ('pendente', 'visualizado', 'resolvido')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_trip_occurrences_trip_id on public.trip_occurrences (trip_id);
create index if not exists idx_trip_occurrences_status on public.trip_occurrences (status);

drop trigger if exists trg_trip_occurrences_updated_at on public.trip_occurrences;
create trigger trg_trip_occurrences_updated_at
before update on public.trip_occurrences
for each row execute function public.set_updated_at();

create or replace function public.get_default_company_id()
returns uuid
language sql
stable
as $$
  select id from public.companies order by created_at limit 1;
$$;

create or replace function public.current_empresa_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.empresa_id from public.profiles p where p.id = auth.uid() limit 1;
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.ativo = true
  );
$$;

create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.ativo = true and p.perfil = 'gestor'
  );
$$;

create or replace function public.is_manager_of_company(p_empresa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.ativo = true
      and p.perfil = 'gestor'
      and p.empresa_id = p_empresa_id
  );
$$;

create or replace function public.is_same_company(p_empresa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.ativo = true
      and p.empresa_id = p_empresa_id
  );
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text;
  v_perfil text;
  v_empresa_id uuid;
begin
  v_nome := coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1));
  v_perfil := coalesce(new.raw_user_meta_data->>'perfil', 'utilizador');

  if v_perfil not in ('gestor', 'utilizador') then
    v_perfil := 'utilizador';
  end if;

  begin
    v_empresa_id := nullif(new.raw_user_meta_data->>'empresa_id', '')::uuid;
  exception when others then
    v_empresa_id := null;
  end;

  if v_empresa_id is null then
    v_empresa_id := public.get_default_company_id();
  end if;

  insert into public.profiles (id, nome, email, perfil, ativo, empresa_id)
  values (new.id, v_nome, new.email, v_perfil, true, v_empresa_id)
  on conflict (id) do update
  set nome = excluded.nome,
      email = excluded.email,
      perfil = excluded.perfil,
      empresa_id = excluded.empresa_id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

drop function if exists public.start_trip(uuid, numeric, text);
drop function if exists public.start_trip(uuid, numeric, text, text);

create or replace function public.start_trip(
  p_vehicle_id uuid,
  p_km_inicial numeric,
  p_observacao_inicio text default null,
  p_destino text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_vehicle public.vehicles%rowtype;
  v_trip_id uuid;
  v_destino text := nullif(trim(p_destino), '');
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  if v_destino is null then
    raise exception 'Destino da viagem e obrigatorio.';
  end if;

  select * into v_profile from public.profiles where id = v_user_id;

  if not found or v_profile.ativo = false then
    raise exception 'Usuario sem acesso ativo.';
  end if;

  if exists (select 1 from public.trips t where t.user_id = v_user_id and t.status = 'em_andamento') then
    raise exception 'Voce ja possui uma viagem em andamento.';
  end if;

  select * into v_vehicle from public.vehicles where id = p_vehicle_id for update;

  if not found then
    raise exception 'Veiculo nao encontrado.';
  end if;

  if v_vehicle.empresa_id <> v_profile.empresa_id then
    raise exception 'Veiculo fora da sua empresa.';
  end if;

  if v_vehicle.status <> 'disponivel' then
    raise exception 'Veiculo indisponivel para inicio da viagem.';
  end if;

  if exists (select 1 from public.trips t where t.vehicle_id = p_vehicle_id and t.status = 'em_andamento') then
    raise exception 'Este veiculo ja esta em uso.';
  end if;

  if p_km_inicial < 0 then
    raise exception 'Quilometragem inicial invalida.';
  end if;

  insert into public.trips (
    vehicle_id,
    user_id,
    empresa_id,
    started_at,
    km_inicial,
    destino,
    observacao_inicio,
    status
  ) values (
    p_vehicle_id,
    v_user_id,
    v_profile.empresa_id,
    timezone('utc', now()),
    p_km_inicial,
    v_destino,
    nullif(trim(p_observacao_inicio), ''),
    'em_andamento'
  ) returning id into v_trip_id;

  update public.vehicles
  set status = 'em_uso',
      km_atual = greatest(km_atual, p_km_inicial)
  where id = p_vehicle_id;

  return v_trip_id;
end;
$$;

create or replace function public.finish_trip(
  p_trip_id uuid,
  p_km_final numeric,
  p_observacao_fim text default null,
  p_occurrence_type text default null,
  p_occurrence_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_trip public.trips%rowtype;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  select * into v_profile from public.profiles where id = v_user_id;

  if not found or v_profile.ativo = false then
    raise exception 'Usuario sem acesso ativo.';
  end if;

  select * into v_trip from public.trips where id = p_trip_id for update;

  if not found then
    raise exception 'Viagem nao encontrada.';
  end if;

  if v_trip.status <> 'em_andamento' then
    raise exception 'Esta viagem nao esta em andamento.';
  end if;

  if v_trip.empresa_id <> v_profile.empresa_id then
    raise exception 'Viagem fora da sua empresa.';
  end if;

  if v_profile.perfil <> 'gestor' and v_trip.user_id <> v_user_id then
    raise exception 'Voce nao pode finalizar uma viagem de outro usuario.';
  end if;

  if p_km_final < v_trip.km_inicial then
    raise exception 'A quilometragem final deve ser maior ou igual a inicial.';
  end if;

  update public.trips
  set ended_at = timezone('utc', now()),
      km_final = p_km_final,
      distancia_total = p_km_final - v_trip.km_inicial,
      observacao_fim = nullif(trim(p_observacao_fim), ''),
      status = 'finalizada'
  where id = p_trip_id;

  update public.vehicles
  set km_atual = p_km_final,
      status = 'disponivel'
  where id = v_trip.vehicle_id;

  if p_occurrence_type is not null and length(trim(p_occurrence_type)) > 0 then
    if p_occurrence_type not in ('abastecimento', 'manutencao', 'outros') then
      raise exception 'Tipo de ocorrencia invalido.';
    end if;

    insert into public.trip_occurrences (trip_id, tipo, descricao, status)
    values (p_trip_id, p_occurrence_type, nullif(trim(p_occurrence_description), ''), 'pendente');
  end if;

  return p_trip_id;
end;
$$;

drop function if exists public.get_fleet_report(uuid, int);
drop function if exists public.get_fleet_report(uuid, int, uuid);

create or replace function public.get_fleet_report(
  p_empresa_id uuid,
  p_period_days int default 30,
  p_vehicle_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_start_date timestamptz := timezone('utc', now()) - make_interval(days => greatest(p_period_days, 1));
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  select * into v_profile from public.profiles where id = v_user_id;

  if not found or v_profile.ativo = false then
    raise exception 'Usuario sem acesso ativo.';
  end if;

  if v_profile.perfil <> 'gestor' then
    raise exception 'Apenas gestor pode acessar relatorios.';
  end if;

  if v_profile.empresa_id <> p_empresa_id then
    raise exception 'Acesso negado ao relatorio de outra empresa.';
  end if;

  if p_vehicle_id is not null and not exists (
    select 1 from public.vehicles v
    where v.id = p_vehicle_id and v.empresa_id = p_empresa_id
  ) then
    raise exception 'Veiculo informado nao pertence a empresa.';
  end if;

  with filtered_trips as (
    select *
    from public.trips t
    where t.empresa_id = p_empresa_id
      and t.created_at >= v_start_date
      and t.status = 'finalizada'
      and (p_vehicle_id is null or t.vehicle_id = p_vehicle_id)
  ),
  top_vehicles as (
    select
      t.vehicle_id,
      v.placa,
      v.modelo,
      count(*) as total_trips,
      coalesce(sum(t.distancia_total), 0) as total_distance
    from filtered_trips t
    join public.vehicles v on v.id = t.vehicle_id
    group by t.vehicle_id, v.placa, v.modelo
    order by total_trips desc, total_distance desc
    limit 5
  ),
  top_users as (
    select
      t.user_id,
      p.nome,
      count(*) as total_trips
    from filtered_trips t
    join public.profiles p on p.id = t.user_id
    group by t.user_id, p.nome
    order by total_trips desc
    limit 5
  )
  select jsonb_build_object(
    'period_days', p_period_days,
    'vehicle_id', p_vehicle_id,
    'total_trips', (select count(*) from filtered_trips),
    'total_distance', (select coalesce(sum(distancia_total), 0) from filtered_trips),
    'active_vehicles', (
      select count(*)
      from public.vehicles v
      where v.empresa_id = p_empresa_id and v.status <> 'inativo'
    ),
    'total_occurrences', (
      select count(*)
      from public.trip_occurrences o
      join public.trips t on t.id = o.trip_id
      where t.empresa_id = p_empresa_id
        and t.created_at >= v_start_date
        and (p_vehicle_id is null or t.vehicle_id = p_vehicle_id)
    ),
    'open_occurrences', (
      select count(*)
      from public.trip_occurrences o
      join public.trips t on t.id = o.trip_id
      where t.empresa_id = p_empresa_id
        and o.status <> 'resolvido'
        and (p_vehicle_id is null or t.vehicle_id = p_vehicle_id)
    ),
    'top_vehicles', (select coalesce(jsonb_agg(to_jsonb(tv)), '[]'::jsonb) from top_vehicles tv),
    'top_users', (select coalesce(jsonb_agg(to_jsonb(tu)), '[]'::jsonb) from top_users tu)
  ) into v_result;

  return v_result;
end;
$$;

create or replace view public.v_occurrences_manager as
select
  o.id,
  o.tipo,
  o.descricao,
  o.status,
  o.created_at,
  t.id as trip_id,
  t.user_id,
  t.vehicle_id,
  t.empresa_id,
  p.nome as usuario_nome,
  v.placa,
  v.modelo
from public.trip_occurrences o
join public.trips t on t.id = o.trip_id
join public.profiles p on p.id = t.user_id
join public.vehicles v on v.id = t.vehicle_id;

create or replace function public.prevent_inactivate_vehicle_in_use()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'inativo' and old.status <> 'inativo' then
    if old.status = 'em_uso' then
      raise exception 'Nao e possivel inativar um veiculo com viagem em andamento.';
    end if;

    if exists (
      select 1
      from public.trips t
      where t.vehicle_id = old.id and t.status = 'em_andamento'
    ) then
      raise exception 'Nao e possivel inativar um veiculo com viagem em andamento.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_inactivate_vehicle_in_use on public.vehicles;
create trigger trg_prevent_inactivate_vehicle_in_use
before update of status on public.vehicles
for each row execute function public.prevent_inactivate_vehicle_in_use();

alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.vehicle_nfc_tags enable row level security;
alter table public.trips enable row level security;
alter table public.trip_occurrences enable row level security;

drop policy if exists "companies_select_authenticated" on public.companies;
create policy "companies_select_authenticated"
on public.companies for select to authenticated
using (true);

drop policy if exists "profiles_select_self_or_manager" on public.profiles;
create policy "profiles_select_self_or_manager"
on public.profiles for select to authenticated
using (id = auth.uid() or public.is_manager_of_company(empresa_id));

drop policy if exists "profiles_update_manager_only" on public.profiles;
create policy "profiles_update_manager_only"
on public.profiles for update to authenticated
using (public.is_manager_of_company(empresa_id))
with check (
  public.is_manager_of_company(empresa_id)
  and not (id = auth.uid() and ativo = false)
);

drop policy if exists "vehicles_select_same_company" on public.vehicles;
create policy "vehicles_select_same_company"
on public.vehicles for select to authenticated
using (public.is_same_company(empresa_id));

drop policy if exists "vehicles_insert_manager_only" on public.vehicles;
create policy "vehicles_insert_manager_only"
on public.vehicles for insert to authenticated
with check (public.is_manager_of_company(empresa_id));

drop policy if exists "vehicles_update_manager_only" on public.vehicles;
create policy "vehicles_update_manager_only"
on public.vehicles for update to authenticated
using (public.is_manager_of_company(empresa_id))
with check (public.is_manager_of_company(empresa_id));

drop policy if exists "vehicle_nfc_tags_select_same_company" on public.vehicle_nfc_tags;
create policy "vehicle_nfc_tags_select_same_company"
on public.vehicle_nfc_tags for select to authenticated
using (public.is_same_company(empresa_id));

drop policy if exists "vehicle_nfc_tags_insert_manager_only" on public.vehicle_nfc_tags;
create policy "vehicle_nfc_tags_insert_manager_only"
on public.vehicle_nfc_tags for insert to authenticated
with check (
  public.is_manager_of_company(empresa_id)
  and exists (
    select 1
    from public.vehicles v
    where v.id = vehicle_nfc_tags.vehicle_id
      and v.empresa_id = vehicle_nfc_tags.empresa_id
  )
);

drop policy if exists "vehicle_nfc_tags_update_manager_only" on public.vehicle_nfc_tags;
create policy "vehicle_nfc_tags_update_manager_only"
on public.vehicle_nfc_tags for update to authenticated
using (public.is_manager_of_company(empresa_id))
with check (
  public.is_manager_of_company(empresa_id)
  and exists (
    select 1
    from public.vehicles v
    where v.id = vehicle_nfc_tags.vehicle_id
      and v.empresa_id = vehicle_nfc_tags.empresa_id
  )
);

drop policy if exists "vehicle_nfc_tags_delete_manager_only" on public.vehicle_nfc_tags;
create policy "vehicle_nfc_tags_delete_manager_only"
on public.vehicle_nfc_tags for delete to authenticated
using (public.is_manager_of_company(empresa_id));

drop policy if exists "trips_select_manager_or_owner" on public.trips;
create policy "trips_select_manager_or_owner"
on public.trips for select to authenticated
using (
  public.is_same_company(empresa_id)
  and (public.is_manager_of_company(empresa_id) or user_id = auth.uid())
);

drop policy if exists "trip_occurrences_select_manager_or_owner" on public.trip_occurrences;
create policy "trip_occurrences_select_manager_or_owner"
on public.trip_occurrences for select to authenticated
using (
  exists (
    select 1
    from public.trips t
    where t.id = trip_occurrences.trip_id
      and (public.is_manager_of_company(t.empresa_id) or t.user_id = auth.uid())
  )
);

drop policy if exists "trip_occurrences_update_manager_only" on public.trip_occurrences;
create policy "trip_occurrences_update_manager_only"
on public.trip_occurrences for update to authenticated
using (
  exists (
    select 1
    from public.trips t
    where t.id = trip_occurrences.trip_id
      and public.is_manager_of_company(t.empresa_id)
  )
)
with check (
  exists (
    select 1
    from public.trips t
    where t.id = trip_occurrences.trip_id
      and public.is_manager_of_company(t.empresa_id)
  )
);

insert into storage.buckets (id, name, public)
values ('vehicle-photos', 'vehicle-photos', true)
on conflict (id) do update
set public = excluded.public;

drop policy if exists "vehicle_photos_public_read" on storage.objects;
create policy "vehicle_photos_public_read"
on storage.objects for select to public
using (bucket_id = 'vehicle-photos');

drop policy if exists "vehicle_photos_manager_upload" on storage.objects;
create policy "vehicle_photos_manager_upload"
on storage.objects for insert to authenticated
with check (bucket_id = 'vehicle-photos' and public.is_manager());

drop policy if exists "vehicle_photos_manager_update" on storage.objects;
create policy "vehicle_photos_manager_update"
on storage.objects for update to authenticated
using (bucket_id = 'vehicle-photos' and public.is_manager())
with check (bucket_id = 'vehicle-photos' and public.is_manager());

drop policy if exists "vehicle_photos_manager_delete" on storage.objects;
create policy "vehicle_photos_manager_delete"
on storage.objects for delete to authenticated
using (bucket_id = 'vehicle-photos' and public.is_manager());

grant usage on schema public to authenticated;
grant select on public.companies to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update on public.vehicles to authenticated;
grant select, insert, update, delete on public.vehicle_nfc_tags to authenticated;
grant select on public.trips to authenticated;
grant select, update on public.trip_occurrences to authenticated;

grant execute on function public.current_empresa_id() to authenticated;
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.is_manager() to authenticated;
grant execute on function public.is_manager_of_company(uuid) to authenticated;
grant execute on function public.is_same_company(uuid) to authenticated;
grant execute on function public.start_trip(uuid, numeric, text, text) to authenticated;
grant execute on function public.finish_trip(uuid, numeric, text, text, text) to authenticated;
grant execute on function public.get_fleet_report(uuid, int, uuid) to authenticated;
