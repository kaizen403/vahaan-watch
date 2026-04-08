import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vaahan",
  description: "Vehicle surveillance and ANPR platform for intelligent fleet monitoring",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
