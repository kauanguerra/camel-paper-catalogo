import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Camel Paper | Catálogo",
  description: "Catálogo interno de produtos Camel Paper",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
