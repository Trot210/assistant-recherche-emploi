import type { ProspectionStatut, ReponseType } from "@/types/database.types";
import type { Prospection } from "@/types/prospection";
import { estEnvoye } from "@/lib/prospection/suppression";
import { appliquerAction } from "@/lib/prospection/workflow";

// Le statut de la base (envoyee, reponse_recue, sans_suite) reste la source de
// vérité de l'application : relances, statistiques et suppression en dépendent.
// Le « statut de suivi » affiché à l'utilisateur le précise avec le type de la
// réponse reçue, sans rien changer à ce que les autres écrans comprennent.
export type IdSuivi =
  | "envoye"
  | "reponse"
  | "entretien"
  | "offre"
  | "refus"
  | "pas_de_poste"
  | "cv_non_conserve"
  | "autre"
  | "non_distribue"
  | "sans_suite";

export type TonSuivi = "attente" | "positif" | "negatif" | "neutre";

export interface DefinitionSuivi {
  id: IdSuivi;
  libelle: string;
  statut: ProspectionStatut;
  type: ReponseType | null;
  ton: TonSuivi;
}

export const STATUTS_SUIVI: DefinitionSuivi[] = [
  { id: "envoye", libelle: "Envoyé, sans réponse", statut: "envoyee", type: null, ton: "attente" },
  { id: "reponse", libelle: "Réponse reçue", statut: "reponse_recue", type: null, ton: "neutre" },
  { id: "entretien", libelle: "Entretien", statut: "reponse_recue", type: "entretien", ton: "positif" },
  { id: "offre", libelle: "Offre indiquée", statut: "reponse_recue", type: "offre", ton: "positif" },
  { id: "pas_de_poste", libelle: "Pas de poste pour l'instant", statut: "reponse_recue", type: "pas_de_poste", ton: "neutre" },
  { id: "cv_non_conserve", libelle: "CV non conservé (canal officiel)", statut: "reponse_recue", type: "cv_non_conserve", ton: "neutre" },
  { id: "refus", libelle: "Refus", statut: "reponse_recue", type: "refus", ton: "negatif" },
  { id: "autre", libelle: "Autre retour", statut: "reponse_recue", type: "autre", ton: "neutre" },
  { id: "non_distribue", libelle: "Non distribué (adresse invalide)", statut: "sans_suite", type: "non_distribue", ton: "negatif" },
  { id: "sans_suite", libelle: "Sans suite", statut: "sans_suite", type: null, ton: "neutre" },
];

export const TYPES_REPONSE: ReponseType[] = [
  "entretien",
  "offre",
  "refus",
  "pas_de_poste",
  "cv_non_conserve",
  "autre",
  "non_distribue",
];

export function estTypeReponse(valeur: unknown): valeur is ReponseType {
  return typeof valeur === "string" && (TYPES_REPONSE as string[]).includes(valeur);
}

export function estIdSuivi(valeur: unknown): valeur is IdSuivi {
  return typeof valeur === "string" && STATUTS_SUIVI.some((s) => s.id === valeur);
}

export function definitionSuivi(id: IdSuivi): DefinitionSuivi {
  return STATUTS_SUIVI.find((s) => s.id === id) ?? STATUTS_SUIVI[0];
}

export function idSuivi(p: Pick<Prospection, "statut" | "reponse_type">): IdSuivi {
  if (p.statut === "sans_suite") return p.reponse_type === "non_distribue" ? "non_distribue" : "sans_suite";
  if (p.statut === "reponse_recue") return p.reponse_type ?? "reponse";
  return "envoye";
}

export function libelleSuivi(p: Pick<Prospection, "statut" | "reponse_type">): string {
  return definitionSuivi(idSuivi(p)).libelle;
}

export type ResultatSuivi =
  | { patch: Partial<Prospection>; abandonnerRelancesEnCours: boolean }
  | { erreur: string };

// Ce que change le passage d'une candidature envoyée à un autre statut de suivi.
// Un premier retour (ou « sans suite ») clôt le fil comme le fait déjà
// « J'ai reçu une réponse » : plus de relance planifiée, et les relances en
// brouillon sont abandonnées. Entre deux statuts déjà clos, on ne change que
// le type de réponse. On ne revient pas à « envoyé » : la date de la prochaine
// relance a été effacée et ne se reconstitue pas de façon fiable.
export function appliquerSuivi(
  p: Prospection,
  cible: IdSuivi,
  aujourdhui: string,
  dateReponse?: string | null,
): ResultatSuivi {
  if (p.type !== "initial" || !estEnvoye(p)) {
    return { erreur: "Le suivi se fait sur le message initial d'une candidature envoyée" };
  }

  const courant = idSuivi(p);
  if (cible === courant) return { patch: {}, abandonnerRelancesEnCours: false };

  const definition = definitionSuivi(cible);
  // « Sans suite » et « non distribué » closent le fil sans qu'il y ait eu de réponse.
  const finDeFil = definition.statut === "sans_suite";

  if (courant === "envoye") {
    const transition = appliquerAction(p, null, finDeFil ? "sans_suite" : "reponse_recue", aujourdhui);
    if ("erreur" in transition) return { erreur: transition.erreur };
    return {
      patch: {
        ...transition.message,
        reponse_type: definition.type,
        reponse_date: cible === "sans_suite" ? null : (dateReponse ?? aujourdhui),
      },
      abandonnerRelancesEnCours: transition.abandonnerRelancesEnCours ?? false,
    };
  }

  if (cible === "envoye") {
    return { erreur: "On ne revient pas à « envoyé » : choisis « Autre retour » si besoin" };
  }

  return {
    patch: {
      statut: definition.statut,
      reponse_type: definition.type,
      reponse_date: cible === "sans_suite" ? null : (p.reponse_date ?? dateReponse ?? aujourdhui),
    },
    abandonnerRelancesEnCours: false,
  };
}

// --- Champs libres du suivi ------------------------------------------------

const MAX_COMMENTAIRE = 2000;
const MAX_ACTION = 300;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function dateValide(valeur: string): boolean {
  if (!DATE.test(valeur)) return false;
  const d = new Date(`${valeur}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valeur;
}

export interface ChampsSuivi {
  commentaire?: string | null;
  prochaine_action?: string | null;
  prochaine_action_date?: string | null;
  reponse_date?: string | null;
}

// Valide et nettoie ce que l'utilisateur saisit : texte borné, dates réelles,
// chaîne vide = champ effacé. Seuls les champs présents dans la demande sont
// retournés, pour ne jamais écraser ce qui n'a pas été envoyé.
export function validerChampsSuivi(corps: unknown): { champs: ChampsSuivi } | { erreur: string } {
  if (typeof corps !== "object" || corps === null) return { erreur: "Demande invalide" };
  const brut = corps as Record<string, unknown>;
  const champs: ChampsSuivi = {};

  const texte = (cle: "commentaire" | "prochaine_action", max: number): string | null => {
    const v = brut[cle];
    if (v === undefined) return null;
    if (v !== null && typeof v !== "string") return `${cle} doit être un texte`;
    const propre = typeof v === "string" ? v.trim() : "";
    if (propre.length > max) return `${cle} ne peut pas dépasser ${max} caractères`;
    champs[cle] = propre === "" ? null : propre;
    return null;
  };
  const date = (cle: "prochaine_action_date" | "reponse_date"): string | null => {
    const v = brut[cle];
    if (v === undefined) return null;
    if (v === null || v === "") {
      champs[cle] = null;
      return null;
    }
    if (typeof v !== "string" || !dateValide(v)) return `${cle} doit être une date AAAA-MM-JJ`;
    champs[cle] = v;
    return null;
  };

  const erreur =
    texte("commentaire", MAX_COMMENTAIRE) ??
    texte("prochaine_action", MAX_ACTION) ??
    date("prochaine_action_date") ??
    date("reponse_date");
  return erreur ? { erreur } : { champs };
}
