// Tri des mails de candidature de la boîte de réception : accusés de réception → « En attente
// réponse », refus → « Refus ». Tout ce fichier est du calcul pur ; la lecture de la boîte mail
// (lib/mail/dossier.ts) et la lecture du contenu par Claude (lib/anthropic/courrier-candidature.ts)
// sont ailleurs.

export const NATURES = ["accuse_reception", "refus", "entretien", "autre", "non_lie"] as const;
export type NatureCourrier = (typeof NATURES)[number];

export const LIBELLE_NATURE: Record<NatureCourrier, string> = {
  accuse_reception: "Accusé de réception",
  refus: "Refus",
  entretien: "Invitation à échanger",
  autre: "Autre message de candidature",
  non_lie: "Sans rapport avec une candidature",
};

// Dossiers de l'utilisateur : « En attente réponse » et « Refus ». Leurs noms portent des emojis
// et des accents que Gmail peut écrire de plusieurs façons : on les retrouve par leur mot-clé.
export type CleDossier = "attente" | "refus";

const MOTS_DOSSIER: Record<CleDossier, RegExp> = { attente: /attente/i, refus: /refus/i };

export function dossierPourNature(nature: NatureCourrier): CleDossier | null {
  if (nature === "accuse_reception") return "attente";
  if (nature === "refus") return "refus";
  // Une invitation à échanger reste en boîte de réception : c'est la bonne nouvelle à voir.
  return null;
}

export function trouverDossier(boites: { path: string; name: string }[], cle: CleDossier): string | null {
  const normalise = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "");
  // On écarte les dossiers que le site gère lui-même, au cas où leur nom contiendrait le mot-clé.
  const candidats = boites.filter((b) => MOTS_DOSSIER[cle].test(normalise(b.name)) && !/prospection/i.test(b.name));
  return candidats[0]?.path ?? null;
}

// Plateformes de recrutement dont les mails sont des mails de candidature.
const EXPEDITEURS_ATS =
  /(myworkday|workday|smartrecruiters|icims|taleo|greenhouse|lever\.co|workable|recruitee|teamtailor|successfactors|jobvite|bamboohr|ashbyhq|pinpointhq|welcomekit|welcometothejungle|jobteaser|marvinrecruiter|cornerjob|hellowork|apec|francetravail|talent\.|recrutement|recruiting|careers|carrieres|candidature|hiring|jobs@|noreply@.*(rh|hr))/i;

const SUJET_CANDIDATURE =
  /candidature|postul|application|applied|appliquer|recrutement|entretien|interview|votre profil|offre d.emploi|nous avons bien re[cç]u|thank you for applying|merci pour votre int[eé]r[eê]t|suite à votre|suite a votre|your candidacy|poste de|position of/i;

// Messages qui ne sont pas des candidatures même s'ils en parlent : alertes d'offres, newsletters.
const SUJET_ALERTE = /alerte|alert\b|nouvelles offres|new jobs|jobs for you|offres pour vous|recommand|newsletter|digest/i;

// Premier tri, sans payer d'appel à Claude : seuls ces messages sont lus en entier. Volontairement
// large ; c'est la lecture du contenu qui tranche.
export function estCandidatPossible(params: { expediteur: string; sujet: string }): boolean {
  if (SUJET_ALERTE.test(params.sujet)) return false;
  return SUJET_CANDIDATURE.test(params.sujet) || EXPEDITEURS_ATS.test(params.expediteur);
}

export interface CourrierARanger {
  messageIdBrut: string;
  nature: NatureCourrier;
  dossier: CleDossier;
  // Rattaché à une candidature spontanée du site : le message va aussi dans « Prospection ».
  liaison: boolean;
}

// Ce qui reste à ranger : classé comme accusé ou refus, pas encore déplacé.
export function courrierARanger(
  lignes: { message_id_brut: string | null; nature: NatureCourrier; deplace_at: string | null; prospection_id: string | null }[],
): CourrierARanger[] {
  const aRanger: CourrierARanger[] = [];
  for (const l of lignes) {
    const dossier = dossierPourNature(l.nature);
    if (!dossier || l.deplace_at !== null || !l.message_id_brut) continue;
    aRanger.push({ messageIdBrut: l.message_id_brut, nature: l.nature, dossier, liaison: l.prospection_id !== null });
  }
  return aRanger;
}

// Le tri ne concerne que les mails reçus à partir de cette date (heure de Paris) : les mails plus
// anciens ne sont ni lus ni rangés. Décision de l'utilisateur le 3 novembre 2026 : il traite lui-même
// l'existant et laisse le site s'occuper des nouveaux mails.
export const TRI_DEPUIS = "2026-11-03";

// Début de la fenêtre de lecture : `jours` jours en arrière, sans jamais remonter avant TRI_DEPUIS.
export function debutDuTri(jours: number, maintenant = new Date()): Date {
  const limite = new Date(`${TRI_DEPUIS}T00:00:00+01:00`);
  const fenetre = new Date(maintenant.getTime() - jours * 86_400_000);
  return fenetre.getTime() > limite.getTime() ? fenetre : limite;
}
