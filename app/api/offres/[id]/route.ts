import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// La description complète (souvent le plus gros champ d'une offre) n'est
// pas incluse dans la liste chargée par le dashboard (voir app/page.tsx),
// pour ne pas alourdir chaque affichage/rafraîchissement — cette route la
// récupère à la demande, quand une offre précise est ouverte.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { data: offre, error } = await supabase
    .from("offres")
    .select()
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!offre) {
    return NextResponse.json({ error: "Offre introuvable" }, { status: 404 });
  }

  return NextResponse.json({ offre });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { error, count } = await supabase
    .from("offres")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!count) {
    return NextResponse.json({ error: "Offre introuvable" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
