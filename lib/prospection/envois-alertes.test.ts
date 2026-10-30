import { describe, expect, it } from "vitest";
import { envoiASurveiller } from "@/lib/prospection/envois-alertes";

const maintenant = new Date("2026-10-31T10:00:00Z");
const envoi = (statut: "echec" | "annule" | "envoye" | "programme", erreur: string | null, termine_at: string | null) => ({ statut, erreur, termine_at });

describe("envoiASurveiller", () => {
  it("signale un envoi annulé par le site ou échoué, récent", () => {
    expect(envoiASurveiller(envoi("annule", "Message modifié : à revalider, puis reprogrammer", "2026-10-30T18:40:00Z"), maintenant)).toBe(true);
    expect(envoiASurveiller(envoi("echec", "Aucun CV en français", "2026-10-31T08:00:00Z"), maintenant)).toBe(true);
  });

  it("ne signale pas ce que l'utilisateur a fait lui-même", () => {
    for (const motif of ["Annulé par toi", "envoyé manuellement", "Message traité à la main"]) {
      expect(envoiASurveiller(envoi("annule", motif, "2026-10-31T08:00:00Z"), maintenant)).toBe(false);
    }
  });

  it("ne signale pas un envoi réussi ou en attente, ni un incident trop ancien", () => {
    expect(envoiASurveiller(envoi("envoye", null, "2026-10-31T08:00:00Z"), maintenant)).toBe(false);
    expect(envoiASurveiller(envoi("programme", null, null), maintenant)).toBe(false);
    expect(envoiASurveiller(envoi("echec", "x", "2026-10-20T08:00:00Z"), maintenant)).toBe(false);
  });
});
