import type { SupabaseClient } from "@supabase/supabase-js";
import { classerReponse, type ClassementReponse } from "@/lib/anthropic/reponses";
import { lireReponsesCandidates } from "@/lib/mail/imap";
import {
  critereRecherche,
  estExpediteurAutomatique,
  nettoyerCorps,
  rapprocher,
  type Confiance,
  type CritereRecherche,
  type EnvoiConnu,
  type ReponseBrute,
  type Rapprochement,
} from "@/lib/prospection/reponses";
import type { Database, Json } from "@/types/database.types";

const JOURS_PAR_DEFAUT = 120;
const CONCURRENCE = 3;

// Une réponse trouvée dans la boîte mail, rapprochée d'une candidature et classée.
// C'est ce que l'écran affiche : l'utilisateur l'associe ou l'écarte lui-même.
export interface PropositionReponse {
  message_id: string;
  prospection_id: string;
  confiance: Confiance;
  entreprise: string;
  destinataire: string | null;
  expediteur: { email: string; nom: string | null };
  date: string;
  sujet: string;
  extrait: string;
  adresse_invalide?: string;
  classement: ClassementReponse | { type: "non_distribue"; resume: string; urls: string[]; ne_plus_contacter: boolean };
}

export interface ContexteDetection {
  dejaVus: Set<string>;
  depuis: Date;
  envois: EnvoiConnu[];
  infoDe: Map<string, { contact_id: string | null; entreprise_id: string }>;
  nomEntreprise: Map<string, string>;
  nomContact: Map<string, string>;
}

export interface ResultatDetection {
  propositions: PropositionReponse[];
  messagesLus: number;
  dejaTraites: number;
  sansCandidature: number;
  contexte: ContexteDetection;
}

export interface OptionsDetection {
  jours?: number;
  // Nombre maximal de réponses classées par Claude lors de cet appel.
  maxClassements: number;
  claudeDisponible: boolean;
}

// Lit la boîte mail (lecture seule), rapproche chaque message d'une candidature et
// propose un classement. Les classements déjà faits sont repris de
// `reponses_detectees` : une réponse n'est classée, donc payée, qu'une fois. RIEN n'est
// enregistré sur une candidature ici ; l'utilisateur valide chaque proposition ensuite.
// Peut lever une erreur si la boîte mail est illisible.
export async function detecterReponses(
  supabase: SupabaseClient<Database>,
  userId: string,
  options: OptionsDetection,
): Promise<ResultatDetection> {
  const [{ data: envoyes }, { data: contacts }, { data: entreprises }, { data: traitees }, { data: memorisees }] = await Promise.all([
    supabase
      .from("prospections")
      .select("id, parent_id, smtp_message_id, date_envoi, contact_id, entreprise_id, type")
      .eq("user_id", userId)
      .not("date_envoi", "is", null),
    supabase.from("contacts").select("id, nom, email").eq("user_id", userId),
    supabase.from("entreprises").select("id, nom").eq("user_id", userId),
    supabase.from("reponses_traitees").select("message_id").eq("user_id", userId),
    // Table absente (migration pas encore appliquée) : pas de mémoire, tout est classé comme avant.
    supabase.from("reponses_detectees").select("message_id, proposition").eq("user_id", userId),
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
  const infoDe = new Map((envoyes ?? []).map((p) => [p.id, { contact_id: p.contact_id, entreprise_id: p.entreprise_id }]));
  const dejaVus = new Set((traitees ?? []).map((t) => t.message_id));
  const memoire = new Map((memorisees ?? []).map((m) => [m.message_id, m.proposition as unknown as PropositionReponse]));

  const criteres = new Map<string, CritereRecherche>();
  for (const envoi of envois) {
    const critere = envoi.emailContact ? critereRecherche(envoi.emailContact) : null;
    if (critere) criteres.set(`${critere.type}:${critere.valeur}`, critere);
  }

  const contexteBase = { dejaVus, envois, infoDe, nomEntreprise, nomContact };
  if (criteres.size === 0) {
    return { propositions: [], messagesLus: 0, dejaTraites: 0, sansCandidature: 0, contexte: { ...contexteBase, depuis: new Date() } };
  }

  const jours = options.jours ?? JOURS_PAR_DEFAUT;
  const premierEnvoi = envois.reduce((min, e) => (e.dateEnvoi < min ? e.dateEnvoi : min), envois[0].dateEnvoi);
  const debutPeriode = new Date(Date.now() - jours * 86_400_000);
  const depuis = new Date(Math.max(debutPeriode.getTime(), new Date(`${premierEnvoi}T00:00:00Z`).getTime() - 86_400_000));

  const lues = await lireReponsesCandidates({
    criteres: [...criteres.values()],
    depuis,
    adresseUtilisateur: process.env.IMAP_USER ?? process.env.SMTP_USER ?? "",
  });

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

  // Les messages automatiques et ceux déjà classés ne passent pas par le modèle ; les
  // autres sont classés par petits groupes, dans une limite qui borne le coût.
  const propositions: (PropositionReponse | undefined)[] = new Array(aTraiter.length);
  const aMemoriser: PropositionReponse[] = [];
  let classes = 0;

  const classer = async (index: number) => {
    const { reponse, rapprochement } = aTraiter[index];
    const prospection = infoDe.get(rapprochement.prospectionId);
    const entreprise = prospection ? (nomEntreprise.get(prospection.entreprise_id) ?? "Entreprise") : "Entreprise";
    const contactId = prospection?.contact_id ?? null;

    let classement: PropositionReponse["classement"];
    let aGarder = false;
    const connue = memoire.get(reponse.messageId);
    if (connue) {
      classement = connue.classement;
    } else if (estExpediteurAutomatique(reponse.fromEmail)) {
      classement = { type: "automatique", resume: "Message automatique (accusé, absence ou non-distribution).", urls: [], ne_plus_contacter: false };
    } else if (!options.claudeDisponible) {
      classement = { type: "autre", resume: "Non classé : plafond mensuel Claude atteint, choisis le type toi-même.", urls: [], ne_plus_contacter: false };
    } else if (classes >= options.maxClassements) {
      classement = { type: "autre", resume: "Non classé : limite de classements atteinte pour cette recherche.", urls: [], ne_plus_contacter: false };
    } else {
      classes += 1;
      try {
        classement = await classerReponse({
          expediteur: reponse.fromEmail,
          sujet: reponse.sujet,
          texte: nettoyerCorps(reponse.texte),
          texteComplet: reponse.texte,
          entreprise,
        });
        aGarder = true;
      } catch (e) {
        console.error("Erreur classement d'une réponse:", e);
        classement = { type: "autre", resume: "Classement automatique indisponible : choisis le type toi-même.", urls: [], ne_plus_contacter: false };
      }
    }

    const proposition: PropositionReponse = {
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
    propositions[index] = proposition;
    // Seul un vrai classement est mémorisé : un « non classé » sera retenté plus tard.
    if (aGarder) aMemoriser.push(proposition);
  };

  for (let i = 0; i < aTraiter.length; i += CONCURRENCE) {
    await Promise.all(Array.from({ length: Math.min(CONCURRENCE, aTraiter.length - i) }, (_, k) => classer(i + k)));
  }

  if (aMemoriser.length > 0) {
    const { error } = await supabase.from("reponses_detectees").upsert(
      aMemoriser.map((p) => ({ user_id: userId, message_id: p.message_id, prospection_id: p.prospection_id, proposition: p as unknown as Json })),
      { onConflict: "user_id,message_id" },
    );
    if (error) console.error("Mémorisation des réponses détectées impossible:", error.message);
  }

  return {
    propositions: propositions.filter((p): p is PropositionReponse => p !== undefined),
    messagesLus: lues.length,
    dejaTraites,
    sansCandidature,
    contexte: { ...contexteBase, depuis },
  };
}

// Réponses déjà détectées et classées, pas encore traitées par l'utilisateur : lues
// dans la mémoire, sans toucher à la boîte mail ni à Claude.
export async function reponsesEnAttente(supabase: SupabaseClient<Database>, userId: string): Promise<PropositionReponse[]> {
  const [{ data: memorisees, error }, { data: traitees }] = await Promise.all([
    supabase.from("reponses_detectees").select("message_id, proposition").eq("user_id", userId).order("created_at", { ascending: false }).limit(100),
    supabase.from("reponses_traitees").select("message_id").eq("user_id", userId),
  ]);
  if (error) {
    console.error("Lecture des réponses détectées impossible:", error.message);
    return [];
  }
  const traites = new Set((traitees ?? []).map((t) => t.message_id));
  return (memorisees ?? [])
    .filter((m) => !traites.has(m.message_id))
    .map((m) => m.proposition as unknown as PropositionReponse)
    .filter((p) => p.classement.type !== "automatique");
}
