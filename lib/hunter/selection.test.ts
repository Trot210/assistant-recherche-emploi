import { describe, expect, it } from "vitest";
import { choisirContactsHunter, type EmailHunter } from "@/lib/hunter/selection";

function email(surcharge: Partial<EmailHunter>): EmailHunter {
  return {
    value: "marie.dupont@bel-group.com",
    type: "personal",
    confidence: 90,
    first_name: "Marie",
    last_name: "Dupont",
    position: "Responsable Trade Marketing",
    verification: { status: "valid" },
    sources: [{ uri: "https://exemple.fr/equipe" }],
    ...surcharge,
  };
}

describe("choisirContactsHunter", () => {
  it("garde un contact nominatif pertinent avec sa source", () => {
    expect(choisirContactsHunter([email({})], [])).toEqual([
      {
        nom: "Marie Dupont",
        poste: "Responsable Trade Marketing",
        email: "marie.dupont@bel-group.com",
        source_url: "https://exemple.fr/equipe",
        verification: "valide",
      },
    ]);
  });

  it("reprend le verdict de Hunter quand il existe, et le laisse vide sinon", () => {
    const [avec] = choisirContactsHunter([email({ verification: { status: "accept_all" } })], []);
    expect(avec.verification).toBe("accept_all");
    const [sans] = choisirContactsHunter([email({ verification: null })], []);
    expect(sans.verification).toBeNull();
  });

  it("écarte adresses génériques, peu fiables, invalides et postes hors sujet", () => {
    const resultat = choisirContactsHunter(
      [
        email({ value: "a@x.fr", type: "generic" }),
        email({ value: "b@x.fr", confidence: 40 }),
        email({ value: "c@x.fr", verification: { status: "invalid" } }),
        email({ value: "d@x.fr", position: "Directeur Financier" }),
        email({ value: "e@x.fr", position: null }),
        email({ value: "g@x.fr", position: "Production Manager" }),
        email({ value: "h@x.fr", position: "Director of Corporate Communications" }),
        email({ value: "f@x.fr", first_name: null, last_name: null }),
      ],
      [],
    );
    expect(resultat).toEqual([]);
  });

  it("reconnaît les postes en anglais et en français visés", () => {
    for (const poste of ["Head of Trade Marketing", "Category Manager", "Chef de Produit", "Talent Acquisition Partner", "Acheteur", "Key Account Manager"]) {
      expect(choisirContactsHunter([email({ position: poste })], []), poste).toHaveLength(1);
    }
  });

  it("ignore les adresses déjà connues, sans tenir compte de la casse", () => {
    expect(choisirContactsHunter([email({})], ["Marie.Dupont@bel-group.com"])).toEqual([]);
  });

  it("classe d'abord les adresses vérifiées, puis par confiance, et plafonne à 5", () => {
    const emails = [
      email({ value: "1@x.fr", confidence: 99, verification: { status: "accept_all" } }),
      email({ value: "2@x.fr", confidence: 75, verification: { status: "valid" } }),
      ...[3, 4, 5, 6, 7].map((n) => email({ value: `${n}@x.fr`, confidence: 80, verification: { status: "valid" } })),
    ];
    const resultat = choisirContactsHunter(emails, []);
    expect(resultat).toHaveLength(5);
    expect(resultat.at(-1)?.email).not.toBe("1@x.fr");
    expect(resultat[0].email).not.toBe("2@x.fr");
  });
});
