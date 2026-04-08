import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Frio Gestion",
  description: "Sistema de gestion para comercios tecnicos",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full">
      <body className="font-sans">
        <div className="min-h-screen bg-[radial-gradient(1200px_circle_at_15%_-20%,rgba(14,165,233,0.12),transparent_55%)] px-4 pb-10 pt-6 sm:px-8">
          {children}
        </div>
      </body>
    </html>
  );
}
