import type { Database } from "@/types/database.types";

export type Profil = Database["public"]["Tables"]["profil"]["Row"];
export type ProfilInsert = Database["public"]["Tables"]["profil"]["Insert"];
export type ProfilUpdate = Database["public"]["Tables"]["profil"]["Update"];
