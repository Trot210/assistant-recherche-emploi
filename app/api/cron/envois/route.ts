import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
    const bilan = await executerEnvoisDus(createAdminClient(), userId);
    return NextResponse.json(bilan);
  } catch (e) {
    console.error("Erreur du planificateur d'envois:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur inconnue" }, { status: 500 });
  }
}
