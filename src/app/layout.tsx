import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { Header } from "@/components/layout/Header";
import { ClientProviders } from "@/components/layout/client-providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "无限小说家",
  description: "您的专属AI小说创作助手",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={inter.className}>
        <ClientProviders>
        <Header />
        <main className="container mx-auto">{children}</main>
        <Toaster />
        </ClientProviders>
      </body>
    </html>
  );
}
