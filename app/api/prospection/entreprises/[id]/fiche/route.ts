import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { genererFicheEntreprise } from "@/lib/anthropic/fiche-entreprise";

// Lecture des pages du site + un appel de synthèse (et au plus une recherche
// web pour trouver le site) : une vingtaine de secondes en général.
export const maxDuration = 60;

// Analyse l'entreprise, enregistre la fiche et crée les contacts trouvés sur
// des pages publiques — chacun avec le lien de sa source. Relancer l'analyse
// remplace la fiche mais n'ajoute jamais deux fois le même contact.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { data: entreprise, error } = await supabase
    .from("entreprises")
    .select()
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!entreprise) return NextResponse.json({ error: "Entreprise introuvable" }, { status: 404 });

  try {
    const fiche = await genererFicheEntreprise(entreprise);

    const { data: existants } = await supabase
      .from("contacts")
      .select("nom, email")
      .eq("entreprise_id", entreprise.id)
      .eq("user_id", user.id);
    const emailsConnus = new Set((existants ?? []).map((c) => c.email?.toLowerCase()).filter(Boolean));
    const nomsConnus = new Set((existants ?? []).map((c) => c.nom.toLowerCase()));

    const aCreer = [];

    // L'adresse générique n'est ajoutée que si elle est confirmée par un
    // extrait cité ; sinon elle reste affichée dans la fiche, à vérifier.
    const adresse = fiche.adresse_candidature;
    if (adresse?.confirmee && !emailsConnus.has(adresse.email.toLowerCase())) {
      aCreer.push({
        user_id: user.id,
        entreprise_id: entreprise.id,
        nom: "Recrutement",
        poste: "Candidatures spontanées",
        email: adresse.email,
        generique: true,
        origine: "page_publique" as const,
        source_url: adresse.source_url,
        source_email: `Page publique de l'entreprise : ${adresse.source_url}`,
      });
    }

    for (const contact of fiche.contacts_publics) {
      if (nomsConnus.has(contact.nom.toLowerCase())) continue;
      if (contact.email && emailsConnus.has(contact.email.toLowerCase())) continue;
      aCreer.push({
        user_id: user.id,
        entreprise_id: entreprise.id,
        nom: contact.nom,
        poste: contact.poste,
        email: contact.email,
        origine: "page_publique" as const,
        source_url: contact.source_url,
        source_email: contact.email ? `Page publique : ${contact.source_url}` : null,
      });
    }

    const { data: contacts, error: contactsError } =
      aCreer.length > 0
        ? await supabase.from("contacts").insert(aCreer).select()
        : { data: [], error: null };
    if (contactsError) return NextResponse.json({ error: contactsError.message }, { status: 500 });

    const { data: misAJour, error: updateError } = await supabase
      .from("entreprises")
      .update({
        // Une nouvelle analyse remplace la fiche mais garde la trace d'une
        // recherche Hunter déjà faite.
        fiche: { ...fiche, hunter_recherche_at: entreprise.fiche?.hunter_recherche_at ?? null },
        fiche_generee_at: new Date().toISOString(),
        site_web: entreprise.site_web ?? fiche.site_web,
      })
      .eq("id", entreprise.id)
      .eq("user_id", user.id)
      .select()
      .single();
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    return NextResponse.json({ entreprise: misAJour, contacts });
  } catch (e) {
    console.error("Erreur analyse entreprise:", e);
    return NextResponse.json(
      { error: e instanceof Error ? `${e.name}: ${e.message}` : "Erreur inconnue lors de l'analyse" },
      { status: 500 },
    );
  }
}
