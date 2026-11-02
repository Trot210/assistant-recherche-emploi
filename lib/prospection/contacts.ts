import type { ContactEntreprise } from "@/types/prospection";

// Intitulés de poste qui parlent à celui qui recrute pour chaque poste visé.
const POSTES_PROCHES: Record<string, RegExp> = {
  "Category Manager": /category|catégorie|achat|ach(e|è)teur|buyer|merchand|assortiment/i,
  "Trade Marketing": /trade|shopper|marketing/i,
  "Chef de Produit": /produit|product|brand|marque|marketing/i,
  Acheteur: /achat|ach(e|è)teur|purchas|buyer|procurement/i,
  "Business Developer": /business develop|commerc|sales|key account/i,
  "Key Account Manager": /key account|\bkam\b|commerc|sales/i,
  Consultant: /consult|conseil/i,
};

// Un message spontané s'adresse à quelqu'un qui peut orienter une candidature :
// un responsable ou un directeur, pas un poste de terrain ou d'assistance.
const SENIOR = /director|directeur|directrice|head|chef|manager|responsable|vp|vice|lead|chief|\bcxo\b|\bchro\b|\bdrh\b/i;
const JUNIOR = /supervisor|superviseur|assistant|junior|stagiaire|intern|coordinat|conseiller|technicien/i;

const RECRUTEUR = /recrut|talent|acquisition|sourcing/i;
const RH = /\brh\b|\bhr\b|ressources humaines|human resources|people|\bchro\b|\bdrh\b|personnel/i;
// Fonctions qui décident ou pèsent sur l'embauche d'un category, d'un trade marketing ou
// d'un chef de produit : marketing, catégorie, ventes, achats, comptes clés, produit.
const DECIDEUR =
  /category|cat[ée]gor|trade|shopper|brand|marque|marketing|commerc|sales|vente|key account|\bkam\b|business develop|achat|purchas|buyer|merchand|retail|customer|produit|product|assortiment|go[- ]to[- ]market/i;

export type RoleContact = "decideur" | "recruteur" | "rh" | "autre";

export const LIBELLE_ROLE: Record<RoleContact, string> = {
  decideur: "décideur du poste",
  recruteur: "recruteur",
  rh: "RH",
  autre: "autre fonction",
};

export interface PertinenceContact {
  role: RoleContact;
  // Plus il est élevé, plus le contact est pertinent pour une candidature spontanée.
  score: number;
  libelle: string;
}

// Qui écrire en premier ? Le décideur du poste (marketing, catégorie, ventes) d'abord :
// c'est lui qui porte le besoin. Puis un recruteur, qui oriente. Les directions RH en
// dernier : elles répondent le plus souvent « candidatez sur le site ».
export function pertinenceContact(
  contact: Pick<ContactEntreprise, "poste" | "generique" | "email_verification">,
  posteVise: string,
): PertinenceContact {
  const poste = contact.poste ?? "";
  const senior = SENIOR.test(poste);
  const junior = JUNIOR.test(poste);

  let role: RoleContact;
  let score: number;
  if (RECRUTEUR.test(poste)) {
    role = "recruteur";
    score = 6;
  } else if (RH.test(poste)) {
    role = "rh";
    score = senior ? 1 : 2;
  } else if (DECIDEUR.test(poste)) {
    role = "decideur";
    score = 8 + (senior ? 2 : 0) + (POSTES_PROCHES[posteVise]?.test(poste) ? 2 : 0);
  } else {
    role = "autre";
    score = senior ? 3 : 1;
  }

  if (junior) score -= 3;
  if (!contact.generique) score += 0.5;
  // Une adresse confirmée par Hunter passe devant une adresse non vérifiée, à poste égal.
  if (contact.email_verification === "valide") score += 0.3;
  return { role, score, libelle: LIBELLE_ROLE[role] };
}

// Meilleur destinataire pour une candidature spontanée : seuls comptent les
// contacts qui ont une adresse e-mail ; on préfère le décideur du poste visé à un
// recruteur, puis un recruteur à une direction RH ou une adresse générique.
export function choisirMeilleurContact(contacts: ContactEntreprise[], posteVise: string): ContactEntreprise | null {
  // Une adresse qui a rebondi ou dont le titulaire ne veut plus être contacté n'est jamais proposée.
  const joignables = contacts.filter((c) => c.email && (c.email_statut ?? "ok") === "ok");
  if (joignables.length === 0) return null;
  return [...joignables].sort((a, b) => pertinenceContact(b, posteVise).score - pertinenceContact(a, posteVise).score)[0];
}
