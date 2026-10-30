-- Lot 3 : traitement quotidien automatique (relances préparées, récapitulatif).
-- Migration additive : aucune donnée existante n'est modifiée ni supprimée.

alter table public.reglages
  -- Préparer chaque matin les brouillons des relances dues (jamais envoyées sans validation).
  add column if not exists relances_auto boolean not null default true,
  -- Recevoir chaque matin un récapitulatif par e-mail (seulement s'il y a quelque chose à faire).
  add column if not exists recap_actif boolean not null default true,
  -- Dernier jour (Paris) où le traitement a tourné : évite un double passage.
  add column if not exists dernier_traitement date;
