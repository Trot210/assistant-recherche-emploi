-- Langue du message (français ou anglais), pays du contact quand il est connu,
-- et identifiant du message envoyé depuis la plateforme (pour que les relances
-- s'affichent dans le même fil de discussion).

alter table public.prospections
  add column if not exists langue text not null default 'fr'
    check (langue in ('fr', 'en')),
  add column if not exists smtp_message_id text;

alter table public.contacts
  add column if not exists pays text,
  add column if not exists langue text
    check (langue in ('fr', 'en'));
