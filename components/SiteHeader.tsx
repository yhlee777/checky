"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Badge, Btn } from "@/components/ui";

export function SiteHeader() {
  const router = useRouter();

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace("/");
    router.refresh(); // 로그아웃 후 화면 새로고침
  };

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => router.push('/')}>
          {/* ✅ 로고 (public 폴더에 checky.svg가 있어야 함) */}
          <img 
            src="/checky.svg" 
            alt="Checky Logo" 
            className="w-8 h-8" 
          />
          <div className="font-semibold tracking-tight">Checky</div>
          <Badge>MVP</Badge>
        </div>

        <Btn variant="secondary" onClick={signOut} >
          로그아웃
        </Btn>
      </div>
    </header>
  );
}