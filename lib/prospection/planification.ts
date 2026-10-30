// Règles des envois programmés. Calcul pur : l'accès à la base et l'envoi sont ailleurs.
// Toutes les dates sont stockées en UTC ; l'utilisateur raisonne en heure de Paris.

export const MAX_PAR_JOUR_DEFAUT = 6;
export const ECART_MIN_DEFAUT_MINUTES = 10;
export const MAX_ESSAIS = 3; // un envoi échoué est retenté deux fois
export const DELAI_RETENTATIVE_MINUTES = 30;
// Un envoi « en cours » depuis plus longtemps a été interrompu (fonction coupée).
export const DELAI_INTERRUPTION_MINUTES = 15;
export const HORIZON_MAX_JOURS = 120;

const FUSEAU = "Europe/Paris";

interface PartiesParis {
  date: string; // AAAA-MM-JJ
  heure: string; // HH:MM
  jourSemaine: number; // 0 = dimanche … 6 = samedi
}

export function decomposerParis(instant: Date): PartiesParis {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: FUSEAU,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const p = Object.fromEntries(f.formatToParts(instant).map((x) => [x.type, x.value]));
  const jours = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    heure: `${p.hour}:${p.minute}`,
    jourSemaine: jours.indexOf(p.weekday),
  };
}

// Décalage de Paris par rapport à l'UTC à cet instant, en minutes (60 l'hiver, 120 l'été).
function decalageParisMinutes(instant: Date): number {
  const p = decomposerParis(instant);
  const [h, m] = p.heure.split(":").map(Number);
  const [a, mo, j] = p.date.split("-").map(Number);
  return Math.round((Date.UTC(a, mo - 1, j, h, m) - Math.floor(instant.getTime() / 60_000) * 60_000) / 60_000);
}

// « 2026-11-06 » + « 09:30 » à Paris → l'instant UTC correspondant.
export function parisVersUtc(date: string, heure: string): Date {
  const [a, mo, j] = date.split("-").map(Number);
  const [h, m] = heure.split(":").map(Number);
  const naif = Date.UTC(a, mo - 1, j, h, m);
  let instant = new Date(naif - 60 * 60_000);
  // Deux passes suffisent pour retomber sur le bon décalage, y compris autour du changement d'heure.
  for (let i = 0; i < 2; i++) instant = new Date(naif - decalageParisMinutes(instant) * 60_000);
  return instant;
}

export function formaterProgrammation(instant: Date): string {
  const f = new Intl.DateTimeFormat("fr-FR", {
    timeZone: FUSEAU,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const texte = f.format(instant);
  // « jeudi 6 novembre 2026 à 09:30 » → « … à 9 h 30 (heure de Paris) »
  return `${texte.replace(/(\d{1,2}):(\d{2})$/, (_m, h: string, mi: string) => (mi === "00" ? `${Number(h)} h` : `${Number(h)} h ${mi}`)).replace(" à ", " à ")} (heure de Paris)`;
}

export interface ValidationProgrammation {
  erreur?: string;
  avertissements: string[];
}

// Une programmation doit être dans le futur proche ou lointain raisonnable. Hors des
// heures de bureau, on prévient sans interdire : le choix reste le tien.
export function validerProgrammation(instant: Date, maintenant: Date): ValidationProgrammation {
  if (Number.isNaN(instant.getTime())) return { erreur: "Date et heure invalides", avertissements: [] };
  if (instant.getTime() < maintenant.getTime() + 2 * 60_000) {
    return { erreur: "Choisis un moment au moins deux minutes dans le futur", avertissements: [] };
  }
  if (instant.getTime() > maintenant.getTime() + HORIZON_MAX_JOURS * 86_400_000) {
    return { erreur: `Choisis une date dans les ${HORIZON_MAX_JOURS} prochains jours`, avertissements: [] };
  }

  const avertissements: string[] = [];
  const { jourSemaine, heure } = decomposerParis(instant);
  const [h] = heure.split(":").map(Number);
  if (jourSemaine === 0 || jourSemaine === 6) avertissements.push("Ce jour tombe un week-end : un message envoyé un jour ouvré a plus de chances d'être lu.");
  else if (h < 8 || h >= 19) avertissements.push("Cette heure est hors des heures de bureau (8 h–19 h) : mieux vaut un créneau de journée.");
  return { avertissements };
}

export interface EnvoiPlanifie {
  id: string;
  prevu_at: string;
}

export interface DecisionEnvois {
  aEnvoyer: string[];
  // Pourquoi on n'envoie pas (plus) maintenant, pour le journal.
  raison: string | null;
}

// Parmi les envois dont l'heure est passée, lesquels partir MAINTENANT. Une seule
// exécution envoie au plus un message : le plafond du jour et l'écart minimal avec
// le dernier envoi s'appliquent aux envois manuels comme aux envois programmés.
export function choisirEnvoisDus(params: {
  programmes: EnvoiPlanifie[];
  maintenant: Date;
  dernierEnvoi: Date | null;
  nbEnvoyesAujourdhui: number;
  maxParJour: number;
  ecartMinutes: number;
}): DecisionEnvois {
  const dus = params.programmes
    .filter((e) => new Date(e.prevu_at).getTime() <= params.maintenant.getTime())
    .sort((a, b) => a.prevu_at.localeCompare(b.prevu_at));
  if (dus.length === 0) return { aEnvoyer: [], raison: null };

  if (params.nbEnvoyesAujourdhui >= params.maxParJour) {
    return { aEnvoyer: [], raison: `limite de ${params.maxParJour} envois par jour atteinte : reporté à demain` };
  }
  if (params.dernierEnvoi && params.maintenant.getTime() - params.dernierEnvoi.getTime() < params.ecartMinutes * 60_000) {
    return { aEnvoyer: [], raison: `moins de ${params.ecartMinutes} minutes depuis le dernier envoi : reporté au prochain passage` };
  }
  return { aEnvoyer: [dus[0].id], raison: dus.length > 1 ? "les autres partiront aux passages suivants, avec l'écart minimal" : null };
}

export interface ResultatEchec {
  rejouer: boolean;
  prochainEssai: Date | null;
}

// Un envoi qui échoue est retenté deux fois, à 30 minutes d'écart, puis abandonné.
export function apresEchecEnvoi(tentatives: number, maintenant: Date): ResultatEchec {
  if (tentatives >= MAX_ESSAIS) return { rejouer: false, prochainEssai: null };
  return { rejouer: true, prochainEssai: new Date(maintenant.getTime() + DELAI_RETENTATIVE_MINUTES * 60_000) };
}

export interface CreneauEtale {
  numero: number;
  jour: string; // AAAA-MM-JJ
  heure: string; // HH:MM
  instant: Date;
}

const DEBUT_FENETRE_MIN = 9 * 60;
const FIN_FENETRE_MIN = 17 * 60;

// Répartit `nombre` envois sur des jours ouvrés à partir de `debut` : au plus
// `maxParJour` par jour, dans la fenêtre 9 h–17 h, à des heures variées (le jour est
// découpé en autant de plages égales qu'il y a d'envois, un horaire au hasard dans
// chacune). `occupes` : horaires déjà pris, à éviter à `ecartMinutes` près.
export function etalerEnvois(params: {
  nombre: number;
  debut: string;
  maxParJour: number;
  ecartMinutes: number;
  occupes?: Date[];
  hasard?: () => number;
}): CreneauEtale[] {
  const hasard = params.hasard ?? Math.random;
  const occupes = [...(params.occupes ?? [])];
  const creneaux: CreneauEtale[] = [];
  const largeurMin = FIN_FENETRE_MIN - DEBUT_FENETRE_MIN;

  let jour = params.debut;
  let garde = 0;
  while (creneaux.length < params.nombre && garde++ < 400) {
    const instantMidi = parisVersUtc(jour, "12:00");
    const { jourSemaine } = decomposerParis(instantMidi);
    if (jourSemaine !== 0 && jourSemaine !== 6) {
      const k = Math.min(params.maxParJour, params.nombre - creneaux.length);
      const plage = largeurMin / k;
      for (let i = 0; i < k; i++) {
        const marge = Math.min(15, plage / 4);
        let minutes = DEBUT_FENETRE_MIN + i * plage + marge + hasard() * (plage - 2 * marge);
        minutes = Math.round(minutes / 5) * 5;
        let instant = parisVersUtc(jour, `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`);
        // Décale d'un écart tant qu'un autre envoi est trop proche.
        let essais = 0;
        while (occupes.some((o) => Math.abs(o.getTime() - instant.getTime()) < params.ecartMinutes * 60_000) && essais++ < 20) {
          instant = new Date(instant.getTime() + params.ecartMinutes * 60_000);
        }
        occupes.push(instant);
        const p = decomposerParis(instant);
        creneaux.push({ numero: creneaux.length + 1, jour: p.date, heure: p.heure, instant });
      }
    }
    jour = decomposerParis(new Date(parisVersUtc(jour, "12:00").getTime() + 86_400_000)).date;
  }
  return creneaux;
}

// Champ « date et heure » du navigateur (AAAA-MM-JJTHH:MM), toujours lu comme une heure de Paris.
export function localVersInstant(valeur: string): Date | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(valeur);
  if (!m) return null;
  const instant = parisVersUtc(m[1], m[2]);
  return Number.isNaN(instant.getTime()) ? null : instant;
}

export function instantVersLocal(instant: Date): string {
  const p = decomposerParis(instant);
  return `${p.date}T${p.heure}`;
}
