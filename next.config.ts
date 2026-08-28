import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @react-pdf/renderer (via sa dépendance pdfkit) charge ses fichiers de
  // polices standard (Helvetica, etc.) par un require() dont le chemin est
  // construit dynamiquement — le traceur de fichiers de Vercel ne le
  // détecte pas statiquement et ne copie donc pas ces fichiers dans le
  // bundle déployé (confirmé en prod : "Cannot find module
  // '.../pdfkit/js/standard-fonts/Helvetica.cjs'", alors que ça fonctionne
  // en local où node_modules est présent en entier). On force leur
  // inclusion explicitement pour les routes qui génèrent des PDF.
  serverExternalPackages: ["@react-pdf/renderer"],
  outputFileTracingIncludes: {
    "/api/documents/cv": [
      "./node_modules/pdfkit/js/**/*",
      "./node_modules/@react-pdf/**/*",
    ],
    "/api/documents/lettre": [
      "./node_modules/pdfkit/js/**/*",
      "./node_modules/@react-pdf/**/*",
    ],
  },
};

export default nextConfig;
