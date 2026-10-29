-- Candidatures spontanées : entreprises ciblées, contacts et messages
-- (premier contact + relances). Tout reste sous validation manuelle : un
-- message n'atteint jamais "envoyée" sans passer par "valide" d'abord.

create table if not exists public.entreprises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  siren text not null,
  nom text not null,
  code_naf text,
  secteur text,
  tranche_effectif text,
  adresse text,
  code_postal text,
  commune text,
  departement text,
  site_web text,
  -- Accroche personnelle saisie par l'utilisateur (ex: un lancement produit
  -- vu dans la presse) : seul élément « propre à l'entreprise » que Claude
  -- a le droit d'utiliser en plus des données Sirene.
  notes text,
  statut text not null default 'a_analyser'
    check (statut in ('a_analyser', 'retenue', 'ecartee')),
  created_at timestamptz not null default now(),
  unique (user_id, siren)
);

create index entreprises_user_id_idx on public.entreprises(user_id);
create index entreprises_statut_idx on public.entreprises(statut);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  nom text not null,
  poste text,
  email text,
  -- Provenance de l'adresse (RGPD : la personne doit pouvoir être informée
  -- de la source de ses coordonnées sur simple demande).
  source_email text,
  created_at timestamptz not null default now()
);

create index contacts_user_id_idx on public.contacts(user_id);
create index contacts_entreprise_id_idx on public.contacts(entreprise_id);

create table if not exists public.prospections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  -- Une relance pointe vers le message initial auquel elle répond.
  parent_id uuid references public.prospections(id) on delete cascade,
  type text not null default 'initial' check (type in ('initial', 'relance')),
  poste_vise text not null,
  objet text not null,
  corps text not null,
  statut text not null default 'a_valider'
    check (statut in ('a_valider', 'valide', 'brouillon_gmail', 'envoyee', 'reponse_recue', 'sans_suite')),
  avertissements jsonb not null default '[]'::jsonb,
  cv_path text,
  gmail_draft_id text,
  gmail_message_id text,
  gmail_thread_id text,
  date_envoi date,
  -- Portés par le message initial uniquement.
  nb_relances int not null default 0,
  prochaine_relance date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index prospections_user_id_idx on public.prospections(user_id);
create index prospections_entreprise_id_idx on public.prospections(entreprise_id);
create index prospections_parent_id_idx on public.prospections(parent_id);
create index prospections_statut_idx on public.prospections(statut);

alter table public.entreprises enable row level security;
alter table public.contacts enable row level security;
alter table public.prospections enable row level security;

create policy "entreprises_select_own" on public.entreprises
  for select using (auth.uid() = user_id);
create policy "entreprises_insert_own" on public.entreprises
  for insert with check (auth.uid() = user_id);
create policy "entreprises_update_own" on public.entreprises
  for update using (auth.uid() = user_id);
create policy "entreprises_delete_own" on public.entreprises
  for delete using (auth.uid() = user_id);

create policy "contacts_select_own" on public.contacts
  for select using (auth.uid() = user_id);
create policy "contacts_insert_own" on public.contacts
  for insert with check (auth.uid() = user_id);
create policy "contacts_update_own" on public.contacts
  for update using (auth.uid() = user_id);
create policy "contacts_delete_own" on public.contacts
  for delete using (auth.uid() = user_id);

create policy "prospections_select_own" on public.prospections
  for select using (auth.uid() = user_id);
create policy "prospections_insert_own" on public.prospections
  for insert with check (auth.uid() = user_id);
create policy "prospections_update_own" on public.prospections
  for update using (auth.uid() = user_id);
create policy "prospections_delete_own" on public.prospections
  for delete using (auth.uid() = user_id);
