import nodemailer from "nodemailer";
import { describe, expect, it } from "vitest";
import { construireOptions } from "@/lib/mail/smtp";

// Transport de test de nodemailer : construit le message MIME complet en
// mémoire, sans réseau, pour inspecter ce qui partirait réellement.
async function rendre(options: ReturnType<typeof construireOptions>): Promise<string> {
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" });
  const info = await transport.sendMail(options);
  return (info.message as Buffer).toString("utf-8");
}

describe("construireOptions", () => {
  const cv = Buffer.from("%PDF-1.3 contenu du cv");

  it("produit un message avec destinataire, objet, corps et CV en pièce jointe", async () => {
    const mime = await rendre(
      construireOptions(
        {
          a: "marie@exemple.fr",
          objet: "Candidature spontanée – Category Manager",
          corps: "Bonjour Marie,\n\nÉlan créatif.",
          nomExpediteur: "Lucien Tamba",
          pieceJointe: { nomFichier: "CV Lucien Tamba.pdf", contenu: cv },
        },
        "lucien@gmail.com",
      ),
    );
    expect(mime).toContain("To: marie@exemple.fr");
    expect(mime).toContain("From: Lucien Tamba <lucien@gmail.com>");
    expect(mime).toContain("Content-Type: multipart/mixed");
    expect(mime).toContain('filename="CV Lucien Tamba.pdf"');
    expect(mime).toContain("Content-Type: application/pdf");
    expect(mime).toContain(cv.toString("base64"));
  });

  it("envoie sans pièce jointe quand aucun CV n'est fourni", async () => {
    const mime = await rendre(construireOptions({ a: "marie@exemple.fr", objet: "Relance", corps: "Texte" }, "lucien@gmail.com"));
    expect(mime).not.toContain("multipart/mixed");
    expect(mime).not.toContain("Content-Disposition: attachment");
  });

  it("place une relance dans le fil du message d'origine", async () => {
    const mime = await rendre(
      construireOptions(
        { a: "marie@exemple.fr", objet: "Re: Candidature", corps: "Texte", repondA: "<abc@gmail.com>" },
        "lucien@gmail.com",
      ),
    );
    expect(mime).toContain("In-Reply-To: <abc@gmail.com>");
    expect(mime).toContain("References: <abc@gmail.com>");
  });

  it("refuse une injection d'en-tête par saut de ligne", () => {
    expect(() => construireOptions({ a: "x@y.fr\nBcc: autre@y.fr", objet: "O", corps: "C" }, "l@g.com")).toThrow(/saut de ligne/);
    expect(() => construireOptions({ a: "x@y.fr", objet: "O\r\nBcc: z@y.fr", corps: "C" }, "l@g.com")).toThrow(/saut de ligne/);
  });
});
