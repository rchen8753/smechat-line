import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LINE AI 客服",
  description: "讓您的 LINE 官方帳號 24 小時自動回覆客人問題",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant-TW">
      <body>{children}</body>
    </html>
  );
}
