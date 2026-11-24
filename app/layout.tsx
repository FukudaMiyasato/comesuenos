import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Comechismes",
  description: "Lo que escucha el ESP32, transcrito en vivo",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
