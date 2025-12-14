"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Btn } from "./ui";

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === "/" || pathname === "/join" || pathname === "/role") return null;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/");
  };

  // ✅ 페이지들이 대부분 bg-slate-50 쓰니까 헤더도 같이 맞추면 “이질감”이 사라짐
  // (원하면 bg-white로 다시 바꿔도 됨)
  const headerBg = "bg-slate-50";

  return (
    <header className={`border-b border-slate-100 ${headerBg}`}>
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          {/* ✅ 헤더용: 배경 없는 워드마크(SVG/투명 PNG) */}
          <div className="relative w-32 h-8">
            <Image
              src="/logo/chekcy-wordmark.svg"   // ✅ 이 파일로 교체 추천
              alt="Chekcy"
              fill
              style={{ objectFit: "contain", objectPosition: "left" }}
              priority
            />
          </div>
        </Link>

        <Btn variant="secondary" onClick={handleLogout}>
          로그아웃
        </Btn>
      </div>
    </header>
  );
}
