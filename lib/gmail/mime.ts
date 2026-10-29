export interface PieceJointe {
  nomFichier: string;
  contentType: string;
  contenu: Buffer;
}

export interface MessageMime {
  a: string;
  objet: string;
  corps: string;
  pieceJointe?: PieceJointe;
}

// Les en-têtes ne sont qu'ASCII : un objet accentué doit passer en
// « encoded-word » (RFC 2047), sinon Gmail affiche des caractères cassés.
export function encoderEnTete(valeur: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7e]*$/.test(valeur)) return valeur;
  return `=?UTF-8?B?${Buffer.from(valeur, "utf-8").toString("base64")}?=`;
}

// Le contenu base64 est coupé à 76 caractères par ligne, comme l'exige la RFC 2045.
function base64EnLignes(contenu: Buffer | string): string {
  const base64 = Buffer.from(contenu).toString("base64");
  return base64.match(/.{1,76}/g)?.join("\r\n") ?? "";
}

// Un saut de ligne dans l'adresse ou l'objet permettrait d'injecter un
// en-tête (Bcc:, etc.) dans le brouillon : on refuse plutôt que de nettoyer.
function refuserSautsDeLigne(nom: string, valeur: string) {
  if (/[\r\n]/.test(valeur)) throw new Error(`${nom} ne peut pas contenir de saut de ligne`);
}

export function construireMime(message: MessageMime): string {
  refuserSautsDeLigne("Le destinataire", message.a);
  refuserSautsDeLigne("L'objet", message.objet);

  const enTetes = [
    `To: ${message.a}`,
    `Subject: ${encoderEnTete(message.objet)}`,
    "MIME-Version: 1.0",
  ];
  const corpsTexte = [
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64EnLignes(message.corps.replace(/\r?\n/g, "\r\n")),
  ];

  if (!message.pieceJointe) {
    return [...enTetes, ...corpsTexte].join("\r\n");
  }

  const frontiere = `rayon_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  const { nomFichier, contentType, contenu } = message.pieceJointe;
  refuserSautsDeLigne("Le nom de la pièce jointe", nomFichier);

  return [
    ...enTetes,
    `Content-Type: multipart/mixed; boundary="${frontiere}"`,
    "",
    `--${frontiere}`,
    ...corpsTexte,
    `--${frontiere}`,
    `Content-Type: ${contentType}; name="${encoderEnTete(nomFichier)}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${encoderEnTete(nomFichier)}"`,
    "",
    base64EnLignes(contenu),
    `--${frontiere}--`,
    "",
  ].join("\r\n");
}

// L'API Gmail attend le message complet en base64 « url-safe ».
export function versBase64Url(mime: string): string {
  return Buffer.from(mime, "utf-8").toString("base64url");
}
