-- Bucket e policy storage per le immagini articolo.
-- Esegui questo script una volta nel SQL Editor di Supabase.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'articoli',
  'articoli',
  true,
  52428800,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "articoli public read" on storage.objects;
drop policy if exists "articoli public insert" on storage.objects;
drop policy if exists "articoli public update" on storage.objects;
drop policy if exists "articoli public delete" on storage.objects;

create policy "articoli public read"
on storage.objects for select
to public
using (bucket_id = 'articoli');

create policy "articoli public insert"
on storage.objects for insert
to public
with check (bucket_id = 'articoli');

create policy "articoli public update"
on storage.objects for update
to public
using (bucket_id = 'articoli')
with check (bucket_id = 'articoli');

create policy "articoli public delete"
on storage.objects for delete
to public
using (bucket_id = 'articoli');
