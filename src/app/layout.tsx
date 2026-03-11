import type { Metadata } from "next";
import { Archivo, Space_Mono } from "next/font/google";

import "./globals.css";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "Transport & Warehouse Barcode Verification",
  description: "Cloud platform for stock checks, loading checks, barcode labels, and scan reconciliation.",
  applicationName: "Warehouse Scan",
  appleWebApp: {
    capable: true,
    title: "Warehouse Scan",
    statusBarStyle: "default",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${archivo.variable} ${spaceMono.variable} antialiased`}>{children}</body>
    </html>
  );
}
