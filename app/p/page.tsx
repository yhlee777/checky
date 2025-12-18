"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import type { Patient } from "@/lib/types";
import { Btn, Card, Field } from "@/components/ui";
import { usePatientBoot } from "@/lib/usePatientBoot";
import {
  Check,
  X,
  Sparkles,
  HeartHandshake,
  ChevronDown,
  ChevronUp,
  Calendar,
  Clock // 아이콘 추가
} from "lucide-react";

/* ===============================
 * Constants & Types
 * =============================== */
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
  memo: string | null;
  is_emergency?: boolean;
  created_at?: string;
};

/* ===============================
 * Helpers
 * =============================== */
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
async function hapticLight() {
  try {
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {}
}
async function hapticMedium() {
  try {
    await Haptics.impact({ style: ImpactStyle.Medium });
  } catch {}
}

// ✅ D-Day 계산 함수
function calcDday(targetDate: string | null): string {
  if (!targetDate) return "";
  const today = new Date(isoToday()); // 시간 성분 제거된 오늘
  const target = parseISO(targetDate);
  
  // 밀리초 차이 -> 일수 변환
  const diffTime = target.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "D-Day";
  if (diffDays > 0) return `D-${diffDays}`;
  return `D+${Math.abs(diffDays)}`;
}

/* ===============================
 * Brand style helpers (emerald)
 * =============================== */
const BRAND = {
  solid:
    "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 hover:border-emerald-700",
  solidDark:
    "bg-emerald-700 hover:bg-emerald-800 text-white border-emerald-700 hover:border-emerald-800",
  soft: "bg-emerald-50 text-emerald-800 border-emerald-200",
  ring: "focus:ring-2 focus:ring-emerald-200",
  chipActive: "bg-emerald-600 text-white border-emerald-600",
  chipInactive: "bg-white text-slate-700 border-slate-200 hover:bg-slate-50",
};

/* ===============================
 * Small UI Primitives
 * =============================== */
function Section({
  title,
  subtitle,
  step,
  children,
}: {
  title: string;
  subtitle?: string;
  step?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2">
          {step && (
            <span className="text-[11px] font-extrabold text-slate-400">
              {step}
            </span>
          )}
          <div className="text-sm font-bold text-slate-800">{title}</div>
        </div>
        {subtitle && (
          <div className="text-[12px] text-slate-500">{subtitle}</div>
        )}
      </div>
      {children}
    </div>
  );
}

function ChoiceChip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "px-3 py-1.5 rounded-xl border text-sm font-extrabold transition",
        "focus:outline-none focus:ring-2 focus:ring-emerald-200",
        active ? BRAND.chipActive : BRAND.chipInactive,
      ].join(" ")}
    >
      {children}
    </button>
  );
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
      ? "bg-emerald-50 text-emerald-800 border-emerald-100"
      : tone === "neutral"
      ? "bg-white text-slate-700 border-slate-200"
      : "bg-slate-50 text-slate-600 border-slate-200";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cls}`}
    >
      {children}
    </span>
  );
}

function StatusPill({ done }: { done: boolean }) {
  return done ? (
    <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-extrabold text-emerald-800">
      오늘 기록 완료 ✓
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-extrabold text-slate-600">
      오늘 기록 미완료
    </span>
  );
}

function SmallError({
  show,
  children,
}: {
  show: boolean;
  children: React.ReactNode;
}) {
  if (!show) return null;
  return <div className="mt-1 text-[12px] text-rose-600">{children}</div>;
}

function Toast({
  msg,
  tone,
}: {
  msg: string;
  tone: "success" | "error" | "info";
}) {
  if (!msg) return null;

  const Icon = tone === "error" ? X : Check;

  const box =
    tone === "error"
      ? "bg-rose-600/90"
      : tone === "info"
      ? "bg-slate-800/90"
      : "bg-emerald-600/90";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none">
      <div
        className={[
          "text-white px-5 py-3 rounded-full shadow-xl flex items-center gap-3 backdrop-blur-sm",
          "animate-in fade-in zoom-in duration-150",
          box,
        ].join(" ")}
      >
        <div className="bg-white/15 rounded-full p-1">
          <Icon className="w-4 h-4 stroke-[3]" />
        </div>
        <span className="font-extrabold text-sm">{msg}</span>
      </div>
    </div>
  );
}

function BottomTabs({ active }: { active: "today" | "insights" }) {
  const base =
    "rounded-xl border px-3 py-2 text-center text-sm font-extrabold transition focus:outline-none focus:ring-2 focus:ring-emerald-200";
  const on = "bg-emerald-600 text-white border-emerald-600";
  const off = "bg-white text-slate-700 border-slate-200 hover:bg-slate-50";

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/90 backdrop-blur-md">
      <div className="max-w-xl mx-auto px-4 py-3 grid grid-cols-2 gap-2">
        <Link href="/p" className={[base, active === "today" ? on : off].join(" ")}>
          오늘 기록
        </Link>
        <Link
          href="/p/insights"
          className={[base, active === "insights" ? on : off].join(" ")}
        >
          나의 한 주
        </Link>
      </div>
    </div>
  );
}

/* 케어 요청 버튼: 브랜드 컬러 안에서 “중요하지만 깔끔하게” */
function CareRequest({
  checked,
  onToggle,
}: {
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={[
        "w-full text-left rounded-2xl border transition-all",
        "focus:outline-none focus:ring-2 focus:ring-emerald-200",
        checked
          ? "border-emerald-300 bg-emerald-50"
          : "border-slate-200 bg-white hover:bg-slate-50",
      ].join(" ")}
    >
      <div className="flex items-start gap-3 p-4">
        {/* left accent bar */}
        <div
          className={[
            "mt-1 h-10 w-1.5 rounded-full",
            checked ? "bg-emerald-500" : "bg-slate-200",
          ].join(" ")}
        />

        <div className="flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div
                className={[
                  "text-sm font-extrabold flex items-center gap-2",
                  checked ? "text-emerald-900" : "text-slate-900",
                ].join(" ")}
              >
                <Sparkles className={["w-4 h-4", checked ? "text-emerald-600" : "text-slate-400"].join(" ")} />
                <span>오늘 유독 힘들어요 (케어 요청)</span>
              </div>
              <div className="mt-1 text-[12px] leading-relaxed text-slate-600">
                체크하면 상담사님이 기록을{" "}
                <span className={["font-extrabold", checked ? "text-emerald-800" : "text-slate-700"].join(" ")}>
                  우선순위로
                </span>{" "}
                확인합니다.
              </div>
            </div>

            {/* toggle */}
            <div
              className={[
                "shrink-0 inline-flex items-center w-12 h-7 rounded-full border transition",
                checked ? "bg-emerald-600 border-emerald-600" : "bg-slate-100 border-slate-200",
              ].join(" ")}
              aria-hidden="true"
            >
              <div
                className={[
                  "w-6 h-6 rounded-full bg-white shadow-sm transition-transform",
                  checked ? "translate-x-5" : "translate-x-0.5",
                ].join(" ")}
              />
            </div>
          </div>

          {checked && (
            <div className="mt-3 rounded-xl border border-emerald-200 bg-white p-3">
              <div className="text-[12px] text-emerald-900 font-extrabold">
                짧게라도 남겨주시면 도움이 돼요
              </div>
              <div className="mt-1 text-[12px] text-slate-600 leading-relaxed">
                예: “오늘 잠을 거의 못 잤어요”, “약을 끊고 싶어요”, “상담에서 꼭 말하고 싶어요”
              </div>
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

/* ===============================
 * Main Page Component
 * =============================== */
export default function Page() {
  const router = useRouter();

  // Boot
  const { booting, userId, linkedPatient: bootPatient } = usePatientBoot();

  const [linkedPatient, setLinkedPatient] = useState<Patient | null>(null);
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);

  const today = useMemo(() => isoToday(), []);

  // Logs panel
  const [showMyLogs, setShowMyLogs] = useState(false);
  const [myLogs, setMyLogs] = useState<LogRow[]>([]);
  const [range, setRange] = useState<"7d" | "30d">("7d");

  // Form
  const [todayLogId, setTodayLogId] = useState<string | null>(null);
  const [emotionPick, setEmotionPick] = useState<EmotionPick>("불안");
  const [emotionOther, setEmotionOther] = useState("");
  const [triggerPick, setTriggerPick] = useState<TriggerPick>("학업/일");
  const [triggerOther, setTriggerOther] = useState("");
  const [intensity, setIntensity] = useState(5);
  const [sleepRaw, setSleepRaw] = useState<string>("6.5");
  const [sleepNum, setSleepNum] = useState<number | null>(6.5);
  const [tookMeds, setTookMeds] = useState<boolean | null>(null);
  const [memo, setMemo] = useState("");
  const [isEmergency, setIsEmergency] = useState(false);

  // Toast
  const [toastMsg, setToastMsg] = useState("");
  const [toastTone, setToastTone] = useState<"success" | "error" | "info">(
    "success"
  );

  const hydratedOnceRef = useRef(false);
  const triedSubmitRef = useRef(false);

  useEffect(() => {
    setLinkedPatient(bootPatient);
  }, [bootPatient]);

  // Derived
  const emotionFinal = useMemo(() => {
    if (emotionPick !== "기타") return emotionPick;
    return `기타: ${emotionOther.trim()}`;
  }, [emotionPick, emotionOther]);

  const triggerFinal = useMemo(() => {
    if (triggerPick !== "기타") return triggerPick;
    return `기타: ${triggerOther.trim()}`;
  }, [triggerPick, triggerOther]);

  // ✅ D-Day Calculation
  const dDay = useMemo(() => {
    if (!linkedPatient?.next_session_date) return null;
    return calcDday(linkedPatient.next_session_date);
  }, [linkedPatient]);

  // Validations
  const emotionError = useMemo(() => {
    if (emotionPick === "기타" && !emotionOther.trim())
      return "감정을 직접 입력해주세요.";
    return "";
  }, [emotionPick, emotionOther]);

  const triggerError = useMemo(() => {
    if (triggerPick === "기타" && !triggerOther.trim())
      return "원인을 직접 입력해주세요.";
    return "";
  }, [triggerPick, triggerOther]);

  const sleepError = useMemo(() => {
    const v = sleepRaw.trim();
    if (!v) return "";
    const n = Number(v);
    if (!Number.isFinite(n)) return "숫자만 입력 가능해요.";
    if (n < 0 || n > 24) return "0~24 사이로 입력해주세요.";
    return "";
  }, [sleepRaw]);

  const canSubmit = useMemo(() => {
    if (emotionError) return false;
    if (triggerError) return false;
    if (sleepError) return false;
    return true;
  }, [emotionError, triggerError, sleepError]);

  const showErrors = triedSubmitRef.current && !canSubmit;

  const openToast = (tone: "success" | "error" | "info", msg: string) => {
    setToastTone(tone);
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 1800);
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
    setIsEmergency(Boolean(row?.is_emergency));
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
  }, [linkedPatient?.id, range, today]);

  const recent3 = useMemo(() => {
    const days = [addDaysISO(today, -2), addDaysISO(today, -1), today];
    const map = new Map(myLogs.map((l) => [l.log_date, l] as const));
    const rows = days.map((d) => ({ date: d, row: map.get(d) ?? null }));

    const ints = rows
      .map((x) => x.row?.intensity)
      .filter((v): v is number => typeof v === "number");

    const sleeps = rows
      .map((x) => x.row?.sleep_hours)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));

    const avgInt = ints.length
      ? Math.round((ints.reduce((a, b) => a + b, 0) / ints.length) * 10) / 10
      : null;

    const avgSleep = sleeps.length
      ? Math.round((sleeps.reduce((a, b) => a + b, 0) / sleeps.length) * 10) /
        10
      : null;

    const filledDays = rows.filter((x) => !!x.row).length;
    const latest = rows.slice().reverse().find((x) => x.row)?.row ?? null;
    const topEmotion = latest?.emotion ?? null;

    return { rows, avgInt, avgSleep, filledDays, topEmotion };
  }, [myLogs, today]);

  const todayDone = useMemo(() => {
    return myLogs.some((l) => l.log_date === today);
  }, [myLogs, today]);

  const redeem = async () => {
    const code = inviteCode.trim();
    if (!code) {
      openToast("error", "초대코드를 입력해주세요.");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("redeem_invite_code", {
        p_code: code,
      });
      if (error) throw error;

      const pid = data?.[0]?.patient_id;
      if (!pid) throw new Error("연결 실패");

      const { data: p, error: pe } = await supabase
        .from("patients")
        .select("*")
        .eq("id", pid)
        .single();
      if (pe) throw pe;

      setLinkedPatient(p as Patient);
      setInviteCode("");
      await hapticLight();
      openToast("success", "연결 완료");
    } catch (e: any) {
      openToast("error", e?.message ?? "연결 실패");
    } finally {
      setLoading(false);
    }
  };

  const submitLog = async () => {
    if (!linkedPatient) return;

    triedSubmitRef.current = true;
    if (!canSubmit) {
      await hapticLight();
      openToast("error", "입력값을 확인해주세요.");
      return;
    }

    const wasNew = !todayLogId;
    setLoading(true);

    try {
      const sleepTrim = sleepRaw.trim();
      const sleep = sleepTrim ? Number(sleepTrim) : null;

      const payload: Partial<LogRow> & {
        patient_id: string;
        counselor_id: string;
        log_date: string;
      } = {
        patient_id: linkedPatient.id,
        counselor_id: (linkedPatient as any).counselor_id,
        log_date: today,
        emotion: emotionFinal,
        trigger: triggerFinal,
        intensity,
        sleep_hours:
          sleep != null && Number.isFinite(sleep) ? clamp(sleep, 0, 24) : null,
        took_meds: tookMeds,
        memo: memo.trim() ? memo.trim() : null,
        is_emergency: isEmergency,
      };

      if (todayLogId) (payload as any).id = todayLogId;

      const { data, error } = await supabase
        .from("patient_logs")
        .upsert(payload, { onConflict: "patient_id,log_date" })
        .select("*")
        .single();

      if (error) throw error;

      await hapticMedium();
      setTodayLogId((data as any)?.id ?? todayLogId ?? null);
      await fetchLogs(linkedPatient.id, range);

      openToast("success", wasNew ? "기록이 완료되었습니다 ✨" : "수정되었습니다.");

      if (wasNew) {
        router.push("/p/insights");
      }
    } catch (e: any) {
      openToast("error", e?.message ?? "저장 실패");
    } finally {
      setLoading(false);
    }
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

  if (booting) return null;
  if (!userId) return null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <Toast msg={toastMsg} tone={toastTone} />

      <main className="max-w-xl mx-auto p-4 pb-28 space-y-4">
        {!linkedPatient ? (
          <Card>
            <h2 className="text-base font-extrabold">초대코드 연결</h2>
            <p className="mt-1 text-sm text-slate-600">
              상담사로부터 받은 코드를 입력하면 기록이 연결됩니다.
            </p>

            <div className="mt-3 flex gap-2">
              <Field
                placeholder="8자리 코드"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
              />
              <Btn onClick={() => void redeem()} disabled={loading}>
                {loading ? "..." : "연결"}
              </Btn>
            </div>
          </Card>
        ) : (
          <>
            {/* Header Card (Updated with D-Day) */}
            <Card>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-extrabold">{linkedPatient.name}님</h2>
                  <div className="mt-2 flex items-center gap-2">
                    {/* ✅ D-Day Badge */}
                    <div className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 ${dDay ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"}`}>
                      <Calendar className="w-3.5 h-3.5" />
                      {dDay ? (
                        <span>상담까지 {dDay}</span>
                      ) : (
                        <span>일정 미정</span>
                      )}
                    </div>
                    {/* Status Badge */}
                    <StatusPill done={todayDone} />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowMyLogs((v) => !v)}
                  className={[
                    "inline-flex items-center gap-1.5 rounded-xl border px-3 py-2",
                    "text-sm font-extrabold transition",
                    BRAND.chipInactive,
                    "focus:outline-none focus:ring-2 focus:ring-emerald-200",
                  ].join(" ")}
                >
                  내 기록
                  {showMyLogs ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>
              </div>

              {/* Stats Bar */}
              <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-2">
                <Pill>{`최근 3일: ${recent3.filledDays}/3 기록`}</Pill>
                <Pill tone="neutral">
                  {recent3.avgInt != null ? `평균 강도 ${recent3.avgInt}` : "강도 -"}
                </Pill>
                <Pill tone="neutral">
                  {recent3.avgSleep != null ? `평균 수면 ${recent3.avgSleep}h` : "수면 -"}
                </Pill>
                {recent3.topEmotion && <Pill tone="good">{recent3.topEmotion}</Pill>}
              </div>

              {showMyLogs && (
                <div className="mt-4">
                  <div className="flex gap-2 mb-3">
                    <button
                      type="button"
                      onClick={() => setRange("7d")}
                      className={[
                        "px-3 py-1 text-xs rounded-full border font-extrabold transition",
                        range === "7d"
                          ? BRAND.chipActive
                          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
                      ].join(" ")}
                    >
                      7일
                    </button>
                    <button
                      type="button"
                      onClick={() => setRange("30d")}
                      className={[
                        "px-3 py-1 text-xs rounded-full border font-extrabold transition",
                        range === "30d"
                          ? BRAND.chipActive
                          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
                      ].join(" ")}
                    >
                      30일
                    </button>
                  </div>

                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl bg-white overflow-hidden">
                    {myLogs.length === 0 ? (
                      <div className="p-3 text-sm text-slate-500">기록 없음</div>
                    ) : (
                      myLogs.map((log) => (
                        <button
                          key={log.id}
                          type="button"
                          onClick={() => {
                            hydrateFormFromRow(log);
                            if (log.log_date === today) setTodayLogId(log.id);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                          className="w-full text-left p-3 hover:bg-slate-50 transition"
                        >
                          <div className="flex justify-between text-sm">
                            <span className="font-extrabold">
                              {log.log_date}
                              {log.log_date === today && " (오늘)"}
                            </span>
                            <span className="font-mono font-extrabold text-slate-500">
                              강도 {log.intensity ?? "-"}
                            </span>
                          </div>

                          <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                            <span>
                              {log.emotion} · {log.trigger}
                            </span>
                            {log.is_emergency && (
                              <span className="bg-emerald-50 text-emerald-800 border border-emerald-100 px-2 py-0.5 rounded-full font-extrabold">
                                케어 요청
                              </span>
                            )}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </Card>

            {/* Form Card */}
            <Card>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-extrabold">오늘의 기록</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    피곤한 날은 최소만 해도 돼요.
                  </p>
                </div>
                <div className="text-xs text-slate-500">
                  {todayLogId ? "수정 모드" : "작성 모드"}
                </div>
              </div>

              <div className="mt-5 space-y-6">
                {/* 1. Emotion */}
                <Section title="오늘의 감정" step="1/6">
                  <div className="flex flex-wrap gap-2">
                    {EMOTION_OPTIONS.map((opt) => (
                      <ChoiceChip
                        key={opt}
                        active={emotionPick === opt}
                        onClick={() => setEmotionPick(opt)}
                      >
                        {opt}
                      </ChoiceChip>
                    ))}
                  </div>

                  {emotionPick === "기타" && (
                    <>
                      <Field
                        className="mt-2"
                        placeholder="감정 직접 입력"
                        value={emotionOther}
                        onChange={(e) => setEmotionOther(e.target.value)}
                      />
                      <SmallError show={triedSubmitRef.current && !!emotionError}>
                        {emotionError}
                      </SmallError>
                    </>
                  )}
                </Section>

                {/* 2. Trigger */}
                <Section title="원인(트리거)" step="2/6">
                  <div className="flex flex-wrap gap-2">
                    {TRIGGER_OPTIONS.map((opt) => (
                      <ChoiceChip
                        key={opt}
                        active={triggerPick === opt}
                        onClick={() => setTriggerPick(opt)}
                      >
                        {opt}
                      </ChoiceChip>
                    ))}
                  </div>

                  {triggerPick === "기타" && (
                    <>
                      <Field
                        className="mt-2"
                        placeholder="원인 직접 입력"
                        value={triggerOther}
                        onChange={(e) => setTriggerOther(e.target.value)}
                      />
                      <SmallError show={triedSubmitRef.current && !!triggerError}>
                        {triggerError}
                      </SmallError>
                    </>
                  )}
                </Section>

                {/* 3. Intensity */}
                <Section title="감정 강도 (1~10)" step="3/6" subtitle={`현재: ${intensity}`}>
                  <div className="rounded-2xl border border-slate-200 bg-white p-3">
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={intensity}
                      onChange={(e) => setIntensity(Number(e.target.value))}
                      className="w-full accent-emerald-600"
                    />
                    <div className="mt-2 flex justify-between text-[11px] text-slate-500 font-semibold">
                      <span>가벼움</span>
                      <span>아주 강함</span>
                    </div>
                  </div>

                  {intensity >= 8 && (
                    <div className="mt-3 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-start gap-3 animate-in fade-in slide-in-from-top-1">
                      <div className="bg-white p-2 rounded-full shadow-sm text-emerald-700">
                        <HeartHandshake className="w-5 h-5" />
                      </div>
                      <div className="text-sm text-emerald-900">
                        <div className="font-extrabold mb-1">혼자 감당하기 힘드신가요?</div>
                        <div className="text-xs opacity-90 leading-relaxed">
                          선생님께 솔직하게 털어놓으셔도 괜찮아요.
                          <br />
                          지금 당장 도움이 필요하다면:{" "}
                          <a href="tel:1393" className="underline font-extrabold">
                            1393 (24시간)
                          </a>
                        </div>
                      </div>
                    </div>
                  )}
                </Section>

                {/* 4. Sleep */}
                <Section title="수면 시간" step="4/6">
                  <div className="flex flex-wrap gap-2">
                    {[5, 6, 7, 8].map((h) => (
                      <button
                        key={h}
                        type="button"
                        onClick={() => setSleepFromPreset(h)}
                        className="px-3 py-1.5 rounded-xl border text-sm bg-white border-slate-200 text-slate-700 hover:bg-slate-50 font-extrabold"
                      >
                        {h}h
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setSleepFromPreset(0)}
                      className="px-3 py-1.5 rounded-xl border text-sm bg-white border-slate-200 text-slate-700 hover:bg-slate-50 font-extrabold"
                    >
                      못 잠
                    </button>
                  </div>

                  <div className="mt-2 border border-slate-200 rounded-2xl bg-white p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-[12px] text-slate-500 font-semibold">
                        대충 이 정도면 돼요
                      </div>
                      <div className="font-mono tabular-nums text-sm font-extrabold text-slate-900">
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

                  <div className="mt-2 relative">
                    <Field
                      value={sleepRaw}
                      onChange={(e) => onSleepInput(e.target.value)}
                      placeholder="예: 6.5"
                      className="pr-10 text-center font-mono font-extrabold"
                    />
                    <span className="absolute right-3 top-2.5 text-sm text-slate-400">
                      h
                    </span>
                  </div>
                  <SmallError show={triedSubmitRef.current && !!sleepError}>
                    {sleepError}
                  </SmallError>
                </Section>

                {/* 5. Meds */}
                <Section title="약 복용" step="5/6">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setTookMeds(true)}
                      className={[
                        "py-2 rounded-2xl text-sm border font-extrabold transition",
                        "focus:outline-none focus:ring-2 focus:ring-emerald-200",
                        tookMeds === true
                          ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50",
                      ].join(" ")}
                    >
                      오늘은 먹었어요
                    </button>
                    <button
                      type="button"
                      onClick={() => setTookMeds(false)}
                      className={[
                        "py-2 rounded-2xl text-sm border font-extrabold transition",
                        "focus:outline-none focus:ring-2 focus:ring-emerald-200",
                        tookMeds === false
                          ? "bg-slate-100 border-slate-200 text-slate-900"
                          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50",
                      ].join(" ")}
                    >
                      오늘은 안 먹었어요
                    </button>
                  </div>

                  <div className="text-[12px] text-slate-500">
                    선택하지 않아도 돼요.
                  </div>
                </Section>

                {/* 6. Memo */}
                <Section title="선생님께 남기는 메모 (선택)" step="6/6">
                  <textarea
                    className="w-full border border-slate-200 rounded-2xl px-3 py-3 text-slate-900 outline-none h-28 resize-none bg-white text-sm leading-relaxed focus:ring-2 focus:ring-emerald-200"
                    placeholder="오늘 있었던 일 중 선생님이 꼭 알아주셨으면 하는 내용이 있나요? (예: 특정 사건, 약 부작용, 상담에서 하고 싶은 말)"
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                  />
                </Section>

                {/* Care Request (brand) */}
                <CareRequest checked={isEmergency} onToggle={() => setIsEmergency((v) => !v)} />

                <Btn
                  onClick={() => void submitLog()}
                  disabled={loading || !canSubmit}
                  className={[
                    "w-full py-4 text-base shadow-lg transition-all",
                    "bg-emerald-600 hover:bg-emerald-700 text-white",
                  ].join(" ")}
                >
                  {loading
                    ? "저장 중..."
                    : todayLogId
                    ? "오늘 기록 수정하기"
                    : "오늘 기록 저장하기"}
                </Btn>

                {showErrors && (
                  <div className="text-sm text-slate-600 text-center">
                    위 항목을 조금만 확인해줘요 🙂
                  </div>
                )}
              </div>
            </Card>
          </>
        )}
      </main>

      <BottomTabs active="today" />
    </div>
  );
}