import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { genererMessageSpontane, genererRelance } from "@/lib/anthropic/prospection";
import { estEnCours, MAX_RELANCES } from "@/lib/prospection/workflow";

// Génération + contrôle qualité (2 appels Claude séquentiels).
export const maxDuration = 60;

// Crée un message à valider : soit un premier contact (entreprise_id +
// poste_vise, contact_id facultatif), soit la relance d'un message déjà
// envoyé (parent_id). Rien n'est envoyé — le message attend la validation.
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parentId: unknown = body?.parent_id;
  const estRelance = typeof parentId === "string";

  const { data: profil, error: profilError } = await supabase
    .from("profil")
    .select()
    .eq("user_id", user.id)
    .maybeSingle();

  if (profilError) return NextResponse.json({ error: profilError.message }, { status: 500 });
  if (!profil) {
    return NextResponse.json(
      { error: "Profil non renseigné — remplis-le via PUT /api/profil avant de continuer" },
      { status: 400 },
    );
  }

  try {
    if (estRelance) {
      const { data: initial, error } = await supabase
        .from("prospections")
        .select()
        .eq("id", parentId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (!initial || initial.type !== "initial") {
        return NextResponse.json({ error: "Message initial introuvable" }, { status: 404 });
      }
      if (initial.statut !== "envoyee") {
        return NextResponse.json({ error: "Seul un message envoyé sans réponse peut être relancé" }, { status: 409 });
      }
      if (initial.nb_relances >= MAX_RELANCES) {
        return NextResponse.json({ error: `Déjà ${MAX_RELANCES} relances envoyées` }, { status: 409 });
      }

      const { data: enCours } = await supabase
        .from("prospections")
        .select("id, statut")
        .eq("parent_id", initial.id)
        .eq("user_id", user.id);
      if ((enCours ?? []).some((r) => estEnCours(r.statut))) {
        return NextResponse.json({ error: "Une relance est déjà en préparation pour ce message" }, { status: 409 });
      }

      const [{ data: entreprise }, { data: contact }] = await Promise.all([
        supabase.from("entreprises").select().eq("id", initial.entreprise_id).eq("user_id", user.id).single(),
        initial.contact_id
          ? supabase.from("contacts").select().eq("id", initial.contact_id).eq("user_id", user.id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      if (!entreprise) return NextResponse.json({ error: "Entreprise introuvable" }, { status: 404 });

      const genere = await genererRelance({
        profil,
        entreprise,
        contact,
        initial,
        numero: initial.nb_relances + 1,
      });

      const { data: prospection, error: insertError } = await supabase
        .from("prospections")
        .insert({
          user_id: user.id,
          entreprise_id: initial.entreprise_id,
          contact_id: initial.contact_id,
          parent_id: initial.id,
          type: "relance",
          poste_vise: initial.poste_vise,
          gmail_thread_id: initial.gmail_thread_id,
          ...genere,
        })
        .select()
        .single();

      if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
      return NextResponse.json({ prospection });
    }

    const entrepriseId: unknown = body?.entreprise_id;
    const contactId: unknown = body?.contact_id;
    const posteVise: unknown = body?.poste_vise;

    if (typeof entrepriseId !== "string" || typeof posteVise !== "string" || !posteVise.trim()) {
      return NextResponse.json({ error: "entreprise_id et poste_vise sont requis" }, { status: 400 });
    }

    const { data: entreprise, error: entrepriseError } = await supabase
      .from("entreprises")
      .select()
      .eq("id", entrepriseId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (entrepriseError) return NextResponse.json({ error: entrepriseError.message }, { status: 500 });
    if (!entreprise) return NextResponse.json({ error: "Entreprise introuvable" }, { status: 404 });

    let contact = null;
    if (typeof contactId === "string") {
      const { data } = await supabase
        .from("contacts")
        .select()
        .eq("id", contactId)
        .eq("entreprise_id", entreprise.id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!data) return NextResponse.json({ error: "Contact introuvable" }, { status: 404 });
      contact = data;
    }

    const genere = await genererMessageSpontane({
      profil,
      entreprise,
      contact,
      posteVise: posteVise.trim(),
    });

    const { data: prospection, error: insertError } = await supabase
      .from("prospections")
      .insert({
        user_id: user.id,
        entreprise_id: entreprise.id,
        contact_id: contact?.id ?? null,
        poste_vise: posteVise.trim(),
        ...genere,
      })
      .select()
      .single();

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
    return NextResponse.json({ prospection });
  } catch (error) {
    console.error("Erreur génération message de prospection:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `${error.name}: ${error.message}`
            : "Erreur inconnue lors de la génération du message",
      },
      { status: 500 },
    );
  }
}
