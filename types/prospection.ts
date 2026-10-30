import type { Database } from "@/types/database.types";

export type Entreprise = Database["public"]["Tables"]["entreprises"]["Row"];
export type EntrepriseInsert = Database["public"]["Tables"]["entreprises"]["Insert"];
// "Contact" désigne déjà les coordonnées du candidat dans database.types.ts.
export type ContactEntreprise = Database["public"]["Tables"]["contacts"]["Row"];
export type ContactEntrepriseInsert = Database["public"]["Tables"]["contacts"]["Insert"];
export type Prospection = Database["public"]["Tables"]["prospections"]["Row"];
export type ProspectionInsert = Database["public"]["Tables"]["prospections"]["Insert"];
export type EnvoiProgramme = Database["public"]["Tables"]["envois_programmes"]["Row"];
