import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Archivo, Inter } from "next/font/google";

import { ConvexClientProvider } from "@/components/convex/convex-client-provider";

import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const archivo = Archivo({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "MULTIPLICA",
    template: "%s · MULTIPLICA",
  },
  description: "Sistema de gestión integral de la Visión G12",
  icons: {
    icon: [{ url: "/brand/app-icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/brand/app-icon.svg" }],
    shortcut: ["/brand/app-icon.svg"],
  },
  applicationName: "MULTIPLICA",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${inter.variable} ${archivo.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ClerkProvider>
          <ConvexClientProvider>{children}</ConvexClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
