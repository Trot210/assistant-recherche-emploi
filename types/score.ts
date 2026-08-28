import type { Database } from "@/types/database.types";

export type Score = Database["public"]["Tables"]["scores"]["Row"];
export type ScoreInsert = Database["public"]["Tables"]["scores"]["Insert"];
export type ScoreUpdate = Database["public"]["Tables"]["scores"]["Update"];
