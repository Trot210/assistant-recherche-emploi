import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hunterConfigure, QuotaHunterEpuise, verifierEmail } from "@/lib/hunter/client";

// Vérifie l'adresse d'un contact (une vérification du quota Hunter), sur clic
// explicite. Une adresse reconnue invalide est aussitôt marquée comme telle, ce
// qui bloque tout envoi ; tu peux la rétablir depuis la fiche.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  if (!hunterConfigure()) {
    return NextResponse.json({ error: "Hunter n'est pas configuré (HUNTER_API_KEY)" }, { status: 501 });
  }

  const { data: contact, error } = await supabase
    .from("contacts")
    .select()
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!contact) return NextResponse.json({ error: "Contact introuvable" }, { status: 404 });
  if (!contact.email) return NextResponse.json({ error: "Ce contact n'a pas d'adresse e-mail" }, { status: 400 });

  try {
    const verification = await verifierEmail(contact.email);
    const { data: misAJour, error: updateError } = await supabase
      .from("contacts")
      .update({
        email_verification: verification,
        email_verifie_at: new Date().toISOString(),
        ...(verification === "invalide" && contact.email_statut === "ok" ? { email_statut: "invalide" as const } : {}),
      })
      .eq("id", contact.id)
      .eq("user_id", user.id)
      .select()
      .single();
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    return NextResponse.json({ contact: misAJour });
  } catch (e) {
    if (e instanceof QuotaHunterEpuise) return NextResponse.json({ error: e.message }, { status: 429 });
    console.error("Erreur vérification Hunter:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur de vérification" }, { status: 502 });
  }
}
