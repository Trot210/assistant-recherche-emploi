import type { Database } from "@/types/database.types";

export type Candidature = Database["public"]["Tables"]["candidatures"]["Row"];
export type CandidatureInsert = Database["public"]["Tables"]["candidatures"]["Insert"];
export type CandidatureUpdate = Database["public"]["Tables"]["candidatures"]["Update"];
