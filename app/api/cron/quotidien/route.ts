import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { lireBilanUsage, ouvrirUsage, plafondAtteint } from "@/lib/anthropic/usage";
import { hunterConfigure, lireQuotaHunter } from "@/lib/hunter/client";
import { imapConfigure, lireReponsesCandidates } from "@/lib/mail/imap";
import { envoyerEmail, smtpConfigure } from "@/lib/mail/smtp";
import { offrePertinente } from "@/lib/prospection/offres";
import { preparerRelance } from "@/lib/prospection/preparer-relance";
import { calculerPriorite } from "@/lib/prospection/priorite";
import { MAX_RELANCES_PAR_JOUR, relancesAPreparer } from "@/lib/prospection/quotidien";
import { construireRecap, type DonneesRecap } from "@/lib/prospection/recap";
import { critereRecherche, estExpediteurAutomatique, rapprocher, type CritereRecherche, type EnvoiConnu } from "@/lib/prospection/reponses";
import { aujourdhuiParis, estEnCours, relanceDue } from "@/lib/prospection/workflow";
import type { Database } from "@/types/database.types";

// Plusieurs relances à rédiger (2 appels Claude chacune), la boîte mail à lire et
// un e-mail à envoyer : plus long qu'une route ordinaire.
export const maxDuration = 60;

const JOURS_LECTURE_REPONSES = 120;
// La lecture de la boîte mail ne doit jamais retarder le récapitulatif ni dépasser la durée
// maximale de la route : passé ce délai, on la déclare indisponible ce matin.
const DELAI_LECTURE_MS = 25_000;

function avecDelai<T>(promesse: Promise<T>, ms: number, defaut: T): Promise<T> {
  return Promise.race([promesse, new Promise<T>((resolve) => setTimeout(() => resolve(defaut), ms))]);
}

// Le traitement du matin travaille pour l'utilisateur seul : il prépare des
// BROUILLONS de relance (jamais envoyés), compte les nouvelles réponses sans les
// enregistrer, et lui envoie un récapitulatif à sa propre adresse. Aucun message
// ne part vers un tiers depuis ici.
async function resoudreAppelant(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret && request.headers.get("authorization")?.trim() === `Bearer ${secret}`) {
    const userId = process.env.SYNC_USER_ID?.trim();
    if (!userId) return { error: "SYNC_USER_ID non configuré côté serveur", statut: 500 } as const;
    return { supabase: createAdminClient() as SupabaseClient<Database>, userId } as const;
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié", statut: 401 } as const;
  return { supabase: supabase as SupabaseClient<Database>, userId: user.id } as const;
}

// Nombre de messages reçus d'entreprises à qui l'utilisateur a écrit et qu'il n'a
// pas encore traités. Lecture seule, aucun appel à Claude.
async function compterNouvellesReponses(supabase: SupabaseClient<Database>, userId: string): Promise<number> {
  const [{ data: envoyes }, { data: contacts }, { data: traitees }] = await Promise.all([
    supabase.from("prospections").select("id, parent_id, smtp_message_id, date_envoi, contact_id").eq("user_id", userId).not("date_envoi", "is", null),
    supabase.from("contacts").select("id, email").eq("user_id", userId),
    supabase.from("reponses_traitees").select("message_id").eq("user_id", userId),
  ]);

  const emailContact = new Map((contacts ?? []).map((c) => [c.id, c.email]));
  const envois: EnvoiConnu[] = (envoyes ?? []).map((p) => ({
    id: p.id,
    parentId: p.parent_id,
    smtpMessageId: p.smtp_message_id,
    emailContact: p.contact_id ? (emailContact.get(p.contact_id) ?? null) : null,
    dateEnvoi: p.date_envoi as string,
  }));
  if (envois.length === 0) return 0;

  const criteres = new Map<string, CritereRecherche>();
  for (const e of envois) {
    const c = e.emailContact ? critereRecherche(e.emailContact) : null;
    if (c) criteres.set(`${c.type}:${c.valeur}`, c);
  }
  if (criteres.size === 0) return 0;

  const premier = envois.reduce((min, e) => (e.dateEnvoi < min ? e.dateEnvoi : min), envois[0].dateEnvoi);
  const depuis = new Date(Math.max(Date.now() - JOURS_LECTURE_REPONSES * 86_400_000, new Date(`${premier}T00:00:00Z`).getTime() - 86_400_000));

  const lues = await lireReponsesCandidates({
    criteres: [...criteres.values()],
    depuis,
    adresseUtilisateur: process.env.IMAP_USER ?? process.env.SMTP_USER ?? "",
  });
  const dejaVus = new Set((traitees ?? []).map((t) => t.message_id));
  return lues.filter((r) => !dejaVus.has(r.messageId) && !estExpediteurAutomatique(r.fromEmail) && rapprocher(r, envois) !== null).length;
}

export async function POST(request: Request) {
  const appelant = await resoudreAppelant(request);
  if ("error" in appelant) return NextResponse.json({ error: appelant.error }, { status: appelant.statut });
  const { supabase, userId } = appelant;

  const corps = await request.json().catch(() => null);
  const simulation = corps?.simulation === true;
  const aujourdhui = aujourdhuiParis();

  const { data: reglages } = await supabase
    .from("reglages")
    .select("relances_auto, recap_actif, dernier_traitement")
    .eq("user_id", userId)
    .maybeSingle();
  const relancesAuto = reglages?.relances_auto ?? true;
  const recapActif = reglages?.recap_actif ?? true;

  if (!simulation && corps?.forcer !== true && reglages?.dernier_traitement === aujourdhui) {
    return NextResponse.json({ deja_fait: true, date: aujourdhui });
  }

  const { data: profil } = await supabase.from("profil").select().eq("user_id", userId).maybeSingle();

  // 1. Relances dues : brouillons préparés dans la limite du jour et du plafond Claude.
  const { data: toutes } = await supabase.from("prospections").select().eq("user_id", userId);
  const prospections = toutes ?? [];
  const { data: entreprises } = await supabase.from("entreprises").select().eq("user_id", userId);
  const nomEntreprise = new Map((entreprises ?? []).map((e) => [e.id, e.nom]));

  const dues = prospections.filter((p) => p.type === "initial" && relanceDue(p, aujourdhui));
  const idsAPreparer = relancesAPreparer(prospections, aujourdhui, MAX_RELANCES_PAR_JOUR);
  const dejaEnPreparation = new Set(prospections.filter((p) => p.parent_id && estEnCours(p.statut)).map((p) => p.parent_id));

  const relancesPreparees: DonneesRecap["relancesPreparees"] = [];
  const raisonsEchec = new Map<string, string>();

  // null : lecture impossible ou trop lente ce matin (indiqué dans le récapitulatif).
  const lecture: Promise<number | null> = imapConfigure()
    ? avecDelai(
        compterNouvellesReponses(supabase, userId).catch((e): null => {
          console.error("Lecture des réponses impossible (traitement quotidien):", e);
          return null;
        }),
        DELAI_LECTURE_MS,
        null,
      )
    : Promise.resolve(null);

  let plafond = false;
  if (!relancesAuto) {
    for (const id of idsAPreparer) raisonsEchec.set(id, "relances automatiques désactivées");
  } else if (simulation) {
    for (const id of idsAPreparer) raisonsEchec.set(id, "simulation : rien n'est rédigé");
  } else if (!profil) {
    for (const id of idsAPreparer) raisonsEchec.set(id, "profil non renseigné");
  } else {
    const bloque = await ouvrirUsage(supabase, userId, "relances-auto");
    plafond = bloque !== null;
    for (const id of idsAPreparer) {
      if (plafond) {
        raisonsEchec.set(id, "plafond Claude atteint");
        continue;
      }
      try {
        const r = await preparerRelance(supabase, userId, id, profil);
        const initial = prospections.find((p) => p.id === id);
        if ("erreur" in r) raisonsEchec.set(id, r.erreur);
        else relancesPreparees.push({ entreprise: nomEntreprise.get(r.prospection.entreprise_id) ?? "Entreprise", poste: initial?.poste_vise ?? r.prospection.poste_vise });
      } catch (e) {
        console.error("Préparation d'une relance impossible (traitement quotidien):", e);
        raisonsEchec.set(id, "rédaction impossible");
      }
    }
  }

  const relancesRestantes: DonneesRecap["relancesRestantes"] = dues
    .filter((p) => !dejaEnPreparation.has(p.id) && !relancesPreparees.some((r) => r.entreprise === (nomEntreprise.get(p.entreprise_id) ?? "") && r.poste === p.poste_vise))
    .map((p) => ({
      entreprise: nomEntreprise.get(p.entreprise_id) ?? "Entreprise",
      poste: p.poste_vise,
      raison: raisonsEchec.get(p.id) ?? "limite de relances préparées par jour",
    }));

  // 2. État du jour, relu après la préparation des brouillons.
  const { data: apres } = await supabase.from("prospections").select().eq("user_id", userId);
  const etat = apres ?? prospections;
  const { data: contacts } = await supabase.from("contacts").select().eq("user_id", userId);

  const hier = new Date(Date.now() - 26 * 3_600_000).toISOString();
  const { data: offresRecentes } = await supabase.from("offres").select("titre").eq("user_id", userId).gte("created_at", hier).limit(1000);

  const bilan = await lireBilanUsage(supabase, userId).catch(() => null);
  const quotaHunter = hunterConfigure() ? await lireQuotaHunter().catch(() => null) : null;

  const prioritaires = (entreprises ?? [])
    .map((e) => ({
      nom: e.nom,
      priorite: calculerPriorite({
        entreprise: e,
        contacts: (contacts ?? []).filter((c) => c.entreprise_id === e.id),
        nbMessages: etat.filter((p) => p.entreprise_id === e.id).length,
      }),
    }))
    .filter((x) => !x.priorite.exclue && x.priorite.score >= 40)
    .sort((a, b) => b.priorite.score - a.priorite.score)
    .slice(0, 3);

  const nouvellesReponses = await lecture;

  const donnees: DonneesRecap = {
    aujourdhui,
    urlSite: new URL(request.url).origin,
    aValider: etat
      .filter((p) => estEnCours(p.statut))
      .map((p) => ({ entreprise: nomEntreprise.get(p.entreprise_id) ?? "Entreprise", poste: p.poste_vise, relance: p.type === "relance" })),
    relancesPreparees,
    relancesRestantes,
    nouvellesReponses: nouvellesReponses ?? 0,
    reponsesIndisponibles: imapConfigure() && nouvellesReponses === null,
    actionsDuJour: etat
      .filter((p) => p.type === "initial" && p.prochaine_action && p.prochaine_action_date && p.prochaine_action_date <= aujourdhui)
      .map((p) => ({ entreprise: nomEntreprise.get(p.entreprise_id) ?? "Entreprise", action: p.prochaine_action as string, date: p.prochaine_action_date })),
    nouvellesOffres: (offresRecentes ?? []).filter((o) => offrePertinente(o.titre)).length,
    prioritaires: prioritaires.map((x) => ({
      nom: x.nom,
      score: x.priorite.score,
      resume: [...x.priorite.raisons].slice(0, 3).join(", ") || "aucun atout particulier",
    })),
    coutMoisUsd: bilan?.depenseMoisUsd ?? null,
    plafondUsd: bilan?.plafondUsd ?? null,
    hunterVerificationsRestantes: quotaHunter ? quotaHunter.verifications.disponibles - quotaHunter.verifications.utilisees : null,
    plafondAtteint: plafond || (bilan ? plafondAtteint(bilan) : false),
  };

  const recap = construireRecap(donnees);

  // 3. Récapitulatif envoyé à l'utilisateur seul (sa propre adresse d'envoi).
  let recapEnvoye = false;
  let recapErreur: string | null = null;
  if (recap && recapActif && !simulation && smtpConfigure()) {
    try {
      await envoyerEmail({ a: process.env.SMTP_USER as string, objet: recap.sujet, corps: recap.texte, nomExpediteur: "Le Rayon" });
      recapEnvoye = true;
    } catch (e) {
      console.error("Envoi du récapitulatif impossible:", e);
      recapErreur = e instanceof Error ? e.message : "erreur inconnue";
    }
  }

  if (!simulation) {
    await supabase.from("reglages").upsert({ user_id: userId, dernier_traitement: aujourdhui, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  }

  return NextResponse.json({
    date: aujourdhui,
    simulation,
    relances_preparees: relancesPreparees.length,
    relances_non_preparees: relancesRestantes.length,
    nouvelles_reponses: donnees.nouvellesReponses,
    reponses_indisponibles: donnees.reponsesIndisponibles,
    nb_actions: recap?.nbActions ?? 0,
    recap_envoye: recapEnvoye,
    recap_erreur: recapErreur,
    recap: simulation ? recap : undefined,
  });
}
