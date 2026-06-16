import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "샐러리아 침산점 · 선결제 주문",
  description: "샐러리아 침산점 선결제 주문 시스템",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="h-full">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
      </head>
      <body className="min-h-full bg-white">{children}</body>
    </html>
  );
}
