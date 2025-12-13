"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { Patient, Role } from "@/lib/types";
import { Badge, Btn, Card, Field } from "@/components/ui";

const EMOTION_OPTIONS = [
  "불안",
  "우울",
  "무기력",
  "분노",
  "자책",
  "긴장",
  "평온",
  "만족",
  "기타",
] as const;
type EmotionPick = (typeof EMOTION_OPTIONS)[number];

const TRIGGER_OPTIONS = [
  "대인관계",
  "연애/성",
  "가족",
  "외모/자존감",
  "미래 걱정",
  "학업/일",
  "금전",
  "건강/몸",
  "기타",
] as const;
type TriggerPick = (typeof TRIGGER_OPTIONS)[number];

type LogRow = {
  id: string;
  patient_id: string;
  counselor_id: string;
  log_date: string; // YYYY-MM-DD
  emotion: string;
  trigger: string;
  intensity: number | null;
  sleep_hours: number | null;
  took_meds: boolean | null;
  memo: string | null;
  created_at?: string;
};

function isoToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function parseISO(iso: string) {
  const [y, m, d] = iso.split("-").map((x) => Number(x));
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}
function addDaysISO(iso: string, days: number) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + days);
  return isoFromDate(d);
}
function isoFromDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function Page() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [linkedPatient, setLinkedPatient] = useState<Patient | null>(null);

  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);

  const today = useMemo(() => isoToday(), []);

  // ===== 모아보기
  const [showMyLogs, setShowMyLogs] = useState(false);
  const [myLogs, setMyLogs] = useState<LogRow[]>([]);
  const [logsLoadedOnce, setLogsLoadedOnce] = useState(false);

  // 필터: "7d" | "30d"
  const [range, setRange] = useState<"7d" | "30d">("7d");

  // ===== form
  const [todayLogId, setTodayLogId] = useState<string | null>(null);

  const [emotionPick, setEmotionPick] = useState<EmotionPick>("불안");
  const [emotionOther, setEmotionOther] = useState("");

  const [triggerPick, setTriggerPick] = useState<TriggerPick>("학업/일");
  const [triggerOther, setTriggerOther] = useState("");

  const [intensity, setIntensity] = useState(5); // 1~10
  const [sleepHours, setSleepHours] = useState<string>("6.5");
  const [tookMeds, setTookMeds] = useState<boolean | null>(null);
  const [memo, setMemo] = useState("");

  const emotionFinal = useMemo(() => {
    if (emotionPick !== "기타") return emotionPick;
    return `기타: ${emotionOther.trim()}`;
  }, [emotionPick, emotionOther]);

  const triggerFinal = useMemo(() => {
    if (triggerPick !== "기타") return triggerPick;
    return `기타: ${triggerOther.trim()}`;
  }, [triggerPick, triggerOther]);

  const canSubmit = useMemo(() => {
    if (emotionPick === "기타" && !emotionOther.trim()) return false;
    if (triggerPick === "기타" && !triggerOther.trim()) return false;

    const v = sleepHours.trim();
    if (v) {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 24) return false;
    }
    return true;
  }, [emotionPick, emotionOther, triggerPick, triggerOther, sleepHours]);

  // ===== auth / role / link
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id ?? null;
      if (!uid) {
        router.replace("/");
        return;
      }
      setUserId(uid);

      const { data: prof } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", uid)
        .single();

      if (!prof?.role) {
        router.replace("/role");
        return;
      }
      if ((prof.role as Role) !== "patient") {
        router.replace("/c");
        return;
      }

      const { data: link } = await supabase
        .from("patient_links")
        .select("patient_id")
        .eq("user_id", uid)
        .single();

      if (link?.patient_id) {
        const { data: p } = await supabase
          .from("patients")
          .select("*")
          .eq("id", link.patient_id)
          .single();
        if (p) setLinkedPatient(p as Patient);
      }
    })().catch(console.error);
  }, [router]);

  const hydrateFormFromRow = (row: LogRow) => {
    const e = row?.emotion ?? "불안";
    if (e.startsWith("기타:")) {
      setEmotionPick("기타");
      setEmotionOther(e.replace(/^기타:\s*/, ""));
    } else if (EMOTION_OPTIONS.includes(e as any)) {
      setEmotionPick(e as EmotionPick);
      setEmotionOther("");
    } else {
      setEmotionPick("기타");
      setEmotionOther(e);
    }

    const t = row?.trigger ?? "학업/일";
    if (t.startsWith("기타:")) {
      setTriggerPick("기타");
      setTriggerOther(t.replace(/^기타:\s*/, ""));
    } else if (TRIGGER_OPTIONS.includes(t as any)) {
      setTriggerPick(t as TriggerPick);
      setTriggerOther("");
    } else {
      setTriggerPick("기타");
      setTriggerOther(t);
    }

    setIntensity(typeof row?.intensity === "number" ? row.intensity : 5);
    setSleepHours(row?.sleep_hours == null ? "" : String(row.sleep_hours));
    setTookMeds(row?.took_meds == null ? null : Boolean(row.took_meds));
    setMemo(row?.memo ?? "");
  };

  const fetchLogs = async (pid: string, rangeKey: "7d" | "30d") => {
    const end = today;
    const start = rangeKey === "7d" ? addDaysISO(end, -6) : addDaysISO(end, -29);

    const { data, error } = await supabase
      .from("patient_logs")
      .select("*")
      .eq("patient_id", pid)
      .gte("log_date", start)
      .lte("log_date", end)
      .order("log_date", { ascending: false });

    if (error) throw error;

    const logs = (data ?? []) as LogRow[];
    setMyLogs(logs);
    setLogsLoadedOnce(true);

    const todayRow = logs.find((x) => x.log_date === today) ?? null;
    if (todayRow) {
      setTodayLogId(todayRow.id ?? null);
      if (!logsLoadedOnce) hydrateFormFromRow(todayRow);
    } else {
      setTodayLogId(null);
    }
  };

  // linkedPatient 생기면: 기본 range(7d)로 한 번만 가져오기
  useEffect(() => {
    if (!linkedPatient) return;
    fetchLogs(linkedPatient.id, range).catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedPatient?.id]);

  // 모아보기 열려있고 range 바뀌면 refetch
  useEffect(() => {
    if (!linkedPatient) return;
    if (!showMyLogs) return;
    fetchLogs(linkedPatient.id, range).catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, showMyLogs, linkedPatient?.id]);

  const redeem = async () => {
    const code = inviteCode.trim();
    if (!code) return alert("초대코드 입력");
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("redeem_invite_code", { p_code: code });
      if (error) throw error;

      const pid = data?.[0]?.patient_id as string | undefined;
      if (!pid) throw new Error("연결 실패(환자 id 없음)");

      const { data: p, error: e2 } = await supabase
        .from("patients")
        .select("*")
        .eq("id", pid)
        .single();
      if (e2) throw e2;

      setLinkedPatient(p as Patient);
      setInviteCode("");
    } catch (e: any) {
      alert(e?.message ?? "연결 실패");
    } finally {
      setLoading(false);
    }
  };

  const submitLog = async () => {
    if (!linkedPatient) return;
    if (!canSubmit) return alert("입력값을 확인하세요.");

    setLoading(true);
    try {
      const sleep = sleepHours.trim() ? Number(sleepHours) : null;

      const payload: Partial<LogRow> & {
        patient_id: string;
        counselor_id: string;
        log_date: string;
      } = {
        patient_id: linkedPatient.id,
        counselor_id: linkedPatient.counselor_id,
        log_date: today,
        emotion: emotionFinal,
        trigger: triggerFinal,
        intensity,
        sleep_hours: Number.isFinite(sleep as any) ? (sleep as any) : null,
        took_meds: tookMeds,
        memo: memo.trim() ? memo.trim() : null,
      };

      if (todayLogId) (payload as any).id = todayLogId;

      const { data, error } = await supabase
        .from("patient_logs")
        .upsert(payload, { onConflict: "patient_id,log_date" })
        .select("*")
        .single();

      if (error) throw error;

      setTodayLogId((data as any)?.id ?? todayLogId ?? null);

      // 리스트 최신화(모아보기 열려있든 아니든)
      await fetchLogs(linkedPatient.id, range);

      alert(todayLogId ? "오늘 기록 수정됨" : "오늘 기록 저장됨");
    } catch (e: any) {
      alert(e?.message ?? "저장 실패");
    } finally {
      setLoading(false);
    }
  };

  if (!userId) return null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      

      <main className="max-w-xl mx-auto p-4 space-y-4">
        {!linkedPatient ? (
          <Card>
            <h2 className="font-semibold">초대코드 연결</h2>
            <p className="text-sm text-slate-600 mt-1">
              상담자가 준 코드를 <span className="font-semibold">1회 입력</span>하면 유지됩니다.
            </p>
            <div className="mt-3 flex gap-2">
              <Field
                placeholder="예: 8자리 코드"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
              />
              <Btn onClick={redeem} disabled={loading}>
                {loading ? "연결 중..." : "연결"}
              </Btn>
            </div>
          </Card>
        ) : (
          <>
            {/* 상단 카드 */}
            <Card>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{linkedPatient.name}</h2>
                  <p className="text-sm text-slate-600 mt-1">{linkedPatient.concern}</p>
                  <div className="mt-2 text-sm text-slate-700">
                    오늘: <span className="font-semibold">{today}</span>
                  </div>
                  {todayLogId && (
                    <div className="mt-1 text-xs text-slate-500">
                      오늘 기록이 이미 있어요 → 저장하면 <span className="font-semibold">수정</span>됩니다.
                    </div>
                  )}
                </div>

                <Btn
                  variant="secondary"
                  onClick={async () => {
                    const next = !showMyLogs;
                    setShowMyLogs(next);
                    if (next && linkedPatient) {
                      try {
                        setLoading(true);
                        await fetchLogs(linkedPatient.id, range);
                      } catch (e: any) {
                        alert(e?.message ?? "기록 불러오기 실패");
                      } finally {
                        setLoading(false);
                      }
                    }
                  }}
                  disabled={loading}
                >
                  {showMyLogs ? "내 기록 닫기" : "내 기록 모아보기"}
                </Btn>
              </div>

              {/* 모아보기 */}
              {showMyLogs && (
                <div className="mt-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold">기록 요약</div>

                    <div className="flex items-center gap-2">
                      <div className="flex gap-1 rounded-full bg-slate-100 p-1">
                        <button
                          type="button"
                          onClick={() => setRange("7d")}
                          className={[
                            "px-3 py-1 text-xs rounded-full",
                            range === "7d"
                              ? "bg-white shadow-sm text-slate-900"
                              : "text-slate-600 hover:text-slate-900",
                          ].join(" ")}
                        >
                          최근 7일
                        </button>
                        <button
                          type="button"
                          onClick={() => setRange("30d")}
                          className={[
                            "px-3 py-1 text-xs rounded-full",
                            range === "30d"
                              ? "bg-white shadow-sm text-slate-900"
                              : "text-slate-600 hover:text-slate-900",
                          ].join(" ")}
                        >
                          최근 30일
                        </button>
                      </div>

                      <Btn
                        variant="secondary"
                        onClick={async () => {
                          if (!linkedPatient) return;
                          try {
                            setLoading(true);
                            await fetchLogs(linkedPatient.id, range);
                          } catch (e: any) {
                            alert(e?.message ?? "새로고침 실패");
                          } finally {
                            setLoading(false);
                          }
                        }}
                        disabled={loading}
                      >
                        새로고침
                      </Btn>
                    </div>
                  </div>

                  {myLogs.length === 0 ? (
                    <div className="mt-2 text-sm text-slate-500">
                      선택한 기간({range === "7d" ? "7일" : "30일"})에 기록이 없습니다.
                    </div>
                  ) : (
                    <div className="mt-3 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white overflow-hidden">
                      {myLogs.map((log) => (
                        <button
                          key={log.id}
                          type="button"
                          onClick={() => {
                            hydrateFormFromRow(log);
                            if (log.log_date === today) setTodayLogId(log.id);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                          className="w-full text-left px-3 py-3 hover:bg-slate-50"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-semibold text-slate-900">
                              {log.log_date}
                              {log.log_date === today && (
                                <span className="ml-2 text-[11px] font-semibold text-emerald-700">
                                  오늘
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500">
                              강도{" "}
                              <span className="font-semibold text-slate-700">
                                {log.intensity ?? "-"}
                              </span>
                              {" · "}
                              수면{" "}
                              <span className="font-semibold text-slate-700">
                                {log.sleep_hours ?? "-"}
                              </span>
                              h
                              {" · "}
                              약{" "}
                              <span className="font-semibold text-slate-700">
                                {log.took_meds === null ? "-" : log.took_meds ? "O" : "X"}
                              </span>
                            </div>
                          </div>

                          <div className="mt-1 text-sm text-slate-700">
                            <span className="font-semibold">{log.emotion}</span>
                            <span className="mx-2 text-slate-300">|</span>
                            <span>{log.trigger}</span>
                          </div>

                          {log.memo && (
                            <div className="mt-1 text-xs text-slate-500 line-clamp-1">
                              메모: {log.memo}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="mt-2 text-[11px] text-slate-500">
                    * 항목을 누르면 해당 날짜 기록이 아래 폼에 로드됩니다.
                  </div>
                </div>
              )}
            </Card>

            {/* 오늘 기록 */}
            <Card>
              <h3 className="font-semibold">오늘 기록</h3>

              <div className="mt-3 space-y-4">
                {/* 감정 */}
                <div>
                  <div className="text-xs text-slate-500 mb-2">감정(1개) · 객관식</div>
                  <div className="flex flex-wrap gap-2">
                    {EMOTION_OPTIONS.map((opt) => {
                      const active = emotionPick === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setEmotionPick(opt)}
                          className={[
                            "px-3 py-1 rounded-full border text-sm",
                            active
                              ? "bg-slate-900 text-white border-slate-900"
                              : "bg-white text-slate-800 border-slate-200 hover:bg-slate-50",
                          ].join(" ")}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>

                  {emotionPick === "기타" && (
                    <div className="mt-2">
                      <Field
                        placeholder="기타 감정 (필수)"
                        value={emotionOther}
                        onChange={(e) => setEmotionOther(e.target.value)}
                      />
                      <div className="mt-1 text-xs text-slate-500">
                        * 기타 선택 시 서술은 필수입니다.
                      </div>
                    </div>
                  )}
                </div>

                {/* 트리거 */}
                <div>
                  <div className="text-xs text-slate-500 mb-2">트리거(1개) · 객관식</div>
                  <div className="flex flex-wrap gap-2">
                    {TRIGGER_OPTIONS.map((opt) => {
                      const active = triggerPick === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setTriggerPick(opt)}
                          className={[
                            "px-3 py-1 rounded-full border text-sm",
                            active
                              ? "bg-slate-900 text-white border-slate-900"
                              : "bg-white text-slate-800 border-slate-200 hover:bg-slate-50",
                          ].join(" ")}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>

                  {triggerPick === "기타" && (
                    <div className="mt-2">
                      <Field
                        placeholder="기타 트리거 (필수)"
                        value={triggerOther}
                        onChange={(e) => setTriggerOther(e.target.value)}
                      />
                      <div className="mt-1 text-xs text-slate-500">
                        * 기타 선택 시 서술은 필수입니다.
                      </div>
                    </div>
                  )}
                </div>

                {/* 강도 */}
                <div>
                  <div className="text-xs text-slate-500 mb-1">강도 (1~10)</div>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={intensity}
                    onChange={(e) => setIntensity(Number(e.target.value))}
                    className="w-full"
                  />
                  <div className="text-sm font-semibold mt-1">{intensity}</div>
                </div>

                {/* 수면 */}
                <div>
                  <div className="text-xs text-slate-500 mb-1">수면시간 (선택)</div>
                  <Field
                    placeholder="예: 6.5"
                    value={sleepHours}
                    onChange={(e) => setSleepHours(e.target.value)}
                  />
                  <div className="mt-1 text-xs text-slate-500">* 0~24 범위</div>
                </div>

                {/* 약 */}
                <div>
                  <div className="text-xs text-slate-500 mb-2">약 복용</div>
                  <div className="flex gap-2">
                    <Btn
                      variant={tookMeds === true ? "primary" : "secondary"}
                      onClick={() => setTookMeds(true)}
                    >
                      약 O
                    </Btn>
                    <Btn
                      variant={tookMeds === false ? "primary" : "secondary"}
                      onClick={() => setTookMeds(false)}
                    >
                      약 X
                    </Btn>
                    <Btn
                      variant={tookMeds === null ? "primary" : "secondary"}
                      onClick={() => setTookMeds(null)}
                    >
                      미기입
                    </Btn>
                  </div>
                </div>

                {/* 메모 */}
                <div>
                  <div className="text-xs text-slate-500 mb-1">기타 메모(선택)</div>
                  <textarea
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-slate-200 min-h-[90px]"
                    placeholder="자유롭게 서술해주세요."
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                  />
                </div>

                <Btn onClick={submitLog} disabled={loading || !canSubmit}>
                  {loading ? "저장 중..." : todayLogId ? "오늘 기록 수정" : "오늘 기록 저장"}
                </Btn>

                {!canSubmit && (
                  <div className="text-xs text-rose-600">
                    * 기타 선택 시 내용 입력이 필요하고, 수면시간은 0~24 숫자만 가능합니다.
                  </div>
                )}
              </div>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
