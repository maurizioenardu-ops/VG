-- V&G - Protezione Supabase: accesso solo utenti autenticati
-- Eseguire UNA VOLTA nel Supabase SQL Editor del progetto corretto.
-- Questa policy è adatta a un gestionale personale/single-account:
-- qualsiasi utente autenticato del progetto può leggere/scrivere i dati.
-- Gli utenti anonimi (chi possiede solo il link della PWA) non possono accedere.

begin;

-- Tabelle usate dalla PWA
alter table if exists public.categorie enable row level security;
alter table if exists public.prodotti enable row level security;
alter table if exists public.prodotti_foto enable row level security;
alter table if exists public.clienti enable row level security;
alter table if exists public.ordini enable row level security;
alter table if exists public.righe_ordine enable row level security;

-- Elimina solo le policy V&G create da questo script, se già presenti.
drop policy if exists "vg_auth_categorie_all" on public.categorie;
drop policy if exists "vg_auth_prodotti_all" on public.prodotti;
drop policy if exists "vg_auth_prodotti_foto_all" on public.prodotti_foto;
drop policy if exists "vg_auth_clienti_all" on public.clienti;
drop policy if exists "vg_auth_ordini_all" on public.ordini;
drop policy if exists "vg_auth_righe_ordine_all" on public.righe_ordine;

create policy "vg_auth_categorie_all" on public.categorie
for all to authenticated using (true) with check (true);
create policy "vg_auth_prodotti_all" on public.prodotti
for all to authenticated using (true) with check (true);
create policy "vg_auth_prodotti_foto_all" on public.prodotti_foto
for all to authenticated using (true) with check (true);
create policy "vg_auth_clienti_all" on public.clienti
for all to authenticated using (true) with check (true);
create policy "vg_auth_ordini_all" on public.ordini
for all to authenticated using (true) with check (true);
create policy "vg_auth_righe_ordine_all" on public.righe_ordine
for all to authenticated using (true) with check (true);

-- Bucket privati: niente URL pubblici.
update storage.buckets set public=false where id in ('articoli','social-videos');

-- Storage: solo utenti autenticati possono leggere/scrivere i due bucket.
drop policy if exists "vg_auth_storage_select" on storage.objects;
drop policy if exists "vg_auth_storage_insert" on storage.objects;
drop policy if exists "vg_auth_storage_update" on storage.objects;
drop policy if exists "vg_auth_storage_delete" on storage.objects;

create policy "vg_auth_storage_select" on storage.objects
for select to authenticated
using (bucket_id in ('articoli','social-videos'));

create policy "vg_auth_storage_insert" on storage.objects
for insert to authenticated
with check (bucket_id in ('articoli','social-videos'));

create policy "vg_auth_storage_update" on storage.objects
for update to authenticated
using (bucket_id in ('articoli','social-videos'))
with check (bucket_id in ('articoli','social-videos'));

create policy "vg_auth_storage_delete" on storage.objects
for delete to authenticated
using (bucket_id in ('articoli','social-videos'));

commit;
