import type { Contact as ContactCandidat } from "@/types/database.types";
import type { Entreprise } from "@/types/prospection";
import type { Offre } from "@/types/offre";
import { libelleTranche } from "@/lib/prospection/secteurs";
import { resumerFiche } from "@/lib/prospection/fiche";

// Claude ne rédige que le cœur du message. Formule d'appel, signature et
// mention de désinscription sont ajoutées par l'application : elles viennent
// du profil et de la fiche contact, jamais du modèle (même principe que
// pour le nom sur la lettre de motivation).
const MENTION_DESINSCRIPTION =
  "Si vous préférez que je ne vous recontacte pas, dites-le-moi simplement et je supprimerai vos coordonnées.";

export function assemblerMessage(params: {
  corps: string;
  contactNom?: string | null;
  candidat: ContactCandidat;
}): string {
  const appel = params.contactNom?.trim() ? `Bonjour ${params.contactNom.trim()},` : "Bonjour,";
  const signature = [params.candidat.nom, params.candidat.telephone, params.candidat.email]
    .filter((ligne): ligne is string => Boolean(ligne))
    .join("\n");

  return [appel, params.corps.trim(), "Cordialement,", signature, MENTION_DESINSCRIPTION]
    .filter(Boolean)
    .join("\n\n");
}

// Les fonctions de génération et de contrôle qualité du reste de
// l'application travaillent sur une offre : une candidature spontanée en
// reçoit une fictive, bâtie uniquement sur des faits connus (Sirene, fiche
// sourcée et note personnelle de l'utilisateur) pour que le contrôle de
// fidélité ne laisse passer aucune affirmation inventée sur l'entreprise.
export function offrePourProspection(entreprise: Entreprise, posteVise: string): Offre {
  const faits = [
    "Candidature spontanée : aucune offre n'est publiée.",
    entreprise.secteur ? `Secteur : ${entreprise.secteur}.` : null,
    entreprise.tranche_effectif ? `Effectif : ${libelleTranche(entreprise.tranche_effectif)}.` : null,
    entreprise.commune ? `Implantation du siège : ${entreprise.commune}.` : null,
    entreprise.notes ? `Information fournie par le candidat sur l'entreprise : ${entreprise.notes}` : null,
    resumerFiche(entreprise.fiche) || null,
  ].filter(Boolean);

  return {
    id: "",
    user_id: entreprise.user_id,
    titre: posteVise,
    entreprise: entreprise.nom,
    description: faits.join(" "),
    source: "prospection",
    source_id: entreprise.siren,
    lien_original: "",
    localisation: entreprise.commune,
    date_publication: null,
    type_contrat: null,
    type_contrat_libelle: null,
    alternance: false,
    stage: false,
    created_at: new Date().toISOString(),
  };
}
