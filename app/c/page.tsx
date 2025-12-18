"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import {
  ShieldAlert,
  CheckCircle2,
  Siren,
  Activity,
  X,
  Search,
  Copy,
  User,
  Calendar,
  UserPlus,
  BookOpen,
  PenLine,
  History,
  ChevronRight,
  Clock,
} from "lucide-react";

/* ===============================
 * Types
 * =============================== */
interface ProfileRow {
  user_id: string;
  role: "patient" | "counselor" | "center_admin";
  center_id: string | null;
}

interface Patient {
  id: string;
  name: string;
  concern: string | null;
  next_session_date: string | null;
  invite_codes?: { code: string }[];
  created_at: string;
  center_id?: string | null;
  counselor_id?: string;
}

interface PatientLog {
  id: string;
  patient_id: string;
  log_date: string;
  emotion: string;
  intensity: number;
  trigger: string;
  memo: string | null;
  sleep_hours: number | null;
  took_meds: boolean | null;
  is_reviewed: boolean;
  detected_keywords: string[] | null;
  is_emergency: boolean;
  created_at: string;
}

interface SessionRow {
  id: string;
  patient_id: string;
  counselor_id: string;
  session_no: number;
  session_date: string;
  notes: string | null;
  status: string;
  created_at: string;
}

type RiskLevel = "LOW" | "MODERATE" | "HIGH";

const RISK_LEVELS: {
  value: RiskLevel;
  label: string;
  color: string;
  desc: string;
}[] = [
  {
    value: "LOW",
    label: "관찰 (Low)",
    color: "bg-emerald-50 text-emerald-700 border-emerald-100",
    desc: "특이사항 없음",
  },
  {
    value: "MODERATE",
    label: "주의 (Moderate)",
    color: "bg-amber-50 text-amber-700 border-amber-100",
    desc: "자살 사고 표현",
  },
  {
    value: "HIGH",
    label: "위험 (High)",
    color: "bg-rose-50 text-rose-700 border-rose-100",
    desc: "즉각적 개입 필요",
  },
];

const ACTION_CODES = [
  { code: "ACT_CALL", label: "내담자/보호자 통화" },
  { code: "ACT_SAFETY", label: "안전계획 수립" },
  { code: "ACT_INSTITUTION", label: "외부기관 연계" },
];

/* ===============================
 * Helpers
 * =============================== */
function dateISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function mmdd(iso: string) {
  return `${iso.slice(5, 7)}/${iso.slice(8, 10)}`;
}
function formatDateTime(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getDate()).padStart(2, "0")} ${String(
    d.getHours()
  ).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function generateInviteCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
function addDaysISO(baseIso: string, days: number) {
  const [y, m, d] = baseIso.split("-").map((x) => Number(x));
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() + days);
  return dateISO(dt);
}

function calcDday(targetDate: string | null): string {
  if (!targetDate) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(targetDate);
  target.setHours(0, 0, 0, 0);

  const diffTime = target.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "D-Day";
  if (diffDays > 0) return `D-${diffDays}`;
  return `D+${Math.abs(diffDays)}`;
}

const RiskBadge = ({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "critical" | "warning" | "safe" | "neutral" | "trend";
}) => {
  const styles = {
    critical: "bg-rose-50 text-rose-700 border-rose-100 font-bold",
    warning: "bg-amber-50 text-amber-700 border-amber-100 font-bold",
    safe: "bg-emerald-50 text-emerald-700 border-emerald-100",
    neutral: "bg-slate-50 text-slate-500 border-slate-100",
    trend: "bg-indigo-50 text-indigo-700 border-indigo-100 font-bold",
  };
  return (
    <span
      className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-[10px] border ${styles[tone]}`}
    >
      {children}
    </span>
  );
};

/* ===============================
 * Modals
 * =============================== */

// 1. 환자 추가 모달
function AddPatientModal({
  isOpen,
  onClose,
  counselorId,
  centerId,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  counselorId: string;
  centerId: string | null;
  onSuccess: () => void;
}) {
  const [name, setName] = useState("");
  const [concern, setConcern] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName("");
      setConcern("");
      setNextDate("");
      setLoading(false);
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!name.trim()) return alert("이름을 입력해주세요.");
    // ✅ 센터 기반 운영이므로, 상담사가 센터에 속해있지 않으면 환자 생성 막기
    if (!centerId) return alert("센터 연결이 필요합니다. (센터 초대코드로 먼저 조인하세요)");

    setLoading(true);
    try {
      const { data: patient, error: pError } = await supabase
        .from("patients")
        .insert({
          name: name,
          concern: concern || null,
          next_session_date: nextDate || null,
          counselor_id: counselorId,
          center_id: centerId, // ✅ 센터 자동 주입
        })
        .select()
        .single();
      if (pError) throw pError;

      const code = generateInviteCode();
      // ✅ invite_codes 스키마에 맞게 (is_used 제거, counselor_id 추가)
      // expires_at은 선택이지만 운영 편하게 30일 넣음
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      const { error: cErr } = await supabase.from("invite_codes").insert({
        patient_id: patient.id,
        counselor_id: counselorId,
        code: code,
        expires_at: expiresAt.toISOString(),
      });
      if (cErr) throw cErr;

      await Haptics.impact({ style: ImpactStyle.Medium });
      onSuccess();
      onClose();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in zoom-in-95 duration-200">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden border border-slate-100">
        <div className="bg-white px-6 py-5 flex justify-between items-center border-b border-slate-100">
          <div>
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <span className="bg-emerald-50 p-1.5 rounded-lg border border-emerald-100">
                <UserPlus className="w-5 h-5 text-emerald-600" />
              </span>
              환자 등록
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              새로운 내담자를 추가합니다.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-50 transition-colors text-slate-400 hover:text-slate-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5">
              이름 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all placeholder:text-slate-300"
              placeholder="예: 홍길동"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5">
              주호소
            </label>
            <input
              type="text"
              value={concern}
              onChange={(e) => setConcern(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all placeholder:text-slate-300"
              placeholder="예: 우울, 수면장애"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5">
              다음 상담일
            </label>
            <input
              type="date"
              value={nextDate}
              onChange={(e) => setNextDate(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-slate-600"
            />
          </div>
        </div>

        <div className="p-5 border-t border-slate-50 flex justify-end gap-2 bg-slate-50/50">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-semibold text-slate-500 hover:text-slate-700 hover:bg-white border border-transparent hover:border-slate-200 rounded-lg transition-all"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-6 py-2.5 text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:shadow-none"
          >
            {loading ? "등록 중..." : "등록하기"}
          </button>
        </div>
      </div>
    </div>
  );
}

// 2. 세션 저장 모달
function AddSessionModal({
  isOpen,
  onClose,
  patient,
  counselorId,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  patient: Patient;
  counselorId: string;
  onSuccess: () => void;
}) {
  const [date, setDate] = useState(dateISO(new Date()));
  const [count, setCount] = useState(1);
  const [notes, setNotes] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDate(dateISO(new Date()));
      setNotes("");
      setNextDate(patient.next_session_date || "");
      setLoading(false);
    }
  }, [isOpen, patient]);

  const handleSubmit = async () => {
    if (!notes.trim()) return alert("세션 내용을 입력해주세요.");
    setLoading(true);
    try {
      const { error } = await supabase.from("sessions").insert({
        patient_id: patient.id,
        counselor_id: counselorId,
        session_no: count,
        session_date: date,
        notes: notes,
        status: "완료",
      });

      if (error) throw error;

      if (nextDate) {
        await supabase
          .from("patients")
          .update({ next_session_date: nextDate })
          .eq("id", patient.id);
      }

      await Haptics.impact({ style: ImpactStyle.Medium });
      onSuccess();
      onClose();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in zoom-in-95 duration-200">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-100">
        <div className="bg-white px-6 py-5 flex justify-between items-center border-b border-slate-100">
          <div>
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <span className="bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                <BookOpen className="w-5 h-5 text-slate-700" />
              </span>
              세션 기록 저장
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {patient.name}님과의 상담 내용을 기록합니다.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-50 transition-colors text-slate-400 hover:text-slate-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto bg-white">
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs font-bold text-slate-500 mb-1.5">
                상담일
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200 transition-all text-slate-700"
              />
            </div>
            <div className="w-24">
              <label className="block text-xs font-bold text-slate-500 mb-1.5">
                회차 (No)
              </label>
              <input
                type="number"
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-center font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5">
              세션 노트 (Content)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full h-48 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200 resize-none leading-relaxed placeholder:text-slate-300"
              placeholder="주요 이슈, 내담자 반응, 개입 내용 등을 상세히 기록하세요."
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5">
              다음 약속 (Next Session)
            </label>
            <input
              type="date"
              value={nextDate}
              onChange={(e) => setNextDate(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200 text-slate-700"
            />
          </div>
        </div>

        <div className="p-5 border-t border-slate-50 flex justify-end gap-2 bg-slate-50/50">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-semibold text-slate-500 hover:text-slate-700 hover:bg-white border border-transparent hover:border-slate-200 rounded-lg transition-all"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-6 py-2.5 text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg shadow-md hover:shadow-lg transition-all disabled:opacity-50"
          >
            {loading ? "저장 중..." : "세션 저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

// 3. 위기 개입 모달
function InterventionModal({
  isOpen,
  onClose,
  patientName,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  patientName: string;
  onSave: (risk: RiskLevel, actions: string[], note: string) => Promise<void>;
}) {
  const [risk, setRisk] = useState<RiskLevel>("LOW");
  const [actions, setActions] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setRisk("LOW");
      setActions(new Set());
      setNote("");
      setIsSaving(false);
    }
  }, [isOpen]);

  const toggleAction = (code: string) => {
    const next = new Set(actions);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setActions(next);
  };

  const handleSave = async () => {
    setIsSaving(true);
    await onSave(risk, Array.from(actions), note);
    setIsSaving(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in zoom-in-95 duration-200">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-100">
        <div className="bg-white px-6 py-5 flex justify-between items-center border-b border-slate-100">
          <div>
            <h2 className="text-xl font-bold text-rose-600 flex items-center gap-2">
              <span className="bg-rose-50 p-1.5 rounded-lg border border-rose-100">
                <ShieldAlert className="w-5 h-5 text-rose-500" />
              </span>
              위기 개입
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              위험 징후에 대한 전문가적 개입을 기록합니다.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-50 transition-colors text-slate-400 hover:text-slate-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 bg-white">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-2">
              위험도 평가
            </label>
            <div className="grid grid-cols-1 gap-2">
              {RISK_LEVELS.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setRisk(r.value)}
                  className={`px-4 py-3 rounded-lg border text-left transition-all relative ${
                    risk === r.value
                      ? `${r.color} ring-1 ring-offset-1 ring-slate-200 font-bold shadow-sm`
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm">{r.label}</span>
                    {risk === r.value && <CheckCircle2 className="w-4 h-4" />}
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-2">
              조치 사항
            </label>
            <div className="grid grid-cols-1 gap-2">
              {ACTION_CODES.map((a) => (
                <label
                  key={a.code}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                    actions.has(a.code)
                      ? "bg-slate-800 text-white border-slate-800 shadow-sm"
                      : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <div
                    className={`w-4 h-4 flex items-center justify-center rounded border ${
                      actions.has(a.code)
                        ? "border-transparent bg-emerald-500"
                        : "border-slate-300 bg-white"
                    }`}
                  >
                    {actions.has(a.code) && (
                      <CheckCircle2 className="w-3 h-3 text-white" />
                    )}
                  </div>
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={actions.has(a.code)}
                    onChange={() => toggleAction(a.code)}
                  />
                  <span className="text-xs font-bold">{a.label}</span>
                </label>
              ))}
            </div>
          </div>
          <textarea
            className="w-full h-24 border border-slate-200 bg-slate-50/50 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 resize-none placeholder:text-slate-300"
            placeholder="추가적인 특이사항이나 메모를 남겨주세요."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <div className="p-5 border-t border-slate-50 flex justify-end gap-2 bg-slate-50/30">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-semibold text-slate-500 hover:text-slate-700 hover:bg-white border border-transparent hover:border-slate-200 rounded-lg transition-all"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-2.5 text-sm font-bold text-white bg-rose-500 hover:bg-rose-600 rounded-lg shadow-md hover:shadow-lg transition-all disabled:opacity-50"
          >
            {isSaving ? "저장 중..." : "위기 기록 저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

// 4. 로그 상세 보기 (Detail Only)
function LogDetailModal({
  isOpen,
  onClose,
  log,
}: {
  isOpen: boolean;
  onClose: () => void;
  log: PatientLog | null;
}) {
  if (!isOpen || !log) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in zoom-in-95 duration-200">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]">
        <div className="bg-white px-6 py-5 flex items-center justify-between border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {log.log_date} 기록
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              작성일시: {formatDateTime(log.created_at)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-50 transition-colors text-slate-400 hover:text-slate-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6 bg-white">
          <div className="flex items-center gap-5">
            <div
              className={`flex flex-col items-center justify-center w-20 h-20 rounded-2xl border-2 shadow-sm ${
                log.intensity >= 8
                  ? "bg-rose-50 border-rose-100 text-rose-600"
                  : "bg-emerald-50 border-emerald-100 text-emerald-600"
              }`}
            >
              <span className="text-3xl font-bold tracking-tighter">
                {log.intensity}
              </span>
              <span className="text-[9px] font-bold uppercase tracking-wide opacity-80">
                Intensity
              </span>
            </div>
            <div className="flex-1">
              <div className="text-xs text-slate-400 font-bold uppercase mb-1 tracking-wide">
                Emotion & Trigger
              </div>
              <div className="text-xl font-bold text-slate-800">
                {log.emotion}
              </div>
              <div className="text-sm text-slate-500 font-medium">
                {log.trigger}
              </div>
            </div>
          </div>

          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap min-h-[120px] shadow-inner">
            {log.memo || (
              <span className="text-slate-400 italic">
                작성된 메모가 없습니다.
              </span>
            )}
          </div>

          {log.is_emergency && (
            <div className="bg-rose-50 border border-rose-100 p-4 rounded-xl flex items-center gap-3 shadow-sm">
              <div className="bg-white p-2 rounded-full shadow-sm text-rose-500">
                <Siren className="w-5 h-5" />
              </div>
              <span className="text-sm font-bold text-rose-700">
                환자가 '케어 요청(SOS)'을 보냈습니다.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ===============================
 * Page Component
 * =============================== */
export default function Page() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);

  // ✅ 센터 연결 (profiles.center_id)
  const [centerId, setCenterId] = useState<string | null>(null);

  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [logs, setLogs] = useState<PatientLog[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"monitoring" | "sessions">(
    "monitoring"
  );

  const [addPatientModalOpen, setAddPatientModalOpen] = useState(false);
  const [interventionModalOpen, setInterventionModalOpen] = useState(false);
  const [logDetailModalOpen, setLogDetailModalOpen] = useState(false);
  const [addSessionModalOpen, setAddSessionModalOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<PatientLog | null>(null);

  const selectedPatient = useMemo(
    () => patients.find((p) => p.id === selectedPatientId) ?? null,
    [patients, selectedPatientId]
  );
  const filteredPatients = useMemo(
    () =>
      patients.filter(
        (p) =>
          !searchQuery.trim() ||
          p.name.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [patients, searchQuery]
  );

  // ✅ 로그인 + profile(center_id) 로드
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.user) return router.replace("/");
      const uid = data.session.user.id;
      setUserId(uid);

      const { data: prof, error } = await supabase
        .from("profiles")
        .select("user_id, role, center_id")
        .eq("user_id", uid)
        .single();

      if (!error && prof) {
        const p = prof as ProfileRow;
        setCenterId(p.center_id ?? null);
      }
    })();
  }, [router]);

  // ✅ 내 환자만 가져오기(기존처럼 전체 pull 방지) + 센터 연결도 같이 걸어둠
  const fetchPatients = async () => {
    if (!userId) return;

    let q = supabase
      .from("patients")
      .select("*, invite_codes(code)")
      .eq("counselor_id", userId)
      .order("created_at", { ascending: false });

    // 센터가 잡혀있으면 추가로 센터 필터(안 잡혀있으면 기존 상담사 기준만)
    if (centerId) q = q.eq("center_id", centerId);

    const { data } = await q;
    setPatients((data ?? []) as Patient[]);
  };

  useEffect(() => {
    fetchPatients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, centerId]);

  const fetchLogs = async () => {
    if (!selectedPatientId) {
      setLogs([]);
      return;
    }
    setLoadingLogs(true);
    const { data } = await supabase
      .from("patient_logs")
      .select("*")
      .eq("patient_id", selectedPatientId)
      .order("log_date", { ascending: false })
      .limit(30);
    setLogs((data ?? []) as PatientLog[]);
    setLoadingLogs(false);
  };

  const fetchSessions = async () => {
    if (!selectedPatientId) {
      setSessions([]);
      return;
    }
    const { data } = await supabase
      .from("sessions")
      .select("*")
      .eq("patient_id", selectedPatientId)
      .order("session_date", { ascending: false });
    setSessions((data ?? []) as SessionRow[]);
  };

  useEffect(() => {
    fetchLogs();
    fetchSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPatientId]);

  const analyzedLogs = useMemo(() => {
    if (logs.length === 0) return [];
    const sumIntensity = logs.reduce((acc, curr) => acc + curr.intensity, 0);
    const avgIntensity = logs.length > 0 ? sumIntensity / logs.length : 0;
    return logs.map((log) => {
      const isRisk =
        log.intensity >= 8 ||
        log.intensity >= avgIntensity + 3 ||
        (log.detected_keywords && log.detected_keywords.length > 0) ||
        log.is_emergency;
      return {
        ...log,
        isRisk,
        riskFactors: {
          isHighScore: log.intensity >= 8,
          isDeviation: log.intensity >= avgIntensity + 3,
          hasKeywords: !!log.detected_keywords?.length,
          isEmergency: log.is_emergency,
        },
      };
    });
  }, [logs]);

  const handleOpenDetail = (log: PatientLog) => {
    setSelectedLog(log);
    setLogDetailModalOpen(true);
  };

  // ✅ intervention_logs.center_id NOT NULL → 반드시 포함
  const saveIntervention = async (risk: RiskLevel, actions: string[], note: string) => {
    if (!selectedPatient || !userId) return;
    if (!centerId) return alert("센터 연결이 필요합니다. (센터 초대코드로 먼저 조인하세요)");
    try {
      await supabase.from("intervention_logs").insert({
        center_id: centerId,
        patient_id: selectedPatient.id,
        counselor_id: userId,
        related_log_id: null,
        risk_level: risk,
        actions_taken: actions,
        note: note,
      });
      await Haptics.impact({ style: ImpactStyle.Heavy });
    } catch (e: any) {
      alert(e.message);
    }
  };

  const copyInviteCode = async () => {
    const code = selectedPatient?.invite_codes?.[0]?.code;
    if (code) {
      await navigator.clipboard.writeText(code);
      await Haptics.impact({ style: ImpactStyle.Light });
      alert("복사됨: " + code);
    }
  };

  if (!userId) return null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col lg:flex-row font-sans selection:bg-emerald-100">
      {/* SIDEBAR */}
      <aside className="w-full lg:w-72 bg-white border-r border-slate-100 flex-shrink-0 lg:h-screen lg:sticky lg:top-0 flex flex-col z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
        <div className="flex flex-col border-b border-slate-50 bg-white">
          <div className="h-16 flex items-center px-5 gap-3">
            <div className="p-1.5 bg-emerald-50 rounded-lg">
              <Activity className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-800 leading-none tracking-tight">
                Chekcy Admin
              </h1>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                Clinical Dashboard
              </p>
            </div>
          </div>
          <div className="px-4 pb-4">
            <button
              onClick={() => setAddPatientModalOpen(true)}
              className="w-full flex items-center justify-center gap-2 bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-100 hover:border-emerald-200 py-2.5 rounded-xl text-sm font-bold shadow-sm hover:shadow transition-all active:scale-95 group"
            >
              <span className="bg-emerald-100 text-emerald-600 rounded p-0.5 group-hover:bg-emerald-200 transition-colors">
                <UserPlus className="w-3.5 h-3.5" />
              </span>
              <span>새 환자 등록하기</span>
            </button>
          </div>
        </div>
        <div className="p-4 border-b border-slate-50">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="환자 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500/50 transition-all placeholder:text-slate-400 text-slate-700"
            />
          </div>
        </div>
        <div className="p-3 space-y-1 overflow-y-auto flex-1">
          {filteredPatients.map((p) => {
            const dDay = calcDday(p.next_session_date);
            const isTomorrow = dDay === "D-1";
            return (
              <button
                key={p.id}
                onClick={() => setSelectedPatientId(p.id)}
                className={`w-full text-left p-3 rounded-xl transition-all border flex items-center justify-between group ${
                  p.id === selectedPatientId
                    ? "bg-white border-emerald-100 shadow-md ring-1 ring-emerald-500/10"
                    : "bg-transparent border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                }`}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold transition-colors ${
                      p.id === selectedPatientId
                        ? "bg-emerald-100 text-emerald-600"
                        : "bg-slate-100 text-slate-400 group-hover:bg-white group-hover:shadow-sm"
                    }`}
                  >
                    {p.name.slice(0, 1)}
                  </div>
                  <div className="overflow-hidden">
                    <div
                      className={`text-sm font-medium truncate ${
                        p.id === selectedPatientId ? "text-slate-800" : ""
                      }`}
                    >
                      {p.name}
                    </div>
                    {isTomorrow && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="bg-indigo-50 text-indigo-600 border border-indigo-100 text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5" /> 내일 상담
                        </span>
                      </div>
                    )}
                    {!isTomorrow && dDay && (
                      <div className="text-[10px] font-bold mt-0.5 text-slate-400">
                        다음: {dDay}
                      </div>
                    )}
                  </div>
                </div>
                {p.id === selectedPatientId && (
                  <ChevronRight className="w-4 h-4 text-emerald-500" />
                )}
              </button>
            );
          })}
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1 p-4 lg:p-8 overflow-y-auto bg-[#F8F9FA]">
        {!selectedPatient ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-4">
            <div className="w-20 h-20 rounded-full bg-white shadow-sm flex items-center justify-center">
              <User className="w-8 h-8 text-slate-300" />
            </div>
            <p className="text-sm font-medium">관리할 환자를 선택해주세요.</p>
          </div>
        ) : (
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
              <div className="flex items-center gap-5">
                <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center text-2xl font-bold text-slate-700 border border-slate-100">
                  {selectedPatient.name.slice(0, 1)}
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-800 tracking-tight">
                    {selectedPatient.name}
                  </h2>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500 font-medium">
                    <span
                      onClick={copyInviteCode}
                      className="cursor-pointer hover:text-emerald-600 flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded border border-slate-100 transition-colors"
                    >
                      <Copy className="w-3 h-3" /> 코드:{" "}
                      <span className="font-mono text-slate-600">
                        {selectedPatient.invite_codes?.[0]?.code}
                      </span>
                    </span>
                    <span
                      className={`flex items-center gap-1.5 px-2 py-1 rounded border ${
                        calcDday(selectedPatient.next_session_date) === "D-1"
                          ? "bg-indigo-50 border-indigo-100 text-indigo-600 font-bold"
                          : "bg-slate-50 border-slate-100 text-slate-600"
                      }`}
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      {selectedPatient.next_session_date
                        ? `${selectedPatient.next_session_date} (${calcDday(
                            selectedPatient.next_session_date
                          )})`
                        : "일정 미정"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2.5">
                <button
                  onClick={() => setInterventionModalOpen(true)}
                  className="flex items-center gap-2 bg-white hover:bg-rose-50 text-rose-600 border border-rose-100 px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm hover:shadow hover:border-rose-200"
                >
                  <ShieldAlert className="w-4 h-4" /> 위기 개입
                </button>
                <button
                  onClick={() => setAddSessionModalOpen(true)}
                  className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm hover:shadow-md active:scale-95"
                >
                  <PenLine className="w-4 h-4" /> 세션 저장
                </button>
              </div>
            </div>

            <div className="border-b border-slate-200/60">
              <nav className="flex gap-8">
                <button
                  onClick={() => setActiveTab("monitoring")}
                  className={`pb-3 text-sm font-bold transition-all relative ${
                    activeTab === "monitoring"
                      ? "text-slate-800"
                      : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  모니터링 (Daily Logs)
                  {activeTab === "monitoring" && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-800 rounded-full" />
                  )}
                </button>
                <button
                  onClick={() => setActiveTab("sessions")}
                  className={`pb-3 text-sm font-bold transition-all relative ${
                    activeTab === "sessions"
                      ? "text-slate-800"
                      : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  상담 세션 (Sessions)
                  {activeTab === "sessions" && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-800 rounded-full" />
                  )}
                </button>
              </nav>
            </div>

            {activeTab === "monitoring" && (
              <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm animate-in fade-in slide-in-from-bottom-2">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50/50 text-slate-500 border-b border-slate-100 uppercase tracking-wider">
                      <tr>
                        <th className="px-6 py-3.5 font-bold w-24">Date</th>
                        <th className="px-6 py-3.5 font-bold w-24">Emotion</th>
                        <th className="px-6 py-3.5 font-bold">Risk Factors</th>
                        <th className="px-6 py-3.5 font-bold w-20">Score</th>
                        <th className="px-6 py-3.5 font-bold">Memo</th>
                        <th className="px-6 py-3.5 font-bold w-20 text-right">
                          View
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {loadingLogs ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="p-10 text-center text-slate-400"
                          >
                            Loading...
                          </td>
                        </tr>
                      ) : analyzedLogs.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="p-10 text-center text-slate-400"
                          >
                            기록이 없습니다.
                          </td>
                        </tr>
                      ) : (
                        analyzedLogs.map((log) => (
                          <tr
                            key={log.id}
                            className="hover:bg-slate-50/80 transition-colors"
                          >
                            <td className="px-6 py-4 font-mono text-slate-600 font-medium">
                              {mmdd(log.log_date)}
                            </td>
                            <td className="px-6 py-4">
                              <span className="inline-flex items-center px-2.5 py-1 rounded-md font-medium bg-slate-50 text-slate-700 border border-slate-100">
                                {log.emotion}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-wrap gap-1.5">
                                {log.riskFactors.isHighScore && (
                                  <RiskBadge tone="critical">High Score</RiskBadge>
                                )}
                                {log.riskFactors.isDeviation && (
                                  <RiskBadge tone="trend">Deviation</RiskBadge>
                                )}
                                {log.riskFactors.hasKeywords &&
                                  log.detected_keywords?.map((k) => (
                                    <RiskBadge key={k} tone="critical">
                                      {k}
                                    </RiskBadge>
                                  ))}
                                {log.riskFactors.isEmergency && (
                                  <RiskBadge tone="critical">SOS</RiskBadge>
                                )}
                                {!log.isRisk && (
                                  <span className="text-slate-300">-</span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 font-mono font-bold text-sm">
                              <span
                                className={
                                  log.intensity >= 8
                                    ? "text-rose-600"
                                    : "text-slate-600"
                                }
                              >
                                {log.intensity}
                                <span className="text-slate-400 text-[10px] font-normal">
                                  /10
                                </span>
                              </span>
                            </td>
                            <td
                              className="px-6 py-4 text-slate-600 truncate max-w-[200px]"
                              title={log.memo || ""}
                            >
                              {log.memo || "-"}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button
                                onClick={() => handleOpenDetail(log)}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 text-slate-600 hover:bg-white hover:border-slate-300 hover:shadow-sm transition-all bg-slate-50"
                              >
                                Detail
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === "sessions" && (
              <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
                {sessions.length === 0 ? (
                  <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 border-dashed text-slate-400">
                    <History className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p>아직 저장된 세션 기록이 없습니다.</p>
                  </div>
                ) : (
                  sessions.map((session) => (
                    <div
                      key={session.id}
                      className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm hover:shadow-md transition-all"
                    >
                      <div className="flex justify-between items-center mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-slate-50 text-slate-700 flex items-center justify-center font-bold text-sm border border-slate-100">
                            #{session.session_no}
                          </div>
                          <div>
                            <h3 className="font-bold text-slate-800 text-sm">
                              {session.session_date} 세션
                            </h3>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              작성일: {formatDateTime(session.created_at)}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="bg-slate-50/50 p-3 rounded-lg text-xs text-slate-700 whitespace-pre-wrap leading-relaxed border border-slate-50">
                        {session.notes}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modals */}
      <AddPatientModal
        isOpen={addPatientModalOpen}
        onClose={() => setAddPatientModalOpen(false)}
        counselorId={userId}
        centerId={centerId}
        onSuccess={fetchPatients}
      />
      <InterventionModal
        isOpen={interventionModalOpen}
        onClose={() => setInterventionModalOpen(false)}
        patientName={selectedPatient?.name || ""}
        onSave={saveIntervention}
      />
      <LogDetailModal
        isOpen={logDetailModalOpen}
        onClose={() => setLogDetailModalOpen(false)}
        log={selectedLog}
      />
      {selectedPatient && (
        <AddSessionModal
          isOpen={addSessionModalOpen}
          onClose={() => setAddSessionModalOpen(false)}
          patient={selectedPatient}
          counselorId={userId}
          onSuccess={() => {
            fetchSessions();
            fetchPatients();
          }}
        />
      )}
    </div>
  );
}
