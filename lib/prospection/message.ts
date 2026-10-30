import type { Contact as ContactCandidat, Langue } from "@/types/database.types";
import type { ContactEntreprise, Entreprise } from "@/types/prospection";
import type { Offre } from "@/types/offre";
import { libelleTranche } from "@/lib/prospection/secteurs";
import { resumerFiche } from "@/lib/prospection/fiche";

// Claude ne rédige que le cœur du message. Formule d'appel, signature et
// mention de désinscription sont ajoutées par l'application : elles viennent
// du profil et de la fiche contact, jamais du modèle (même principe que
// pour le nom sur la lettre de motivation).
const TEXTES: Record<Langue, { cordialement: string; desinscription: string }> = {
  fr: {
    cordialement: "Cordialement,",
    desinscription: "Si vous préférez que je ne vous recontacte pas, un mot suffit et je supprimerai vos coordonnées.",
  },
  en: {
    cordialement: "Kind regards,",
    desinscription: "If you'd rather I didn't contact you again, just let me know and I will delete your details.",
  },
};

// D'où vient l'adresse du destinataire, dite en une expression qui suit « provient de » :
// la personne a le droit de le savoir (RGPD), et ça explique pourquoi on lui écrit.
export function sourceAdresse(
  contact: Pick<ContactEntreprise, "origine" | "source_email"> | null | undefined,
  langue: Langue,
): string | null {
  if (!contact) return null;
  const en = langue === "en";
  if (contact.origine === "hunter") return en ? "the Hunter.io professional directory" : "l'annuaire professionnel Hunter.io";
  if (contact.origine === "page_publique") return en ? "your company's website" : "le site de votre entreprise";
  const saisie = contact.source_email?.trim();
  return saisie && saisie.length <= 80 ? saisie : null;
}

function formuleAppel(contactNom: string | null | undefined, langue: Langue): string {
  const nom = contactNom?.trim();
  if (langue === "en") {
    // En anglais professionnel, on s'adresse à la personne par son prénom.
    return nom ? `Hello ${nom.split(/\s+/)[0]},` : "Hello,";
  }
  return nom ? `Bonjour ${nom},` : "Bonjour,";
}

export function assemblerMessage(params: {
  corps: string;
  contactNom?: string | null;
  candidat: ContactCandidat;
  langue?: Langue;
  // Provenance de l'adresse (voir sourceAdresse), ajoutée à la mention de désinscription.
  source?: string | null;
}): string {
  const langue = params.langue ?? "fr";
  const signature = [params.candidat.nom, params.candidat.telephone, params.candidat.email]
    .filter((ligne): ligne is string => Boolean(ligne))
    .join("\n");

  return [
    formuleAppel(params.contactNom, langue),
    params.corps.trim(),
    TEXTES[langue].cordialement,
    signature,
    params.source
      ? `${langue === "en" ? `Your address comes from ${params.source}.` : `Votre adresse provient de ${params.source}.`} ${TEXTES[langue].desinscription}`
      : TEXTES[langue].desinscription,
  ]
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
