import { describe, expect, it } from "vitest";
import {
  bilanEntreprise,
  estEnvoye,
  modesProposes,
  peutSupprimerMessage,
  texteSuppressionEntreprise,
  texteSuppressionMessage,
} from "@/lib/prospection/suppression";

const envoye = { date_envoi: "2026-10-29" };
const brouillon = { date_envoi: null };

describe("bilanEntreprise", () => {
  it("sépare ce qui est parti de ce qui ne l'est pas", () => {
    expect(bilanEntreprise([envoye, brouillon, brouillon], 3)).toEqual({ contacts: 3, brouillons: 2, envoyes: 1 });
    expect(bilanEntreprise([], 0)).toEqual({ contacts: 0, brouillons: 0, envoyes: 0 });
  });

  it("ne compte pas un brouillon de relance abandonné comme envoyé", () => {
    expect(estEnvoye({ date_envoi: null })).toBe(false);
    expect(estEnvoye({ date_envoi: "2026-11-05" })).toBe(true);
  });
});

describe("modesProposes", () => {
  it("ne propose que la suppression quand il n'y a rien à préserver", () => {
    expect(modesProposes({ contacts: 2, brouillons: 1, envoyes: 0 }, "a_analyser")).toEqual(["supprimer"]);
  });

  it("propose de retirer de la liste d'abord quand il y a un historique", () => {
    expect(modesProposes({ contacts: 2, brouillons: 0, envoyes: 1 }, "retenue")).toEqual(["retirer", "supprimer"]);
  });

  it("ne propose plus de retirer une entreprise déjà écartée", () => {
    expect(modesProposes({ contacts: 2, brouillons: 0, envoyes: 1 }, "ecartee")).toEqual(["supprimer"]);
  });
});

describe("textes de confirmation d'entreprise", () => {
  it("annonce que l'historique est conservé quand on retire de la liste", () => {
    const texte = texteSuppressionEntreprise("Bel", { contacts: 4, brouillons: 1, envoyes: 2 }, "retirer");
    expect(texte).toContain("Ses 2 messages envoyés");
    expect(texte).toContain("conservés");
    expect(texte).toContain("1 brouillon en attente sera supprimé");
  });

  it("accorde le texte quand il n'y a qu'un message envoyé", () => {
    const texte = texteSuppressionEntreprise("Bel", { contacts: 1, brouillons: 0, envoyes: 1 }, "retirer");
    expect(texte).toContain("Son message envoyé et ses contacts sont conservés");
    expect(texte).not.toContain("brouillon");
  });

  it("liste tout ce qui disparaît en cas de suppression définitive", () => {
    const texte = texteSuppressionEntreprise("Bel", { contacts: 4, brouillons: 1, envoyes: 2 }, "supprimer");
    expect(texte).toContain("4 contacts, 1 brouillon, 2 messages envoyés");
    expect(texte).toContain("statistiques");
  });

  it("rassure quand rien d'autre n'est touché", () => {
    const texte = texteSuppressionEntreprise("Lidl", { contacts: 1, brouillons: 0, envoyes: 0 }, "supprimer");
    expect(texte).toContain("1 contact");
    expect(texte).toContain("Rien d'autre n'est touché");
  });
});

describe("messages", () => {
  it("autorise un brouillon, un message initial envoyé et un brouillon de relance", () => {
    expect(peutSupprimerMessage({ type: "initial", date_envoi: null }).ok).toBe(true);
    expect(peutSupprimerMessage({ type: "initial", date_envoi: "2026-10-29" }).ok).toBe(true);
    expect(peutSupprimerMessage({ type: "relance", date_envoi: null }).ok).toBe(true);
  });

  it("refuse de supprimer seule une relance déjà envoyée", () => {
    const resultat = peutSupprimerMessage({ type: "relance", date_envoi: "2026-11-05" });
    expect(resultat.ok).toBe(false);
    expect(resultat).toHaveProperty("raison");
  });

  it("précise ce qui est conservé et ce qui est effacé", () => {
    expect(texteSuppressionMessage({ nomEntreprise: "Bel", envoye: false, dateEnvoi: null, nbRelances: 0 })).toContain(
      "n'a pas été envoyé",
    );
    const envoyeTexte = texteSuppressionMessage({ nomEntreprise: "Bel", envoye: true, dateEnvoi: "29/10/2026", nbRelances: 2 });
    expect(envoyeTexte).toContain("le 29/10/2026");
    expect(envoyeTexte).toContain("ses 2 relances");
    expect(texteSuppressionMessage({ nomEntreprise: "Bel", envoye: true, dateEnvoi: null, nbRelances: 1 })).toContain("sa relance");
    expect(envoyeTexte).toContain("ne sont pas touchés");
  });
});
