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

const RECRUTEUR = /recrut|talent|\brh\b|\bhr\b|ressources humaines|human resources/i;
const COMMERCIAL = /commerc|sales|vente|business develop/i;

function score(contact: ContactEntreprise, posteVise: string): number {
  const poste = contact.poste ?? "";
  let total = 0;
  if (POSTES_PROCHES[posteVise]?.test(poste)) total += 3;
  if (RECRUTEUR.test(poste)) total += 2;
  if (COMMERCIAL.test(poste)) total += 1;
  if (!contact.generique) total += 0.5;
  return total;
}

// Meilleur destinataire pour une candidature spontanée : seuls comptent les
// contacts qui ont une adresse e-mail ; on préfère un responsable du métier visé
// à un recruteur, puis un recruteur à une adresse générique.
export function choisirMeilleurContact(contacts: ContactEntreprise[], posteVise: string): ContactEntreprise | null {
  const joignables = contacts.filter((c) => c.email);
  if (joignables.length === 0) return null;
  return [...joignables].sort((a, b) => score(b, posteVise) - score(a, posteVise))[0];
}
