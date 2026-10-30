import type { SupabaseClient } from "@supabase/supabase-js";
import { envoyerProspection } from "@/lib/prospection/envoi";
import {
  apresEchecEnvoi,
  choisirEnvoisDus,
  DELAI_INTERRUPTION_MINUTES,
  decomposerParis,
  ECART_MIN_DEFAUT_MINUTES,
  MAX_PAR_JOUR_DEFAUT,
} from "@/lib/prospection/planification";
import type { Database } from "@/types/database.types";

type Client = SupabaseClient<Database>;

// Ferme les programmations actives d'un message (envoyé à la main, modifié, supprimé...) :
// elles ne doivent plus partir. Le motif reste dans l'historique.
export async function cloturerProgrammations(supabase: Client, userId: string, prospectionId: string, motif: string) {
  await supabase
    .from("envois_programmes")
    .update({ statut: "annule", erreur: motif, termine_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("prospection_id", prospectionId)
    .in("statut", ["programme", "en_cours"]);
}

export async function lireReglagesEnvois(supabase: Client, userId: string): Promise<{ maxParJour: number; ecartMinutes: number }> {
  const { data } = await supabase.from("reglages").select("envois_max_par_jour, envois_ecart_minutes").eq("user_id", userId).maybeSingle();
  return {
    maxParJour: data?.envois_max_par_jour ?? MAX_PAR_JOUR_DEFAUT,
    ecartMinutes: data?.envois_ecart_minutes ?? ECART_MIN_DEFAUT_MINUTES,
  };
}

export interface BilanExecution {
  envoyes: number;
  annules: number;
  echecs: number;
  retentes: number;
  // Raison pour laquelle des envois dus ont été reportés (plafond, écart), ou null.
  report: string | null;
  details: string[];
}

const ENVOYES = ["envoyee", "reponse_recue", "sans_suite"] as const;

// Un passage du planificateur : envoie, s'il y en a un, le message programmé dont
// l'heure est passée, dans le respect du plafond du jour et de l'écart minimal.
// Appelé toutes les cinq minutes par la tâche planifiée, et testable sans réseau
// avec un faux client. Chaque programmation est « réservée » avant l'envoi par une
// mise à jour conditionnelle : deux passages simultanés ne peuvent pas envoyer
// deux fois le même message.
export async function executerEnvoisDus(supabase: Client, userId: string, maintenant = new Date()): Promise<BilanExecution> {
  const bilan: BilanExecution = { envoyes: 0, annules: 0, echecs: 0, retentes: 0, report: null, details: [] };
  const iso = maintenant.toISOString();

  // 1. Envois « en cours » depuis trop longtemps : la fonction a été interrompue.
  const seuil = new Date(maintenant.getTime() - DELAI_INTERRUPTION_MINUTES * 60_000).toISOString();
  const { data: bloques } = await supabase
    .from("envois_programmes")
    .select("id, prospection_id")
    .eq("user_id", userId)
    .eq("statut", "en_cours")
    .lt("debut_at", seuil);
  for (const b of bloques ?? []) {
    const { data: p } = await supabase.from("prospections").select("statut, smtp_message_id").eq("id", b.prospection_id).maybeSingle();
    const parti = p?.smtp_message_id ? true : false;
    await supabase
      .from("envois_programmes")
      .update(
        parti
          ? { statut: "envoye", termine_at: iso }
          : {
              statut: "echec",
              termine_at: iso,
              erreur: "Envoi interrompu : vérifie dans « Envoyés et clos » que le message est bien parti avant de le reprogrammer.",
            },
      )
      .eq("id", b.id)
      .eq("statut", "en_cours");
    if (!parti) bilan.echecs += 1;
    bilan.details.push(`envoi interrompu ${b.id} : ${parti ? "finalement envoyé" : "à vérifier"}`);
  }

  // 2. Envois dus.
  const { data: dus } = await supabase
    .from("envois_programmes")
    .select()
    .eq("user_id", userId)
    .eq("statut", "programme")
    .lte("prevu_at", iso)
    .order("prevu_at")
    .limit(20);
  if (!dus || dus.length === 0) return bilan;

  const reglages = await lireReglagesEnvois(supabase, userId);
  const aujourdhui = decomposerParis(maintenant).date;
  const { data: envoyesDuJour } = await supabase
    .from("prospections")
    .select("updated_at")
    .eq("user_id", userId)
    .eq("date_envoi", aujourdhui)
    .in("statut", [...ENVOYES]);
  const dernier = (envoyesDuJour ?? []).map((p) => new Date(p.updated_at).getTime()).sort((a, b) => b - a)[0];

  const decision = choisirEnvoisDus({
    programmes: dus.map((d) => ({ id: d.id, prevu_at: d.prevu_at })),
    maintenant,
    dernierEnvoi: dernier ? new Date(dernier) : null,
    nbEnvoyesAujourdhui: envoyesDuJour?.length ?? 0,
    maxParJour: reglages.maxParJour,
    ecartMinutes: reglages.ecartMinutes,
  });
  bilan.report = decision.raison;

  for (const id of decision.aEnvoyer) {
    const ligne = dus.find((d) => d.id === id);
    if (!ligne) continue;

    // 3. Réservation atomique : une seule exécution obtient la ligne.
    const { data: reservee } = await supabase
      .from("envois_programmes")
      .update({ statut: "en_cours", debut_at: iso, tentatives: ligne.tentatives + 1 })
      .eq("id", ligne.id)
      .eq("statut", "programme")
      .eq("tentatives", ligne.tentatives)
      .select()
      .maybeSingle();
    if (!reservee) continue;

    // 4. Envoi, avec tous les contrôles refaits à l'instant T.
    const resultat = await envoyerProspection(supabase, userId, ligne.prospection_id, { maxParJour: reglages.maxParJour });

    if (resultat.ok) {
      await supabase.from("envois_programmes").update({ statut: "envoye", erreur: null, termine_at: new Date().toISOString() }).eq("id", ligne.id);
      bilan.envoyes += 1;
      bilan.details.push(`envoyé : ${ligne.prospection_id}`);
      continue;
    }

    const termine = new Date().toISOString();
    switch (resultat.code) {
      case "bloque":
      case "statut":
        // Le message n'est plus envoyable (modifié, fil clos, adresse exclue...) : on n'insiste pas.
        await supabase
          .from("envois_programmes")
          .update({ statut: "annule", erreur: resultat.code === "statut" ? "Le message n'est plus validé (modifié, déjà envoyé ou fil clos) : programmation annulée." : resultat.erreur, termine_at: termine })
          .eq("id", ligne.id);
        bilan.annules += 1;
        break;
      case "limite":
        // Plafond atteint entre-temps : on remet la programmation, sans compter d'essai.
        await supabase.from("envois_programmes").update({ statut: "programme", tentatives: ligne.tentatives, debut_at: null }).eq("id", ligne.id);
        bilan.report = resultat.erreur;
        break;
      case "reserve": {
        const { data: p } = await supabase.from("prospections").select("statut").eq("id", ligne.prospection_id).maybeSingle();
        const parti = p ? (ENVOYES as readonly string[]).includes(p.statut) : false;
        await supabase
          .from("envois_programmes")
          .update({ statut: parti ? "envoye" : "echec", erreur: parti ? null : resultat.erreur, termine_at: termine })
          .eq("id", ligne.id);
        if (!parti) bilan.echecs += 1;
        break;
      }
      case "smtp": {
        const suite = apresEchecEnvoi(reservee.tentatives, maintenant);
        if (suite.rejouer && suite.prochainEssai) {
          await supabase
            .from("envois_programmes")
            .update({ statut: "programme", prevu_at: suite.prochainEssai.toISOString(), erreur: resultat.erreur, debut_at: null })
            .eq("id", ligne.id);
          bilan.retentes += 1;
        } else {
          await supabase.from("envois_programmes").update({ statut: "echec", erreur: resultat.erreur, termine_at: termine }).eq("id", ligne.id);
          bilan.echecs += 1;
        }
        break;
      }
      default:
        // Configuration, destinataire ou CV manquant : inutile de réessayer tel quel.
        await supabase.from("envois_programmes").update({ statut: "echec", erreur: resultat.erreur, termine_at: termine }).eq("id", ligne.id);
        bilan.echecs += 1;
    }
    bilan.details.push(`${resultat.code} : ${ligne.prospection_id}`);
  }

  return bilan;
}
