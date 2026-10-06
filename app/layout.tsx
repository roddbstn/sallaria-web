import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import FirebaseInit from "@/components/FirebaseInit";

export const metadata: Metadata = {
  title: "선결제 주문",
  description: "선결제 주문 시스템",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="h-full">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
      </head>
      <body className="min-h-full" style={{ backgroundColor: '#E5E5E5' }}>
        <FirebaseInit />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
