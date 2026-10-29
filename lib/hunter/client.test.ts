import { describe, expect, it } from "vitest";
import { nomPourHunter } from "@/lib/hunter/client";

describe("nomPourHunter", () => {
  it("retire parenthèses, formes juridiques et mots génériques de la raison sociale", () => {
    expect(nomPourHunter("ORANGINA SCHWEPPES FRANCE (ORANGINA SUNTORY FRANCE)")).toBe("ORANGINA SCHWEPPES");
    expect(nomPourHunter("HEINEKEN ENTREPRISE (H.E.)")).toBe("HEINEKEN");
    expect(nomPourHunter("SHOWROOMPRIVE.COM")).toBe("SHOWROOMPRIVE");
    expect(nomPourHunter("CAMPARI FRANCE (CAMPARI FRANCE) (CF)")).toBe("CAMPARI");
  });
});
