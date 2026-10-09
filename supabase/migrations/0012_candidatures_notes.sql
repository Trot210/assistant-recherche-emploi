-- Notes libres par candidature : nom du recruteur, date de relance prévue,
-- retour d'entretien... Colonne nullable, aucune donnée existante touchée.
alter table public.candidatures
  add column if not exists notes text;
