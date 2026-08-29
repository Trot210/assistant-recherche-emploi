import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const SousSectionSchema = z.object({
  titre: z.string(),
  points: z.array(z.string()),
});

const ExperienceSchema = z.object({
  poste: z.string(),
  entreprise: z.string(),
  lieu: z.string().optional(),
  date_debut: z.string(),
  date_fin: z.string().nullable(),
  sous_sections: z.array(SousSectionSchema),
});

const PreferencesSchema = z
  .object({
    localisations: z.array(z.string()),
    types_contrat: z.array(z.string()),
  })
  .passthrough();

const ContactSchema = z.object({
  nom: z.string().optional(),
  localisation: z.string().optional(),
  telephone: z.string().optional(),
  email: z.string().optional(),
  langues: z.array(z.string()).optional(),
  outils: z.array(z.string()).optional(),
  autre: z.array(z.string()).optional(),
});

const FormationEntrySchema = z.object({
  periode: z.string(),
  intitule: z.string(),
  etablissement: z.string().optional(),
});

const ActivitesSchema = z.object({
  loisirs: z.string().optional(),
  sport: z.string().optional(),
});

// Le profil alimente la génération de CV/lettre (métadonnées d'expérience
// copiées telles quelles, voir lib/anthropic/documents.ts) : une forme
// inattendue passerait inaperçue à la sauvegarde et casserait
// silencieusement la génération plus tard.
const ProfilInputSchema = z.object({
  cv_texte: z.string().nullable().optional(),
  competences: z.array(z.string()).optional(),
  experiences: z.array(ExperienceSchema).optional(),
  preferences: PreferencesSchema.optional(),
  contact: ContactSchema.optional(),
  formation: z.array(FormationEntrySchema).optional(),
  activites: ActivitesSchema.optional(),
});

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("profil")
    .select()
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ profil: data });
}

export async function PUT(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const bodyBrut = await request.json().catch(() => null);

  if (!bodyBrut) {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const validation = ProfilInputSchema.safeParse(bodyBrut);

  if (!validation.success) {
    return NextResponse.json(
      { error: `Profil invalide : ${validation.error.issues.map((i) => `${i.path.join(".")} — ${i.message}`).join("; ")}` },
      { status: 400 },
    );
  }

  const body = validation.data;

  const { data, error } = await supabase
    .from("profil")
    .upsert(
      {
        user_id: user.id,
        cv_texte: body.cv_texte ?? null,
        competences: body.competences ?? [],
        experiences: body.experiences ?? [],
        preferences: body.preferences ?? { localisations: [], types_contrat: [] },
        contact: body.contact ?? {},
        formation: body.formation ?? [],
        activites: body.activites ?? {},
      },
      { onConflict: "user_id" },
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ profil: data });
}
