export type Bande = "high" | "mid" | "low" | "none";

export function bande(score: number | null | undefined): Bande {
  if (score == null) return "none";
  if (score >= 80) return "high";
  if (score >= 60) return "mid";
  return "low";
}

export function estAutomatique(source: string): boolean {
  return source === "france_travail" || source === "apec";
}

export function libelleSource(source: string): string {
  if (source === "france_travail") return "France Travail";
  if (source === "apec") return "APEC";
  return source;
}

const formatteurDate = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });

export function formaterDate(date: string | null): string {
  if (!date) return "";
  return formatteurDate.format(new Date(date));
}

export function estParisIntraMuros(localisation: string | null): boolean {
  if (!localisation) return false;
  return /\bparis\b|^75\b/i.test(localisation);
}

export function domaine(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
