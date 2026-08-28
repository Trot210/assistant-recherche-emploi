import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="fr">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
