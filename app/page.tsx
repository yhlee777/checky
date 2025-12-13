"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { Role } from "@/lib/types";
import { Badge, Btn, Card, Field } from "@/components/ui";

export default function Page() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");

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
    })();
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
      {/* Desktop: 2-column / Mobile: stacked */}
      <div className="mx-auto max-w-6xl min-h-screen grid grid-cols-1 md:grid-cols-2">
        {/* Left (Desktop-only brand panel) */}
        <aside className="hidden md:flex flex-col justify-between p-10">
          <div>
            <div className="flex items-center justify-between">
              <div className="font-bold tracking-tight text-xl">Checky</div>
              <Badge>MVP</Badge>
            </div>

            <div className="mt-10">
              <h1 className="text-3xl font-semibold leading-tight">
                상담을 “기억”이 아니라
                <br />
                <span className="text-slate-900">데이터 기반 흐름</span>으로.
              </h1>
              <p className="mt-4 text-sm text-slate-600 leading-relaxed">
                Checky는 공감 앱이 아닙니다.
                <br />
                상담사가 <span className="text-slate-900 font-semibold">30초 전에 훑고</span> 판단할 수 있게 만드는
                임상 보조 도구입니다.
              </p>

              <div className="mt-8 grid grid-cols-1 gap-3">
                <Feature
                  title="세션 단위 정리"
                  desc="회차 구간별로 기록을 묶어, 흐름을 한눈에."
                />
                <Feature
                  title="표 기반"
                  desc="그래프 과해석 없이 사실만 남깁니다."
                />
                <Feature
                  title="원자 저장"
                  desc="저장 한 번으로 예약·숙제·세션이 동시에 처리됩니다."
                />
              </div>
            </div>
          </div>

          <div className="text-xs text-slate-500">
            Clear · Calm · Clinical
          </div>
        </aside>

        {/* Right (Auth Panel) */}
        <section className="flex items-center justify-center p-4 md:p-10">
          <div className="w-full max-w-md">
            {/* Mobile header */}
            <div className="md:hidden mb-4 flex items-start justify-between">
              <div>
                <div className="font-bold tracking-tight text-xl">Checky</div>
                <p className="text-sm text-slate-600 mt-1">
                  상담 기록을 “세션 단위”로 정리합니다.
                </p>
              </div>
              <Badge>MVP</Badge>
            </div>

            {userId ? (
              // 로그인 되어있으면 “분기 중”
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
                  이 화면이 오래 지속되면 /role 프로필을 확인하세요.
                </p>
              </Card>
            ) : (
              // 로그인/가입 화면
              <Card className="w-full">
                {/* Desktop header inside card */}
                <div className="hidden md:flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Checky</h2>
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

            {/* Mobile footer */}
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
