create table if not exists public.profil (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cv_texte text,
  competences text[] default '{}',
  experiences jsonb default '[]'::jsonb,
  preferences jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index profil_user_id_idx on public.profil(user_id);

alter table public.profil enable row level security;

create policy "profil_select_own" on public.profil
  for select using (auth.uid() = user_id);
create policy "profil_insert_own" on public.profil
  for insert with check (auth.uid() = user_id);
create policy "profil_update_own" on public.profil
  for update using (auth.uid() = user_id);
create policy "profil_delete_own" on public.profil
  for delete using (auth.uid() = user_id);
