import type { EnvoiProgramme } from "@/types/prospection";

// Envois programmés que l'utilisateur doit voir : un envoi échoué, ou annulé par le
// site (message modifié, adresse devenue invalide, réponse reçue...). Ceux qu'il a
// lui-même annulés ou envoyés à la main n'ont rien à lui signaler.
const MOTIFS_VOLONTAIRES = ["Annulé par toi", "envoyé manuellement", "Message traité à la main"];

export const JOURS_ALERTE = 3;

export function envoiASurveiller(envoi: Pick<EnvoiProgramme, "statut" | "erreur" | "termine_at">, maintenant: Date): boolean {
  if (envoi.statut !== "echec" && envoi.statut !== "annule") return false;
  if (envoi.statut === "annule" && MOTIFS_VOLONTAIRES.includes(envoi.erreur ?? "")) return false;
  if (!envoi.termine_at) return true;
  return maintenant.getTime() - new Date(envoi.termine_at).getTime() <= JOURS_ALERTE * 86_400_000;
}
