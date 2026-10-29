-- Suivi détaillé des candidatures spontanées envoyées : type de réponse reçue,
-- commentaire et prochaine action. Tout est facultatif : les messages
-- existants ne changent pas, et le statut existant (envoyee, reponse_recue,
-- sans_suite) reste la source de vérité — « reponse_type » précise seulement
-- ce qu'était la réponse.

alter table public.prospections
  add column if not exists reponse_type text
    check (reponse_type in ('entretien', 'offre', 'refus', 'pas_de_poste', 'cv_non_conserve', 'autre')),
  add column if not exists reponse_date date,
  -- Court extrait de la réponse (pas le message complet).
  add column if not exists reponse_extrait text,
  -- Lien éventuellement indiqué dans la réponse (site carrières, offre...).
  add column if not exists reponse_url text,
  add column if not exists commentaire text,
  add column if not exists prochaine_action text,
  add column if not exists prochaine_action_date date;

-- Réponses déjà examinées dans la boîte mail (associées à une candidature ou
-- ignorées), pour ne pas les reproposer à chaque recherche. Une candidature
-- peut recevoir plusieurs réponses : la colonne ci-dessus garde la dernière,
-- cette table se souvient de toutes.
create table if not exists public.reponses_traitees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id text not null,
  prospection_id uuid references public.prospections(id) on delete set null,
  decision text not null check (decision in ('associee', 'ignoree')),
  created_at timestamptz not null default now(),
  unique (user_id, message_id)
);

create index if not exists reponses_traitees_user_id_idx on public.reponses_traitees(user_id);

alter table public.reponses_traitees enable row level security;

create policy "reponses_traitees_select_own" on public.reponses_traitees
  for select using (auth.uid() = user_id);
create policy "reponses_traitees_insert_own" on public.reponses_traitees
  for insert with check (auth.uid() = user_id);
create policy "reponses_traitees_update_own" on public.reponses_traitees
  for update using (auth.uid() = user_id);
create policy "reponses_traitees_delete_own" on public.reponses_traitees
  for delete using (auth.uid() = user_id);
