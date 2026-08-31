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
  icons: {
    // "?v=1" force les navigateurs à traiter l'icône comme une ressource
    // distincte de tout ce qui a pu être mis en cache avant — Chrome garde
    // son cache de favicon indépendamment du reste de la page, et même un
    // rechargement forcé ne le rafraîchit pas toujours. À incrémenter si le
    // favicon change à nouveau.
    icon: "/favicon-32.png?v=1",
    apple: "/apple-touch-icon.png?v=1",
  },
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
