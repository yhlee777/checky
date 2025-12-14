import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',      // 👈 필수: 정적 내보내기 설정
  images: {
    unoptimized: true,   // 👈 필수: 모바일 앱에서 이미지 깨짐 방지
  },
  // ⬇️ 여기부터 추가된 headers 설정입니다.
  async headers() {
    return [
      {
        // /logo 폴더 안에 있는 모든 .svg 파일에 대해
        source: '/logo/:path*.svg',
        headers: [
          {
            key: 'Content-Type',
            // "이 파일은 SVG 이미지입니다"라고 브라우저에 알려줍니다.
            value: 'image/svg+xml',
          },
        ],
      },
    ];
  },
  // ⬆️ 여기까지 추가된 부분입니다.
};

export default nextConfig;