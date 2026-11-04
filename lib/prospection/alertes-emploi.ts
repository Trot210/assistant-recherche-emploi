// Alertes des sites d'annonces (HelloWork, Indeed, Michael Page...) : rangées automatiquement dans le
// dossier « Alertes emploi » de l'utilisateur, hors de la boîte de réception. Calcul pur ; la lecture
// et le déplacement dans la boîte mail sont dans lib/mail/dossier.ts.

// Expéditeurs de ces alertes : adresses d'envoi des sites d'annonces, pas celles de leurs mails de
// candidature (« reply.hellowork.com »), qui sont triés ailleurs.
const DOMAINES_ALERTES =
  /(^|\.)(emails\.hellowork\.com|smartforum\.hellowork\.com|match\.indeed\.com|indeed\.com|mail\.michaelpage\.fr|meteojob\.com|diffusion\.apec\.fr|jobtransport\.com|profils\.org)$/;

// Un mail de ces sites qui parle d'une candidature, d'un entretien ou d'un recrutement reste en boîte de
// réception : ce n'est pas une alerte.
const SUJET_CANDIDATURE = /candidature|application|postul|entretien|interview|recrutement|nous avons bien re/i;

export function estAlerteEmploi(params: { expediteur: string; sujet: string }): boolean {
  const domaine = params.expediteur.trim().toLowerCase().split("@")[1] ?? "";
  return DOMAINES_ALERTES.test(domaine) && !SUJET_CANDIDATURE.test(params.sujet);
}

// Seules les alertes reçues à partir de cette date sont rangées : les plus anciennes ont été traitées à
// la main avec l'utilisateur le 4 novembre 2026.
export const ALERTES_DEPUIS = "2026-11-04";

export function debutDesAlertes(jours: number, maintenant = new Date()): Date {
  const limite = new Date(`${ALERTES_DEPUIS}T00:00:00+01:00`);
  const fenetre = new Date(maintenant.getTime() - jours * 86_400_000);
  return fenetre.getTime() > limite.getTime() ? fenetre : limite;
}

// Le dossier de l'utilisateur, retrouvé par son nom (« Alertes emploi », à quelques variantes près).
export function trouverDossierAlertes(boites: { path: string; name: string }[]): string | null {
  return boites.find((b) => /alertes?\s*emploi/i.test(b.name))?.path ?? null;
}
