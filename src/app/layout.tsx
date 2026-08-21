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

function resolveConvexUrlForProvider(): string | undefined {
  if (process.env.NEXT_PUBLIC_CONVEX_URL) {
    return process.env.NEXT_PUBLIC_CONVEX_URL;
  }
  // Keep ConvexProvider in the tree during `npm run build` prerender.
  if (process.env.MULTIPLICA_ALLOW_PLACEHOLDER_ENV === "1") {
    return "http://127.0.0.1:3210";
  }
  return undefined;
}

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
        <ClerkProvider
          signInUrl="/login"
          signUpUrl="/login"
          signInFallbackRedirectUrl="/dashboard"
          signUpFallbackRedirectUrl="/acceso-denegado"
          afterSignOutUrl="/login"
        >
          <ConvexClientProvider convexUrl={resolveConvexUrlForProvider()}>
            {children}
          </ConvexClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
