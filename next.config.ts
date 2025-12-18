import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ❌ 제거: 서버 API / Route Handler 쓰면 절대 있으면 안 됨
  // output: "export",

  images: {
    unoptimized: true, // ✅ 유지 (모바일/웹뷰 안전)
  },

  // ✅ SVG Content-Type 지정은 서버 배포에서도 문제 없음 → 유지
  async headers() {
    return [
      {
        source: "/logo/:path*.svg",
        headers: [
          {
            key: "Content-Type",
            value: "image/svg+xml",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
