-- Lot 1 : politique de candidature par entreprise, offre repérée, adresses
-- invalides ou exclues, statut « non distribué », suivi du coût Claude et
-- réglages (plafond mensuel).
-- Migration additive : aucune donnée existante n'est modifiée ni supprimée.

-- Ce que l'entreprise a dit (ou ce que l'utilisateur a constaté) sur les
-- candidatures spontanées, et l'offre éventuellement repérée à la main.
alter table public.entreprises
  add column if not exists politique_candidature text
    check (politique_candidature in ('acceptees', 'non_conservees', 'portail_uniquement', 'ne_pas_recontacter')),
  add column if not exists politique_note text,
  add column if not exists offre_reperee_titre text,
  add column if not exists offre_reperee_url text,
  add column if not exists offres_verifiees_at timestamptz;

-- État d'une adresse : valide par défaut ; « invalide » après un rebond ;
-- « ne_plus_contacter » à la demande de la personne. Les deux bloquent l'envoi.
alter table public.contacts
  add column if not exists email_statut text not null default 'ok'
    check (email_statut in ('ok', 'invalide', 'ne_plus_contacter'));

-- Nouveau type de retour : le message n'est pas arrivé (adresse inexistante...).
-- Il ne compte pas comme une réponse dans les statistiques.
alter table public.prospections drop constraint if exists prospections_reponse_type_check;
alter table public.prospections
  add constraint prospections_reponse_type_check
  check (reponse_type in ('entretien', 'offre', 'refus', 'pas_de_poste', 'cv_non_conserve', 'autre', 'non_distribue'));

-- Un appel à Claude = une ligne : jetons, recherches web et coût estimé.
create table if not exists public.usage_ia (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fonction text not null,
  modele text not null,
  tokens_entree int not null default 0,
  tokens_sortie int not null default 0,
  tokens_cache_lecture int not null default 0,
  tokens_cache_ecriture int not null default 0,
  recherches_web int not null default 0,
  cout_usd numeric(10, 5) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists usage_ia_user_date_idx on public.usage_ia(user_id, created_at);

alter table public.usage_ia enable row level security;

create policy "usage_ia_select_own" on public.usage_ia
  for select using (auth.uid() = user_id);
create policy "usage_ia_insert_own" on public.usage_ia
  for insert with check (auth.uid() = user_id);

-- Réglages de l'utilisateur.
create table if not exists public.reglages (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plafond_claude_usd numeric(8, 2) not null default 3 check (plafond_claude_usd >= 0),
  updated_at timestamptz not null default now()
);

alter table public.reglages enable row level security;

create policy "reglages_select_own" on public.reglages
  for select using (auth.uid() = user_id);
create policy "reglages_insert_own" on public.reglages
  for insert with check (auth.uid() = user_id);
create policy "reglages_update_own" on public.reglages
  for update using (auth.uid() = user_id);
