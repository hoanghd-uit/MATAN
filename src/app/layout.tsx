import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AppLayout from "@/components/ui/AppLayout";

// RootLayout wraps the application with AppLayout, providing global styling and navigation.
// The labeling page inside uses a dynamic layout grid that adapts when the gaming space
// video datasource is uploaded and available.

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Annotation Session Labeler — Emotion Labeling Tool",
  description: "Upload gameplay video, audio, and telemetry logs to label player emotions frame-by-frame",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <AppLayout>{children}</AppLayout>
      </body>
    </html>
  );
}
