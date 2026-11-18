import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { lireBilanUsage, plafondAtteint, suivreUsage } from "@/lib/anthropic/usage";
import { classerEchanges } from "@/lib/prospection/classement-courrier";
import { analyserCourrier, rangerCourrierAnalyse } from "@/lib/prospection/service-courrier";
import { dossierDisponible, rangerCourrierAutomatique } from "@/lib/mail/dossier";
import { decomposerParis } from "@/lib/prospection/planification";
import { executerEnvoisDus } from "@/lib/prospection/programmations";
import { enregistrerPassage, resumerErreurs } from "@/lib/prospection/sante";

// Chaque envoi peut prendre quelques secondes (CV à lire, connexion au serveur de messagerie).
export const maxDuration = 60;

// Passage du planificateur d'envois : appelé toutes les cinq minutes par une tâche
// GitHub, avec le secret partagé. Il envoie, au plus, UN message programmé dont l'heure
// est passée, dans le respect du plafond du jour et de l'écart minimal entre deux envois.
// Il fonctionne sans session : ordinateur éteint, site fermé.
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization")?.trim() !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  const userId = process.env.SYNC_USER_ID?.trim();
  if (!userId) return NextResponse.json({ error: "SYNC_USER_ID non configuré côté serveur" }, { status: 500 });

  try {
    const supabase = createAdminClient();
    const bilan = await executerEnvoisDus(supabase, userId);

    // Toutes les dix minutes : les réponses arrivées en boîte de réception depuis hier qui
    // concernent la prospection sont déplacées dans le dossier « Prospection ». Jamais bloquant.
    let classement: { deplaces: number } | null = null;
    if (dossierDisponible() && Number(decomposerParis(new Date()).heure.split(":")[1]) % 10 === 0) {
      try {
        const r = await Promise.race([
          classerEchanges(supabase, userId, { jours: 1, apercu: false, envoyes: false }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 30_000)),
        ]);
        classement = r?.bilan ? { deplaces: r.bilan.deplaces + r.bilan.ajoutes } : null;
      } catch (e) {
        console.error("Classement des réponses dans le dossier impossible:", e);
      }
    }

    // Toutes les dix minutes, cinq minutes après l'autre : les mails de candidature arrivés depuis trois
    // jours (accusés de réception, refus) sont lus (5 au plus, par Claude) puis rangés dans « En attente
    // réponse » et « Refus ». Jamais bloquant.
    let courrier: { ranges: number } | null = null;
    let rangement: { alertes: number; temporaires: number; recruteurs: number; lettres: number } | null = null;
    // Problèmes de ce passage, pour le signaler (récapitulatif du matin, bandeau du site) au lieu de les taire.
    const problemes: string[] = [];
    if (dossierDisponible() && Number(decomposerParis(new Date()).heure.split(":")[1]) % 10 === 5) {
      // Alertes emploi, mails temporaires et lettres d'information vont dans leurs dossiers (sans Claude, quelques secondes).
      try {
        const a = await Promise.race([rangerCourrierAutomatique({ jours: 2 }), new Promise<null>((resolve) => setTimeout(() => resolve(null), 12_000))]);
        rangement = a ? { alertes: a.alertes, temporaires: a.temporaires, recruteurs: a.recruteurs, lettres: a.lettres } : null;
        if (a && a.erreurs.length > 0) {
          console.error("Rangement automatique des mails:", a.erreurs.join(" ; "));
          problemes.push(...a.erreurs);
        }
      } catch (e) {
        console.error("Rangement automatique des mails impossible:", e);
        problemes.push(`rangement automatique impossible (${e instanceof Error ? e.message : "erreur inconnue"})`);
      }
      try {
        suivreUsage(supabase, userId, "courrier-candidatures");
        const usage = await lireBilanUsage(supabase, userId).catch(() => null);
        const claudeDisponible = usage ? !plafondAtteint(usage) : true;
        const r = await Promise.race([
          (async () => {
            await analyserCourrier(supabase, userId, { jours: 3, max: 5, claudeDisponible });
            return rangerCourrierAnalyse(supabase, userId, { apercu: false });
          })(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 30_000)),
        ]);
        courrier = r ? { ranges: r.ranges } : null;
        // Un passage simplement lent n'est pas une panne ; seules les vraies erreurs sont signalées.
        if (r?.bilan?.erreurs.length) problemes.push(...r.bilan.erreurs);
      } catch (e) {
        console.error("Tri des mails de candidature impossible:", e);
        problemes.push(`tri des candidatures impossible (${e instanceof Error ? e.message : "erreur inconnue"})`);
      }
      await enregistrerPassage(supabase, userId, resumerErreurs(problemes));
    }
    return NextResponse.json({ ...bilan, classement, courrier, rangement });
  } catch (e) {
    console.error("Erreur du planificateur d'envois:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur inconnue" }, { status: 500 });
  }
}
