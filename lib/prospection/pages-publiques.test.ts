import { describe, expect, it } from "vitest";
import {
  choisirAdresseCandidature,
  extraireEmails,
  htmlVersTexte,
  liensUtiles,
  urlPublique,
} from "@/lib/prospection/pages-publiques";

describe("urlPublique", () => {
  it("accepte un site public et refuse le réseau local ou les adresses IP", () => {
    expect(urlPublique("https://www.bel-group.com/fr")).not.toBeNull();
    for (const interdit of [
      "http://localhost:3000",
      "http://127.0.0.1/admin",
      "http://192.168.1.1",
      "http://[::1]/",
      "http://serveur.internal/",
      "http://machine/",
      "file:///etc/passwd",
      "javascript:alert(1)",
    ]) {
      expect(urlPublique(interdit), interdit).toBeNull();
    }
  });
});

describe("htmlVersTexte", () => {
  it("retire scripts, styles et balises et garde le texte visible", () => {
    const texte = htmlVersTexte(
      "<html><style>p{color:red}</style><script>var a=1</script><h1>Bel &amp; Cie</h1><p>Nos marques :</p><p>Kiri&nbsp;et Babybel</p></html>",
    );
    expect(texte).toBe("Bel & Cie\nNos marques :\nKiri et Babybel");
  });
});

describe("extraireEmails", () => {
  const html = `
    <a href="mailto:Recrutement@exemple.fr?subject=Candidature">Écrivez-nous</a>
    <p>Contact presse : presse@exemple.fr.</p>
    <p>Hébergé par support@hebergeur.com, logo@2x.png, rh@filiale.exemple.fr</p>`;

  it("garde seulement les adresses du domaine de l'entreprise, sans doublon ni ponctuation finale", () => {
    expect(extraireEmails(html, "exemple.fr").sort()).toEqual([
      "presse@exemple.fr",
      "recrutement@exemple.fr",
      "rh@filiale.exemple.fr",
    ]);
  });
});

describe("liensUtiles", () => {
  it("retient les pages carrières/contact du même site, sans fichiers ni autres sites", () => {
    const html = `
      <a href="/carrieres">Carrières</a>
      <a href="https://www.exemple.fr/contact#haut">Contact</a>
      <a href="/docs/rapport-presse.pdf">Rapport</a>
      <a href="https://autre-site.com/carrieres">Autre</a>
      <a href="/produits">Produits</a>`;
    expect(liensUtiles(html, new URL("https://exemple.fr/"))).toEqual([
      "https://exemple.fr/carrieres",
      "https://www.exemple.fr/contact",
    ]);
  });
});

describe("choisirAdresseCandidature", () => {
  it("préfère une adresse de recrutement à une adresse générique", () => {
    const pages = [
      { url: "https://exemple.fr/contact", texte: "", emails: ["contact@exemple.fr", "presse@exemple.fr"] },
      { url: "https://exemple.fr/carrieres", texte: "", emails: ["recrutement@exemple.fr"] },
    ];
    expect(choisirAdresseCandidature(pages)).toEqual({
      email: "recrutement@exemple.fr",
      source_url: "https://exemple.fr/carrieres",
    });
  });

  it("renvoie null quand aucune adresse ne concerne les candidatures", () => {
    expect(choisirAdresseCandidature([{ url: "https://exemple.fr", texte: "", emails: ["contact@exemple.fr"] }])).toBeNull();
  });
});
