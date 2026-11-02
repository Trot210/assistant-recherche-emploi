import { libelleVerification } from "@/lib/hunter/verification";
import type { ContactEntreprise, Prospection } from "@/types/prospection";

// Avertissements avant de rédiger un message (jamais un refus : l'utilisateur peut
// écrire quand même, en connaissance de cause). Calcul pur.

// Délai pendant lequel une deuxième personne de la même entreprise n'est pas relancée.
export const JOURS_INTERLOCUTEUR_ACTIF = 21;

// Une adresse non confirmée risque un rebond : le seuil de confiance d'un expéditeur
// est bas (un rebond sur dix suffit à abîmer sa réputation). Une adresse lue sur une
// page publique, ou saisie par l'utilisateur lui-même, n'a pas besoin de vérification.
export function avertissementAdresse(
  contact: Pick<ContactEntreprise, "nom" | "email" | "email_verification" | "origine"> | null,
): string | null {
  if (!contact?.email) return null;
  if (contact.email_verification === "valide") return null;
  if (contact.origine === "page_publique" || contact.origine === "manuel") return null;
  return `L'adresse de ${contact.nom} n'est pas vérifiée (${libelleVerification(contact.email_verification)}) : elle peut rebondir, ce qui abîme la réputation de ton adresse d'envoi. Vérifie-la d'abord, ou écris quand même.`;
}

type EnvoiEntreprise = Pick<Prospection, "type" | "statut" | "contact_id" | "date_envoi" | "reponse_type">;

function joursEntre(debut: string, fin: string): number {
  return Math.floor((new Date(`${fin}T12:00:00Z`).getTime() - new Date(`${debut}T12:00:00Z`).getTime()) / 86_400_000);
}

// Une autre personne de la même entreprise a déjà reçu un message récemment (ou en a
// un en préparation) : écrire à une deuxième personne dans la foulée est vite perçu
// comme du démarchage de masse et brouille ce que l'entreprise sait de toi.
export function avertissementInterlocuteur(params: {
  nomEntreprise: string;
  messages: EnvoiEntreprise[];
  contacts: Pick<ContactEntreprise, "id" | "nom">[];
  contactId: string | null;
  aujourdhui: string;
}): string | null {
  const { nomEntreprise, messages, contacts, contactId, aujourdhui } = params;
  const nomDe = (id: string | null) => contacts.find((c) => c.id === id)?.nom ?? "un autre contact";

  for (const m of messages) {
    if (m.type !== "initial" || m.contact_id === contactId) continue;
    if (m.reponse_type === "non_distribue" || m.statut === "sans_suite") continue;

    if (m.statut === "a_valider" || m.statut === "valide" || m.statut === "brouillon_gmail") {
      return `${nomEntreprise} : un message pour ${nomDe(m.contact_id)} est déjà en préparation. Un seul interlocuteur actif par entreprise : envoie-le d'abord, ou écris quand même.`;
    }
    if ((m.statut === "envoyee" || m.statut === "reponse_recue") && m.date_envoi) {
      const jours = joursEntre(m.date_envoi, aujourdhui);
      if (jours >= 0 && jours < JOURS_INTERLOCUTEUR_ACTIF) {
        return `${nomEntreprise} : ${nomDe(m.contact_id)} a déjà reçu un message il y a ${jours === 0 ? "moins d'un jour" : `${jours} jour${jours > 1 ? "s" : ""}`}. Écrire à une deuxième personne de la même entreprise en moins de ${JOURS_INTERLOCUTEUR_ACTIF} jours passe pour du démarchage de masse : attends, ou écris quand même.`;
      }
    }
  }
  return null;
}
