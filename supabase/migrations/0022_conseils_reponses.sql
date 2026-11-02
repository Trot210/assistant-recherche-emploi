-- Conseil sur une réponse reçue : ce que dit la réponse, s'il faut répondre,
-- et un exemple de réponse. Une ligne par candidature (le dernier conseil
-- remplace le précédent), pour ne pas repayer l'analyse à chaque ouverture.
-- Le conseil n'envoie rien et ne modifie ni la candidature ni la boîte mail.
-- Migration additive : aucune donnée existante n'est modifiée ni supprimée.

create table if not exists public.conseils_reponses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prospection_id uuid not null references public.prospections(id) on delete cascade,
  -- Identifiant du message analysé dans la boîte mail (null : seul l'extrait enregistré a été analysé).
  message_id text,
  -- Date de la réponse analysée (AAAA-MM-JJ).
  reponse_date date,
  -- Analyse complète (catégorie, recommandation, brouillon...) : voir lib/prospection/conseil-reponse.ts.
  contenu jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, prospection_id)
);

create index if not exists conseils_reponses_user_idx on public.conseils_reponses(user_id);

alter table public.conseils_reponses enable row level security;

create policy "conseils_reponses_select_own" on public.conseils_reponses
  for select using (auth.uid() = user_id);
create policy "conseils_reponses_insert_own" on public.conseils_reponses
  for insert with check (auth.uid() = user_id);
create policy "conseils_reponses_update_own" on public.conseils_reponses
  for update using (auth.uid() = user_id);
create policy "conseils_reponses_delete_own" on public.conseils_reponses
  for delete using (auth.uid() = user_id);
