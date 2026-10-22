import type { Metadata, Viewport } from "next";
import { Archivo_Black, Geist, Geist_Mono, Noto_Sans_Devanagari } from "next/font/google";
import { ServiceWorkerRegister } from "./ServiceWorkerRegister";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const notoDevanagari = Noto_Sans_Devanagari({
  variable: "--font-devanagari",
  subsets: ["devanagari"],
});

const archivoBlack = Archivo_Black({
  variable: "--font-archivo-black",
  subsets: ["latin"],
  weight: "400",
});

// Deliberately neutral: the tab title and lock-screen name must not reveal what the app is for.
export const metadata: Metadata = {
  title: "Aatman",
  description: "A quiet space to check in with yourself.",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#1a1a1a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${notoDevanagari.variable} ${archivoBlack.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background font-sans text-foreground">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
