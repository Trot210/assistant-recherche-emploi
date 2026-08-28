create type offre_source as enum ('france_travail', 'apec');

create table if not exists public.offres (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  titre text not null,
  entreprise text,
  description text,
  source offre_source not null,
  source_id text not null,
  lien_original text not null,
  localisation text,
  date_publication date,
  created_at timestamptz not null default now(),
  unique (user_id, source, source_id)
);

create index offres_user_id_idx on public.offres(user_id);
create index offres_source_idx on public.offres(source);

alter table public.offres enable row level security;

create policy "offres_select_own" on public.offres
  for select using (auth.uid() = user_id);
create policy "offres_insert_own" on public.offres
  for insert with check (auth.uid() = user_id);
create policy "offres_update_own" on public.offres
  for update using (auth.uid() = user_id);
create policy "offres_delete_own" on public.offres
  for delete using (auth.uid() = user_id);
