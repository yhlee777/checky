"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { Role } from "@/lib/types";
import { Card } from "@/components/ui";

function routeByRole(r: Role) {
  if (r === "counselor") return "/c";
  if (r === "patient") return "/p";
  // ✅ 센터장 라우트 (원하는 경로로 바꾸면 됨)
  return "/admin";
}

export default function RolePage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const uid = data.session?.user?.id ?? null;
      if (!uid) {
        router.replace("/");
        return;
      }
      setUserId(uid);

      // 이미 role 있으면 바로 이동 (다시 안 물어봄)
      const { data: prof } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", uid)
        .single();

      if (prof?.role) {
        const r = prof.role as Role;
        router.replace(routeByRole(r));
      }
    });
  }, [router]);

  const pick = async (role: Role) => {
  if (!userId) return;

  const { error } = await supabase
    .from("profiles")
    .upsert(
      {
        user_id: userId,
        role,
      },
      { onConflict: "user_id" } // ✅ PK 충돌 시 update
    );

  if (error) {
    alert(error.message);
    return;
  }

  router.replace(routeByRole(role));
};

  if (!userId) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="max-w-2xl">
        <h1 className="text-xl font-bold text-slate-900">
          Checky를 어떻게 사용하시나요?
        </h1>
        <p className="text-sm text-slate-600 mt-2">
          역할은 한 번 선택하면 바꾸지 않습니다.
        </p>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
          <button
            onClick={() => pick("counselor")}
            className="border border-slate-200 rounded-2xl p-5 text-left hover:bg-slate-50 transition"
          >
            <div className="text-base font-semibold text-slate-900">
              상담자입니다
            </div>
            <div className="text-sm text-slate-600 mt-1">
              여러 내담자의 기록을 한눈에 관리합니다
            </div>
          </button>

          <button
            onClick={() => pick("patient")}
            className="border border-slate-200 rounded-2xl p-5 text-left hover:bg-slate-50 transition"
          >
            <div className="text-base font-semibold text-slate-900">
              내담자입니다
            </div>
            <div className="text-sm text-slate-600 mt-1">
              상담을 돕기 위한 최소 기록만 합니다
            </div>
          </button>

          {/* ✅ 센터장 추가 */}
          <button
            onClick={() => pick("center_admin")}
            className="border border-slate-200 rounded-2xl p-5 text-left hover:bg-slate-50 transition"
          >
            <div className="text-base font-semibold text-slate-900">
              센터장입니다
            </div>
            <div className="text-sm text-slate-600 mt-1">
              센터 단위 리스크 인박스/운영을 관리합니다
            </div>
          </button>
        </div>
      </Card>
    </div>
  );
}
