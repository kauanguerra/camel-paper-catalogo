import type { Metadata, Viewport } from "next";
import "./globals.css";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: {
    default: "Camel Paper | Catálogo",
    template: "%s | Camel Paper",
  },
  description: "Catálogo interno e comercial de produtos Camel Paper",
  applicationName: "Camel Paper Catálogo",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Camel Paper Catálogo",
    statusBarStyle: "default",
  },
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
      <body>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
