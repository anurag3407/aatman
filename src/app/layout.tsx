import type { Metadata, Viewport } from "next";
import { Fraunces, Geist, Geist_Mono, Noto_Sans_Devanagari, Noto_Serif_Devanagari, Unbounded } from "next/font/google";
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

const serifDisplay = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
});

const serifDevanagari = Noto_Serif_Devanagari({
  variable: "--font-serif-devanagari",
  subsets: ["devanagari"],
  display: "swap",
});

const unbounded = Unbounded({
  variable: "--font-unbounded",
  subsets: ["latin"],
});

// Deliberately neutral: the tab title and lock-screen name must not reveal what the app is for.
export const metadata: Metadata = {
  title: "Aatman",
  description: "A quiet space to check in with yourself.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f0e5" },
    { media: "(prefers-color-scheme: dark)", color: "#151915" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${notoDevanagari.variable} ${serifDisplay.variable} ${serifDevanagari.variable} ${unbounded.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
