import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
// ⬇️ [유지] 기존 헤더 컴포넌트
import { SiteHeader } from "@/components/SiteHeader";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Checky - 마음 챙김 파트너",
  description: "Clinical Assistant for Counselors",
  // ⬇️ [추가] 아이콘 설정 (public/logo/icon.png 파일을 사용한다고 가정)
  icons: {
    icon: "/logo/icon.png", // 브라우저 탭 아이콘 (favicon) - 정사각형 권장
    apple: "/logo/icon.png", // iOS 홈 화면 아이콘 - 정사각형 권장
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={inter.className}>
        {/* ⬇️ [유지] 헤더 */}
        <SiteHeader />
        
        {/* ⬇️ [유지] 페이지 내용 */}
        {children}
      </body>
    </html>
  );
}