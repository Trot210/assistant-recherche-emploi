import type { Langue } from "@/types/database.types";

// Hunter donne le pays de l'ENTREPRISE (code à deux lettres), pas celui de la
// personne : l'indice est donc indirect, d'où une suggestion affichée avec sa
// raison et toujours modifiable avant la rédaction.
const PAYS_FRANCOPHONES = new Set(["FR", "BE", "CH", "LU", "MC"]);

export interface IndicesLangue {
  email?: string | null;
  // Code pays à deux lettres (ex. "FR", "US"), saisi ou fourni par Hunter.
  pays?: string | null;
}

export interface SuggestionLangue {
  langue: Langue;
  raison: string;
}

export function libelleLangue(langue: Langue): string {
  return langue === "en" ? "Anglais" : "Français";
}

// Extension de pays d'une adresse e-mail ("marie@bel.fr" -> "FR"), ou null
// pour une extension générique (.com, .net, .org...), qui ne dit rien du pays.
function paysDuDomaine(email: string | null | undefined): string | null {
  const domaine = email?.split("@")[1]?.toLowerCase();
  const extension = domaine?.split(".").pop();
  if (!extension || !/^[a-z]{2}$/.test(extension)) return null;
  // L'extension du Royaume-Uni est .uk, le code pays est GB.
  return extension === "uk" ? "GB" : extension.toUpperCase();
}

export function suggererLangue(indices: IndicesLangue): SuggestionLangue {
  const pays = indices.pays?.trim().toUpperCase() || null;
  if (pays) {
    return PAYS_FRANCOPHONES.has(pays)
      ? { langue: "fr", raison: `pays du contact : ${pays}` }
      : { langue: "en", raison: `pays du contact : ${pays}` };
  }

  const paysDomaine = paysDuDomaine(indices.email);
  if (paysDomaine) {
    return PAYS_FRANCOPHONES.has(paysDomaine)
      ? { langue: "fr", raison: `adresse en .${paysDomaine.toLowerCase()}` }
      : { langue: "en", raison: `adresse en .${paysDomaine === "GB" ? "uk" : paysDomaine.toLowerCase()}` };
  }

  return { langue: "fr", raison: "entreprise française, aucun indice contraire" };
}

// Pour un contact qui n'a pas de pays propre : le pays de l'entreprise donné
// par Hunter sert d'indice faute de mieux, en dernier recours après l'extension.
export function suggererLangueContact(contact: {
  email: string | null;
  pays: string | null;
  langue: Langue | null;
}): SuggestionLangue {
  if (contact.langue) return { langue: contact.langue, raison: "choisie pour ce contact" };
  return suggererLangue({ email: contact.email, pays: contact.pays });
}
