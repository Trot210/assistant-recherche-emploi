import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { envoyerProspection } from "@/lib/prospection/envoi";

// Envoie tout de suite un message programmé. La programmation est d'abord réservée
// (conditionnellement) : le planificateur ne pourra pas envoyer le même message en
// parallèle.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (body?.confirme !== true) {
    return NextResponse.json({ error: "Confirme l'envoi immédiat" }, { status: 400 });
  }

  const { data: reservee } = await supabase
    .from("envois_programmes")
    .update({ statut: "en_cours", debut_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("statut", "programme")
    .select()
    .maybeSingle();
  if (!reservee) {
    return NextResponse.json({ error: "Cet envoi n'est plus en attente (déjà parti, en cours ou annulé)" }, { status: 409 });
  }

  const resultat = await envoyerProspection(supabase, user.id, reservee.prospection_id);

  if (!resultat.ok) {
    // L'envoi n'a pas eu lieu : la programmation redevient en attente pour ne rien perdre.
    await supabase
      .from("envois_programmes")
      .update({ statut: "programme", debut_at: null, erreur: resultat.erreur })
      .eq("id", reservee.id)
      .eq("statut", "en_cours");
    return NextResponse.json({ error: resultat.erreur }, { status: resultat.statut });
  }

  const { data: programmation } = await supabase
    .from("envois_programmes")
    .update({ statut: "envoye", erreur: null, termine_at: new Date().toISOString() })
    .eq("id", reservee.id)
    .select()
    .single();
  return NextResponse.json({ prospection: resultat.prospection, programmation, piece_jointe: resultat.pieceJointe });
}
