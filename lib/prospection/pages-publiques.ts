import { extraireDomaine } from "@/lib/prospection/fiche";

// Lecture gratuite des pages publiques d'une entreprise (accueil, contact,
// carrières, mentions légales) : aucun appel payant, et toute adresse e-mail
// trouvée ici figure mot pour mot sur la page, donc vérifiable.

export interface PageLue {
  url: string;
  texte: string;
  emails: string[];
}

const DELAI_MS = 8000;
const TAILLE_MAX_OCTETS = 600_000;
const TEXTE_MAX = 4000;
const PAGES_MAX = 4;
const LIENS_UTILES = /carri|recrut|rejoign|candidat|contact|mentions|presse|equipe|a-propos|about|qui-sommes|marques|brands|nos-marques/i;
const EXTENSIONS_FAUSSES = /\.(png|jpe?g|gif|svg|webp|css|js|woff2?)$/i;
const EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+/g;

// Évite qu'un domaine fourni par un tiers (modèle, page) ne pointe vers le
// réseau local : seules des adresses publiques à nom de domaine sont lues.
export function urlPublique(url: string): URL | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    const hote = u.hostname.toLowerCase();
    if (!hote.includes(".") || /^[\d.]+$/.test(hote) || hote.includes(":")) return null;
    if (/(^|\.)(localhost|local|internal|lan|home|corp)$/.test(hote)) return null;
    return u;
  } catch {
    return null;
  }
}

function decoderEntites(texte: string): string {
  return texte
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)));
}

export function htmlVersTexte(html: string): string {
  const texte = html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|br|section|article)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decoderEntites(texte)
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

// Adresses de l'entreprise elle-même seulement (même domaine ou sous-domaine) :
// on ignore celles de prestataires, d'hébergeurs ou de réseaux sociaux.
export function extraireEmails(html: string, domaine: string): string[] {
  const mailto = [...html.matchAll(/mailto:([^"'?\s>]+)/gi)].map((m) => decodeURIComponent(m[1]));
  const visibles = decoderEntites(html).match(EMAIL) ?? [];
  const trouves = new Set<string>();

  for (const brut of [...mailto, ...visibles]) {
    const email = brut.trim().replace(/[.,;:)>]+$/, "").toLowerCase();
    if (EXTENSIONS_FAUSSES.test(email)) continue;
    const hote = email.split("@")[1];
    if (hote && (hote === domaine || hote.endsWith(`.${domaine}`))) trouves.add(email);
  }
  return [...trouves];
}

// Pages utiles à lire, repérées dans les liens de l'accueil (même site seulement).
export function liensUtiles(html: string, base: URL): string[] {
  const urls = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/gi)) {
    try {
      const u = new URL(decoderEntites(m[1]), base);
      const memeSite = u.hostname.replace(/^www\./, "") === base.hostname.replace(/^www\./, "");
      if (memeSite && LIENS_UTILES.test(u.pathname) && !/\.(pdf|jpe?g|png|zip)$/i.test(u.pathname)) {
        u.hash = "";
        u.search = "";
        urls.add(u.toString());
      }
    } catch {
      /* lien invalide : ignoré */
    }
  }
  return [...urls];
}

async function telecharger(url: string): Promise<string | null> {
  const cible = urlPublique(url);
  if (!cible) return null;
  try {
    const res = await fetch(cible, {
      signal: AbortSignal.timeout(DELAI_MS),
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LeRayon/1.0; recherche d'emploi personnelle)", Accept: "text/html" },
    });
    // Une redirection ne doit pas mener hors du web public.
    if (!res.ok || !urlPublique(res.url)) return null;
    if (!(res.headers.get("content-type") ?? "").includes("html")) return null;
    const buffer = await res.arrayBuffer();
    return new TextDecoder("utf-8").decode(buffer.slice(0, TAILLE_MAX_OCTETS));
  } catch {
    return null;
  }
}

// Lit l'accueil, puis jusqu'à PAGES_MAX - 1 pages utiles en parallèle.
export async function lirePagesPubliques(siteWeb: string): Promise<PageLue[]> {
  const accueilUrl = urlPublique(siteWeb.includes("://") ? siteWeb : `https://${siteWeb}`);
  const domaine = extraireDomaine(siteWeb);
  if (!accueilUrl || !domaine) return [];

  const accueilHtml = await telecharger(accueilUrl.toString());
  if (!accueilHtml) return [];

  const autres = liensUtiles(accueilHtml, accueilUrl)
    .filter((u) => u !== accueilUrl.toString())
    .slice(0, PAGES_MAX - 1);
  const htmls = await Promise.all(autres.map(telecharger));

  const pages: { url: string; html: string }[] = [{ url: accueilUrl.toString(), html: accueilHtml }];
  autres.forEach((url, i) => {
    const html = htmls[i];
    if (html) pages.push({ url, html });
  });

  return pages.map(({ url, html }) => ({
    url,
    texte: htmlVersTexte(html).slice(0, TEXTE_MAX),
    emails: extraireEmails(html, domaine),
  }));
}

const ADRESSE_RECRUTEMENT = /recrut|candidat|emploi|jobs?@|carri|talent|^rh@|^hr@|ressources/i;

// Parmi les adresses de l'entreprise, celle qui sert aux candidatures.
export function choisirAdresseCandidature(pages: PageLue[]): { email: string; source_url: string } | null {
  for (const page of pages) {
    const email = page.emails.find((e) => ADRESSE_RECRUTEMENT.test(e));
    if (email) return { email, source_url: page.url };
  }
  return null;
}
