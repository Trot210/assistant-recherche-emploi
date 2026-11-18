-- Trois ajouts, tous facultatifs et sans effet sur les données existantes :
--  1. reglages : dernier passage du tri automatique des mails (et son erreur éventuelle), pour signaler une panne ;
--  2. candidatures : date de la dernière relance d'une candidature sur offre, pour ne pas la proposer deux fois ;
--  3. courrier_candidatures : fiche de préparation d'un entretien, rédigée une seule fois par Claude.

alter table public.reglages
  add column if not exists courrier_passage_at timestamptz,
  add column if not exists courrier_passage_erreur text;

alter table public.candidatures
  add column if not exists derniere_relance_at timestamptz;

alter table public.courrier_candidatures
  add column if not exists fiche_entretien jsonb,
  add column if not exists fiche_entretien_at timestamptz;
