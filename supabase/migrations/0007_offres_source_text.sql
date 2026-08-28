-- Le dashboard permet d'ajouter des offres depuis n'importe quelle source
-- (LinkedIn, Indeed, JobTeaser, Welcome to the Jungle...), pas seulement
-- france_travail/apec : la colonne passe d'un enum fermé à du texte libre.
alter table public.offres
  alter column source type text using source::text;

drop type if exists offre_source;
