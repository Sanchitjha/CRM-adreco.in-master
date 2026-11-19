import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Adreco CRM",
  description: "Internal sales CRM for Adreco Engineering Pvt Ltd",
  applicationName: "Adreco CRM",
  // "Add to Home Screen" on an iPhone opens the CRM full screen, like an app, under this name.
  appleWebApp: { capable: true, title: "Adreco CRM", statusBarStyle: "default" },
};

// Pinch-zoom stays allowed (people with weak eyesight need it). `viewportFit: cover` lets the page use the whole
// screen on a phone with a notch; the layout keeps its content out of the notch with the safe-area insets.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0d9488",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
