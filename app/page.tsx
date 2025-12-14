"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { Role } from "@/lib/types";
import { Badge, Btn, Card, Field } from "@/components/ui";
import { LocalNotifications } from "@capacitor/local-notifications";

export default function Page() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");

  // ✅ 알림 권한 요청 + 23:00 반복 알림 예약
  useEffect(() => {
    const setupNotifications = async () => {
      try {
        const permission = await LocalNotifications.requestPermissions();

        if (permission.display === "granted") {
          // 중복 예약 방지
          await LocalNotifications.cancel({ notifications: [{ id: 1 }] });

          await LocalNotifications.schedule({
            notifications: [
              {
                title: "오늘 하루는 어땠나요?",
                body: "Checky에 오늘의 기록을 짧게 남겨주세요 🌙",
                id: 1,
                schedule: {
                  on: { hour: 23, minute: 0 },
                  allowWhileIdle: true,
                },
              },
            ],
          });

          console.log("🔔 매일 밤 11시 알림 예약 완료");
        }
      } catch (error) {
        // 웹/미지원 환경은 무시
        console.error("알림 설정 중 오류:", error);
      }
    };

    setupNotifications();
  }, []);

  // ✅ 세션 확인
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user?.id ?? null;
      setUserId(uid);
      setChecking(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setUserId(s?.user?.id ?? null);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  // ✅ 로그인 상태면 role 보고 라우팅
  useEffect(() => {
    if (!userId) return;

    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", userId)
        .single();

      if (error || !data?.role) {
        router.replace("/role");
        return;
      }

      const role = data.role as Role;
      router.replace(role === "counselor" ? "/c" : "/p");
    })().catch(console.error);
  }, [userId, router]);

  const signIn = async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: pw,
    });
    if (error) alert(error.message);
  };

  const signUp = async () => {
    const { error } = await supabase.auth.signUp({ email, password: pw });
    if (error) alert(error.message);
    else alert("가입 완료. 로그인하세요.");
  };

  if (checking) return null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-6xl min-h-screen grid grid-cols-1 md:grid-cols-2">
        {/* Left: Brand (Desktop only) */}
        <aside className="hidden md:flex flex-col justify-between p-10">
          <div>
            <div className="flex items-center justify-between">
              <div className="font-bold tracking-tight text-xl">Checky</div>
              <Badge>MVP</Badge>
            </div>

            <div className="mt-10">
              {/* ✅ Hero */}
              <h1 className="text-3xl font-semibold leading-tight">
                상담사가 <span className="text-slate-900">30초 만에</span>
                <br />
                지난 세션 맥락을 훑게 합니다.
              </h1>

              {/* ✅ Sub (한 번만) */}
              <p className="mt-4 text-sm text-slate-600 leading-relaxed">
                “기억” 대신 <span className="font-semibold text-slate-900">세션 단위 데이터</span>로 정리합니다.
                <br />
                기록은 짧게, 판단은 빠르게.
              </p>

              {/* ✅ One-line scenario (Feature 위) */}
              <p className="mt-6 text-sm text-slate-700 leading-relaxed">
                <span className="font-semibold">세션 30초 전</span>, 구간만 고르면
                <br />
                지난 흐름과 숙제·예약까지 <span className="font-semibold">한 번에 정리됩니다.</span>
              </p>

              {/* ✅ Features (더 짧게) */}
              <div className="mt-8 grid grid-cols-1 gap-3">
                <Feature
                  title="세션 단위 흐름"
                  desc="회차 구간으로 자동 묶어 상담 전 스캔이 가능합니다."
                />
                <Feature
                  title="표 중심 요약"
                  desc="강도·수면·약·숙제를 사실 중심으로 정리합니다."
                />
                <Feature
                  title="한 번에 저장"
                  desc="예약·숙제·세션 기록을 저장 한 번으로 처리합니다."
                />
              </div>

              <div className="mt-6 text-xs text-slate-500">
                For counselors: prep fast, decide with context.
              </div>
            </div>
          </div>

          <div className="text-xs text-slate-500">Clear · Calm · Clinical</div>
        </aside>

        {/* Right: Auth */}
        <section className="flex items-center justify-center p-4 md:p-10">
          <div className="w-full max-w-md">
            {/* Mobile header */}
            <div className="md:hidden mb-4 flex items-start justify-between">
              <div>
                <div className="font-bold tracking-tight text-xl">Checky</div>
                <p className="text-sm text-slate-600 mt-1">
                  상담사가 30초 만에 세션 맥락을 파악하는 기록 도구
                </p>
              </div>
              <Badge>MVP</Badge>
            </div>

            {userId ? (
              <Card className="w-full">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">역할 확인 중</h2>
                    <p className="text-sm text-slate-600 mt-1">
                      프로필을 확인하고 화면을 이동합니다…
                    </p>
                  </div>
                  <Badge>MVP</Badge>
                </div>

                <div className="mt-5">
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full w-1/3 bg-emerald-500 rounded-full animate-pulse" />
                  </div>
                </div>

                <p className="mt-4 text-xs text-slate-500">
                  오래 걸리면 /role 프로필을 확인하세요.
                </p>
              </Card>
            ) : (
              <Card className="w-full">
                {/* Desktop title inside card */}
                <div className="hidden md:flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">로그인</h2>
                    <p className="text-sm text-slate-600 mt-1">
                      상담 기록을 “세션 단위”로 정리합니다.
                    </p>
                  </div>
                  <Badge>MVP</Badge>
                </div>

                <div className="mt-2 md:mt-6 space-y-2">
                  <Field
                    placeholder="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    inputMode="email"
                  />
                  <Field
                    type="password"
                    placeholder="password"
                    value={pw}
                    onChange={(e) => setPw(e.target.value)}
                    autoComplete="current-password"
                  />
                </div>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Btn onClick={signIn}>로그인</Btn>
                  <Btn variant="secondary" onClick={signUp}>
                    가입
                  </Btn>
                </div>

                <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                  <span>문제 발생 시: env / Supabase URL 확인</span>
                  <span className="hidden md:inline">Clinical UI</span>
                </div>
              </Card>
            )}

            <p className="md:hidden text-center text-xs text-slate-500 mt-4">
              Clear · Calm · Clinical
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

function Feature({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="text-sm text-slate-600 mt-1 leading-relaxed">{desc}</div>
    </div>
  );
}
