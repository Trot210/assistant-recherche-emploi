create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  offre_id uuid not null references public.offres(id) on delete cascade,
  score int not null check (score >= 0 and score <= 100),
  points_forts jsonb default '[]'::jsonb,
  ecarts jsonb default '[]'::jsonb,
  calculated_at timestamptz not null default now(),
  unique (offre_id)
);

create index scores_user_id_idx on public.scores(user_id);
create index scores_offre_id_idx on public.scores(offre_id);

alter table public.scores enable row level security;

create policy "scores_select_own" on public.scores
  for select using (auth.uid() = user_id);
create policy "scores_insert_own" on public.scores
  for insert with check (auth.uid() = user_id);
create policy "scores_update_own" on public.scores
  for update using (auth.uid() = user_id);
create policy "scores_delete_own" on public.scores
  for delete using (auth.uid() = user_id);
