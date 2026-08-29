-- Le suivi des candidatures gagne deux étapes intermédiaires entre "envoyée"
-- et le dénouement (refus/entretien) : "réponse reçue" (accusé de réception,
-- avant de savoir si c'est positif) et "offre" (issue positive du process).
alter type candidature_statut add value if not exists 'reponse_recue';
alter type candidature_statut add value if not exists 'offre';
