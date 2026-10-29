-- Fiche entreprise issue de la recherche web (activité, marques, enjeux,
-- sources) et provenance des contacts : chaque contact trouvé automatiquement
-- garde le lien de la page publique d'où il vient.

alter table public.entreprises
  add column if not exists fiche jsonb,
  add column if not exists fiche_generee_at timestamptz;

alter table public.contacts
  add column if not exists source_url text,
  add column if not exists origine text not null default 'manuel'
    check (origine in ('manuel', 'page_publique', 'hunter')),
  -- Adresse générique de l'entreprise (recrutement@...) : pas de prénom à
  -- saluer dans le message.
  add column if not exists generique boolean not null default false;
