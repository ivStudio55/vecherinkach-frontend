import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ClientBootstrap } from "./ClientBootstrap";
import { SunRaysBackground } from "./SunRaysBackground";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Вечеринкач - Игра для вечеринок",
  description: "Интерактивная игра-викторина для компании",
  icons: {
    icon: '/favicon.ico',
  },
  other: {
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <SunRaysBackground />
        <ClientBootstrap />
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
