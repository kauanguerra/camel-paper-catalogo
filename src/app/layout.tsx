import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Camel Paper | Catálogo",
    template: "%s | Camel Paper",
  },
  description: "Catálogo interno e comercial de produtos Camel Paper",
  applicationName: "Camel Paper Catálogo",
};

export const viewport: Viewport = {
  themeColor: "#831d0d",
  colorScheme: "light",
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
