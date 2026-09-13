import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Finvyo | Your wealth. In view.",
  description:
    "Finvyo – Your wealth. In view. Analyze your US stock transaction statements, compute Time-Weighted Return (TWR), track real-time stock prices, and benchmark against S&P 500, Nasdaq, and Nifty 50.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#0b0f19] text-slate-100 antialiased selection:bg-blue-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
