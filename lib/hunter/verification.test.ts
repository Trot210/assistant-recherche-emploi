import { describe, expect, it } from "vitest";
import { libelleVerification, verificationDepuisHunter } from "@/lib/hunter/verification";

describe("verificationDepuisHunter", () => {
  it("traduit les verdicts de Hunter", () => {
    expect(verificationDepuisHunter({ status: "valid", result: "deliverable" })).toBe("valide");
    expect(verificationDepuisHunter({ status: "invalid" })).toBe("invalide");
    expect(verificationDepuisHunter({ status: "disposable" })).toBe("invalide");
    expect(verificationDepuisHunter({ status: "accept_all" })).toBe("accept_all");
    expect(verificationDepuisHunter({ status: "unknown" })).toBe("inconnu");
    expect(verificationDepuisHunter({ status: "webmail" })).toBe("inconnu");
  });

  it("ne confond pas « valide » et « accepte tout »", () => {
    expect(verificationDepuisHunter({ status: "valid", accept_all: true })).toBe("valide");
    expect(verificationDepuisHunter({ status: null, accept_all: true })).toBe("accept_all");
  });

  it("reste prudent sans réponse exploitable", () => {
    expect(verificationDepuisHunter(null)).toBe("inconnu");
    expect(verificationDepuisHunter({})).toBe("inconnu");
  });

  it("dit en clair ce que signifie chaque état", () => {
    expect(libelleVerification("valide")).toBe("adresse vérifiée");
    expect(libelleVerification(null)).toBe("adresse non vérifiée");
  });
});
