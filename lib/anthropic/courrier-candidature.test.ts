import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/anthropic/client", () => ({ anthropic: {} }));

import { assainirClassement } from "./courrier-candidature";

const base = { nature: "autre" as const, resume: "Candidature à finaliser", action_requise: true, action: "Finaliser la candidature", lien: "https://societe.example/finaliser" };
const texte = "Bonjour, finalisez votre candidature ici : https://societe.example/finaliser. Merci.";

describe("assainirClassement", () => {
  it("garde l'action et le lien quand ce dernier figure dans le message", () => {
    expect(assainirClassement(base, texte)).toEqual({
      nature: "autre",
      resume: "Candidature à finaliser",
      actionRequise: true,
      action: "Finaliser la candidature",
      lien: "https://societe.example/finaliser",
    });
  });

  it("écarte un lien que le modèle a inventé ou qui n'est pas en https", () => {
    expect(assainirClassement({ ...base, lien: "https://autre.example/piege" }, texte).lien).toBeNull();
    expect(assainirClassement({ ...base, lien: "http://societe.example/finaliser" }, "http://societe.example/finaliser").lien).toBeNull();
  });

  it("ne demande aucune action sans texte d'action", () => {
    expect(assainirClassement({ ...base, action: "  " }, texte)).toMatchObject({ actionRequise: false, action: null, lien: null });
  });

  it("une invitation à un entretien, un refus ou un message sans rapport n'ont pas d'action en plus", () => {
    for (const nature of ["entretien", "refus", "non_lie"] as const) {
      expect(assainirClassement({ ...base, nature }, texte)).toMatchObject({ actionRequise: false, action: null, lien: null });
    }
  });
});
