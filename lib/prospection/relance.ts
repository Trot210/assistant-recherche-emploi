// Consigne de rédaction d'une relance selon son rang. Calcul pur, testable : le
// texte lui-même est rédigé par Claude (lib/anthropic/prospection.ts).

export interface MessagePrecedent {
  // Date d'envoi (AAAA-MM-JJ) et texte du message déjà envoyé dans ce fil.
  date: string | null;
  corps: string;
}

// Relance n°1 : un rappel court avec, au plus, un élément nouveau. Relance n°2 (la
// dernière) : un angle différent, jamais un simple « je relance », et une sortie
// facile pour que la personne puisse répondre non ou rediriger.
export function consigneRelance(numero: number, maxCorps: number): string {
  const commun = `Jamais « je me permets de relancer », « je reviens vers vous » ni « sans nouvelle de votre part » : on ne reproche pas l'absence de réponse.`;

  if (numero <= 1) {
    return `Tu rédiges la relance n°1 d'un e-mail de candidature spontanée resté sans réponse. Elle respecte le temps du destinataire : deux ou trois phrases (${maxCorps} caractères maximum). Rappelle en une phrase le poste visé, sans répéter le message précédent. Tu peux apporter UN élément nouveau, mais seulement s'il existe dans le profil ou la fiche et n'a pas déjà été mentionné. Termine par une question simple, facile à traiter. ${commun}`;
  }

  return `Tu rédiges la relance n°${numero}, la DERNIÈRE, d'un e-mail de candidature spontanée resté sans réponse. Elle doit changer d'angle : reprends AUCUNE phrase des messages précédents (listés plus bas), ni leur accroche. Choisis l'un de ces deux angles, selon ce que permettent le profil et la fiche :
(a) propose un échange très court, par exemple quinze minutes, plutôt que de demander un poste ;
(b) mets en avant UNE expérience du profil différente de celles déjà citées, reliée à un enjeu de l'entreprise tiré de la fiche (sans fiche, reste sur le secteur).
Deux ou trois phrases (${maxCorps} caractères maximum). Termine en laissant une sortie simple : si ce n'est pas le bon moment ou la bonne personne, un mot suffit, ou la personne peut transmettre au bon interlocuteur. ${commun}`;
}

// Messages déjà envoyés dans le fil, présentés à Claude pour qu'il ne se répète pas.
export function messagesPrecedents(initial: MessagePrecedent, relances: MessagePrecedent[]): string {
  const tous = [{ ...initial, titre: "Message initial" }, ...relances.map((r, i) => ({ ...r, titre: `Relance n°${i + 1}` }))];
  return tous.map((m) => `${m.titre}${m.date ? ` (envoyé le ${m.date})` : ""} :\n${m.corps}`).join("\n\n");
}
