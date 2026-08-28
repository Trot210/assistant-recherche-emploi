create type candidature_statut as enum ('a_traiter', 'envoyee', 'entretien', 'refusee');

create table if not exists public.candidatures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  offre_id uuid not null references public.offres(id) on delete cascade,
  date_envoi date,
  statut candidature_statut not null default 'a_traiter',
  cv_genere_url text,
  lm_generee_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (offre_id)
);

create index candidatures_user_id_idx on public.candidatures(user_id);
create index candidatures_offre_id_idx on public.candidatures(offre_id);
create index candidatures_statut_idx on public.candidatures(statut);

alter table public.candidatures enable row level security;

create policy "candidatures_select_own" on public.candidatures
  for select using (auth.uid() = user_id);
create policy "candidatures_insert_own" on public.candidatures
  for insert with check (auth.uid() = user_id);
create policy "candidatures_update_own" on public.candidatures
  for update using (auth.uid() = user_id);
create policy "candidatures_delete_own" on public.candidatures
  for delete using (auth.uid() = user_id);
