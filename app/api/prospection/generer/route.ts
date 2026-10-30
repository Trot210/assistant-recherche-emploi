import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { genererMessageSpontane } from "@/lib/anthropic/prospection";
import { preparerRelance } from "@/lib/prospection/preparer-relance";
import { suggererLangueContact } from "@/lib/prospection/langue";
import { premierBlocage } from "@/lib/prospection/politique";
import type { Langue } from "@/types/database.types";
import { ouvrirUsage } from "@/lib/anthropic/usage";

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
  const plafond = await ouvrirUsage(supabase, user.id, "prospection");
  if (plafond) return plafond;


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
      const resultat = await preparerRelance(supabase, user.id, parentId, profil);
      if ("erreur" in resultat) {
        return NextResponse.json({ error: resultat.erreur, code: resultat.code }, { status: resultat.statut });
      }
      return NextResponse.json({ prospection: resultat.prospection });
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

    // Langue : choix explicite de la requête, sinon celle suggérée pour le
    // contact (pays, extension de l'adresse), sinon le français.
    const demandee: unknown = body?.langue;
    const langue: Langue =
      demandee === "fr" || demandee === "en"
        ? demandee
        : contact
          ? suggererLangueContact(contact).langue
          : "fr";

    // Politique de l'entreprise et état de l'adresse : « ne plus contacter » est
    // un refus net ; les autres politiques demandent une confirmation (forcer).
    const blocage = premierBlocage(entreprise, contact);
    if (blocage?.niveau === "interdit") {
      return NextResponse.json({ error: blocage.raison, code: "bloque" }, { status: 409 });
    }
    if (blocage && body?.forcer !== true) {
      return NextResponse.json({ error: blocage.raison, code: "politique" }, { status: 409 });
    }

    const genere = await genererMessageSpontane({
      profil,
      entreprise,
      contact,
      posteVise: posteVise.trim(),
      langue,
    });

    const { data: prospection, error: insertError } = await supabase
      .from("prospections")
      .insert({
        user_id: user.id,
        entreprise_id: entreprise.id,
        contact_id: contact?.id ?? null,
        poste_vise: posteVise.trim(),
        langue,
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
