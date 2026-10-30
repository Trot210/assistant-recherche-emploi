import type { EmailVerification } from "@/types/database.types";
import { verificationDepuisHunter } from "@/lib/hunter/verification";

export interface EmailHunter {
  value: string;
  type: "personal" | "generic";
  confidence: number;
  first_name: string | null;
  last_name: string | null;
  position: string | null;
  verification?: { status: string | null } | null;
  sources?: { uri: string }[];
}

export interface ContactHunter {
  nom: string;
  poste: string | null;
  email: string;
  source_url: string | null;
  // Verdict de Hunter déjà fourni avec l'adresse (sans coût), s'il y en a un.
  verification: EmailVerification | null;
}

const MAX_CONTACTS = 5;
const CONFIANCE_MIN = 70;

// Postes qui ont un lien avec la candidature visée : le reste (finance, IT,
// juridique...) ne sert à rien pour un message spontané.
const POSTES_PERTINENTS =
  /category|catégorie|trade|marketing|brand|marque|chef de produit|product (manager|owner|marketing|lead)|ach(at|et)|purchas|procurement|buyer|commerc|sales|key account|\bkam\b|business develop|\brh\b|\bhr\b|ressources humaines|human resources|recrut|talent/i;

// Écarte les adresses peu fiables ou sans rapport avec le poste visé, et
// classe les autres : adresses nominatives d'abord, puis vérifiées par Hunter,
// puis par niveau de confiance.
export function choisirContactsHunter(emails: EmailHunter[], dejaConnus: string[]): ContactHunter[] {
  const connus = new Set(dejaConnus.map((e) => e.toLowerCase()));

  return emails
    .filter((e) => e.type === "personal" && e.confidence >= CONFIANCE_MIN)
    .filter((e) => e.verification?.status !== "invalid")
    .filter((e) => e.position && POSTES_PERTINENTS.test(e.position))
    .filter((e) => (e.first_name || e.last_name) && !connus.has(e.value.toLowerCase()))
    .sort((a, b) => {
      const verifieA = a.verification?.status === "valid" ? 1 : 0;
      const verifieB = b.verification?.status === "valid" ? 1 : 0;
      return verifieB - verifieA || b.confidence - a.confidence;
    })
    .slice(0, MAX_CONTACTS)
    .map((e) => ({
      nom: [e.first_name, e.last_name].filter(Boolean).join(" "),
      poste: e.position,
      email: e.value,
      source_url: e.sources?.[0]?.uri ?? null,
      verification: e.verification?.status ? verificationDepuisHunter({ status: e.verification.status }) : null,
    }));
}
