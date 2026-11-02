import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { lireBilanUsage, plafondAtteint, suivreUsage } from "@/lib/anthropic/usage";
import { ImapNonConfigure, imapConfigure, lireRebonds } from "@/lib/mail/imap";
import { detecterReponses } from "@/lib/prospection/detecter-reponses";
import { analyserRebond, rapprocherRebond } from "@/lib/prospection/rebonds";
import { nettoyerCorps } from "@/lib/prospection/reponses";

// Lecture de la boîte + un classement par réponse : plus long que les routes ordinaires.
export const maxDuration = 60;

const JOURS_PAR_DEFAUT = 120;
const MAX_CLASSEMENTS = 15;

// Cherche, dans la boîte mail et en lecture seule, les réponses aux candidatures
// envoyées, les rapproche de la bonne candidature et propose un classement.
// RIEN n'est enregistré ici : l'utilisateur valide chaque proposition ensuite
// (route « enregistrer »), ou l'écarte (route « ignorer »).
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  // Ici le plafond ne bloque pas la recherche : seul le classement par Claude est
  // suspendu, les réponses restent lisibles et classables à la main.
  suivreUsage(supabase, user.id, "classement-reponses");
  const claudeDisponible = !plafondAtteint(await lireBilanUsage(supabase, user.id).catch(() => ({ depenseMoisUsd: 0, plafondUsd: 0 })));

  if (!imapConfigure()) {
    return NextResponse.json({ error: new ImapNonConfigure().message }, { status: 501 });
  }

  const corps = await request.json().catch(() => null);
  const jours = Number.isInteger(corps?.jours) && corps.jours > 0 && corps.jours <= 365 ? corps.jours : JOURS_PAR_DEFAUT;

  let detection;
  try {
    detection = await detecterReponses(supabase, user.id, { jours, maxClassements: MAX_CLASSEMENTS, claudeDisponible });
  } catch (e) {
    console.error("Erreur lecture de la boîte mail:", e);
    const detail = e instanceof Error ? e.message : "Erreur inconnue";
    const aide = /auth|login|credentials|AUTHENTICATIONFAILED/i.test(detail)
      ? " — vérifie le mot de passe d'application Gmail et que l'accès IMAP est activé"
      : "";
    return NextResponse.json({ error: `Lecture de la boîte mail impossible : ${detail}${aide}` }, { status: 502 });
  }
  const { propositions, messagesLus } = detection;
  let { dejaTraites } = detection;
  const { sansCandidature } = detection;
  const { dejaVus, depuis, envois, infoDe, nomEntreprise, nomContact } = detection.contexte;
  // Aucun message envoyé : rien à rapprocher, inutile de relire la boîte pour les rebonds.
  if (envois.length === 0) return NextResponse.json({ propositions: [], messagesLus: 0, dejaTraites: 0, sansCandidature: 0 });

  // Rapports de non-distribution : une adresse qui rebondit est proposée comme
  // invalide, jamais marquée sans ton accord. Si leur lecture échoue, les
  // réponses déjà lues restent affichées.
  const adresseUtilisateur = process.env.IMAP_USER ?? process.env.SMTP_USER ?? "";
  const propositionsRebonds: unknown[] = [];
  let rebondsIgnores = 0;
  try {
    for (const rebond of await lireRebonds({ depuis })) {
      if (dejaVus.has(rebond.messageId)) {
        dejaTraites += 1;
        continue;
      }
      const analyse = analyserRebond(rebond, adresseUtilisateur);
      const rapproche = analyse.definitif ? rapprocherRebond(analyse, rebond.date, envois) : null;
      if (!rapproche) {
        rebondsIgnores += 1;
        continue;
      }
      const prospection = infoDe.get(rapproche.prospectionId);
      const contactId = prospection?.contact_id ?? null;
      propositionsRebonds.push({
        message_id: rebond.messageId,
        prospection_id: rapproche.prospectionId,
        confiance: "certaine",
        entreprise: prospection ? (nomEntreprise.get(prospection.entreprise_id) ?? "Entreprise") : "Entreprise",
        destinataire: contactId ? (nomContact.get(contactId) ?? null) : null,
        expediteur: { email: "mailer-daemon", nom: "Rapport de non-distribution" },
        date: rebond.date.toISOString().slice(0, 10),
        sujet: rebond.sujet,
        extrait: nettoyerCorps(rebond.texte, 300),
        adresse_invalide: rapproche.adresse,
        classement: {
          type: "non_distribue",
          resume: `Le message n'a pas été remis : l'adresse ${rapproche.adresse} semble inexistante ou refusée.`,
          urls: [],
          ne_plus_contacter: false,
        },
      });
    }
  } catch (e) {
    console.error("Erreur lecture des rebonds:", e);
  }

  return NextResponse.json({
    propositions: [...propositionsRebonds, ...propositions],
    rebondsIgnores,
    messagesLus,
    dejaTraites,
    sansCandidature,
  });
}
