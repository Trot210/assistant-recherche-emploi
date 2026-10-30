// Retrouver l'adresse e-mail d'une personne à partir de son nom : chaque
// entreprise suit presque toujours un même format (prenom.nom@, initiale+nom@...).
// On le déduit des adresses déjà connues du même domaine, puis on propose
// quelques adresses candidates, qu'une vérification (Hunter) départage ensuite.
// Calcul pur : aucun appel réseau ici.

export type Patron =
  | "{first}.{last}"
  | "{f}{last}"
  | "{first}"
  | "{first}{last}"
  | "{f}.{last}"
  | "{last}.{first}"
  | "{last}"
  | "{first}_{last}"
  | "{first}-{last}"
  | "{last}{f}"
  | "{first}{l}";

const FORMATS: Record<Patron, (p: string, n: string) => string> = {
  "{first}.{last}": (p, n) => `${p}.${n}`,
  "{f}{last}": (p, n) => `${p[0]}${n}`,
  "{first}": (p) => p,
  "{first}{last}": (p, n) => `${p}${n}`,
  "{f}.{last}": (p, n) => `${p[0]}.${n}`,
  "{last}.{first}": (p, n) => `${n}.${p}`,
  "{last}": (_p, n) => n,
  "{first}_{last}": (p, n) => `${p}_${n}`,
  "{first}-{last}": (p, n) => `${p}-${n}`,
  "{last}{f}": (p, n) => `${n}${p[0]}`,
  "{first}{l}": (p, n) => `${p}${n[0]}`,
};

export const PATRONS = Object.keys(FORMATS) as Patron[];

// Formats les plus répandus, utilisés quand le domaine n'en révèle aucun.
const PATRONS_PAR_DEFAUT: Patron[] = ["{first}.{last}", "{f}{last}", "{first}{last}"];

export function estPatron(valeur: unknown): valeur is Patron {
  return typeof valeur === "string" && (PATRONS as string[]).includes(valeur);
}

// Minuscules, sans accents ni apostrophes ni espaces ; le trait d'union est
// conservé (anne-lise.favet-richard@ existe tel quel chez certains employeurs).
export function nettoyerNomPropre(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "");
}

export function decouperNomComplet(nomComplet: string): { prenom: string; nom: string } | null {
  const mots = nomComplet.trim().split(/\s+/).filter(Boolean);
  if (mots.length < 2) return null;
  return { prenom: mots[0], nom: mots.slice(1).join(" ") };
}

function variantesTraitUnion(valeur: string): string[] {
  return valeur.includes("-") ? [valeur, valeur.replace(/-/g, "")] : [valeur];
}

// Parties locales possibles pour un patron : avec et sans trait d'union quand le
// prénom ou le nom en contient.
export function appliquerPatron(patron: Patron, prenom: string, nom: string): string[] {
  const p = nettoyerNomPropre(prenom);
  const n = nettoyerNomPropre(nom);
  if (!p || !n) return [];
  const locaux = new Set<string>();
  for (const vp of variantesTraitUnion(p)) {
    for (const vn of variantesTraitUnion(n)) locaux.add(FORMATS[patron](vp, vn));
  }
  return [...locaux];
}

// Quel patron explique cette adresse pour cette personne ?
export function detecterPatron(partieLocale: string, prenom: string, nom: string): Patron | null {
  const local = partieLocale.trim().toLowerCase();
  return PATRONS.find((patron) => appliquerPatron(patron, prenom, nom).includes(local)) ?? null;
}

export interface AdresseConnue {
  nom: string;
  email: string;
  // Adresse générique (recrutement@...) : n'apprend rien sur le format des personnes.
  generique?: boolean;
}

export interface FormatDomaine {
  patron: Patron;
  // Nombre d'adresses connues qui suivent ce format, sur l'ensemble de celles analysées.
  observations: number;
  total: number;
  // Autres formats rencontrés sur le même domaine, du plus fréquent au moins fréquent.
  autres: Patron[];
}

export function domaineDe(email: string): string | null {
  return email.split("@")[1]?.trim().toLowerCase() || null;
}

// Déduit le format d'un domaine des adresses déjà connues. Deux adresses
// concordantes (ou une seule, signalée par `observations: 1`) suffisent ; le
// reste est rendu comme formats secondaires.
export function deduireFormat(adresses: AdresseConnue[], domaine: string): FormatDomaine | null {
  const compte = new Map<Patron, number>();
  let total = 0;
  for (const a of adresses) {
    if (a.generique || domaineDe(a.email) !== domaine.toLowerCase()) continue;
    const mots = a.nom.trim().split(/\s+/);
    if (mots.length < 2) continue;
    const local = a.email.split("@")[0];
    // Le premier mot est le prénom ; si l'adresse ne s'explique pas ainsi, on essaie le dernier mot comme prénom.
    const patron =
      detecterPatron(local, mots[0], mots.slice(1).join(" ")) ?? detecterPatron(local, mots[mots.length - 1], mots.slice(0, -1).join(" "));
    total += 1;
    if (patron) compte.set(patron, (compte.get(patron) ?? 0) + 1);
  }
  const classes = [...compte.entries()].sort((a, b) => b[1] - a[1]);
  if (classes.length === 0) return null;
  return {
    patron: classes[0][0],
    observations: classes[0][1],
    total,
    autres: classes.slice(1).map(([p]) => p),
  };
}

export interface CandidatAdresse {
  email: string;
  patron: Patron;
}

export const MAX_CANDIDATS = 3;

// Adresses à essayer, de la plus probable à la moins probable : le format du
// domaine (déduit ou donné par Hunter), puis les autres formats observés, puis
// les formats courants. Au plus MAX_CANDIDATS, sans doublon.
export function candidatsAdresses(params: {
  prenom: string;
  nom: string;
  domaine: string;
  format?: FormatDomaine | null;
  patronHunter?: Patron | null;
}): CandidatAdresse[] {
  const ordre: Patron[] = [];
  const ajouter = (p: Patron | null | undefined) => {
    if (p && !ordre.includes(p)) ordre.push(p);
  };
  ajouter(params.format?.patron);
  ajouter(params.patronHunter);
  (params.format?.autres ?? []).forEach(ajouter);
  PATRONS_PAR_DEFAUT.forEach(ajouter);

  const candidats: CandidatAdresse[] = [];
  const vus = new Set<string>();
  for (const patron of ordre) {
    for (const local of appliquerPatron(patron, params.prenom, params.nom)) {
      const email = `${local}@${params.domaine.toLowerCase()}`;
      if (vus.has(email)) continue;
      vus.add(email);
      candidats.push({ email, patron });
    }
  }
  return candidats.slice(0, MAX_CANDIDATS);
}

// Hunter renvoie le format sous la forme « {first}.{last} » ; tout autre format est ignoré.
export function patronDepuisHunter(valeur: string | null | undefined): Patron | null {
  return estPatron(valeur) ? valeur : null;
}

// Domaine d'adresses d'une entreprise : le plus fréquent parmi ses adresses
// connues (il diffère parfois de celui du site web), sinon celui du site.
export function domaineAdresses(adresses: AdresseConnue[], domaineSite: string | null): string | null {
  const compte = new Map<string, number>();
  for (const a of adresses) {
    if (a.generique) continue;
    const d = domaineDe(a.email);
    if (d) compte.set(d, (compte.get(d) ?? 0) + 1);
  }
  const plusFrequent = [...compte.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return plusFrequent ?? domaineSite;
}
