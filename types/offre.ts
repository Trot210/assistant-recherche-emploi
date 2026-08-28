import type { Database } from "@/types/database.types";

export type Offre = Database["public"]["Tables"]["offres"]["Row"];
export type OffreInsert = Database["public"]["Tables"]["offres"]["Insert"];
export type OffreUpdate = Database["public"]["Tables"]["offres"]["Update"];
