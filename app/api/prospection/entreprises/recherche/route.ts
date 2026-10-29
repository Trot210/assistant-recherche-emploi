import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rechercherEntreprises } from "@/lib/prospection/recherche-entreprises";

// Proxy de l'API publique Recherche d'entreprises : la recherche elle-même
// ne coûte rien et ne touche pas à la base, mais elle reste réservée aux
// utilisateurs connectés. Marque aussi les entreprises déjà importées pour
// ne pas les proposer deux fois.
export async function GET(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const secteurId = searchParams.get("secteur");
  const effectifMin = searchParams.get("effectif_min") ?? "12";
  const departements = (searchParams.get("departements") ?? "").split(",").filter(Boolean);
  const page = Number(searchParams.get("page") ?? "1");

  if (!secteurId) {
    return NextResponse.json({ error: "secteur est requis" }, { status: 400 });
  }

  try {
    const resultat = await rechercherEntreprises({
      secteurId,
      departements,
      effectifMin,
      motCle: searchParams.get("q") ?? undefined,
      page: Number.isInteger(page) && page > 0 ? page : 1,
    });

    const sirens = resultat.entreprises.map((e) => e.siren);
    const { data: existantes } = await supabase
      .from("entreprises")
      .select("siren")
      .eq("user_id", user.id)
      .in("siren", sirens);
    const dejaImportees = new Set((existantes ?? []).map((e) => e.siren));

    return NextResponse.json({
      ...resultat,
      entreprises: resultat.entreprises.map((e) => ({
        ...e,
        deja_importee: dejaImportees.has(e.siren),
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur lors de la recherche";
    const status = /inconnu|mot-clé/.test(message) ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
