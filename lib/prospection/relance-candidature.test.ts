import { describe, expect, it } from "vitest";
import { candidaturesARelancer, type LigneCandidature } from "./relance-candidature";

const maintenant = new Date("2026-11-18T10:00:00Z");

function ligne(extra: Partial<LigneCandidature>): LigneCandidature {
  return { id: "1", statut: "envoyee", date_envoi: "2026-11-05", derniere_relance_at: null, titre: "Poste test", entreprise: "Société Test", lien: null, ...extra };
}

describe("candidaturesARelancer", () => {
  it("propose une candidature envoyée depuis 13 jours sans nouvelles", () => {
    const r = candidaturesARelancer([ligne({})], maintenant);
    expect(r).toHaveLength(1);
    expect(r[0].jours).toBe(13);
  });

  it("n'en propose pas avant 10 jours", () => {
    expect(candidaturesARelancer([ligne({ date_envoi: "2026-11-10" })], maintenant)).toEqual([]);
  });

  it("n'en propose plus après 30 jours", () => {
    expect(candidaturesARelancer([ligne({ date_envoi: "2026-10-10" })], maintenant)).toEqual([]);
  });

  it("ignore entretien, refus, offre et à traiter", () => {
    for (const statut of ["entretien", "refusee", "offre", "a_traiter"]) {
      expect(candidaturesARelancer([ligne({ statut })], maintenant)).toEqual([]);
    }
  });

  it("accepte un simple accusé de réception", () => {
    expect(candidaturesARelancer([ligne({ statut: "reponse_recue" })], maintenant)).toHaveLength(1);
  });

  it("ne repropose pas une candidature déjà relancée ou sans date d'envoi", () => {
    expect(candidaturesARelancer([ligne({ derniere_relance_at: "2026-11-12T08:00:00Z" })], maintenant)).toEqual([]);
    expect(candidaturesARelancer([ligne({ date_envoi: null })], maintenant)).toEqual([]);
  });

  it("trie la plus ancienne d'abord", () => {
    const r = candidaturesARelancer([ligne({ id: "a", date_envoi: "2026-11-07" }), ligne({ id: "b", date_envoi: "2026-10-25" })], maintenant);
    expect(r.map((x) => x.id)).toEqual(["b", "a"]);
  });
});
