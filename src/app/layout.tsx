import type { Metadata } from "next";
import { Inter } from 'next/font/google';
import "./globals.css";
import { Header } from "@/components/layout/header";
import { Toaster } from '@/components/ui/sonner';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: "无限小说 - AI驱动的创作平台",
  description: "释放你的想象力，与AI共同谱写无限的故事。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={inter.className}>
        <Header />
        <main className="container mx-auto">{children}</main>
        <Toaster />
      </body>
    </html>
  );
}
