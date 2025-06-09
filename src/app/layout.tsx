import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/layout/Header";

export const metadata: Metadata = {
  title: "无限小说",
  description: "无限创作，永不枯竭",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Header />
        {children}
      </body>
    </html>
  );
}
