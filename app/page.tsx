// app/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { Role } from "@/lib/types";
import { Badge, Btn, Card, Field } from "@/components/ui";
import { LocalNotifications } from "@capacitor/local-notifications";

function isoToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function Page() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  // 🔄 DB 작업 중인지 확인 (리다이렉트 잠금)
  const [isProcessing, setIsProcessing] = useState(false);

  // 탭 상태: 'patient'(내담자) 또는 'counselor'(상담사) 또는 'center_admin'(센터장)
  const [authMode, setAuthMode] = useState<"patient" | "counselor" | "center_admin">(
    "patient"
  );

  // 화면 모드: false=로그인, true=회원가입(등록)
  const [isSignUpMode, setIsSignUpMode] = useState(false);

  // 공통 입력 상태
  const [code, setCode] = useState(""); // 내담자용 초대코드
  const [email, setEmail] = useState(""); // 상담사/센터장 이메일
  const [pw, setPw] = useState(""); // 공통 비밀번호

  const [todayDone, setTodayDone] = useState<boolean | null>(null);
  const [feedback, setFeedback] = useState("");

  // ✅ 알림 설정
  useEffect(() => {
    const setupNotifications = async () => {
      try {
        const permission = await LocalNotifications.requestPermissions();
        if (permission.display === "granted") {
          await LocalNotifications.cancel({ notifications: [{ id: 1 }] });
          await LocalNotifications.schedule({
            notifications: [
              {
                title: "오늘 하루는 어땠나요?",
                body: "Checky에 오늘의 기록을 짧게 남겨주세요 🌙",
                id: 1,
                schedule: { on: { hour: 23, minute: 0 }, allowWhileIdle: true },
              },
            ],
          });
          console.log("🔔 매일 밤 11시 알림 예약 완료");
        }
      } catch (error) {
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

  // ✅ 라우팅 로직 (isProcessing이 true면 대기)
  useEffect(() => {
    if (!userId || isProcessing) return;

    (async () => {
      // 1) role 확인
      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("role, center_id")
        .eq("user_id", userId)
        .single();

      if (profErr || !prof?.role) {
        router.replace("/role");
        return;
      }

      const role = prof.role as Role;

      // ✅ 센터장: 센터 연결 여부로 분기
      if (role === "center_admin") {
        const cid = prof.center_id ?? null;
        router.replace(cid ? "/admin/center" : "/center/join");
        return;
      }

      // 상담사면 바로 이동
      if (role === "counselor") {
        router.replace("/c");
        return;
      }

      // 2) 내담자면: 연결 확인
      const { data: link, error: linkErr } = await supabase
        .from("patient_links")
        .select("patient_id")
        .eq("user_id", userId)
        .single();

      const pid = link?.patient_id ?? null;

      // 연결 없으면 /p (여기서 머무름)
      if (linkErr || !pid) {
        setTodayDone(null);
        router.replace("/p");
        return;
      }

      // 3) 오늘 기록 확인
      const today = isoToday();
      const { data: todayLog, error: logErr } = await supabase
        .from("patient_logs")
        .select("id")
        .eq("patient_id", pid)
        .eq("log_date", today)
        .maybeSingle();

      const done = !logErr && !!todayLog?.id;
      setTodayDone(done);

      router.replace(done ? "/p/insights" : "/p");
    })().catch(() => {
      router.replace("/p");
    });
  }, [userId, router, isProcessing]);

  const getPatientEmail = (code: string) => `${code}@patient.checky`;

  // 🟢 통합 액션 핸들러 (인증 + DB 세팅)
  const handleAuthAction = async () => {
    setFeedback("");
    setIsProcessing(true); // 🔒 라우팅 잠금 (중요)

    try {
      let finalEmail = email;

      // 입력값 검증
      if (authMode === "patient") {
        if (!code || pw.length < 4) {
          throw new Error("초대코드와 4자리 이상 비밀번호를 입력해주세요.");
        }
        finalEmail = getPatientEmail(code);
      } else {
        // counselor / center_admin
        if (!email || !pw) {
          throw new Error("이메일과 비밀번호를 입력해주세요.");
        }
      }

      let authUser = null;

      // 1. Supabase Auth 실행
      if (isSignUpMode) {
        const { data, error } = await supabase.auth.signUp({
          email: finalEmail,
          password: pw,
        });
        if (error) throw error;
        authUser = data.user;
        setFeedback("등록 성공! 로그인 중...");
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: finalEmail,
          password: pw,
        });
        if (error) throw error;
        authUser = data.user;
      }

      if (!authUser) throw new Error("사용자 정보를 가져올 수 없습니다.");

      // 2. 프로필 & 링크 DB 강제 주입

      // (1) 프로필(Role) 확인
      const { data: existingProfile, error: profReadErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", authUser.id)
        .maybeSingle();

      if (profReadErr) {
        // 읽기 실패해도 아래 insert 시도는 가능 (RLS에 따라 다름)
        console.warn("profiles read error:", profReadErr);
      }

      // (2) 프로필 없으면 생성
      if (!existingProfile) {
        const { error: insErr } = await supabase.from("profiles").insert({
          user_id: authUser.id,
          role: authMode,
        });
        if (insErr) console.warn("profiles insert error:", insErr);
      }

      // (3) 프로필이 있는데 role이 다르면 (MVP에서는 안내만)
      if (existingProfile?.role && existingProfile.role !== authMode) {
        // 기존 계정의 role을 함부로 바꾸면 위험해서 여기서는 막음
        setFeedback(
          `이 계정은 이미 '${existingProfile.role}'로 등록되어 있습니다. 다른 탭을 선택해주세요.`
        );
        return;
      }

      // (4) 내담자라면: 환자 데이터 연결 (RPC)
      if (authMode === "patient") {
        const { data: existingLink } = await supabase
          .from("patient_links")
          .select("id")
          .eq("user_id", authUser.id)
          .maybeSingle();

        if (!existingLink) {
          const { error: rpcError } = await supabase.rpc("redeem_invite_code", {
            p_code: code,
          });

          if (rpcError) {
            console.error("초대코드 연결 실패:", rpcError);
            // 로그인 자체는 성공했으니 넘어감
          } else {
            console.log("✅ 환자 데이터 연결 완료 (RPC)");
          }
        }
      }

      // ✅ 센터장: 가입/로그인 후 센터 연결은 라우팅에서 자동으로 /center/join로 보냄
      // (여기서 별도 DB 작업 없음)

      // 3. 완료 처리
      if (isSignUpMode) {
        setIsSignUpMode(false);
        setPw("");
      }
    } catch (error: any) {
      setFeedback(error.message || "오류가 발생했습니다.");
    } finally {
      setIsProcessing(false); // 🔓 라우팅 잠금 해제
    }
  };

  // ⬇️ 로딩 화면
  if (checking) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center animate-pulse">
          <div className="h-16 w-16 bg-emerald-500 rounded-2xl shadow-sm mb-6 flex items-center justify-center text-white font-bold text-2xl">
            C
          </div>
          <p className="text-slate-400 text-sm font-medium">Checky를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  const isEmailMode = authMode === "counselor" || authMode === "center_admin";

  const roleLabel =
    authMode === "patient"
      ? "내담자 (초대코드)"
      : authMode === "counselor"
      ? "상담사 (이메일)"
      : "센터장 (이메일)";

  const titleText = isSignUpMode
    ? authMode === "patient"
      ? "비밀번호 설정 (등록)"
      : authMode === "center_admin"
      ? "센터장 회원가입"
      : "회원가입"
    : "로그인";

  const descText = isSignUpMode
    ? "본인 확인을 위해 비밀번호를 설정해주세요."
    : authMode === "patient"
    ? "상담사에게 받은 코드와 비밀번호를 입력하세요."
    : authMode === "center_admin"
    ? "센터장 계정으로 로그인하세요."
    : "이메일과 비밀번호로 로그인하세요.";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-6xl min-h-screen grid grid-cols-1 md:grid-cols-2">
        {/* Left: Brand */}
        <aside className="hidden md:flex flex-col justify-between p-10">
          <div>
            <div className="flex items-center justify-between">
              <div className="font-bold tracking-tight text-xl">Checky</div>
              <Badge>MVP</Badge>
            </div>
            <div className="mt-10">
              <h1 className="text-3xl font-semibold leading-tight">
                상담사가 <span className="text-slate-900">30초 만에</span>
                <br />
                지난 세션 맥락을 훑게 합니다.
              </h1>
              <p className="mt-4 text-sm text-slate-600 leading-relaxed">
                “기억” 대신{" "}
                <span className="font-semibold text-slate-900">세션 단위 데이터</span>로
                정리합니다.
              </p>
              <div className="mt-8 grid grid-cols-1 gap-3">
                <Feature title="세션 단위 흐름" desc="회차 구간으로 자동 묶어 스캔 가능" />
                <Feature title="안전한 기록" desc="초대코드와 개인 비밀번호로 이중 보안" />
                <Feature title="센터 운영" desc="센터장은 리스크 인박스로 케이스를 정리" />
              </div>
            </div>
          </div>
          <div className="text-xs text-slate-500">Clear · Calm · Clinical</div>
        </aside>

        {/* Right: Auth */}
        <section className="flex items-center justify-center p-4 md:p-10">
          <div className="w-full max-w-md">
            {/* Mobile Header */}
            <div className="md:hidden mb-4 flex items-start justify-between">
              <div>
                <div className="font-bold tracking-tight text-xl">Checky</div>
                <p className="text-sm text-slate-600 mt-1">상담 기록 도구</p>
              </div>
              <Badge>MVP</Badge>
            </div>

            {userId ? (
              <Card className="w-full">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">
                      {isProcessing ? "설정 중..." : "이동 중"}
                    </h2>
                    <p className="text-sm text-slate-600 mt-1">
                      {isProcessing
                        ? "계정 정보를 설정하고 있습니다."
                        : "화면을 이동합니다..."}
                    </p>
                  </div>
                  <Badge>MVP</Badge>
                </div>
                <div className="mt-5">
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full w-1/3 bg-emerald-500 rounded-full animate-pulse" />
                  </div>
                </div>
              </Card>
            ) : (
              <Card className="w-full">
                {/* Tabs */}
                <div className="flex border-b border-slate-100 mb-6">
                  <button
                    onClick={() => {
                      setAuthMode("patient");
                      setFeedback("");
                      setPw("");
                      setEmail("");
                      setIsSignUpMode(false);
                    }}
                    className={`flex-1 pb-3 text-sm font-semibold transition ${
                      authMode === "patient"
                        ? "text-emerald-600 border-b-2 border-emerald-500"
                        : "text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    내담자
                  </button>
                  <button
                    onClick={() => {
                      setAuthMode("counselor");
                      setFeedback("");
                      setPw("");
                      setCode("");
                      setIsSignUpMode(false);
                    }}
                    className={`flex-1 pb-3 text-sm font-semibold transition ${
                      authMode === "counselor"
                        ? "text-emerald-600 border-b-2 border-emerald-500"
                        : "text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    상담사
                  </button>
                  <button
                    onClick={() => {
                      setAuthMode("center_admin");
                      setFeedback("");
                      setPw("");
                      setCode("");
                      setIsSignUpMode(false);
                    }}
                    className={`flex-1 pb-3 text-sm font-semibold transition ${
                      authMode === "center_admin"
                        ? "text-emerald-600 border-b-2 border-emerald-500"
                        : "text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    센터장
                  </button>
                </div>

                {/* Title */}
                <div className="mb-5">
                  <h2 className="text-xl font-bold text-slate-900">{titleText}</h2>
                  <p className="text-sm text-slate-600 mt-1">{descText}</p>
                </div>

                {/* Form */}
                <div className="space-y-4">
                  {authMode === "patient" ? (
                    <>
                      <div>
                        <label className="text-xs font-medium text-slate-500 ml-1 mb-1 block">
                          초대코드
                        </label>
                        <Field
                          placeholder="예: A1B2C"
                          value={code}
                          onChange={(e) => setCode(e.target.value.toUpperCase())}
                          autoComplete="off"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500 ml-1 mb-1 block">
                          {isSignUpMode ? "사용할 비밀번호 설정" : "비밀번호"}
                        </label>
                        <Field
                          type="password"
                          placeholder="4자리 이상"
                          value={pw}
                          onChange={(e) => setPw(e.target.value)}
                          autoComplete="current-password"
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <label className="text-xs font-medium text-slate-500 ml-1 mb-1 block">
                          {roleLabel} 이메일
                        </label>
                        <Field
                          placeholder="이메일"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          autoComplete="email"
                          inputMode="email"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500 ml-1 mb-1 block">
                          비밀번호
                        </label>
                        <Field
                          type="password"
                          placeholder="비밀번호"
                          value={pw}
                          onChange={(e) => setPw(e.target.value)}
                          autoComplete="current-password"
                        />
                      </div>
                    </>
                  )}
                </div>

                {/* Feedback */}
                {feedback && (
                  <div className="mt-4 p-3 bg-red-50 rounded-xl text-xs text-red-600 font-medium text-center break-keep">
                    {feedback}
                  </div>
                )}

                {/* Action Button */}
                <div className="mt-6">
                  <Btn
                    onClick={handleAuthAction}
                    className="w-full"
                    disabled={isProcessing}
                  >
                    {isProcessing
                      ? "처리 중..."
                      : isSignUpMode
                      ? "등록하고 시작하기"
                      : "입장하기"}
                  </Btn>
                </div>

                {/* Toggle Mode */}
                <div className="mt-4 flex justify-center">
                  {isSignUpMode ? (
                    <button
                      onClick={() => {
                        setIsSignUpMode(false);
                        setFeedback("");
                      }}
                      className="text-xs text-slate-500 hover:text-emerald-600 underline underline-offset-4"
                    >
                      이미 비밀번호가 있나요? 로그인하기
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setIsSignUpMode(true);
                        setFeedback("");
                      }}
                      className="text-xs text-slate-500 hover:text-emerald-600 underline underline-offset-4"
                    >
                      {authMode === "patient"
                        ? "처음이신가요? 비밀번호 등록하기"
                        : "계정이 없으신가요? 가입하기"}
                    </button>
                  )}
                </div>

                {/* small hint for center_admin */}
                {authMode === "center_admin" && (
                  <p className="mt-4 text-[12px] text-slate-500 text-center break-keep">
                    센터장 계정은 로그인 후 <span className="font-semibold">센터 초대코드</span>로
                    센터에 연결합니다.
                  </p>
                )}
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
