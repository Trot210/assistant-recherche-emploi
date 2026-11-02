-- Réponses détectées dans la boîte mail et déjà classées, en attente de ton accord.
-- Sert de mémoire : une réponse n'est classée (donc payée) qu'une fois, et la page
-- « Aujourd'hui » peut afficher les nouvelles réponses sans relire la boîte mail.
-- Rien n'est enregistré sur une candidature tant que tu ne l'as pas associée.
-- Migration additive : aucune donnée existante n'est modifiée ni supprimée.

create table if not exists public.reponses_detectees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Identifiant du message dans la boîte mail (même clé que reponses_traitees).
  message_id text not null,
  prospection_id uuid references public.prospections(id) on delete cascade,
  -- Proposition complète affichée à l'écran : expéditeur, extrait, classement...
  proposition jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, message_id)
);

create index if not exists reponses_detectees_user_idx on public.reponses_detectees(user_id, created_at desc);

alter table public.reponses_detectees enable row level security;

create policy "reponses_detectees_select_own" on public.reponses_detectees
  for select using (auth.uid() = user_id);
create policy "reponses_detectees_insert_own" on public.reponses_detectees
  for insert with check (auth.uid() = user_id);
create policy "reponses_detectees_update_own" on public.reponses_detectees
  for update using (auth.uid() = user_id);
create policy "reponses_detectees_delete_own" on public.reponses_detectees
  for delete using (auth.uid() = user_id);
