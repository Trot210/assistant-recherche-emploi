-- Mails de candidature qui demandent une action de ta part (« Finalisez votre candidature », « Envoyez
-- vos documents »…) : le tri des mails le repère et le site les liste dans « Aujourd'hui » jusqu'à ce que
-- tu les marques comme faits. Migration additive : aucune donnée existante n'est modifiée ni supprimée.

alter table public.courrier_candidatures
  add column if not exists action_requise boolean not null default false,
  add column if not exists action_texte text,
  add column if not exists action_lien text,
  add column if not exists action_faite_at timestamptz;
