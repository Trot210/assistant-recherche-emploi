import { describe, expect, it } from "vitest";
import { avertissementAdresse, avertissementInterlocuteur } from "./avertissements-ecriture";

const contact = (surcharge: Record<string, unknown> = {}) =>
  ({ nom: "Contact Un", email: "a@societe.example", email_verification: null, origine: "hunter", ...surcharge }) as never;

describe("avertissementAdresse", () => {
  it("n'avertit pas pour une adresse vérifiée, publique ou saisie à la main", () => {
    expect(avertissementAdresse(contact({ email_verification: "valide" }))).toBeNull();
    expect(avertissementAdresse(contact({ origine: "page_publique" }))).toBeNull();
    expect(avertissementAdresse(contact({ origine: "manuel" }))).toBeNull();
    expect(avertissementAdresse(null)).toBeNull();
    expect(avertissementAdresse(contact({ email: null }))).toBeNull();
  });

  it("avertit pour une adresse non vérifiée, accept-all ou déduite", () => {
    expect(avertissementAdresse(contact())).toMatch(/pas vérifiée/);
    expect(avertissementAdresse(contact({ email_verification: "accept_all" }))).toMatch(/Contact Un/);
    expect(avertissementAdresse(contact({ origine: "devine", email_verification: "inconnu" }))).not.toBeNull();
  });
});

describe("avertissementInterlocuteur", () => {
  const contacts = [
    { id: "c1", nom: "Première Personne" },
    { id: "c2", nom: "Deuxième Personne" },
  ];
  const base = { nomEntreprise: "Société Test", contacts, aujourdhui: "2026-11-10" };
  const envoye = (surcharge: Record<string, unknown> = {}) =>
    ({ type: "initial", statut: "envoyee", contact_id: "c1", date_envoi: "2026-11-02", reponse_type: null, ...surcharge }) as never;

  it("avertit quand une autre personne a reçu un message il y a moins de 21 jours", () => {
    const r = avertissementInterlocuteur({ ...base, messages: [envoye()], contactId: "c2" });
    expect(r).toMatch(/Première Personne/);
    expect(r).toMatch(/8 jours/);
  });

  it("n'avertit pas pour la même personne, un envoi ancien ou un message non distribué", () => {
    expect(avertissementInterlocuteur({ ...base, messages: [envoye()], contactId: "c1" })).toBeNull();
    expect(avertissementInterlocuteur({ ...base, messages: [envoye({ date_envoi: "2026-10-01" })], contactId: "c2" })).toBeNull();
    expect(avertissementInterlocuteur({ ...base, messages: [envoye({ reponse_type: "non_distribue", statut: "sans_suite" })], contactId: "c2" })).toBeNull();
    expect(avertissementInterlocuteur({ ...base, messages: [envoye({ type: "relance" })], contactId: "c2" })).toBeNull();
  });

  it("avertit aussi quand un message est déjà en préparation", () => {
    const r = avertissementInterlocuteur({ ...base, messages: [envoye({ statut: "a_valider", date_envoi: null })], contactId: "c2" });
    expect(r).toMatch(/en préparation/);
  });

  it("compte une réponse reçue récemment comme un interlocuteur actif", () => {
    expect(avertissementInterlocuteur({ ...base, messages: [envoye({ statut: "reponse_recue" })], contactId: null })).not.toBeNull();
  });
});
