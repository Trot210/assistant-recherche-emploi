-- Envois programmés : un message validé part à la date et l'heure choisies,
-- sans intervention, même ordinateur éteint. Une ligne par programmation, avec
-- son historique (programmé, en cours, envoyé, annulé, échoué).
-- Migration additive : aucune donnée existante n'est modifiée ni supprimée.

create table if not exists public.envois_programmes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prospection_id uuid not null references public.prospections(id) on delete cascade,
  -- Instant d'envoi voulu (UTC ; l'interface affiche l'heure de Paris).
  prevu_at timestamptz not null,
  statut text not null default 'programme'
    check (statut in ('programme', 'en_cours', 'envoye', 'annule', 'echec')),
  -- Nombre d'essais d'envoi déjà faits (un échec d'envoi est retenté deux fois).
  tentatives int not null default 0,
  -- Dernière erreur d'envoi, ou raison de l'annulation, en clair.
  erreur text,
  -- Comment la programmation est née : à la main ou par « étaler mes messages ».
  origine text not null default 'manuel' check (origine in ('manuel', 'etalement')),
  created_at timestamptz not null default now(),
  debut_at timestamptz,
  termine_at timestamptz
);

create index if not exists envois_programmes_user_idx on public.envois_programmes(user_id, statut, prevu_at);
create index if not exists envois_programmes_prospection_idx on public.envois_programmes(prospection_id);

-- Une seule programmation active par message : c'est ce qui empêche, au niveau de
-- la base, qu'un même message soit programmé deux fois.
create unique index if not exists envois_programmes_actif_unique
  on public.envois_programmes(prospection_id)
  where statut in ('programme', 'en_cours');

alter table public.envois_programmes enable row level security;

create policy "envois_programmes_select_own" on public.envois_programmes
  for select using (auth.uid() = user_id);
create policy "envois_programmes_insert_own" on public.envois_programmes
  for insert with check (auth.uid() = user_id);
create policy "envois_programmes_update_own" on public.envois_programmes
  for update using (auth.uid() = user_id);
create policy "envois_programmes_delete_own" on public.envois_programmes
  for delete using (auth.uid() = user_id);

-- Garde-fous d'envoi réglables : nombre maximal d'envois par jour et écart
-- minimal entre deux envois.
alter table public.reglages
  add column if not exists envois_max_par_jour int not null default 6 check (envois_max_par_jour between 1 and 20),
  add column if not exists envois_ecart_minutes int not null default 10 check (envois_ecart_minutes between 1 and 240);
