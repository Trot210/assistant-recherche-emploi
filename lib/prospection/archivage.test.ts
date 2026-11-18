import { describe, expect, it } from "vitest";
import { estArchivable, type MailBoiteReception } from "./archivage";

const maintenant = new Date("2026-11-18T12:00:00Z");
const vide = new Set<string>();

function mail(extra: Partial<MailBoiteReception> = {}): MailBoiteReception {
  return { lu: true, etoile: false, date: "2026-10-01T10:00:00Z", messageId: "abc@x", ...extra };
}

describe("estArchivable", () => {
  it("archive un vieux mail lu sans étoile", () => {
    expect(estArchivable(mail(), vide, 30, maintenant)).toBe(true);
  });

  it("garde un mail non lu", () => {
    expect(estArchivable(mail({ lu: false }), vide, 30, maintenant)).toBe(false);
  });

  it("garde un mail étoilé", () => {
    expect(estArchivable(mail({ etoile: true }), vide, 30, maintenant)).toBe(false);
  });

  it("garde un mail récent", () => {
    expect(estArchivable(mail({ date: "2026-11-10T10:00:00Z" }), vide, 30, maintenant)).toBe(false);
  });

  it("garde un mail sans date lisible", () => {
    expect(estArchivable(mail({ date: null }), vide, 30, maintenant)).toBe(false);
    expect(estArchivable(mail({ date: "pas une date" }), vide, 30, maintenant)).toBe(false);
  });

  it("garde un mail protégé, par drapeau ou par identifiant", () => {
    expect(estArchivable(mail({ protege: true }), vide, 30, maintenant)).toBe(false);
    expect(estArchivable(mail(), new Set(["abc@x"]), 30, maintenant)).toBe(false);
  });
});
