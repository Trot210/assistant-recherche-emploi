import type { EmailVerification } from "@/types/database.types";

// Réponse (partielle) de l'API de vérification d'adresse de Hunter.
export interface ReponseVerificationHunter {
  status?: string | null;
  result?: string | null;
  accept_all?: boolean | null;
}

// Traduit le verdict de Hunter. « valid » : le serveur confirme l'adresse.
// « accept_all » : il accepte n'importe quelle adresse, rien n'est prouvé.
// « invalid » ou jetable : l'adresse n'existe pas ou ne reçoit rien.
// Tout le reste (inconnu, messagerie grand public, réponse absente) : inconnu.
export function verificationDepuisHunter(reponse: ReponseVerificationHunter | null | undefined): EmailVerification {
  const statut = reponse?.status?.toLowerCase();
  if (statut === "valid") return "valide";
  if (statut === "accept_all" || reponse?.accept_all === true) return "accept_all";
  if (statut === "invalid" || statut === "disposable") return "invalide";
  return "inconnu";
}

export function libelleVerification(v: EmailVerification | null | undefined): string {
  switch (v) {
    case "valide":
      return "adresse vérifiée";
    case "accept_all":
      return "non vérifiable (le serveur accepte toute adresse)";
    case "invalide":
      return "adresse invalide";
    case "inconnu":
      return "vérification non concluante";
    default:
      return "adresse non vérifiée";
  }
}
