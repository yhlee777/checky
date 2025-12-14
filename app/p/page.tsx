"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import type { Patient } from "@/lib/types";
import { Btn, Card, Field } from "@/components/ui";

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
  log_date: string;
  emotion: string;
  trigger: string;
  intensity: number | null;
  sleep_hours: number | null;
  took_meds: boolean | null;
  did_homework: boolean | null;
  memo: string | null;
  created_at?: string;
};

type HomeworkItem = {
  id: string;
  title: string;
  is_active: boolean;
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
function isoFromDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addDaysISO(iso: string, days: number) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + days);
  return isoFromDate(d);
}
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
function roundToHalf(n: number) {
  return Math.round(n * 2) / 2;
}

function Pill({
  tone = "muted",
  children,
}: {
  tone?: "muted" | "good" | "neutral";
  children: React.ReactNode;
}) {
  const cls =
    tone === "good"
      ? "bg-emerald-50 text-emerald-700 border-emerald-100"
      : tone === "neutral"
      ? "bg-white text-slate-700 border-slate-200"
      : "bg-slate-50 text-slate-600 border-slate-200";

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {children}
    </span>
  );
}

function SmallError({ show, children }: { show: boolean; children: React.ReactNode }) {
  if (!show) return null;
  return <div className="mt-1 text-[12px] text-slate-500">{children}</div>;
}

function BottomTabs({ active }: { active: "today" | "insights" }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/90 backdrop-blur-md">
      <div className="max-w-xl mx-auto px-4 py-3 grid grid-cols-2 gap-2">
        <a
          href="/p"
          className={[
            "rounded-xl border px-3 py-2 text-center text-sm font-semibold transition",
            active === "today"
              ? "bg-emerald-600 text-white border-emerald-600"
              : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50",
          ].join(" ")}
        >
          오늘 기록
        </a>
        <a
          href="/p/insights"
          className={[
            "rounded-xl border px-3 py-2 text-center text-sm font-semibold transition",
            active === "insights"
              ? "bg-emerald-600 text-white border-emerald-600"
              : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50",
          ].join(" ")}
        >
          나의 한 주
        </a>
      </div>
    </div>
  );
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
  const [range, setRange] = useState<"7d" | "30d">("7d");

  // ===== 숙제 목록 & 로컬 체크
  const [homeworks, setHomeworks] = useState<HomeworkItem[]>([]);
  const [checkedHomeworks, setCheckedHomeworks] = useState<Set<string>>(new Set());

  // ===== form
  const [todayLogId, setTodayLogId] = useState<string | null>(null);

  const [emotionPick, setEmotionPick] = useState<EmotionPick>("불안");
  const [emotionOther, setEmotionOther] = useState("");

  const [triggerPick, setTriggerPick] = useState<TriggerPick>("학업/일");
  const [triggerOther, setTriggerOther] = useState("");

  const [intensity, setIntensity] = useState(5);

  // ✅ 수면: 슬라이더+프리셋(+선택적으로 직접입력)
  const [sleepRaw, setSleepRaw] = useState<string>("6.5");
  const [sleepNum, setSleepNum] = useState<number | null>(6.5);

  // ✅ 약: 중립 파스텔
  const [tookMeds, setTookMeds] = useState<boolean | null>(null);

  const [memo, setMemo] = useState("");

  // UI 메시지 (alert 대신)
  const [saveMsg, setSaveMsg] = useState("");
  const hydratedOnceRef = useRef(false);
  const triedSubmitRef = useRef(false);

  const emotionFinal = useMemo(() => {
    if (emotionPick !== "기타") return emotionPick;
    return `기타: ${emotionOther.trim()}`;
  }, [emotionPick, emotionOther]);

  const triggerFinal = useMemo(() => {
    if (triggerPick !== "기타") return triggerPick;
    return `기타: ${triggerOther.trim()}`;
  }, [triggerPick, triggerOther]);

  /* ===============================
   * validation (inline errors)
   * =============================== */
  const emotionError = useMemo(() => {
    if (emotionPick === "기타" && !emotionOther.trim()) return "감정을 직접 입력해주세요.";
    return "";
  }, [emotionPick, emotionOther]);

  const triggerError = useMemo(() => {
    if (triggerPick === "기타" && !triggerOther.trim()) return "원인을 직접 입력해주세요.";
    return "";
  }, [triggerPick, triggerOther]);

  const sleepError = useMemo(() => {
    const v = sleepRaw.trim();
    if (!v) return "";
    const n = Number(v);
    if (!Number.isFinite(n)) return "수면 시간은 숫자만 입력 가능해요. (예: 6.5)";
    if (n < 0 || n > 24) return "수면 시간은 0~24 사이로 입력해주세요.";
    return "";
  }, [sleepRaw]);

  const canSubmit = useMemo(() => {
    if (emotionError) return false;
    if (triggerError) return false;
    if (sleepError) return false;
    return true;
  }, [emotionError, triggerError, sleepError]);

  const showErrors = triedSubmitRef.current && !canSubmit;

  /* ===============================
   * auth & data fetching
   * =============================== */
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
      if (prof.role !== "patient") {
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

  const fetchHomeworks = async (pid: string) => {
    const { data, error } = await supabase
      .from("homeworks")
      .select("*")
      .eq("patient_id", pid)
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    if (!error && data) setHomeworks(data as HomeworkItem[]);
  };

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

    const s = row?.sleep_hours;
    if (typeof s === "number" && Number.isFinite(s)) {
      const v = clamp(s, 0, 24);
      setSleepNum(v);
      setSleepRaw(String(v));
    } else {
      setSleepNum(null);
      setSleepRaw("");
    }

    setTookMeds(row?.took_meds == null ? null : Boolean(row.took_meds));
    setMemo(row?.memo ?? "");

    if (row?.did_homework) {
      setCheckedHomeworks(new Set());
    } else {
      setCheckedHomeworks(new Set());
    }
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

    const todayRow = logs.find((x) => x.log_date === today) ?? null;
    if (todayRow) {
      setTodayLogId(todayRow.id ?? null);
      if (!hydratedOnceRef.current) {
        hydrateFormFromRow(todayRow);
        hydratedOnceRef.current = true;
      }
    } else {
      setTodayLogId(null);
    }
  };

  useEffect(() => {
    if (!linkedPatient) return;
    fetchLogs(linkedPatient.id, range).catch(console.error);
    fetchHomeworks(linkedPatient.id).catch(console.error);
  }, [linkedPatient?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!linkedPatient) return;
    if (!showMyLogs) return;
    fetchLogs(linkedPatient.id, range).catch(console.error);
  }, [range, showMyLogs, linkedPatient?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (homeworks.length > 0 && todayLogId) {
      const log = myLogs.find((l) => l.id === todayLogId);
      if (log?.did_homework) {
        const allIds = new Set(homeworks.map((h) => h.id));
        setCheckedHomeworks(allIds);
      }
    }
  }, [homeworks, todayLogId, myLogs]);

  const recent3 = useMemo(() => {
    const days = [addDaysISO(today, -2), addDaysISO(today, -1), today];
    const map = new Map(myLogs.map((l) => [l.log_date, l]));
    const rows = days.map((d) => ({ date: d, row: map.get(d) ?? null }));

    const ints = rows.map((x) => x.row?.intensity).filter((v): v is number => typeof v === "number");
    const sleeps = rows
      .map((x) => x.row?.sleep_hours)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));

    const avgInt = ints.length ? Math.round((ints.reduce((a, b) => a + b, 0) / ints.length) * 10) / 10 : null;
    const avgSleep =
      sleeps.length ? Math.round((sleeps.reduce((a, b) => a + b, 0) / sleeps.length) * 10) / 10 : null;

    const medsDays = rows.filter((x) => x.row?.took_meds === true).length;
    const hwDays = rows.filter((x) => x.row?.did_homework === true).length;
    const filledDays = rows.filter((x) => !!x.row).length;

    const latest = rows.slice().reverse().find((x) => x.row)?.row ?? null;
    const topEmotion = latest?.emotion ?? null;

    return { rows, avgInt, avgSleep, medsDays, hwDays, filledDays, topEmotion };
  }, [myLogs, today]);

  /* ===============================
   * actions
   * =============================== */
  const redeem = async () => {
    const code = inviteCode.trim();
    if (!code) {
      setSaveMsg("초대코드를 입력해주세요.");
      return;
    }

    setLoading(true);
    setSaveMsg("");
    try {
      const { data, error } = await supabase.rpc("redeem_invite_code", { p_code: code });
      if (error) throw error;

      const pid = data?.[0]?.patient_id;
      if (!pid) throw new Error("연결 실패");

      const { data: p } = await supabase.from("patients").select("*").eq("id", pid).single();
      setLinkedPatient(p as Patient);
      setInviteCode("");

      setSaveMsg("연결 완료");
      try {
        await Haptics.impact({ style: ImpactStyle.Light });
      } catch {}
      setTimeout(() => setSaveMsg(""), 1500);
    } catch (e: any) {
      setSaveMsg(e?.message ?? "연결 실패");
    } finally {
      setLoading(false);
    }
  };

  const submitLog = async () => {
    if (!linkedPatient) return;

    triedSubmitRef.current = true;

    if (!canSubmit) {
      setSaveMsg("입력값을 확인해주세요.");
      try {
        await Haptics.impact({ style: ImpactStyle.Light });
      } catch {}
      return;
    }

    setLoading(true);
    setSaveMsg("");

    try {
      const isDidHomework = checkedHomeworks.size > 0;

      const sleepTrim = sleepRaw.trim();
      const sleep = sleepTrim ? Number(sleepTrim) : null;

      const payload: Partial<LogRow> & { patient_id: string; counselor_id: string; log_date: string } = {
        patient_id: linkedPatient.id,
        counselor_id: (linkedPatient as any).counselor_id,
        log_date: today,
        emotion: emotionFinal,
        trigger: triggerFinal,
        intensity,
        sleep_hours: sleep != null && Number.isFinite(sleep) ? clamp(sleep, 0, 24) : null,
        took_meds: tookMeds,
        did_homework: isDidHomework,
        memo: memo.trim() ? memo.trim() : null,
      };

      if (todayLogId) (payload as any).id = todayLogId;

      const { data, error } = await supabase
        .from("patient_logs")
        .upsert(payload, { onConflict: "patient_id,log_date" })
        .select("*")
        .single();

      if (error) throw error;

      await Haptics.impact({ style: ImpactStyle.Medium });
      setTodayLogId((data as any)?.id ?? todayLogId ?? null);

      await fetchLogs(linkedPatient.id, range);

      setSaveMsg(todayLogId ? "수정 완료" : "저장 완료");
      setTimeout(() => setSaveMsg(""), 1500);
    } catch (e: any) {
      setSaveMsg(e?.message ?? "저장 실패");
    } finally {
      setLoading(false);
    }
  };

  const toggleHomeworkCheck = (id: string) => {
    const next = new Set(checkedHomeworks);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCheckedHomeworks(next);
  };

  const setSleepFromPreset = (n: number) => {
    const v = clamp(n, 0, 24);
    setSleepNum(v);
    setSleepRaw(String(v));
  };

  const onSleepSlider = (v: number) => {
    const next = roundToHalf(clamp(v, 0, 24));
    setSleepNum(next);
    setSleepRaw(String(next));
  };

  const onSleepInput = (v: string) => {
    setSleepRaw(v);
    const t = v.trim();
    if (!t) {
      setSleepNum(null);
      return;
    }
    const n = Number(t);
    if (Number.isFinite(n)) setSleepNum(clamp(n, 0, 24));
  };

  if (!userId) return null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main className="max-w-xl mx-auto p-4 pb-28 space-y-4">
        {!linkedPatient ? (
          <Card>
            <h2 className="font-semibold">초대코드 연결</h2>

            <div className="mt-3 flex gap-2">
              <Field placeholder="8자리 코드" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} />
              <Btn onClick={() => void redeem()} disabled={loading}>
                연결
              </Btn>
            </div>

            {saveMsg && <div className="mt-2 text-sm text-slate-600">{saveMsg}</div>}
          </Card>
        ) : (
          <>
            <Card>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{linkedPatient.name}</h2>
                  <div className="mt-1 text-sm text-slate-700">
                    오늘: <span className="font-semibold">{today}</span>
                  </div>
                </div>

                <Btn variant="secondary" onClick={() => setShowMyLogs(!showMyLogs)}>
                  {showMyLogs ? "닫기" : "내 기록"}
                </Btn>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Pill>{`최근 3일: ${recent3.filledDays}/3 기록`}</Pill>
                <Pill tone="neutral">{recent3.avgInt != null ? `평균 강도 ${recent3.avgInt}` : "강도 -"}</Pill>
                <Pill tone="neutral">{recent3.avgSleep != null ? `평균 수면 ${recent3.avgSleep}h` : "수면 -"}</Pill>
                <Pill>{`약 ${recent3.medsDays}일`}</Pill>
                <Pill>{`숙제 ${recent3.hwDays}일`}</Pill>
                {recent3.topEmotion && <Pill tone="good">{recent3.topEmotion}</Pill>}
              </div>

              {saveMsg && <div className="mt-2 text-sm text-slate-600">{saveMsg}</div>}

              {showMyLogs && (
                <div className="mt-4">
                  <div className="flex gap-2 mb-3">
                    <button
                      onClick={() => setRange("7d")}
                      className={`px-3 py-1 text-xs rounded-full ${
                        range === "7d" ? "bg-white shadow-sm font-bold" : "text-slate-500"
                      }`}
                    >
                      7일
                    </button>
                    <button
                      onClick={() => setRange("30d")}
                      className={`px-3 py-1 text-xs rounded-full ${
                        range === "30d" ? "bg-white shadow-sm font-bold" : "text-slate-500"
                      }`}
                    >
                      30일
                    </button>
                  </div>

                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl bg-white">
                    {myLogs.length === 0 ? (
                      <div className="p-3 text-sm text-slate-500">기록 없음</div>
                    ) : (
                      myLogs.map((log) => (
                        <button
                          key={log.id}
                          onClick={() => {
                            hydrateFormFromRow(log);
                            if (log.log_date === today) setTodayLogId(log.id);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                          className="w-full text-left p-3 hover:bg-slate-50"
                        >
                          <div className="flex justify-between text-sm">
                            <span className="font-semibold">
                              {log.log_date} {log.log_date === today && " (오늘)"}
                            </span>
                            <span className="text-slate-500">강도 {log.intensity ?? "-"}</span>
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            {log.emotion} · {log.trigger}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </Card>

            <Card>
              <h3 className="font-semibold mb-4">
                오늘의 기록{" "}
                <span className="text-xs text-slate-500 font-normal">(피곤한 날은 최소만 해도 돼요)</span>
              </h3>

              <div className="space-y-6">
                {/* 1/7 감정 */}
                <div>
                  <div className="text-xs text-slate-500 mb-2 font-bold">1/7 오늘의 감정</div>
                  <div className="flex flex-wrap gap-2">
                    {EMOTION_OPTIONS.map((opt) => (
                      <button
                        key={opt}
                        onClick={() => setEmotionPick(opt)}
                        className={`px-3 py-1.5 rounded-xl border text-sm transition-all ${
                          emotionPick === opt
                            ? "bg-emerald-600 text-white border-emerald-600"
                            : "bg-white text-slate-600 border-slate-200"
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                  {emotionPick === "기타" && (
                    <>
                      <Field className="mt-2" placeholder="감정 직접 입력" value={emotionOther} onChange={(e) => setEmotionOther(e.target.value)} />
                      <SmallError show={triedSubmitRef.current && !!emotionError}>{emotionError}</SmallError>
                    </>
                  )}
                </div>

                {/* 2/7 트리거 */}
                <div>
                  <div className="text-xs text-slate-500 mb-2 font-bold">2/7 원인(트리거)</div>
                  <div className="flex flex-wrap gap-2">
                    {TRIGGER_OPTIONS.map((opt) => (
                      <button
                        key={opt}
                        onClick={() => setTriggerPick(opt)}
                        className={`px-3 py-1.5 rounded-xl border text-sm transition-all ${
                          triggerPick === opt
                            ? "bg-emerald-600 text-white border-emerald-600"
                            : "bg-white text-slate-600 border-slate-200"
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                  {triggerPick === "기타" && (
                    <>
                      <Field className="mt-2" placeholder="원인 직접 입력" value={triggerOther} onChange={(e) => setTriggerOther(e.target.value)} />
                      <SmallError show={triedSubmitRef.current && !!triggerError}>{triggerError}</SmallError>
                    </>
                  )}
                </div>

                {/* 3/7 강도 */}
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-xs text-slate-500 font-bold">3/7 감정 강도 (1~10)</span>
                    <span className="text-sm font-bold text-emerald-600">{intensity}</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={intensity}
                    onChange={(e) => setIntensity(Number(e.target.value))}
                    className="w-full accent-emerald-600"
                  />
                </div>

                {/* 4/7 수면 */}
                <div>
                  <div className="text-xs text-slate-500 mb-2 font-bold">4/7 수면 시간</div>

                  <div className="flex flex-wrap gap-2 mb-2">
                    {[5, 6, 7, 8].map((h) => (
                      <button
                        key={h}
                        onClick={() => setSleepFromPreset(h)}
                        className="px-3 py-1.5 rounded-xl border text-sm bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                      >
                        {h}h
                      </button>
                    ))}
                    <button
                      onClick={() => setSleepFromPreset(0)}
                      className="px-3 py-1.5 rounded-xl border text-sm bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                    >
                      못 잠
                    </button>
                  </div>

                  <div className="border border-slate-200 rounded-xl bg-white p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-[12px] text-slate-500">대충 이 정도면 돼요</div>
                      <div className="font-mono tabular-nums text-sm font-semibold text-slate-800">
                        {sleepNum == null ? "-" : `${sleepNum}h`}
                      </div>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={24}
                      step={0.5}
                      value={sleepNum == null ? 6 : sleepNum}
                      onChange={(e) => onSleepSlider(Number(e.target.value))}
                      className="w-full mt-2 accent-emerald-600"
                    />
                  </div>

                  <div className="mt-2">
                    <div className="relative">
                      <Field
                        value={sleepRaw}
                        onChange={(e) => onSleepInput(e.target.value)}
                        placeholder="예: 6.5"
                        className="pr-10 text-center font-mono font-bold"
                      />
                      <span className="absolute right-3 top-2.5 text-sm text-slate-400">h</span>
                    </div>
                    <SmallError show={triedSubmitRef.current && !!sleepError}>{sleepError}</SmallError>
                  </div>
                </div>

                {/* 5/7 약 */}
                <div>
                  <div className="text-xs text-slate-500 mb-2 font-bold">5/7 약 복용</div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setTookMeds(true)}
                      className={`flex-1 py-2 rounded-xl text-sm border font-medium transition ${
                        tookMeds === true
                          ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                          : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      오늘은 먹었어요
                    </button>
                    <button
                      onClick={() => setTookMeds(false)}
                      className={`flex-1 py-2 rounded-xl text-sm border font-medium transition ${
                        tookMeds === false
                          ? "bg-slate-50 border-slate-200 text-slate-700"
                          : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      오늘은 안 먹었어요
                    </button>
                  </div>
                  <div className="mt-1 text-[12px] text-slate-500">기록이 목적이지 평가가 아니에요.</div>
                </div>

                {/* 6/7 숙제 */}
                <div className="pt-4 border-t border-slate-100">
                  <div className="text-xs text-slate-500 mb-3 font-bold">6/7 오늘의 숙제</div>

                  {homeworks.length > 0 ? (
                    <div className="space-y-2 mb-2">
                      {homeworks.map((h) => {
                        const isChecked = checkedHomeworks.has(h.id);
                        return (
                          <div
                            key={h.id}
                            onClick={() => toggleHomeworkCheck(h.id)}
                            className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                              isChecked
                                ? "bg-emerald-50 border-emerald-200"
                                : "bg-white border-slate-200 hover:bg-slate-50"
                            }`}
                          >
                            <div
                              className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                                isChecked ? "bg-emerald-500 border-emerald-500" : "border-slate-300"
                              }`}
                            >
                              {isChecked && <span className="text-white text-xs">✓</span>}
                            </div>
                            <span className={`text-sm ${isChecked ? "text-slate-400 line-through" : "text-slate-800"}`}>
                              {h.title}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-sm text-slate-400 mb-2 bg-slate-50 p-3 rounded-xl text-center">
                      등록된 숙제가 없습니다.
                    </div>
                  )}

                  <div className="text-[12px] text-slate-500">하나라도 체크하면 “오늘 숙제 수행”으로 저장돼요.</div>
                </div>

                {/* 7/7 메모 */}
                <div>
                  <div className="text-xs text-slate-500 mb-2 font-bold">7/7 메모 (선택)</div>
                  <textarea
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-slate-900 outline-none h-24 resize-none bg-white"
                    placeholder="자유롭게 남겨주세요."
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                  />
                </div>

                {/* 저장 */}
                <Btn
                  onClick={() => void submitLog()}
                  disabled={loading || !canSubmit}
                  className="w-full py-4 text-base shadow-lg bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {loading ? "저장 중..." : todayLogId ? "오늘 기록 수정하기" : "오늘 기록 저장하기"}
                </Btn>

                {showErrors && <div className="text-sm text-slate-600 text-center">위 항목을 조금만 확인해줘요 🙂</div>}
              </div>
            </Card>
          </>
        )}
      </main>

      <BottomTabs active="today" />
    </div>
  );
}
