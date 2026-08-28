-- Type de contrat affiché sur chaque offre + flags pour exclure par défaut
-- les stages et alternances du dashboard et du scoring.
alter table public.offres
  add column type_contrat text,
  add column type_contrat_libelle text,
  add column alternance boolean not null default false,
  add column stage boolean not null default false;
