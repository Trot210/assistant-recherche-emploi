import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { lireBilanUsage, plafondAtteint, suivreUsage } from "@/lib/anthropic/usage";
import { classerEchanges } from "@/lib/prospection/classement-courrier";
import { analyserCourrier, rangerCourrierAnalyse } from "@/lib/prospection/service-courrier";
import { dossierDisponible } from "@/lib/mail/dossier";
import { decomposerParis } from "@/lib/prospection/planification";
import { executerEnvoisDus } from "@/lib/prospection/programmations";

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
    if (dossierDisponible() && Number(decomposerParis(new Date()).heure.split(":")[1]) % 10 === 5) {
      try {
        suivreUsage(supabase, userId, "courrier-candidatures");
        const usage = await lireBilanUsage(supabase, userId).catch(() => null);
        const claudeDisponible = usage ? !plafondAtteint(usage) : true;
        const r = await Promise.race([
          (async () => {
            await analyserCourrier(supabase, userId, { jours: 3, max: 5, claudeDisponible });
            return rangerCourrierAnalyse(supabase, userId, { apercu: false });
          })(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 35_000)),
        ]);
        courrier = r ? { ranges: r.ranges } : null;
      } catch (e) {
        console.error("Tri des mails de candidature impossible:", e);
      }
    }
    return NextResponse.json({ ...bilan, classement, courrier });
  } catch (e) {
    console.error("Erreur du planificateur d'envois:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur inconnue" }, { status: 500 });
  }
}
