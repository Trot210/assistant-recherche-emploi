-- Coordonnées, formation et centres d'intérêt : informations factuelles et
-- statiques (pas adaptées par offre, contrairement à experiences/competences),
-- séparées des préférences de recherche, pour alimenter l'en-tête et le pied
-- du CV généré.
alter table public.profil
  add column contact jsonb not null default '{}'::jsonb,
  add column formation jsonb not null default '[]'::jsonb,
  add column activites jsonb not null default '{}'::jsonb;
