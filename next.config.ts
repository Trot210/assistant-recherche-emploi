import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @react-pdf/renderer résout certains modules (hyphénation par langue)
  // via des imports dynamiques que le traceur de fichiers de Vercel ne
  // détecte pas statiquement — le bundling casse silencieusement en prod
  // (fonctionne en local où node_modules est présent en entier). En
  // l'excluant du bundling, Node le résout normalement au runtime.
  serverExternalPackages: ["@react-pdf/renderer"],
};

export default nextConfig;
