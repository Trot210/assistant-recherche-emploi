import type { EntrepriseStatut } from "@/types/database.types";
import type { Prospection } from "@/types/prospection";

// Règles de suppression. Dans la base, supprimer une entreprise supprime en
// cascade ses contacts ET tous ses messages, envoyés compris : l'historique et
// les statistiques seraient faussés. L'interface distingue donc deux gestes :
//   - « retirer de la liste » : l'entreprise passe en « écartée », ses
//     brouillons disparaissent, son historique et ses contacts sont conservés ;
//   - « supprimer définitivement » : tout ce qui s'y rattache est effacé.

// Un message est « envoyé » dès qu'il a une date d'envoi (un brouillon de
// relance abandonné, lui, n'est jamais parti).
export function estEnvoye(prospection: Pick<Prospection, "date_envoi">): boolean {
  return prospection.date_envoi !== null;
}

export interface BilanEntreprise {
  contacts: number;
  brouillons: number;
  envoyes: number;
  // Envois programmés encore en attente : ils disparaissent avec leurs messages.
  programmes: number;
}

export function bilanEntreprise(
  messages: Pick<Prospection, "date_envoi">[],
  nbContacts: number,
  nbProgrammes = 0,
): BilanEntreprise {
  const envoyes = messages.filter(estEnvoye).length;
  return { contacts: nbContacts, brouillons: messages.length - envoyes, envoyes, programmes: nbProgrammes };
}

export type ModeSuppressionEntreprise = "retirer" | "supprimer";

// Sans historique, il n'y a rien à préserver : seule la suppression a un sens.
// Avec un historique, on propose d'abord de retirer de la liste ; une entreprise
// déjà écartée ne peut plus être que supprimée.
export function modesProposes(bilan: BilanEntreprise, statut: EntrepriseStatut): ModeSuppressionEntreprise[] {
  if (bilan.envoyes === 0) return ["supprimer"];
  return statut === "ecartee" ? ["supprimer"] : ["retirer", "supprimer"];
}

function pluriel(n: number, singulier: string, plurielForme = `${singulier}s`): string {
  return `${n} ${n > 1 ? plurielForme : singulier}`;
}

export function texteSuppressionEntreprise(nom: string, bilan: BilanEntreprise, mode: ModeSuppressionEntreprise): string {
  if (mode === "retirer") {
    const conserves = bilan.envoyes === 1 ? "Son message envoyé" : `Ses ${bilan.envoyes} messages envoyés`;
    const brouillons =
      bilan.brouillons > 0
        ? `. ${pluriel(bilan.brouillons, "brouillon")} en attente ${bilan.brouillons > 1 ? "seront supprimés" : "sera supprimé"}`
        : "";
    const programmes =
      bilan.programmes > 0
        ? ` ${bilan.programmes > 1 ? `Ses ${bilan.programmes} envois programmés seront annulés` : "Son envoi programmé sera annulé"} : ils ne partiront pas.`
        : "";
    return `${nom} sera retirée de ta liste (onglet « Écartées »). ${conserves} et ses contacts sont conservés, avec les statistiques${brouillons}.${programmes}`;
  }
  const effaces = [
    bilan.contacts > 0 ? pluriel(bilan.contacts, "contact") : null,
    bilan.brouillons > 0 ? pluriel(bilan.brouillons, "brouillon") : null,
    bilan.envoyes > 0 ? pluriel(bilan.envoyes, "message envoyé", "messages envoyés") : null,
    bilan.programmes > 0 ? `${pluriel(bilan.programmes, "envoi programmé", "envois programmés")} (qui ne partiront pas)` : null,
  ].filter(Boolean);
  const suite =
    bilan.envoyes > 0
      ? " Ils disparaîtront aussi de l'historique et des statistiques ; les e-mails déjà partis restent chez leurs destinataires."
      : " Rien d'autre n'est touché.";
  return `Supprimer définitivement ${nom} ?${effaces.length > 0 ? ` Seront effacés : ${effaces.join(", ")}.` : ""}${suite}`;
}

// Une relance envoyée ne se supprime pas seule : le message initial garde le
// compte de ses relances et la date de la suivante. On supprime alors le fil
// entier depuis le message initial.
export function peutSupprimerMessage(
  prospection: Pick<Prospection, "type" | "date_envoi">,
): { ok: true } | { ok: false; raison: string } {
  if (prospection.type === "relance" && estEnvoye(prospection)) {
    return {
      ok: false,
      raison: "Une relance envoyée ne se supprime pas seule : supprime le message initial pour retirer tout le fil",
    };
  }
  return { ok: true };
}

export function texteSuppressionMessage(params: {
  nomEntreprise: string;
  envoye: boolean;
  dateEnvoi: string | null;
  nbRelances: number;
  // Date de l'envoi programmé encore en attente, déjà mise en forme, s'il y en a un.
  programmeLe?: string | null;
}): string {
  const { nomEntreprise, envoye, dateEnvoi, nbRelances, programmeLe } = params;
  if (!envoye) {
    const programme = programmeLe ? ` Son envoi programmé (${programmeLe}) sera annulé : il ne partira pas.` : "";
    return `Supprimer ce message à ${nomEntreprise} ? Il n'a pas été envoyé.${programme} L'entreprise et ses contacts ne sont pas touchés.`;
  }
  const relances = nbRelances > 0 ? `, avec ${nbRelances === 1 ? "sa relance" : `ses ${nbRelances} relances`}` : "";
  return `Ce message a été envoyé${dateEnvoi ? ` le ${dateEnvoi}` : ""}. Le supprimer l'efface de l'historique et des statistiques${relances}. L'e-mail déjà parti reste chez son destinataire. L'entreprise et ses contacts ne sont pas touchés.`;
}
