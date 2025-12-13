import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
// ⬇️ [추가] 방금 만든 헤더 가져오기
import { SiteHeader } from "@/components/SiteHeader";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Checky",
  description: "Clinical Assistant for Counselors",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={inter.className}>
        {/* ⬇️ [추가] 여기에 헤더를 넣으면 모든 페이지 위에 뜹니다 */}
        <SiteHeader />
        
        {/* children이 실제 페이지 내용입니다 */}
        {children}
      </body>
    </html>
  );
}