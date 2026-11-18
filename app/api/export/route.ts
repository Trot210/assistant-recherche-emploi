import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aujourdhuiParis } from "@/lib/prospection/workflow";

export const maxDuration = 60;

// Tables sauvegardées. Les offres ne le sont que si elles sont liées à une candidature : les milliers d'offres
// importées chaque jour se retrouvent depuis France Travail et alourdiraient la sauvegarde pour rien.
const TABLES = ["profil", "entreprises", "contacts", "prospections", "envois_programmes", "candidatures", "courrier_candidatures", "reglages"] as const;

const PAGE = 1000;

// Sauvegarde de TES données en un fichier JSON à télécharger : à garder sur ton Mac au cas où la base poserait
// problème. Le fichier ne contient aucun mot de passe ni clé d'accès, mais des coordonnées de contacts : à ranger
// comme un document personnel. Lecture seule, rien n'est modifié.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const sauvegarde: Record<string, unknown> = { exporte_le: new Date().toISOString(), version: 1 };
  const absentes: string[] = [];

  for (const table of TABLES) {
    const lignes: unknown[] = [];
    let erreur: string | null = null;
    for (let debut = 0; ; debut += PAGE) {
      const { data, error } = await supabase
        .from(table)
        .select()
        .eq("user_id", user.id)
        .range(debut, debut + PAGE - 1);
      if (error) {
        erreur = error.message;
        break;
      }
      lignes.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }
    if (erreur) absentes.push(`${table} : ${erreur}`);
    else sauvegarde[table] = lignes;
  }

  // Offres liées à une candidature.
  const candidatures = (sauvegarde.candidatures as { offre_id: string }[] | undefined) ?? [];
  const idsOffres = [...new Set(candidatures.map((c) => c.offre_id))];
  const offres: unknown[] = [];
  for (let i = 0; i < idsOffres.length; i += 200) {
    const { data, error } = await supabase.from("offres").select().eq("user_id", user.id).in("id", idsOffres.slice(i, i + 200));
    if (error) {
      absentes.push(`offres : ${error.message}`);
      break;
    }
    offres.push(...(data ?? []));
  }
  sauvegarde.offres_candidatees = offres;
  if (absentes.length > 0) sauvegarde.tables_non_exportees = absentes;

  return new NextResponse(JSON.stringify(sauvegarde, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="sauvegarde-le-rayon-${aujourdhuiParis()}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
