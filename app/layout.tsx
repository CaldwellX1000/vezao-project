import type { Metadata } from "next";
import { Geist, Geist_Mono, Lexend } from "next/font/google";
import "./globals.css";
import InstallPrompt from "@/components/InstallPrompt";
import { ThemeProvider } from "@/components/ThemeProvider";
import PushPrompt from '@/components/PushPrompt'
import ToastHost from '@/components/ToastHost'
import DesktopSidebar from '@/components/DesktopSidebar'
import DesktopRightRail from '@/components/DesktopRightRail'

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const lexend = Lexend({
  subsets: ["latin"],
  variable: "--font-lexend",
});



export const metadata: Metadata = {
  title: "SERULO",
  description: "Dunia Seru Versi Lo — kreativitas, humor, musik & lifestyle",
  manifest: "/manifest.json",
  themeColor: "#000000",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SERULO",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-192.png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${lexend.variable} h-full antialiased`}
    >
      <body className={`${lexend.className} min-h-full flex flex-col overflow-hidden`}>
                        <ThemeProvider>
          <DesktopSidebar />
          <div className="md:pl-[72px] lg:pl-56 h-[100dvh] flex flex-col overflow-hidden">
            {children}
          </div>
          <ToastHost />
          <InstallPrompt />
          <PushPrompt />
        </ThemeProvider>
      </body>
    </html>
  );
}
