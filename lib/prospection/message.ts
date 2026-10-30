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

// D'où vient l'adresse du destinataire, dite en une phrase complète : la personne
// a le droit de le savoir (RGPD), et ça explique pourquoi on lui écrit.
export function sourceAdresse(
  contact: Pick<ContactEntreprise, "origine" | "source_email"> | null | undefined,
  langue: Langue,
): string | null {
  if (!contact) return null;
  const en = langue === "en";
  if (contact.origine === "hunter") {
    return en ? "Your address is listed in the Hunter.io professional directory." : "Votre adresse figure dans l'annuaire professionnel Hunter.io.";
  }
  if (contact.origine === "page_publique") {
    return en ? "Your address is published on your company's website." : "Votre adresse est publiée sur le site de votre entreprise.";
  }
  if (contact.origine === "devine") {
    return en
      ? "Your address was inferred from your company's email address format."
      : "Votre adresse a été déduite du format des adresses de votre entreprise.";
  }
  const saisie = contact.source_email?.trim();
  if (!saisie || saisie.length > 80) return null;
  return en ? `Your address comes from: ${saisie}.` : `Votre adresse provient de : ${saisie}.`;
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
  // Phrase sur la provenance de l'adresse (voir sourceAdresse), placée avant la mention de désinscription.
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
    params.source ? `${params.source} ${TEXTES[langue].desinscription}` : TEXTES[langue].desinscription,
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
