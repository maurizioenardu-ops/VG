-- V&G - Migrazione multiutente sicura
-- Ogni riga appartiene a un solo account Supabase.
-- Eseguire nel SQL Editor SOLO dopo avere creato un backup del database.

begin;

do $$
declare
  vg_owner_id uuid;
  vg_owner_email constant text := 'maurizio.enardu@gmail.com';
  vg_table text;
  vg_policy record;
  vg_constraint record;
begin
  select id into vg_owner_id
  from auth.users
  where lower(email) = lower(vg_owner_email);

  if vg_owner_id is null then
    raise exception 'Account Supabase non trovato: %', vg_owner_email;
  end if;

  foreach vg_table in array array[
    'categorie',
    'prodotti',
    'prodotti_foto',
    'clienti',
    'ordini',
    'righe_ordine'
  ] loop
    if to_regclass('public.' || vg_table) is null then
      raise exception 'Tabella obbligatoria non trovata: public.%', vg_table;
    end if;

    execute format(
      'alter table public.%I add column if not exists user_id uuid references auth.users(id) on delete cascade',
      vg_table
    );
    execute format(
      'update public.%I set user_id = $1 where user_id is null',
      vg_table
    ) using vg_owner_id;
    execute format(
      'alter table public.%I alter column user_id set default auth.uid()',
      vg_table
    );
    execute format(
      'alter table public.%I alter column user_id set not null',
      vg_table
    );
    execute format(
      'create index if not exists %I on public.%I(user_id)',
      'idx_' || vg_table || '_user_id',
      vg_table
    );
    execute format('alter table public.%I enable row level security', vg_table);

    -- Rimuove le vecchie policy permissive prima di applicare l'isolamento.
    for vg_policy in
      select policyname
      from pg_policies
      where schemaname = 'public' and tablename = vg_table
    loop
      execute format('drop policy if exists %I on public.%I', vg_policy.policyname, vg_table);
    end loop;

    execute format(
      'create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)',
      'vg_owner_select_' || vg_table,
      vg_table
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)',
      'vg_owner_insert_' || vg_table,
      vg_table
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
      'vg_owner_update_' || vg_table,
      vg_table
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)',
      'vg_owner_delete_' || vg_table,
      vg_table
    );
  end loop;

  -- I valori univoci devono esserlo per singolo proprietario, non per tutto il gestionale.
  -- Rimuove soltanto vincoli UNIQUE composti dalla singola colonna indicata.
  for vg_constraint in
    select n.nspname as schema_name, c.relname as table_name, con.conname
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where con.contype = 'u'
      and n.nspname = 'public'
      and (
        (c.relname = 'categorie' and con.conkey = array[(select attnum from pg_attribute where attrelid = c.oid and attname = 'nome')])
        or (c.relname = 'prodotti' and con.conkey = array[(select attnum from pg_attribute where attrelid = c.oid and attname = 'sku')])
        or (c.relname = 'ordini' and con.conkey = array[(select attnum from pg_attribute where attrelid = c.oid and attname = 'numero_ordine')])
      )
  loop
    execute format('alter table %I.%I drop constraint %I', vg_constraint.schema_name, vg_constraint.table_name, vg_constraint.conname);
  end loop;

  create unique index if not exists ux_categorie_user_nome on public.categorie(user_id, nome);
  create unique index if not exists ux_prodotti_user_sku on public.prodotti(user_id, sku) where sku is not null;
  create unique index if not exists ux_ordini_user_numero on public.ordini(user_id, numero_ordine) where numero_ordine is not null;

  -- Conserva le foto esistenti come proprietà dell'account principale.
  update storage.objects
  set owner_id = vg_owner_id::text
  where bucket_id in ('articoli', 'social-videos')
    and owner_id is null;
end $$;

-- Nessun accesso alle tabelle del gestionale senza autenticazione.
revoke all on table public.categorie, public.prodotti, public.prodotti_foto,
  public.clienti, public.ordini, public.righe_ordine from anon;
grant select, insert, update, delete on table public.categorie, public.prodotti,
  public.prodotti_foto, public.clienti, public.ordini, public.righe_ordine to authenticated;

-- I bucket restano privati.
update storage.buckets
set public = false
where id in ('articoli', 'social-videos');

-- Sostituisce le vecchie policy storage V&G.
drop policy if exists "vg_auth_storage_select" on storage.objects;
drop policy if exists "vg_auth_storage_insert" on storage.objects;
drop policy if exists "vg_auth_storage_update" on storage.objects;
drop policy if exists "vg_auth_storage_delete" on storage.objects;
drop policy if exists "articoli public read" on storage.objects;
drop policy if exists "articoli public insert" on storage.objects;
drop policy if exists "articoli public update" on storage.objects;
drop policy if exists "articoli public delete" on storage.objects;
drop policy if exists "vg_owner_storage_select" on storage.objects;
drop policy if exists "vg_owner_storage_insert" on storage.objects;
drop policy if exists "vg_owner_storage_update" on storage.objects;
drop policy if exists "vg_owner_storage_delete" on storage.objects;

create policy "vg_owner_storage_select" on storage.objects
for select to authenticated
using (
  bucket_id in ('articoli', 'social-videos')
  and owner_id = (select auth.uid())::text
);

create policy "vg_owner_storage_insert" on storage.objects
for insert to authenticated
with check (
  bucket_id in ('articoli', 'social-videos')
  and owner_id = (select auth.uid())::text
);

create policy "vg_owner_storage_update" on storage.objects
for update to authenticated
using (
  bucket_id in ('articoli', 'social-videos')
  and owner_id = (select auth.uid())::text
)
with check (
  bucket_id in ('articoli', 'social-videos')
  and owner_id = (select auth.uid())::text
);

create policy "vg_owner_storage_delete" on storage.objects
for delete to authenticated
using (
  bucket_id in ('articoli', 'social-videos')
  and owner_id = (select auth.uid())::text
);

commit;

-- Verifica manuale dopo l'esecuzione:
-- select user_id, count(*) from public.prodotti group by user_id;
-- select user_id, count(*) from public.clienti group by user_id;
-- select user_id, count(*) from public.ordini group by user_id;
