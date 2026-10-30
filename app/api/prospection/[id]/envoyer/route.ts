import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { envoyerProspection } from "@/lib/prospection/envoi";
import { cloturerProgrammations } from "@/lib/prospection/programmations";

// Envoie réellement le message depuis la boîte de l'utilisateur. Rien ne part sans une
// confirmation explicite dans la requête : l'interface la demande après l'affichage du
// destinataire, du texte et de la pièce jointe. La logique d'envoi est partagée avec
// les envois programmés (lib/prospection/envoi.ts).
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
    return NextResponse.json({ error: "Confirme l'envoi après avoir vérifié le message" }, { status: 400 });
  }

  const joindreCv: boolean = typeof body?.joindre_cv === "boolean" ? body.joindre_cv : true;
  const resultat = await envoyerProspection(supabase, user.id, id, { joindreCv });

  if (!resultat.ok) {
    return NextResponse.json(
      {
        error: resultat.erreur,
        ...(resultat.code === "non_configure" ? { smtp_non_configure: true } : {}),
        ...(resultat.code === "bloque" ? { bloque: true } : {}),
      },
      { status: resultat.statut },
    );
  }

  // Un message envoyé à la main ne doit plus partir une deuxième fois à l'heure programmée.
  await cloturerProgrammations(supabase, user.id, id, "envoyé manuellement");

  return NextResponse.json({ prospection: resultat.prospection, piece_jointe: resultat.pieceJointe });
}
