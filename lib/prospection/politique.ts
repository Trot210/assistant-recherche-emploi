import type { EmailStatut, PolitiqueCandidature, ReponseType } from "@/types/database.types";
import type { ContactEntreprise, Entreprise } from "@/types/prospection";

// Ce qu'une entreprise accepte en matière de candidatures spontanées. C'est sa
// politique interne (ou ce que l'on a constaté), pas une obligation du RGPD :
// l'application s'en sert pour éviter d'écrire pour rien.
export const POLITIQUES: { id: PolitiqueCandidature; libelle: string; aide: string }[] = [
  { id: "acceptees", libelle: "Accepte les spontanées", aide: "L'entreprise dit conserver ou étudier les candidatures spontanées." },
  {
    id: "non_conservees",
    libelle: "Ne conserve pas les spontanées",
    aide: "Elle ne conserve ni ne diffuse les CV reçus hors offre : mieux vaut candidater à une offre publiée.",
  },
  {
    id: "portail_uniquement",
    libelle: "Candidature par son portail uniquement",
    aide: "Elle n'étudie que les candidatures déposées sur son site carrières ou ses offres.",
  },
  { id: "ne_pas_recontacter", libelle: "Ne plus contacter", aide: "Aucun message ne sera rédigé ni envoyé à cette entreprise." },
];

export function libellePolitique(politique: PolitiqueCandidature | null): string | null {
  return POLITIQUES.find((p) => p.id === politique)?.libelle ?? null;
}

export function estPolitique(valeur: unknown): valeur is PolitiqueCandidature {
  return typeof valeur === "string" && POLITIQUES.some((p) => p.id === valeur);
}

export type BlocageEcriture =
  | { niveau: "interdit"; raison: string }
  | { niveau: "avertissement"; raison: string };

// Écrire à une entreprise qui a demandé à ne plus l'être est interdit ; écrire à
// une entreprise qui ne conserve pas les spontanées reste possible, mais
// l'utilisateur doit le décider en connaissance de cause.
export function blocageEntreprise(entreprise: Pick<Entreprise, "nom" | "politique_candidature">): BlocageEcriture | null {
  switch (entreprise.politique_candidature) {
    case "ne_pas_recontacter":
      return { niveau: "interdit", raison: `${entreprise.nom} est marquée « ne plus contacter ».` };
    case "non_conservees":
      return {
        niveau: "avertissement",
        raison: `${entreprise.nom} a indiqué ne pas conserver les candidatures spontanées : une offre publiée est la bonne porte d'entrée.`,
      };
    case "portail_uniquement":
      return {
        niveau: "avertissement",
        raison: `${entreprise.nom} n'étudie que les candidatures déposées via son portail ou ses offres.`,
      };
    default:
      return null;
  }
}

export function blocageContact(contact: Pick<ContactEntreprise, "nom" | "email_statut"> | null): BlocageEcriture | null {
  if (!contact) return null;
  const statut: EmailStatut = contact.email_statut ?? "ok";
  if (statut === "ne_plus_contacter") {
    return { niveau: "interdit", raison: `${contact.nom} a demandé à ne plus être contacté(e).` };
  }
  if (statut === "invalide") {
    return { niveau: "interdit", raison: `L'adresse de ${contact.nom} a rebondi : elle est marquée invalide.` };
  }
  return null;
}

// Premier blocage rencontré, le plus strict d'abord.
export function premierBlocage(
  entreprise: Pick<Entreprise, "nom" | "politique_candidature">,
  contact: Pick<ContactEntreprise, "nom" | "email_statut"> | null,
): BlocageEcriture | null {
  const blocages = [blocageContact(contact), blocageEntreprise(entreprise)].filter((b): b is BlocageEcriture => b !== null);
  return blocages.find((b) => b.niveau === "interdit") ?? blocages[0] ?? null;
}

// Politique que l'on peut proposer à partir du type d'une réponse reçue. Rien
// n'est appliqué sans l'accord de l'utilisateur.
export function politiqueProposee(type: ReponseType): PolitiqueCandidature | null {
  return type === "cv_non_conserve" ? "non_conservees" : null;
}
