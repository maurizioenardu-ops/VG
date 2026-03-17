create table if not exists prodotti_foto (
  id uuid primary key default gen_random_uuid(),
  prodotto_id uuid,
  path text not null,
  ordine integer default 0,
  created_at timestamptz default now()
);

alter table prodotti_foto enable row level security;

drop policy if exists "select foto" on prodotti_foto;
drop policy if exists "insert foto" on prodotti_foto;
drop policy if exists "update foto" on prodotti_foto;
drop policy if exists "delete foto" on prodotti_foto;

create policy "select foto" on prodotti_foto for select to anon using (true);
create policy "insert foto" on prodotti_foto for insert to anon with check (true);
create policy "update foto" on prodotti_foto for update to anon using (true);
create policy "delete foto" on prodotti_foto for delete to anon using (true);
