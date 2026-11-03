// Règles du nettoyage des dossiers « Refus » et « En attente réponse ». Calcul pur.

export const JOURS_AVANT_NETTOYAGE = 30;

// Un mail est concerné quand il a été reçu avant cette date. On part de la date de réception : la
// boîte mail ne garde pas la date à laquelle le mail a été rangé dans le dossier.
export function dateLimiteNettoyage(maintenant: Date, jours: number): Date {
  return new Date(maintenant.getTime() - jours * 86_400_000);
}

export type ActionNettoyage = "corbeille" | "retirer";

// Un mail qui est aussi dans « Prospection » n'est que retiré du dossier (il reste dans « Prospection ») ;
// les autres vont à la corbeille. Sans identifiant lisible, on ne devine pas : corbeille, comme pour tout
// mail concerné, car il n'est dans aucun autre dossier géré.
export function actionDeNettoyage(messageIdNormalise: string | null, dansProspection: Set<string>): ActionNettoyage {
  return messageIdNormalise !== null && dansProspection.has(messageIdNormalise) ? "retirer" : "corbeille";
}
