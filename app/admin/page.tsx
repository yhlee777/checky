"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { Btn, Card, Field } from "@/components/ui";
import {
  Check,
  X,
  ShieldAlert,
  Sparkles,
  ChevronRight,
  RefreshCw,
  Building2,
  KeyRound,
} from "lucide-react";

/* ===============================
 * Types (based on your schema)
 * =============================== */
type ProfileRow = {
  user_id: string;
  role: "patient" | "counselor" | "center_admin";
  center_id: string | null;
};

type PatientRow = {
  id: string;
  name: string;
  counselor_id: string;
  center_id: string | null;
  next_session_date: string | null;
  current_risk_level: "LOW" | "MODERATE" | "HIGH" | "IMMINENT" | string;
  created_at?: string;
  updated_at?: string;
};

type PatientLogRow = {
  id: string;
  patient_id: string;
  counselor_id: string;
  log_date: string; // date
  emotion: string;
  trigger: string;
  intensity: number;
  sleep_hours: number | null;
  took_meds: boolean | null;
  memo: string | null;
  is_reviewed: boolean;
  detected_keywords: string[] | null;
  is_emergency: boolean | null;
  created_at: string;
};

type InterventionLogRow = {
  id: string;
  center_id: string;
  patient_id: string;
  counselor_id: string;
  related_log_id: string | null;
  risk_level: "LOW" | "MODERATE" | "HIGH" | "IMMINENT";
  actions_taken: any; // jsonb
  note: string | null;
  created_at: string;
};

type RiskItem = {
  patient: PatientRow;
  log: PatientLogRow;
  hasIntervention: boolean;
  intervention?: InterventionLogRow | null;
  score: number; // for sorting
};

type ToastTone = "success" | "error" | "info";

/* ===============================
 * Helpers
 * =============================== */
function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function isoToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function daysAgoISO(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function riskBadge(risk: string) {
  const base =
    "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-extrabold";
  if (risk === "IMMINENT")
    return clsx(base, "bg-rose-50 text-rose-700 border-rose-200");
  if (risk === "HIGH")
    return clsx(base, "bg-orange-50 text-orange-700 border-orange-200");
  if (risk === "MODERATE")
    return clsx(base, "bg-amber-50 text-amber-800 border-amber-200");
  return clsx(base, "bg-emerald-50 text-emerald-800 border-emerald-200");
}

function flagBadge(kind: "EMERGENCY" | "KEYWORDS" | "INTENSE") {
  const base =
    "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-extrabold";
  if (kind === "EMERGENCY")
    return clsx(base, "bg-emerald-50 text-emerald-900 border-emerald-200");
  if (kind === "KEYWORDS")
    return clsx(base, "bg-slate-50 text-slate-700 border-slate-200");
  return clsx(base, "bg-slate-900 text-white border-slate-900");
}

function Toast({
  msg,
  tone,
  onClose,
}: {
  msg: string;
  tone: ToastTone;
  onClose: () => void;
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
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className={clsx(
          "pointer-events-none text-white px-5 py-3 rounded-full shadow-xl flex items-center gap-3 backdrop-blur-sm",
          "animate-in fade-in zoom-in duration-150",
          box
        )}
      >
        <div className="bg-white/15 rounded-full p-1">
          <Icon className="w-4 h-4 stroke-[3]" />
        </div>
        <span className="font-extrabold text-sm">{msg}</span>
      </div>
    </div>
  );
}

/* ===============================
 * Intervention modal
 * =============================== */
const RISK_LEVELS: Array<InterventionLogRow["risk_level"]> = [
  "LOW",
  "MODERATE",
  "HIGH",
  "IMMINENT",
];

const ACTION_PRESETS = [
  { key: "CONTACT_ATTEMPT", label: "연락 시도" },
  { key: "SAFETY_PLAN", label: "안전계획 안내" },
  { key: "EMERGENCY_REFERRAL", label: "응급기관/1393 안내" },
  { key: "GUARDIAN_CONTACT", label: "보호자 안내/연락" },
  { key: "SESSION_RESCHEDULE", label: "상담 일정 조정" },
  { key: "SUPERVISION", label: "슈퍼비전 보고" },
  { key: "NO_ACTION", label: "개입 불필요(무행동 기록)" },
] as const;

function InterventionModal({
  open,
  onClose,
  onSubmit,
  patientName,
  logDate,
  defaultRisk,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    risk_level: InterventionLogRow["risk_level"];
    actions_taken: any[];
    note: string;
  }) => Promise<void>;
  patientName: string;
  logDate: string;
  defaultRisk: InterventionLogRow["risk_level"];
}) {
  const [risk, setRisk] = useState<InterventionLogRow["risk_level"]>(defaultRisk);
  const [note, setNote] = useState("");
  const [actions, setActions] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRisk(defaultRisk);
    setNote("");
    setActions({});
  }, [open, defaultRisk]);

  if (!open) return null;

  const actionsTaken = ACTION_PRESETS.filter((a) => actions[a.key]).map((a) => ({
    type: a.key,
    label: a.label,
    at: new Date().toISOString(),
  }));

  return (
    <div className="fixed inset-0 z-[150] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-xl rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-extrabold text-slate-900">
              개입 로그 작성
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {patientName} · {logDate}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-extrabold hover:bg-slate-50"
          >
            닫기
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <div className="text-xs font-extrabold text-slate-500 mb-2">
              리스크 레벨
            </div>
            <div className="flex flex-wrap gap-2">
              {RISK_LEVELS.map((lv) => (
                <button
                  key={lv}
                  onClick={() => setRisk(lv)}
                  className={clsx(
                    "px-3 py-1.5 rounded-xl border text-sm font-extrabold transition",
                    "focus:outline-none focus:ring-2 focus:ring-emerald-200",
                    risk === lv
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                  )}
                >
                  {lv}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs font-extrabold text-slate-500 mb-2">
              조치 사항 (복수 선택)
            </div>
            <div className="grid grid-cols-2 gap-2">
              {ACTION_PRESETS.map((a) => (
                <button
                  key={a.key}
                  onClick={() =>
                    setActions((prev) => ({ ...prev, [a.key]: !prev[a.key] }))
                  }
                  className={clsx(
                    "px-3 py-2 rounded-2xl border text-sm font-extrabold transition text-left",
                    "focus:outline-none focus:ring-2 focus:ring-emerald-200",
                    actions[a.key]
                      ? "bg-emerald-50 text-emerald-900 border-emerald-200"
                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                  )}
                >
                  {a.label}
                </button>
              ))}
            </div>
            <div className="mt-2 text-[12px] text-slate-500">
              * “무행동 기록”은 반드시 사유를 노트에 적는 게 좋아요.
            </div>
          </div>

          <div>
            <div className="text-xs font-extrabold text-slate-500 mb-2">
              노트 (선택)
            </div>
            <textarea
              className="w-full border border-slate-200 rounded-2xl px-3 py-3 text-slate-900 outline-none h-28 resize-none bg-white text-sm leading-relaxed focus:ring-2 focus:ring-emerald-200"
              placeholder="예: 내담자 직접 부인, 반복 패턴 아님, 기존 안전계획 유지 등"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <div className="p-5 border-t border-slate-100 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-500">
            선택된 조치:{" "}
            <span className="font-extrabold text-slate-800">
              {actionsTaken.length}개
            </span>
          </div>
          <Btn
            onClick={async () => {
              setLoading(true);
              try {
                await onSubmit({
                  risk_level: risk,
                  actions_taken: actionsTaken,
                  note: note.trim(),
                });
              } finally {
                setLoading(false);
              }
            }}
            disabled={loading}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {loading ? "저장 중..." : "개입 로그 저장"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

/* ===============================
 * Main: Center Admin Page
 * =============================== */
export default function CenterAdminPage() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [centerId, setCenterId] = useState<string | null>(null);

  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [logs, setLogs] = useState<PatientLogRow[]>([]);
  const [interventions, setInterventions] = useState<InterventionLogRow[]>([]);

  const [days, setDays] = useState(14);
  const [q, setQ] = useState("");

  const [toastMsg, setToastMsg] = useState("");
  const [toastTone, setToastTone] = useState<ToastTone>("success");

  const [selected, setSelected] = useState<RiskItem | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const today = useMemo(() => isoToday(), []);

  const openToast = (tone: ToastTone, msg: string) => {
    setToastTone(tone);
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 1600);
  };

  // 1) boot: auth + profile
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: auth } = await supabase.auth.getUser();
        const user = auth?.user;
        if (!user) {
          openToast("error", "로그인이 필요합니다.");
          setProfile(null);
          setCenterId(null);
          return;
        }

        const { data: p, error: pe } = await supabase
          .from("profiles")
          .select("user_id, role, center_id")
          .eq("user_id", user.id)
          .single();

        if (pe) throw pe;

        const prof = p as ProfileRow;
        setProfile(prof);
        setCenterId(prof.center_id);

        if (prof.role !== "center_admin") {
          openToast("error", "센터장 계정만 접근할 수 있습니다.");
        }
      } catch (e: any) {
        openToast("error", e?.message ?? "부팅 실패");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isCenterAdmin = useMemo(() => profile?.role === "center_admin", [profile]);
  const isCenterLinked = useMemo(() => !!centerId, [centerId]);

  const canAccess = useMemo(() => {
    return isCenterAdmin && isCenterLinked;
  }, [isCenterAdmin, isCenterLinked]);

  // 2) fetch data
  const reload = async () => {
    if (!centerId) return;
    setLoading(true);
    try {
      const start = daysAgoISO(days);

      const { data: ps, error: pErr } = await supabase
        .from("patients")
        .select(
          "id,name,counselor_id,center_id,next_session_date,current_risk_level,created_at,updated_at"
        )
        .eq("center_id", centerId)
        .order("updated_at", { ascending: false });

      if (pErr) throw pErr;

      const { data: ls, error: lErr } = await supabase
        .from("patient_logs")
        .select(
          "id,patient_id,counselor_id,log_date,emotion,trigger,intensity,sleep_hours,took_meds,memo,is_reviewed,detected_keywords,is_emergency,created_at"
        )
        .gte("log_date", start)
        .lte("log_date", today)
        .order("created_at", { ascending: false });

      if (lErr) throw lErr;

      const { data: ivs, error: iErr } = await supabase
        .from("intervention_logs")
        .select(
          "id,center_id,patient_id,counselor_id,related_log_id,risk_level,actions_taken,note,created_at"
        )
        .eq("center_id", centerId)
        .gte(
          "created_at",
          new Date(Date.now() - days * 24 * 3600 * 1000).toISOString()
        )
        .order("created_at", { ascending: false });

      if (iErr) throw iErr;

      setPatients((ps ?? []) as PatientRow[]);
      setLogs((ls ?? []) as PatientLogRow[]);
      setInterventions((ivs ?? []) as InterventionLogRow[]);
    } catch (e: any) {
      openToast("error", e?.message ?? "로드 실패");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canAccess) return;
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccess, centerId, days, today]);

  // 3) derive risk inbox
  const patientMap = useMemo(() => {
    return new Map(patients.map((p) => [p.id, p] as const));
  }, [patients]);

  const interventionByRelatedLogId = useMemo(() => {
    const m = new Map<string, InterventionLogRow>();
    for (const iv of interventions) {
      if (iv.related_log_id) m.set(iv.related_log_id, iv);
    }
    return m;
  }, [interventions]);

  const riskItems = useMemo<RiskItem[]>(() => {
    const items: RiskItem[] = [];

    for (const l of logs) {
      const p = patientMap.get(l.patient_id);
      if (!p) continue;

      const keywordsCount = Array.isArray(l.detected_keywords)
        ? l.detected_keywords.length
        : 0;

      const isRisk =
        Boolean(l.is_emergency) || keywordsCount > 0 || (l.intensity ?? 0) >= 8;

      if (!isRisk) continue;

      let score = 0;
      if (l.is_emergency) score += 100;
      if ((l.intensity ?? 0) >= 8) score += 40;
      if (keywordsCount > 0) score += 20;
      if (!l.is_reviewed) score += 15;

      const iv = interventionByRelatedLogId.get(l.id) ?? null;
      if (!iv) score += 10;

      items.push({
        patient: p,
        log: l,
        hasIntervention: !!iv,
        intervention: iv,
        score,
      });
    }

    const qq = q.trim().toLowerCase();
    const filtered = qq
      ? items.filter((x) => x.patient.name.toLowerCase().includes(qq))
      : items;

    return filtered.sort((a, b) => b.score - a.score);
  }, [logs, patientMap, interventionByRelatedLogId, q]);

  const stats = useMemo(() => {
    const total = riskItems.length;
    const unreviewed = riskItems.filter((x) => !x.log.is_reviewed).length;
    const needIntervention = riskItems.filter((x) => !x.hasIntervention).length;
    const emergency = riskItems.filter((x) => Boolean(x.log.is_emergency)).length;
    return { total, unreviewed, needIntervention, emergency };
  }, [riskItems]);

  // 4) actions
  const markReviewed = async (logId: string) => {
    try {
      const { error } = await supabase
        .from("patient_logs")
        .update({ is_reviewed: true })
        .eq("id", logId);

      if (error) throw error;

      setLogs((prev) =>
        prev.map((l) => (l.id === logId ? { ...l, is_reviewed: true } : l))
      );
      openToast("success", "확인 처리 완료");
    } catch (e: any) {
      openToast("error", e?.message ?? "업데이트 실패");
    }
  };

  const createIntervention = async (
    item: RiskItem,
    payload: {
      risk_level: InterventionLogRow["risk_level"];
      actions_taken: any[];
      note: string;
    }
  ) => {
    if (!centerId) return;
    try {
      const insert: Partial<InterventionLogRow> & {
        center_id: string;
        patient_id: string;
        counselor_id: string;
        risk_level: InterventionLogRow["risk_level"];
        actions_taken: any;
      } = {
        center_id: centerId,
        patient_id: item.patient.id,
        counselor_id: item.patient.counselor_id,
        related_log_id: item.log.id,
        risk_level: payload.risk_level,
        actions_taken: payload.actions_taken ?? [],
        note: payload.note || null,
      };

      const { data, error } = await supabase
        .from("intervention_logs")
        .insert(insert)
        .select("*")
        .single();

      if (error) throw error;

      const created = data as InterventionLogRow;
      setInterventions((prev) => [created, ...prev]);

      openToast("success", "개입 로그 저장 완료");
      setModalOpen(false);

      await markReviewed(item.log.id);
    } catch (e: any) {
      openToast("error", e?.message ?? "개입 로그 저장 실패");
    }
  };

  const suggestedRisk = (item: RiskItem): InterventionLogRow["risk_level"] => {
    if (item.log.is_emergency) return "HIGH";
    if ((item.log.intensity ?? 0) >= 9) return "HIGH";
    if ((item.log.intensity ?? 0) >= 8) return "MODERATE";
    if ((item.log.detected_keywords?.length ?? 0) > 0) return "MODERATE";
    return "LOW";
  };

  /* ===============================
   * Render states
   * =============================== */

  if (loading && !profile) {
    return (
      <div className="min-h-screen bg-slate-50 p-4">
        <div className="max-w-5xl mx-auto">
          <Card>
            <div className="text-sm font-extrabold text-slate-700">
              로딩 중...
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-slate-50 p-4">
        <div className="max-w-5xl mx-auto">
          <Card>
            <div className="text-sm font-extrabold text-slate-900">
              로그인 상태를 확인할 수 없습니다.
            </div>
            <div className="mt-2 text-sm text-slate-600">
              로그인 후 다시 접근해주세요.
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // ✅ role ok but NOT linked to center yet → join flow 안내
  if (isCenterAdmin && !isCenterLinked) {
    return (
      <div className="min-h-screen bg-slate-50 p-4">
        <Toast msg={toastMsg} tone={toastTone} onClose={() => setToastMsg("")} />
        <div className="max-w-3xl mx-auto space-y-4">
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-extrabold text-slate-900">
                  센터 연결이 필요합니다
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  지금 계정은 <span className="font-extrabold">센터장</span>이지만,
                  아직 센터에 소속되지 않았어요.
                </div>

                <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-white border border-emerald-200">
                    <Building2 className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-extrabold text-emerald-900">
                      “센터 등록하기”에서 초대코드를 입력하세요
                    </div>
                    <div className="mt-1 text-xs text-emerald-900/70">
                      센터 초대코드로 <span className="font-extrabold">profiles.center_id</span>를
                      설정한 뒤, 이 페이지에서 리스크 인박스를 확인할 수 있어요.
                    </div>
                  </div>
                </div>
              </div>

              <div className="hidden sm:flex items-center gap-2">
                <Link href="/center/join">
                  <button className="rounded-2xl px-4 py-2 text-sm font-extrabold bg-emerald-600 text-white hover:bg-emerald-700 border border-emerald-600">
                    센터 등록하기
                  </button>
                </Link>
              </div>
            </div>

            <div className="mt-4 flex flex-col sm:flex-row gap-2">
              <Link href="/center/join" className="w-full">
                <button className="w-full rounded-2xl px-4 py-3 text-sm font-extrabold bg-emerald-600 text-white hover:bg-emerald-700 border border-emerald-600 inline-flex items-center justify-center gap-2">
                  <KeyRound className="w-4 h-4" /> 초대코드 입력하러 가기
                </button>
              </Link>

              <button
                onClick={async () => {
                  // 프로필 다시 가져와서 center_id 생기면 자동 진입
                  setLoading(true);
                  try {
                    const { data: auth } = await supabase.auth.getUser();
                    const user = auth?.user;
                    if (!user) throw new Error("로그인이 필요합니다.");

                    const { data: p, error: pe } = await supabase
                      .from("profiles")
                      .select("user_id, role, center_id")
                      .eq("user_id", user.id)
                      .single();
                    if (pe) throw pe;

                    const prof = p as ProfileRow;
                    setProfile(prof);
                    setCenterId(prof.center_id);

                    if (prof.center_id) openToast("success", "센터 연결 확인됨");
                    else openToast("info", "아직 센터 연결이 없습니다.");
                  } catch (e: any) {
                    openToast("error", e?.message ?? "확인 실패");
                  } finally {
                    setLoading(false);
                  }
                }}
                className="w-full sm:w-auto rounded-2xl px-4 py-3 text-sm font-extrabold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 inline-flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                연결 상태 새로고침
              </button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // role not center_admin
  if (!canAccess) {
    return (
      <div className="min-h-screen bg-slate-50 p-4">
        <div className="max-w-5xl mx-auto space-y-4">
          <Card>
            <div className="text-sm font-extrabold text-slate-900">접근 불가</div>
            <div className="mt-2 text-sm text-slate-600">
              이 페이지는{" "}
              <span className="font-extrabold">센터장(center_admin)</span> 권한만
              접근할 수 있습니다.
            </div>
          </Card>
        </div>
      </div>
    );
  }

  /* ===============================
   * Main UI (unchanged)
   * =============================== */
  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <Toast msg={toastMsg} tone={toastTone} onClose={() => setToastMsg("")} />

      <div className="max-w-5xl mx-auto space-y-4">
        {/* Top header */}
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-extrabold text-slate-900">
                센터 리스크 인박스
              </div>
              <div className="mt-1 text-sm text-slate-600">
                원문이 아니라 <span className="font-extrabold">상태</span>를 관리합니다.
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 text-[12px] text-slate-600 font-semibold">
                  <ShieldAlert className="w-4 h-4 text-emerald-600" />
                  기간: 최근 {days}일
                </span>
                <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-extrabold bg-white border-slate-200 text-slate-700">
                  총 {stats.total}건
                </span>
                <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-extrabold bg-white border-slate-200 text-slate-700">
                  미확인 {stats.unreviewed}건
                </span>
                <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-extrabold bg-white border-slate-200 text-slate-700">
                  개입로그 필요 {stats.needIntervention}건
                </span>
                <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-extrabold bg-emerald-50 border-emerald-200 text-emerald-900">
                  케어 요청 {stats.emergency}건
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden sm:block">
                <select
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-extrabold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                >
                  <option value={7}>최근 7일</option>
                  <option value={14}>최근 14일</option>
                  <option value={30}>최근 30일</option>
                </select>
              </div>

              <button
                onClick={() => reload()}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-extrabold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-200 inline-flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                새로고침
              </button>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <Field
              placeholder="내담자 이름 검색"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Inbox list */}
          <div className="lg:col-span-2 space-y-3">
            <Card>
              <div className="text-sm font-extrabold text-slate-900">Risk Inbox</div>
              <div className="mt-1 text-sm text-slate-600">
                “확인”과 “개입 로그”만 관리하세요.
              </div>

              <div className="mt-4 border border-slate-200 rounded-2xl bg-white overflow-hidden divide-y divide-slate-100">
                {riskItems.length === 0 ? (
                  <div className="p-4 text-sm text-slate-500">
                    해당 기간에 리스크 이벤트가 없습니다.
                  </div>
                ) : (
                  riskItems.map((it) => {
                    const keywordsCount = it.log.detected_keywords?.length ?? 0;
                    const flags: Array<"EMERGENCY" | "KEYWORDS" | "INTENSE"> = [];
                    if (it.log.is_emergency) flags.push("EMERGENCY");
                    if (keywordsCount > 0) flags.push("KEYWORDS");
                    if ((it.log.intensity ?? 0) >= 8) flags.push("INTENSE");

                    return (
                      <button
                        key={it.log.id}
                        onClick={() => setSelected(it)}
                        className={clsx("w-full text-left p-4 hover:bg-slate-50 transition")}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <div className="text-sm font-extrabold text-slate-900">
                                {it.patient.name}
                              </div>
                              <span className={riskBadge(it.patient.current_risk_level)}>
                                {it.patient.current_risk_level}
                              </span>
                              {!it.log.is_reviewed && (
                                <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-extrabold bg-white border-slate-200 text-slate-700">
                                  미확인
                                </span>
                              )}
                              {!it.hasIntervention && (
                                <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-extrabold bg-white border-slate-200 text-slate-700">
                                  개입로그 필요
                                </span>
                              )}
                            </div>

                            <div className="mt-1 text-xs text-slate-500 flex flex-wrap items-center gap-2">
                              <span className="font-mono">{it.log.log_date}</span>
                              <span>
                                {it.log.emotion} · {it.log.trigger}
                              </span>
                              <span className="font-extrabold text-slate-700">
                                강도 {it.log.intensity}
                              </span>
                              {it.patient.next_session_date && (
                                <span>
                                  다음 상담:{" "}
                                  <span className="font-extrabold text-slate-700">
                                    {it.patient.next_session_date}
                                  </span>
                                </span>
                              )}
                            </div>

                            <div className="mt-2 flex flex-wrap gap-2">
                              {flags.map((f) => (
                                <span key={f}>{flagBadge(f)}</span>
                              ))}
                              {keywordsCount > 0 && (
                                <span className="text-[11px] text-slate-500 font-semibold">
                                  키워드 {keywordsCount}개
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="text-slate-400 pt-1">
                            <ChevronRight className="w-5 h-5" />
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </Card>
          </div>

          {/* Detail panel */}
          <div className="space-y-3">
            <Card>
              <div className="text-sm font-extrabold text-slate-900">상세</div>
              <div className="mt-1 text-sm text-slate-600">
                원문은 최소만 확인하고, 상태를 정리하세요.
              </div>

              {!selected ? (
                <div className="mt-4 text-sm text-slate-500">
                  왼쪽에서 항목을 선택하세요.
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-extrabold text-slate-900">
                          {selected.patient.name}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {selected.log.log_date} · 강도{" "}
                          <span className="font-extrabold text-slate-700">
                            {selected.log.intensity}
                          </span>
                        </div>
                      </div>
                      <span className={riskBadge(selected.patient.current_risk_level)}>
                        {selected.patient.current_risk_level}
                      </span>
                    </div>

                    <div className="mt-3 text-sm text-slate-700">
                      <div className="font-extrabold">요약</div>
                      <div className="mt-1 text-sm text-slate-700">
                        {selected.log.emotion} · {selected.log.trigger}
                      </div>
                      {Array.isArray(selected.log.detected_keywords) &&
                        selected.log.detected_keywords.length > 0 && (
                          <div className="mt-2 text-xs text-slate-500">
                            감지 키워드:{" "}
                            <span className="font-extrabold text-slate-700">
                              {selected.log.detected_keywords.join(", ")}
                            </span>
                          </div>
                        )}
                      {selected.log.is_emergency && (
                        <div className="mt-2 inline-flex items-center gap-2 text-xs font-extrabold text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                          <Sparkles className="w-4 h-4" />
                          케어 요청
                        </div>
                      )}
                    </div>

                    {selected.log.memo && selected.log.memo.trim() && (
                      <div className="mt-3">
                        <div className="text-xs font-extrabold text-slate-500">
                          메모 (최소 열람)
                        </div>
                        <div className="mt-1 text-sm text-slate-700 border border-slate-200 rounded-2xl bg-slate-50 p-3">
                          {selected.log.memo}
                        </div>
                      </div>
                    )}

                    <div className="mt-4 flex flex-col gap-2">
                      <button
                        onClick={() => markReviewed(selected.log.id)}
                        className={clsx(
                          "rounded-2xl border px-3 py-2 text-sm font-extrabold transition",
                          selected.log.is_reviewed
                            ? "bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed"
                            : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50",
                          "focus:outline-none focus:ring-2 focus:ring-emerald-200"
                        )}
                        disabled={selected.log.is_reviewed}
                      >
                        {selected.log.is_reviewed ? "이미 확인됨" : "확인 처리"}
                      </button>

                      <button
                        onClick={() => setModalOpen(true)}
                        className={clsx(
                          "rounded-2xl border px-3 py-2 text-sm font-extrabold transition",
                          "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700 hover:border-emerald-700",
                          "focus:outline-none focus:ring-2 focus:ring-emerald-200"
                        )}
                      >
                        {selected.hasIntervention ? "개입 로그 추가 작성" : "개입 로그 작성"}
                      </button>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="text-xs font-extrabold text-slate-500">
                      연결된 개입 로그
                    </div>

                    {!selected.hasIntervention ? (
                      <div className="mt-2 text-sm text-slate-600">
                        아직 작성된 개입 로그가 없습니다.
                      </div>
                    ) : (
                      <div className="mt-2 space-y-2">
                        <div className="text-sm font-extrabold text-slate-900">
                          Risk: {selected.intervention?.risk_level}
                        </div>
                        <div className="text-xs text-slate-500">
                          {new Date(
                            selected.intervention!.created_at
                          ).toLocaleString()}
                        </div>
                        <div className="text-sm text-slate-700">
                          <div className="text-xs font-extrabold text-slate-500 mb-1">
                            Actions
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {(selected.intervention?.actions_taken ?? []).map(
                              (a: any, idx: number) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-extrabold bg-emerald-50 text-emerald-900 border-emerald-200"
                                >
                                  {a?.label ?? a?.type ?? "ACTION"}
                                </span>
                              )
                            )}
                          </div>
                        </div>
                        {selected.intervention?.note && (
                          <div className="mt-2 text-sm text-slate-700 border border-slate-200 rounded-2xl bg-slate-50 p-3">
                            {selected.intervention.note}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="text-xs text-slate-500">
                    (다음 단계) 케이스 타임라인 페이지 `/admin/case/[patientId]`를
                    붙이면 “센터장용 블랙박스”가 완성됩니다.
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>

      {selected && (
        <InterventionModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          patientName={selected.patient.name}
          logDate={selected.log.log_date}
          defaultRisk={suggestedRisk(selected)}
          onSubmit={async (payload) => {
            await createIntervention(selected, payload);
          }}
        />
      )}
    </div>
  );
}
