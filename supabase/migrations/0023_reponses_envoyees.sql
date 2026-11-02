-- Réponses envoyées depuis le site à une réponse reçue : une ligne par envoi, avec
-- le texte exact parti. Sert de trace et de verrou contre le double envoi.
-- Migration additive : aucune donnée existante n'est modifiée ni supprimée.

create table if not exists public.reponses_envoyees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- La trace survit à la suppression de la candidature.
  prospection_id uuid references public.prospections(id) on delete set null,
  -- Réponse à laquelle on répond (identifiant du message reçu, sinon sa date) :
  -- une même réponse reçue ne reçoit qu'une réponse envoyée d'ici.
  cle text not null,
  destinataire text not null,
  objet text not null,
  corps text not null,
  -- Identifiant du message envoyé ; null tant que l'envoi n'est pas confirmé.
  smtp_message_id text,
  created_at timestamptz not null default now()
);

-- Verrou atomique : la ligne est créée AVANT l'envoi, un second envoi simultané
-- de la même réponse est refusé par la base.
create unique index if not exists reponses_envoyees_cle_unique
  on public.reponses_envoyees(user_id, cle);

create index if not exists reponses_envoyees_prospection_idx on public.reponses_envoyees(prospection_id);

alter table public.reponses_envoyees enable row level security;

create policy "reponses_envoyees_select_own" on public.reponses_envoyees
  for select using (auth.uid() = user_id);
create policy "reponses_envoyees_insert_own" on public.reponses_envoyees
  for insert with check (auth.uid() = user_id);
create policy "reponses_envoyees_update_own" on public.reponses_envoyees
  for update using (auth.uid() = user_id);
create policy "reponses_envoyees_delete_own" on public.reponses_envoyees
  for delete using (auth.uid() = user_id);
