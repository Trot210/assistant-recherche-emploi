-- Mails de candidature lus dans la boîte mail (accusés de réception, refus, invitations...) et ce
-- que le site en a conclu. Sert de mémoire : un mail n'est lu et classé (donc payé) qu'une fois, et
-- on sait lesquels restent à ranger dans « En attente réponse » ou « Refus ».
-- Migration additive : aucune donnée existante n'est modifiée ni supprimée.

create table if not exists public.courrier_candidatures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Identifiant du message (normalisé, comme reponses_traitees) et tel qu'écrit dans le message.
  message_id text not null,
  message_id_brut text,
  -- Ce que dit le mail : accusé de réception, refus, invitation à échanger, autre candidature, ou sans rapport.
  nature text not null check (nature in ('accuse_reception', 'refus', 'entretien', 'autre', 'non_lie')),
  expediteur text not null,
  sujet text not null default '',
  resume text not null default '',
  date_mail timestamptz,
  -- Rattaché à une candidature spontanée envoyée par le site (réponse à l'un de ses messages).
  prospection_id uuid references public.prospections(id) on delete set null,
  -- Quand le mail a été rangé dans son dossier ; null tant qu'il reste en boîte de réception.
  deplace_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, message_id)
);

create index if not exists courrier_candidatures_user_idx on public.courrier_candidatures(user_id, created_at desc);

alter table public.courrier_candidatures enable row level security;

create policy "courrier_candidatures_select_own" on public.courrier_candidatures
  for select using (auth.uid() = user_id);
create policy "courrier_candidatures_insert_own" on public.courrier_candidatures
  for insert with check (auth.uid() = user_id);
create policy "courrier_candidatures_update_own" on public.courrier_candidatures
  for update using (auth.uid() = user_id);
create policy "courrier_candidatures_delete_own" on public.courrier_candidatures
  for delete using (auth.uid() = user_id);
