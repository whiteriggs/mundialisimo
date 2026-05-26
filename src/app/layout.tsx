import type { Metadata, Viewport } from "next";
import "./globals.css";
import PwaRegister from "@/components/PwaRegister";

const bp = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "Mundialisimo 2026",
  description: "Porra del Mundial 2026: reglas, puntuacion y apuesta demo",
  manifest: `${bp}/manifest.json`,
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Mundialisimo",
  },
  icons: {
    apple: `${bp}/icons/apple-touch-icon.png?v=4`,
    icon: [
      { url: `${bp}/icons/icon-192x192.png?v=4`, sizes: "192x192", type: "image/png" },
      { url: `${bp}/icons/icon-512x512.png?v=4`, sizes: "512x512", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0d10",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
