import { debutDesAlertes, estAlerteEmploi } from "@/lib/prospection/alertes-emploi";
import { estCandidatPossible } from "@/lib/prospection/courrier-candidatures";

// Rangement automatique, sans Claude, de trois sortes de mails de la boîte de réception : les alertes des
// sites d'annonces (« Alertes emploi »), les mails à durée de vie courte (« Mails temporaires ») et les lettres
// d'information (« Lettres d'information »). Calcul pur ; la lecture et les déplacements sont dans lib/mail/dossier.ts.

export type CategorieAutomatique = "alerte" | "temporaire" | "recruteur" | "lettre";

// Mails dont l'utilité dure un jour ou deux : réinitialisation de mot de passe, code de vérification ou de
// connexion. On ne retient que des formulations sans ambiguïté ; « confirmez votre adresse » est volontairement
// absent (c'est souvent l'étape qui finalise une candidature) et les alertes de sécurité de comptes ne sont pas
// concernées.
const SUJET_TEMPORAIRE =
  /(r[ée]initialisation|r[ée]initialiser|r[ée]cup[ée]ration|reset|changement).{0,30}(mot de passe|password)|(mot de passe|password).{0,20}(oubli[ée]|reset|r[ée]initialis)|(your|votre|le|ton)?\s*(verification|v[ée]rification|login|connexion|security|s[ée]curit[ée]|one-time|[àa] usage unique).{0,12}code|\bcode (de |d['’])?(v[ée]rification|connexion|confirmation|s[ée]curit[ée]|acc[èe]s)\b|\b(otp|2fa)\b/i;

// Un mail de ce type n'est jamais rangé comme « temporaire » s'il parle d'une candidature : il reste au tri des candidatures.
const SUJET_CANDIDATURE_OU_TRANSACTION =
  /candidature|application|postul|entretien|interview|recrutement|nous avons bien re[cç]u|facture|invoice|re[cç]u\b|receipt|paiement|payment|commande|order\b|livraison|rendez-vous|rdv/i;

// Messages qu'on ne range pas comme lettre d'information même avec un lien de désinscription : alertes de
// sécurité, factures, mails à propos d'une candidature ou d'un entretien.
const SUJET_A_GARDER =
  /candidature|application|postul|entretien|interview|recrutement|nous avons bien re[cç]u|facture|invoice|re[cç]u\b|receipt|paiement|payment|commande|order\b|livraison|rendez-vous|rdv|s[ée]curit[ée]|security|alerte de|suspicious|connexion/i;

export function estMailTemporaire(params: { expediteur: string; sujet: string }): boolean {
  return SUJET_TEMPORAIRE.test(params.sujet) && !SUJET_CANDIDATURE_OU_TRANSACTION.test(params.sujet);
}

// Étapes d'un recrutement annoncées par un site d'évaluation ou de recrutement : « Votre prochaine étape pour… »,
// « Merci d'avoir complété votre évaluation ».
const SUJET_RECRUTEMENT = /prochaine [ée]tape|[ée]valuation|assessment|test (en ligne|d['’])|votre profil/i;

// Une lettre d'information porte un lien de désinscription ; elle ne parle ni d'une candidature, ni d'une
// facture, ni de la sécurité d'un compte. Un mail d'une plateforme de recrutement (ou qui annonce une étape de
// recrutement) n'en est jamais une, même avec un lien de désinscription : il va au tri des candidatures.
export function estLettreInformation(params: { expediteur: string; sujet: string; listeDesinscription: boolean }): boolean {
  if (!params.listeDesinscription || SUJET_A_GARDER.test(params.sujet)) return false;
  if (SUJET_RECRUTEMENT.test(params.sujet)) return false;
  return !estCandidatPossible({ expediteur: params.expediteur, sujet: params.sujet });
}

// Mails d'un recruteur ou d'un cabinet qui te contacte de lui-même (« Opportunité de poste… »), à ne pas confondre
// avec les réponses à tes candidatures. Règle volontairement prudente : il faut À LA FOIS un objet de proposition
// et un expéditeur de recrutement (adresse ou domaine), et l'objet ne doit pas parler d'une candidature, d'un entretien
// ni d'un remerciement (ces mails vont au tri des candidatures).
const SUJET_PROPOSITION =
  /opportunit[ée]|job opportunity|proposition (de|d['’]) ?(poste|mission|emploi)|nouvelle mission|offre d['’]emploi|poste (de|d['’]|[àa] pourvoir)|[àa] pourvoir|we(?:'|’)re hiring|nous recrutons|votre profil (m['’]a|nous a|correspond|int[ée]resse)|your profile (matches|caught|is)/i;
const SUJET_REPONSE_OU_CANDIDATURE =
  /candidature|application|postul|entretien|interview|int[ée]r[êe]t|interest|merci|thank|suite [àa]|^(re|tr|fwd?)\s*:|r[ée]ponse|nous avons bien re[cç]u|facture|invoice/i;
const EXPEDITEUR_RECRUTEMENT = /@[^@\s>]*(recrut|recruit|talent|staffing|headhunt|chasseur|sourcing|int[ée]rim|cabinet)/i;

export function estMailRecruteur(params: { expediteur: string; sujet: string }): boolean {
  return (
    SUJET_PROPOSITION.test(params.sujet) &&
    !SUJET_REPONSE_OU_CANDIDATURE.test(params.sujet.trim()) &&
    EXPEDITEUR_RECRUTEMENT.test(params.expediteur)
  );
}

// Première catégorie qui s'applique, dans cet ordre : alerte emploi, mail temporaire, recruteur, lettre d'information.
export function categorieAutomatique(m: { expediteur: string; sujet: string; listeDesinscription: boolean }): CategorieAutomatique | null {
  if (estAlerteEmploi({ expediteur: m.expediteur, sujet: m.sujet })) return "alerte";
  if (estMailTemporaire(m)) return "temporaire";
  if (estMailRecruteur(m)) return "recruteur";
  if (estLettreInformation(m)) return "lettre";
  return null;
}

// Les deux nouvelles catégories ne concernent que les mails reçus à partir de cette date : les mails plus
// anciens sont laissés tels quels, comme décidé avec l'utilisateur.
export const NOUVELLES_CATEGORIES_DEPUIS = "2026-11-13";

// Le dossier « Recruteurs » ne reçoit que les mails arrivés à partir de cette date.
export const RECRUTEURS_DEPUIS = "2026-11-18";

export function debutDeCategorie(categorie: CategorieAutomatique, jours: number, maintenant = new Date()): Date {
  if (categorie === "alerte") return debutDesAlertes(jours, maintenant);
  const limite = new Date(`${categorie === "recruteur" ? RECRUTEURS_DEPUIS : NOUVELLES_CATEGORIES_DEPUIS}T00:00:00+01:00`);
  const fenetre = new Date(maintenant.getTime() - jours * 86_400_000);
  return fenetre.getTime() > limite.getTime() ? fenetre : limite;
}

export const NOM_DOSSIER_TEMPORAIRES = "Mails temporaires";
export const NOM_DOSSIER_LETTRES = "Lettres d'information";
export const NOM_DOSSIER_RECRUTEURS = "Recruteurs";

// Le nom peut porter un emoji après le mot (« Recruteurs 🤝 »).
export function trouverDossierRecruteurs(boites: { path: string; name: string }[]): string | null {
  return boites.find((b) => /^recruteurs?(\s|$)/i.test(b.name.trim()))?.path ?? null;
}

export function trouverDossierTemporaires(boites: { path: string; name: string }[]): string | null {
  return boites.find((b) => /^mails?\s+temporaires?$/i.test(b.name.trim()))?.path ?? null;
}

export function trouverDossierLettres(boites: { path: string; name: string }[]): string | null {
  return boites.find((b) => /^lettres?\s+d.information$/i.test(b.name.trim()))?.path ?? null;
}

// Durée de conservation avant la corbeille, par dossier trié automatiquement.
export const JOURS_MAILS_TEMPORAIRES = 2;
