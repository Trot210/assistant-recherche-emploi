import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Deux gestes distincts (voir lib/prospection/suppression.ts) :
//   mode "retirer"   : l'entreprise passe en « écartée » et ses brouillons non
//                      envoyés sont supprimés ; historique et contacts restent.
//   mode "supprimer" : l'entreprise est supprimée, avec ses contacts et tous
//                      ses messages (cascade en base), envoyés compris.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const mode: unknown = body?.mode;
  if (mode !== "retirer" && mode !== "supprimer") {
    return NextResponse.json({ error: "mode doit être « retirer » ou « supprimer »" }, { status: 400 });
  }

  const { data: entreprise, error } = await supabase
    .from("entreprises")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!entreprise) return NextResponse.json({ error: "Entreprise introuvable" }, { status: 404 });

  if (mode === "supprimer") {
    const { data: messages } = await supabase
      .from("prospections")
      .select("id")
      .eq("entreprise_id", entreprise.id)
      .eq("user_id", user.id);

    const { error: deleteError } = await supabase
      .from("entreprises")
      .delete()
      .eq("id", entreprise.id)
      .eq("user_id", user.id);
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

    return NextResponse.json({ mode, supprimes: (messages ?? []).map((m) => m.id) });
  }

  // « Retirer » : seuls les messages qui ne sont jamais partis disparaissent.
  const { data: brouillons, error: brouillonsError } = await supabase
    .from("prospections")
    .delete()
    .eq("entreprise_id", entreprise.id)
    .eq("user_id", user.id)
    .is("date_envoi", null)
    .select("id");
  if (brouillonsError) return NextResponse.json({ error: brouillonsError.message }, { status: 500 });

  const { data: misAJour, error: updateError } = await supabase
    .from("entreprises")
    .update({ statut: "ecartee" })
    .eq("id", entreprise.id)
    .eq("user_id", user.id)
    .select()
    .single();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ mode, entreprise: misAJour, supprimes: (brouillons ?? []).map((b) => b.id) });
}
