-- Nettoyage automatique des dossiers « Refus » et « En attente réponse » de la boîte mail :
-- un mail de plus de 30 jours est mis à la corbeille de Gmail (récupérable, Gmail l'efface
-- lui-même définitivement après 30 jours de plus) ; un mail aussi rangé dans « Prospection »
-- est seulement retiré du dossier. Activé par défaut, désactivable depuis « Aujourd'hui ».
-- Migration additive : aucune donnée existante n'est modifiée ni supprimée.

alter table public.reglages
  add column if not exists purge_dossiers boolean not null default true;
