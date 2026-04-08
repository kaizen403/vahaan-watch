import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tablet — Vaahan",
  description:
    "Field tablet interface for real-time ANPR surveillance and alert monitoring",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <meta name="theme-color" content="#0a0a0a" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
