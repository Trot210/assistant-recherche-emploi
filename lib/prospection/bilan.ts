import { LIBELLE_ROLE, pertinenceContact, type RoleContact } from "@/lib/prospection/contacts";
import type { ContactEntreprise, Entreprise, Prospection } from "@/types/prospection";

// Bilan de la prospection : de l'envoi à l'entretien, et (à partir d'assez d'envois)
// ce qui marche le mieux. Calcul pur.

// En dessous, une comparaison entre segments n'a pas de sens : un seul message de plus
// ou de moins change tous les taux.
export const SEUIL_COMPARAISON = 30;
// Un segment de moins de 5 messages est montré, mais signalé comme trop petit.
export const MIN_SEGMENT_FIABLE = 5;
// Au-delà, la réputation de l'adresse d'envoi commence à souffrir.
export const SEUIL_REBOND = 0.03;

type MessageBilan = Pick<
  Prospection,
  "type" | "statut" | "contact_id" | "entreprise_id" | "date_envoi" | "reponse_type" | "reponse_date" | "langue" | "poste_vise"
>;

export interface EntreeBilan {
  prospections: MessageBilan[];
  contacts: Pick<ContactEntreprise, "id" | "poste" | "generique" | "email_verification">[];
  entreprises: Pick<Entreprise, "id" | "secteur">[];
}

export interface Entonnoir {
  envoyes: number;
  rebonds: number;
  remis: number;
  reponses: number;
  // Parmi les réponses : retours positifs (entretien ou offre indiquée), refus et fins de non-recevoir, autres.
  positives: number;
  entretiens: number;
  negatives: number;
  autres: number;
  relancesEnvoyees: number;
  // Rapports sur les messages remis, ou null sans message.
  tauxRebond: number | null;
  tauxReponse: number | null;
  tauxPositif: number | null;
  // Délai moyen entre l'envoi et la réponse, en jours, ou null si inconnu.
  delaiMoyenJours: number | null;
}

export interface Segment {
  cle: string;
  libelle: string;
  remis: number;
  reponses: number;
  positives: number;
  tauxReponse: number;
  fiable: boolean;
}

export interface Bilan {
  entonnoir: Entonnoir;
  // null tant que le seuil de comparaison n'est pas atteint.
  segments: { role: Segment[]; secteur: Segment[]; langue: Segment[]; poste: Segment[] } | null;
  progressionSeuil: { envoyes: number; seuil: number };
}

const TYPES_NEGATIFS = new Set(["refus", "pas_de_poste", "cv_non_conserve"]);

function estEnvoye(m: MessageBilan): boolean {
  return m.type === "initial" && m.date_envoi !== null && ["envoyee", "reponse_recue", "sans_suite"].includes(m.statut);
}

function rapport(a: number, b: number): number | null {
  return b === 0 ? null : a / b;
}

function jours(debut: string, fin: string): number {
  return Math.round((new Date(`${fin}T12:00:00Z`).getTime() - new Date(`${debut}T12:00:00Z`).getTime()) / 86_400_000);
}

export function calculerEntonnoir(prospections: MessageBilan[]): Entonnoir {
  const initiaux = prospections.filter(estEnvoye);
  const rebonds = initiaux.filter((m) => m.reponse_type === "non_distribue");
  const reponses = initiaux.filter((m) => m.statut === "reponse_recue" && m.reponse_type !== "non_distribue");
  const positives = reponses.filter((m) => m.reponse_type === "entretien" || m.reponse_type === "offre");
  const negatives = reponses.filter((m) => m.reponse_type !== null && TYPES_NEGATIFS.has(m.reponse_type));

  const delais = reponses
    .filter((m) => m.date_envoi && m.reponse_date)
    .map((m) => jours(m.date_envoi as string, m.reponse_date as string))
    .filter((d) => d >= 0);

  const remis = initiaux.length - rebonds.length;
  return {
    envoyes: initiaux.length,
    rebonds: rebonds.length,
    remis,
    reponses: reponses.length,
    positives: positives.length,
    entretiens: reponses.filter((m) => m.reponse_type === "entretien").length,
    negatives: negatives.length,
    autres: reponses.length - positives.length - negatives.length,
    relancesEnvoyees: prospections.filter((m) => m.type === "relance" && m.date_envoi !== null).length,
    tauxRebond: rapport(rebonds.length, initiaux.length),
    tauxReponse: rapport(reponses.length, remis),
    tauxPositif: rapport(positives.length, remis),
    delaiMoyenJours: delais.length > 0 ? Math.round((delais.reduce((a, b) => a + b, 0) / delais.length) * 10) / 10 : null,
  };
}

function segmenter(messages: { cle: string; libelle: string; reponse: boolean; positive: boolean }[]): Segment[] {
  const groupes = new Map<string, Segment>();
  for (const m of messages) {
    const g = groupes.get(m.cle) ?? { cle: m.cle, libelle: m.libelle, remis: 0, reponses: 0, positives: 0, tauxReponse: 0, fiable: false };
    g.remis += 1;
    if (m.reponse) g.reponses += 1;
    if (m.positive) g.positives += 1;
    groupes.set(m.cle, g);
  }
  return [...groupes.values()]
    .map((g) => ({ ...g, tauxReponse: g.reponses / g.remis, fiable: g.remis >= MIN_SEGMENT_FIABLE }))
    .sort((a, b) => b.positives - a.positives || b.tauxReponse - a.tauxReponse || b.remis - a.remis);
}

export function bilanProspection(entree: EntreeBilan): Bilan {
  const entonnoir = calculerEntonnoir(entree.prospections);
  const progressionSeuil = { envoyes: entonnoir.envoyes, seuil: SEUIL_COMPARAISON };
  if (entonnoir.envoyes < SEUIL_COMPARAISON) return { entonnoir, segments: null, progressionSeuil };

  const contact = new Map(entree.contacts.map((c) => [c.id, c]));
  const secteur = new Map(entree.entreprises.map((e) => [e.id, e.secteur]));
  const remis = entree.prospections.filter((m) => estEnvoye(m) && m.reponse_type !== "non_distribue");
  const base = remis.map((m) => {
    const c = m.contact_id ? contact.get(m.contact_id) : undefined;
    const role: RoleContact = c ? pertinenceContact({ ...c, generique: c.generique }, m.poste_vise).role : "autre";
    return {
      m,
      role,
      reponse: m.statut === "reponse_recue",
      positive: m.reponse_type === "entretien" || m.reponse_type === "offre",
    };
  });

  return {
    entonnoir,
    progressionSeuil,
    segments: {
      role: segmenter(base.map((b) => ({ cle: b.role, libelle: LIBELLE_ROLE[b.role], reponse: b.reponse, positive: b.positive }))),
      secteur: segmenter(
        base.map((b) => {
          const s = secteur.get(b.m.entreprise_id) ?? "Secteur non précisé";
          return { cle: s, libelle: s, reponse: b.reponse, positive: b.positive };
        }),
      ),
      langue: segmenter(base.map((b) => ({ cle: b.m.langue, libelle: b.m.langue === "en" ? "Anglais" : "Français", reponse: b.reponse, positive: b.positive }))),
      poste: segmenter(base.map((b) => ({ cle: b.m.poste_vise, libelle: b.m.poste_vise, reponse: b.reponse, positive: b.positive }))),
    },
  };
}
