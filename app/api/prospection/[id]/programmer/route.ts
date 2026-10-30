import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { formaterProgrammation, validerProgrammation } from "@/lib/prospection/planification";
import { verifierProgrammable } from "@/lib/prospection/programmer";

// Programme l'envoi d'un message validé à une date et une heure précises. Comme pour
// l'envoi immédiat, rien n'est programmé sans une confirmation explicite : l'interface
// la demande après l'affichage du destinataire, du texte, de la pièce jointe et de la
// date. L'envoi lui-même est fait plus tard par le planificateur (/api/cron/envois).
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
    return NextResponse.json({ error: "Confirme la programmation après avoir vérifié le message" }, { status: 400 });
  }
  if (typeof body?.prevu_at !== "string") {
    return NextResponse.json({ error: "prevu_at (date et heure) est requis" }, { status: 400 });
  }

  const instant = new Date(body.prevu_at);
  const validation = validerProgrammation(instant, new Date());
  if (validation.erreur) return NextResponse.json({ error: validation.erreur }, { status: 400 });

  const { data: prospection, error } = await supabase
    .from("prospections")
    .select()
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!prospection) return NextResponse.json({ error: "Message introuvable" }, { status: 404 });

  const probleme = await verifierProgrammable(supabase, user.id, prospection);
  if (probleme) return NextResponse.json({ error: probleme }, { status: 409 });

  // Une seule programmation active par message : une nouvelle date remplace l'ancienne.
  const { data: existante } = await supabase
    .from("envois_programmes")
    .select("id")
    .eq("user_id", user.id)
    .eq("prospection_id", prospection.id)
    .eq("statut", "programme")
    .maybeSingle();

  if (existante) {
    const { data, error: updateError } = await supabase
      .from("envois_programmes")
      .update({ prevu_at: instant.toISOString(), erreur: null, tentatives: 0 })
      .eq("id", existante.id)
      .eq("user_id", user.id)
      .eq("statut", "programme")
      .select()
      .single();
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    return NextResponse.json({ programmation: data, quand: formaterProgrammation(instant), avertissements: validation.avertissements });
  }

  const { data, error: insertError } = await supabase
    .from("envois_programmes")
    .insert({ user_id: user.id, prospection_id: prospection.id, prevu_at: instant.toISOString() })
    .select()
    .single();
  if (insertError) {
    // L'index unique refuse une deuxième programmation active du même message.
    const deja = insertError.code === "23505";
    return NextResponse.json(
      { error: deja ? "Ce message est déjà en cours d'envoi" : insertError.message },
      { status: deja ? 409 : 500 },
    );
  }
  return NextResponse.json({ programmation: data, quand: formaterProgrammation(instant), avertissements: validation.avertissements });
}
