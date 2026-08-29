import type { Metadata } from "next";
import { Barlow_Condensed, Inter, IBM_Plex_Mono, Fraunces } from "next/font/google";
import "./globals.css";

const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-barlow-condensed",
});

// Police display pour le nom du produit ("Le Rayon") — une serif à forte
// personnalité, distincte du reste de la typographie fonctionnelle du site.
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["700", "900"],
  variable: "--font-fraunces",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["500"],
  variable: "--font-ibm-plex-mono",
});

export const metadata: Metadata = {
  title: "Assistant Recherche d'Emploi",
  description: "Centralise, score et prépare vos candidatures en Île-de-France.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${barlowCondensed.variable} ${inter.variable} ${ibmPlexMono.variable} ${fraunces.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
