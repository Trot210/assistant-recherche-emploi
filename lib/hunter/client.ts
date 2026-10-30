import type { EmailHunter } from "@/lib/hunter/selection";
import { verificationDepuisHunter, type ReponseVerificationHunter } from "@/lib/hunter/verification";
import type { EmailVerification } from "@/types/database.types";

// Hunter.io : l'offre gratuite donne un petit quota mensuel de recherches. La
// clé est facultative — sans elle, la recherche de contacts par Hunter est
// simplement masquée dans l'interface.
const API = "https://api.hunter.io/v2";

export function hunterConfigure(): boolean {
  return Boolean(process.env.HUNTER_API_KEY);
}

export class QuotaHunterEpuise extends Error {
  constructor() {
    super("Le quota de recherches Hunter de ce mois est épuisé");
    this.name = "QuotaHunterEpuise";
  }
}

async function appeler<T>(chemin: string, params: Record<string, string>): Promise<T> {
  const apiKey = process.env.HUNTER_API_KEY;
  if (!apiKey) throw new Error("HUNTER_API_KEY n'est pas défini dans .env.local");

  // La clé voyage en en-tête plutôt que dans l'URL, pour ne pas finir dans des journaux.
  const res = await fetch(`${API}${chemin}?${new URLSearchParams(params)}`, {
    headers: { "X-API-KEY": apiKey, Accept: "application/json" },
    cache: "no-store",
  });

  if (res.status === 429) throw new QuotaHunterEpuise();
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Hunter a répondu ${res.status}${detail ? ` : ${detail.slice(0, 200)}` : ""}`);
  }
  return (await res.json()) as T;
}

// Nom d'entreprise utilisable par Hunter : la raison sociale Sirene contient
// parenthèses, formes juridiques et mots génériques qui gênent la recherche.
export function nomPourHunter(raisonSociale: string): string {
  return raisonSociale
    .replace(/\(.*?\)/g, " ")
    .replace(/\b(SAS|SASU|SARL|SA|FRANCE|ENTREPRISE|EXPLOITATION|PRODUCTION|ELECTROMENAGER)\b/gi, " ")
    .replace(/\.com\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function rechercherParametre(param: Record<string, string>) {
  const data = await appeler<{ data?: { emails?: EmailHunter[]; country?: string | null; pattern?: string | null } }>("/domain-search", {
    ...param,
    limit: "10",
    type: "personal",
    // L'offre gratuite ne renvoie que 10 adresses par recherche : on les
    // demande dans les services utiles plutôt que parmi les dirigeants.
    department: "marketing,sales,hr",
  });
  return { emails: data.data?.emails ?? [], pays: data.data?.country ?? null, pattern: data.data?.pattern ?? null };
}

// Hunter donne le pays de l'ENTREPRISE (code à deux lettres), pas celui de
// chaque personne : il sert d'indice pour choisir la langue du message. Le
// domaine du site n'est pas toujours celui des adresses e-mail (groupe parent,
// domaine dédié) : sans résultat, on retente avec le nom de l'entreprise. Une
// recherche sans résultat ne consomme pas le quota.
export async function rechercherEmailsDomaine(
  domaine: string,
  nomEntreprise?: string,
): Promise<{ emails: EmailHunter[]; pays: string | null; pattern: string | null }> {
  const parDomaine = await rechercherParametre({ domain: domaine });
  if (parDomaine.emails.length > 0 || !nomEntreprise) return parDomaine;
  const nom = nomPourHunter(nomEntreprise);
  return nom.length >= 3 ? rechercherParametre({ company: nom }) : parDomaine;
}

export async function quotaHunter(): Promise<{ utilisees: number; disponibles: number } | null> {
  try {
    const data = await appeler<{ data?: { requests?: { searches?: { used?: number; available?: number } } } }>(
      "/account",
      {},
    );
    const recherches = data.data?.requests?.searches;
    if (recherches?.used === undefined || recherches.available === undefined) return null;
    return { utilisees: recherches.used, disponibles: recherches.available };
  } catch {
    return null;
  }
}

export interface QuotaHunter {
  recherches: { utilisees: number; disponibles: number };
  verifications: { utilisees: number; disponibles: number };
}

// Crédits restants du mois. L'appel au compte ne consomme aucun crédit.
export async function lireQuotaHunter(): Promise<QuotaHunter> {
  const data = await appeler<{
    data?: { requests?: { searches?: { used?: number; available?: number }; verifications?: { used?: number; available?: number } } };
  }>("/account", {});
  const r = data.data?.requests;
  return {
    recherches: { utilisees: r?.searches?.used ?? 0, disponibles: r?.searches?.available ?? 0 },
    verifications: { utilisees: r?.verifications?.used ?? 0, disponibles: r?.verifications?.available ?? 0 },
  };
}

// Vérifie qu'une adresse existe (une « vérification » du quota mensuel Hunter,
// distincte des recherches). Hunter répond parfois 202 : la vérification est en
// cours, on réessaie une fois avant de conclure « inconnu ».
export async function verifierEmail(email: string): Promise<EmailVerification> {
  const apiKey = process.env.HUNTER_API_KEY;
  if (!apiKey) throw new Error("HUNTER_API_KEY n'est pas défini dans .env.local");

  for (let tentative = 0; tentative < 2; tentative++) {
    const res = await fetch(`${API}/email-verifier?${new URLSearchParams({ email })}`, {
      headers: { "X-API-KEY": apiKey, Accept: "application/json" },
      cache: "no-store",
    });
    if (res.status === 429) throw new QuotaHunterEpuise();
    if (res.status === 202) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      continue;
    }
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Hunter a répondu ${res.status}${detail ? ` : ${detail.slice(0, 200)}` : ""}`);
    }
    const data = (await res.json()) as { data?: ReponseVerificationHunter };
    return verificationDepuisHunter(data.data);
  }
  return "inconnu";
}
