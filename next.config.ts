import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',      // 👈 필수: 정적 내보내기 설정
  images: {
    unoptimized: true,   // 👈 필수: 모바일 앱에서 이미지 깨짐 방지
  },
};

export default nextConfig;