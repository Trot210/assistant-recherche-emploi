import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { classerReponse, type ClassementReponse } from "@/lib/anthropic/reponses";
import { ImapNonConfigure, imapConfigure, lireReponsesCandidates } from "@/lib/mail/imap";
import {
  critereRecherche,
  estExpediteurAutomatique,
  nettoyerCorps,
  rapprocher,
  type CritereRecherche,
  type EnvoiConnu,
  type Rapprochement,
  type ReponseBrute,
} from "@/lib/prospection/reponses";

// Lecture de la boîte + un classement par réponse : plus long que les routes ordinaires.
export const maxDuration = 60;

const JOURS_PAR_DEFAUT = 120;
const MAX_CLASSEMENTS = 15;
const CONCURRENCE = 3;

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
  if (!imapConfigure()) {
    return NextResponse.json({ error: new ImapNonConfigure().message }, { status: 501 });
  }

  const corps = await request.json().catch(() => null);
  const jours = Number.isInteger(corps?.jours) && corps.jours > 0 && corps.jours <= 365 ? corps.jours : JOURS_PAR_DEFAUT;

  const [{ data: envoyes }, { data: contacts }, { data: entreprises }, { data: traitees }] = await Promise.all([
    supabase
      .from("prospections")
      .select("id, parent_id, smtp_message_id, date_envoi, contact_id, entreprise_id, type")
      .eq("user_id", user.id)
      .not("date_envoi", "is", null),
    supabase.from("contacts").select("id, nom, email").eq("user_id", user.id),
    supabase.from("entreprises").select("id, nom").eq("user_id", user.id),
    supabase.from("reponses_traitees").select("message_id").eq("user_id", user.id),
  ]);

  const emailContact = new Map((contacts ?? []).map((c) => [c.id, c.email]));
  const nomContact = new Map((contacts ?? []).map((c) => [c.id, c.nom]));
  const nomEntreprise = new Map((entreprises ?? []).map((e) => [e.id, e.nom]));

  const envois: EnvoiConnu[] = (envoyes ?? []).map((p) => ({
    id: p.id,
    parentId: p.parent_id,
    smtpMessageId: p.smtp_message_id,
    emailContact: p.contact_id ? (emailContact.get(p.contact_id) ?? null) : null,
    dateEnvoi: p.date_envoi as string,
  }));
  const infoDe = new Map((envoyes ?? []).map((p) => [p.id, p]));

  const criteres = new Map<string, CritereRecherche>();
  for (const envoi of envois) {
    const critere = envoi.emailContact ? critereRecherche(envoi.emailContact) : null;
    if (critere) criteres.set(`${critere.type}:${critere.valeur}`, critere);
  }
  if (criteres.size === 0) {
    return NextResponse.json({ propositions: [], messagesLus: 0, dejaTraites: 0, sansCandidature: 0 });
  }

  const premierEnvoi = envois.reduce((min, e) => (e.dateEnvoi < min ? e.dateEnvoi : min), envois[0].dateEnvoi);
  const debutPeriode = new Date(Date.now() - jours * 86_400_000);
  const depuis = new Date(Math.max(debutPeriode.getTime(), new Date(`${premierEnvoi}T00:00:00Z`).getTime() - 86_400_000));

  let lues;
  try {
    lues = await lireReponsesCandidates({
      criteres: [...criteres.values()],
      depuis,
      adresseUtilisateur: process.env.IMAP_USER ?? process.env.SMTP_USER ?? "",
    });
  } catch (e) {
    console.error("Erreur lecture de la boîte mail:", e);
    const detail = e instanceof Error ? e.message : "Erreur inconnue";
    const aide = /auth|login|credentials|AUTHENTICATIONFAILED/i.test(detail)
      ? " — vérifie le mot de passe d'application Gmail et que l'accès IMAP est activé"
      : "";
    return NextResponse.json({ error: `Lecture de la boîte mail impossible : ${detail}${aide}` }, { status: 502 });
  }

  const dejaVus = new Set((traitees ?? []).map((t) => t.message_id));
  let dejaTraites = 0;
  let sansCandidature = 0;
  const aTraiter: { reponse: ReponseBrute; rapprochement: Rapprochement }[] = [];

  for (const reponse of lues) {
    if (dejaVus.has(reponse.messageId)) {
      dejaTraites += 1;
      continue;
    }
    const rapprochement = rapprocher(reponse, envois);
    if (!rapprochement) {
      sansCandidature += 1;
      continue;
    }
    aTraiter.push({ reponse, rapprochement });
  }

  // Les messages automatiques ne passent pas par le modèle ; les autres sont
  // classés par petits groupes, dans une limite qui borne le coût d'une recherche.
  const propositions = new Array(aTraiter.length);
  let classes = 0;
  const classer = async (index: number) => {
    const { reponse, rapprochement } = aTraiter[index];
    const prospection = infoDe.get(rapprochement.prospectionId);
    const entreprise = prospection ? (nomEntreprise.get(prospection.entreprise_id) ?? "Entreprise") : "Entreprise";
    const texte = nettoyerCorps(reponse.texte);

    let classement: ClassementReponse;
    if (estExpediteurAutomatique(reponse.fromEmail)) {
      classement = { type: "automatique", resume: "Message automatique (accusé, absence ou non-distribution).", urls: [] };
    } else if (classes >= MAX_CLASSEMENTS) {
      classement = { type: "autre", resume: "Non classé : limite de classements atteinte pour cette recherche.", urls: [] };
    } else {
      classes += 1;
      try {
        classement = await classerReponse({
          expediteur: reponse.fromEmail,
          sujet: reponse.sujet,
          texte,
          texteComplet: reponse.texte,
          entreprise,
        });
      } catch (e) {
        console.error("Erreur classement d'une réponse:", e);
        classement = { type: "autre", resume: "Classement automatique indisponible : choisis le type toi-même.", urls: [] };
      }
    }

    const contactId = prospection?.contact_id ?? null;
    propositions[index] = {
      message_id: reponse.messageId,
      prospection_id: rapprochement.prospectionId,
      confiance: rapprochement.confiance,
      entreprise,
      destinataire: contactId ? (nomContact.get(contactId) ?? null) : null,
      expediteur: { email: reponse.fromEmail, nom: reponse.fromNom },
      date: reponse.date.toISOString().slice(0, 10),
      sujet: reponse.sujet,
      extrait: nettoyerCorps(reponse.texte, 500),
      classement,
    };
  };

  for (let i = 0; i < aTraiter.length; i += CONCURRENCE) {
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCE, aTraiter.length - i) }, (_, k) => classer(i + k)),
    );
  }

  return NextResponse.json({
    propositions,
    messagesLus: lues.length,
    dejaTraites,
    sansCandidature,
  });
}
