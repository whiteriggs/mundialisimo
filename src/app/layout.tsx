import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mundialisimo 2026",
  description: "Porra del Mundial 2026: reglas, puntuacion y apuesta demo"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>
        {children}
      </body>
    </html>
  );
}
