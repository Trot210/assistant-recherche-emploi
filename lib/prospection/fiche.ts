import { POSTES_CIBLES } from "@/lib/prospection/secteurs";
import type { AdresseCandidature, ContactPublic, FaitSource, Fiche, PosteSuggere } from "@/types/fiche";

// Ce que la recherche web a réellement ramené : les liens des pages
// consultées, et les extraits que Claude a cités à partir d'elles.
export interface SourcesRecherche {
  urls: string[];
  extraits: { url: string; texte: string }[];
}

// Ce que le modèle renvoie avant contrôle : rien de tout cela n'est cru
// tel quel (voir assainirFiche).
export interface FicheBrute {
  site_web: string | null;
  activite: string;
  marques: FaitSource[];
  enjeux: FaitSource[];
  actualites: FaitSource[];
  adresse_candidature: { email: string; source_url: string } | null;
  contacts_publics: { nom: string; poste: string | null; email: string | null; source_url: string }[];
  postes_suggeres: PosteSuggere[];
}

const MAX_FAITS = 5;
const MAX_TEXTE = 240;
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

// Deux liens désignent la même page s'ils ne diffèrent que par le schéma,
// "www.", la casse, le fragment ou un "/" final.
export function cleUrl(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return `${u.hostname.replace(/^www\./, "").toLowerCase()}${u.pathname.replace(/\/+$/, "").toLowerCase()}`;
  } catch {
    return null;
  }
}

export function extraireDomaine(siteWeb: string | null | undefined): string | null {
  if (!siteWeb) return null;
  try {
    const hote = new URL(siteWeb.includes("://") ? siteWeb : `https://${siteWeb}`).hostname;
    return hote.replace(/^www\./, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

function emailCiteDansExtraits(email: string, sources: SourcesRecherche): boolean {
  const cible = email.toLowerCase();
  return sources.extraits.some((e) => e.texte.toLowerCase().includes(cible));
}

// Applique à la sortie du modèle les contrôles que le prompt seul ne peut pas
// garantir : un fait sans lien vérifiable est écarté, une adresse e-mail n'est
// marquée « confirmée » que si elle figure dans un extrait cité, et les postes
// suggérés sont ramenés à la liste des postes ciblés.
export function assainirFiche(brute: FicheBrute, sources: SourcesRecherche): Fiche {
  const autorisees = new Set(sources.urls.map(cleUrl).filter((c): c is string => c !== null));
  const sourceValide = (url: string) => {
    const cle = cleUrl(url);
    return cle !== null && autorisees.has(cle);
  };

  const faits = (liste: FaitSource[]): FaitSource[] =>
    liste
      .filter((f) => f.texte.trim() && sourceValide(f.source_url))
      .slice(0, MAX_FAITS)
      .map((f) => ({ texte: f.texte.trim().slice(0, MAX_TEXTE), source_url: f.source_url.trim() }));

  let adresse: AdresseCandidature | null = null;
  if (brute.adresse_candidature) {
    const email = brute.adresse_candidature.email.trim();
    if (EMAIL.test(email) && sourceValide(brute.adresse_candidature.source_url)) {
      adresse = {
        email,
        source_url: brute.adresse_candidature.source_url.trim(),
        confirmee: emailCiteDansExtraits(email, sources),
      };
    }
  }

  const contacts: ContactPublic[] = brute.contacts_publics
    .filter((c) => c.nom.trim() && sourceValide(c.source_url))
    .slice(0, MAX_FAITS)
    .map((c) => {
      const email = c.email?.trim() ?? "";
      return {
        nom: c.nom.trim(),
        poste: c.poste?.trim() || null,
        email: EMAIL.test(email) && emailCiteDansExtraits(email, sources) ? email : null,
        source_url: c.source_url.trim(),
      };
    });

  const postes: PosteSuggere[] = [];
  for (const suggestion of brute.postes_suggeres) {
    const canonique = POSTES_CIBLES.find((p) => p.toLowerCase() === suggestion.poste.trim().toLowerCase());
    if (canonique && !postes.some((p) => p.poste === canonique)) {
      postes.push({ poste: canonique, raison: suggestion.raison.trim().slice(0, MAX_TEXTE) });
    }
  }

  return {
    site_web: extraireDomaine(brute.site_web) ? brute.site_web!.trim() : null,
    activite: brute.activite.trim().slice(0, 400),
    marques: faits(brute.marques),
    enjeux: faits(brute.enjeux),
    actualites: faits(brute.actualites),
    adresse_candidature: adresse,
    contacts_publics: contacts,
    postes_suggeres: postes.slice(0, 3),
  };
}

// Résumé des faits sourcés pour les prompts de rédaction et de contrôle : le
// modèle ne peut s'appuyer sur l'entreprise que pour ce qui figure ici.
export function resumerFiche(fiche: Fiche | null): string {
  if (!fiche) return "";
  const lignes = [
    fiche.activite && `Activité : ${fiche.activite}`,
    fiche.marques.length > 0 && `Marques : ${fiche.marques.map((m) => m.texte).join(" ; ")}`,
    fiche.enjeux.length > 0 && `Enjeux : ${fiche.enjeux.map((e) => e.texte).join(" ; ")}`,
    fiche.actualites.length > 0 && `Actualités : ${fiche.actualites.map((a) => a.texte).join(" ; ")}`,
  ].filter(Boolean);
  return lignes.join("\n");
}
