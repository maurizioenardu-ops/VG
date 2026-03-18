create table if not exists prodotti_foto (
  id uuid primary key default gen_random_uuid(),
  prodotto_id uuid,
  path text not null,
  ordine integer default 0,
  created_at timestamptz default now()
);

create index if not exists idx_prodotti_foto_prodotto_id on prodotti_foto (prodotto_id);
create unique index if not exists ux_prodotti_foto_prodotto_ordine on prodotti_foto (prodotto_id, ordine);

alter table prodotti_foto enable row level security;

drop policy if exists "select foto" on prodotti_foto;
drop policy if exists "insert foto" on prodotti_foto;
drop policy if exists "update foto" on prodotti_foto;
drop policy if exists "delete foto" on prodotti_foto;

create policy "select foto" on prodotti_foto for select to public using (true);
create policy "insert foto" on prodotti_foto for insert to public with check (true);
create policy "update foto" on prodotti_foto for update to public using (true) with check (true);
create policy "delete foto" on prodotti_foto for delete to public using (true);
