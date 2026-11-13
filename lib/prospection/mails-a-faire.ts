// Mails de candidature à traiter, tels que le site les montre dans « Aujourd'hui » et dans le récapitulatif
// du matin : ceux qui demandent une action (« Finalisez votre candidature ») et les invitations à un entretien.
// Calcul pur ; la lecture des lignes est faite par l'appelant (client Supabase du navigateur ou de la tâche du matin).

// Un mail à faire n'est plus proposé au bout de ce délai : s'il traîne, c'est qu'il n'est plus d'actualité.
export const JOURS_MAILS_A_FAIRE = 30;
// Une invitation à un entretien reste visible ce nombre de jours.
export const JOURS_ENTRETIENS = 21;

export interface LigneCourrierBrute {
  id?: string;
  nature: string;
  expediteur: string;
  sujet: string;
  resume: string;
  date_mail: string | null;
  action_requise?: boolean | null;
  action_texte?: string | null;
  action_lien?: string | null;
  action_faite_at?: string | null;
}

export interface MailAFaire {
  id: string | null;
  expediteur: string;
  sujet: string;
  action: string;
  lien: string | null;
  date: string | null;
}

export interface Entretien {
  expediteur: string;
  sujet: string;
  resume: string;
  date: string | null;
}

// « Nom Prénom <adresse@exemple.fr> » → « Nom Prénom » ; à défaut, le domaine de l'adresse.
export function nomExpediteur(expediteur: string): string {
  const nom = expediteur.replace(/<[^>]*>/g, "").replace(/["']/g, "").trim();
  if (nom) return nom;
  const adresse = expediteur.match(/<([^>]+)>/)?.[1] ?? expediteur;
  return adresse.split("@")[1] ?? adresse;
}

const depuisJours = (jours: number, maintenant: Date) => maintenant.getTime() - jours * 86_400_000;
const recent = (date: string | null, jours: number, maintenant: Date) => date === null || new Date(date).getTime() >= depuisJours(jours, maintenant);

export function mailsAFaire(lignes: LigneCourrierBrute[], maintenant = new Date()): MailAFaire[] {
  return lignes
    .filter((l) => l.action_requise === true && !l.action_faite_at && recent(l.date_mail, JOURS_MAILS_A_FAIRE, maintenant))
    .sort((a, b) => (b.date_mail ?? "").localeCompare(a.date_mail ?? ""))
    .map((l) => ({
      id: l.id ?? null,
      expediteur: nomExpediteur(l.expediteur),
      sujet: l.sujet,
      action: l.action_texte?.trim() || "Voir le message",
      // Un lien affiché au clic doit être sûr : seulement du https.
      lien: l.action_lien && /^https:\/\//i.test(l.action_lien) ? l.action_lien : null,
      date: l.date_mail,
    }));
}

// `jours` : l'écran garde les invitations 21 jours ; le récapitulatif du matin ne signale que les toutes récentes.
export function entretiensRecents(lignes: LigneCourrierBrute[], maintenant = new Date(), jours = JOURS_ENTRETIENS): Entretien[] {
  return lignes
    .filter((l) => l.nature === "entretien" && recent(l.date_mail, jours, maintenant))
    .sort((a, b) => (b.date_mail ?? "").localeCompare(a.date_mail ?? ""))
    .map((l) => ({ expediteur: nomExpediteur(l.expediteur), sujet: l.sujet, resume: l.resume, date: l.date_mail }));
}
