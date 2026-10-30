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
    expect(bilanEntreprise([envoye, brouillon, brouillon], 3)).toEqual({ contacts: 3, brouillons: 2, envoyes: 1, programmes: 0 });
    expect(bilanEntreprise([], 0)).toEqual({ contacts: 0, brouillons: 0, envoyes: 0, programmes: 0 });
  });

  it("ne compte pas un brouillon de relance abandonné comme envoyé", () => {
    expect(estEnvoye({ date_envoi: null })).toBe(false);
    expect(estEnvoye({ date_envoi: "2026-11-05" })).toBe(true);
  });
});

describe("modesProposes", () => {
  it("ne propose que la suppression quand il n'y a rien à préserver", () => {
    expect(modesProposes({ contacts: 2, brouillons: 1, envoyes: 0, programmes: 0 }, "a_analyser")).toEqual(["supprimer"]);
  });

  it("propose de retirer de la liste d'abord quand il y a un historique", () => {
    expect(modesProposes({ contacts: 2, brouillons: 0, envoyes: 1, programmes: 0 }, "retenue")).toEqual(["retirer", "supprimer"]);
  });

  it("ne propose plus de retirer une entreprise déjà écartée", () => {
    expect(modesProposes({ contacts: 2, brouillons: 0, envoyes: 1, programmes: 0 }, "ecartee")).toEqual(["supprimer"]);
  });
});

describe("textes de confirmation d'entreprise", () => {
  it("annonce que l'historique est conservé quand on retire de la liste", () => {
    const texte = texteSuppressionEntreprise("Bel", { contacts: 4, brouillons: 1, envoyes: 2, programmes: 0 }, "retirer");
    expect(texte).toContain("Ses 2 messages envoyés");
    expect(texte).toContain("conservés");
    expect(texte).toContain("1 brouillon en attente sera supprimé");
  });

  it("accorde le texte quand il n'y a qu'un message envoyé", () => {
    const texte = texteSuppressionEntreprise("Bel", { contacts: 1, brouillons: 0, envoyes: 1, programmes: 0 }, "retirer");
    expect(texte).toContain("Son message envoyé et ses contacts sont conservés");
    expect(texte).not.toContain("brouillon");
  });

  it("liste tout ce qui disparaît en cas de suppression définitive", () => {
    const texte = texteSuppressionEntreprise("Bel", { contacts: 4, brouillons: 1, envoyes: 2, programmes: 0 }, "supprimer");
    expect(texte).toContain("4 contacts, 1 brouillon, 2 messages envoyés");
    expect(texte).toContain("statistiques");
  });

  it("rassure quand rien d'autre n'est touché", () => {
    const texte = texteSuppressionEntreprise("Lidl", { contacts: 1, brouillons: 0, envoyes: 0, programmes: 0 }, "supprimer");
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

describe("envois programmés dans les confirmations", () => {
  it("prévient qu'un message supprimé emporte son envoi programmé", () => {
    const texte = texteSuppressionMessage({
      nomEntreprise: "Bel",
      envoye: false,
      dateEnvoi: null,
      nbRelances: 0,
      programmeLe: "lundi 2 novembre 2026 à 16 h 49 (heure de Paris)",
    });
    expect(texte).toContain("Son envoi programmé (lundi 2 novembre 2026 à 16 h 49 (heure de Paris)) sera annulé");
    expect(texte).toContain("il ne partira pas");
  });

  it("ne parle pas d'envoi programmé quand il n'y en a pas", () => {
    expect(texteSuppressionMessage({ nomEntreprise: "Bel", envoye: false, dateEnvoi: null, nbRelances: 0 })).not.toContain("programmé");
  });

  it("compte les envois programmés d'une entreprise dans le bilan et les textes", () => {
    const bilan = bilanEntreprise([{ date_envoi: null }, { date_envoi: null }], 1, 2);
    expect(bilan.programmes).toBe(2);
    const supprimer = texteSuppressionEntreprise("Bel", bilan, "supprimer");
    expect(supprimer).toContain("2 envois programmés (qui ne partiront pas)");
    const retirer = texteSuppressionEntreprise("Bel", { ...bilan, envoyes: 1 }, "retirer");
    expect(retirer).toContain("Ses 2 envois programmés seront annulés");
    expect(texteSuppressionEntreprise("Bel", { ...bilan, programmes: 1, envoyes: 1 }, "retirer")).toContain("Son envoi programmé sera annulé");
  });
});
