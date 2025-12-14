"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import type {
  Patient,
  SessionRow,
  PatientLog,
  Homework,
  RangeSummary,
  Role,
} from "@/lib/types";
import { Btn, Card, Field } from "@/components/ui";

/* ===============================
 * helpers
 * =============================== */
function addDays(d: Date, days: number) {
  const c = new Date(d.getTime());
  c.setDate(c.getDate() + days);
  return c;
}
function dateISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function mmdd(iso: string) {
  return `${iso.slice(5, 7)}/${iso.slice(8, 10)}`;
}
function daysDiffFromToday(iso: string) {
  const today = new Date();
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const [y, m, d] = iso.split("-").map(Number);
  const t1 = new Date(y, (m ?? 1) - 1, d ?? 1).getTime();
  return Math.round((t1 - t0) / (1000 * 60 * 60 * 24));
}
function relLabel(iso: string) {
  const diff = daysDiffFromToday(iso);
  if (diff === 0) return "오늘";
  if (diff === -1) return "어제";
  if (diff < 0) return `${Math.abs(diff)}일 전`;
  return `${diff}일 후`;
}

type HomeworkDraft = {
  id: string; // uuid or tmp_
  title: string;
  is_active: boolean;
  _deleted?: boolean;
  _dirty?: boolean;
};

function normTitle(s: string) {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

/* ===============================
 * tiny UI atoms (local)
 * =============================== */
function Pill({
  tone = "neutral",
  children,
  title,
}: {
  tone?: "neutral" | "muted" | "good" | "bad";
  children: React.ReactNode;
  title?: string;
}) {
  const cls =
    tone === "good"
      ? "bg-emerald-50 text-emerald-700 border-emerald-100"
      : tone === "bad"
      ? "bg-slate-100 text-slate-700 border-slate-200"
      : tone === "muted"
      ? "bg-slate-50 text-slate-500 border-slate-200"
      : "bg-white text-slate-600 border-slate-200";

  return (
    <span
      title={title}
      className={[
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        cls,
      ].join(" ")}
    >
      {children}
    </span>
  );
}

/* ===============================
 * shared styles
 * =============================== */
const inputBase =
  "w-full border border-slate-200 rounded-xl px-3 py-2 text-slate-900 outline-none bg-white focus:ring-2 focus:ring-slate-200";
const inputMuted =
  "w-full border border-slate-200 rounded-xl px-3 py-2 text-slate-700 outline-none bg-slate-50 focus:ring-2 focus:ring-slate-200";

// ✅ 숙제 UI 컴팩트
const hwRowCls =
  "border border-slate-200 rounded-xl bg-white flex flex-col sm:flex-row sm:items-center gap-2 px-2.5 py-2";
const hwInputCls =
  "w-full text-[13px] border border-slate-200 rounded-xl px-3 py-2 outline-none bg-white focus:ring-2 focus:ring-slate-200";
const hwInputMutedCls =
  "w-full text-[13px] text-slate-700 border border-slate-200 rounded-xl px-3 py-2 outline-none bg-slate-50 focus:ring-2 focus:ring-slate-200";
const hwBtnSecondary =
  "text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50";
const hwBtnPrimary =
  "text-xs px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white";
const hwBtnDangerLite =
  "text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50";

/* ===============================
 * Drawer (mobile)
 * =============================== */
function MobileDrawer({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <div className={`lg:hidden ${open ? "" : "pointer-events-none"}`}>
      <div
        onClick={onClose}
        className={[
          "fixed inset-0 z-40 transition-opacity",
          open ? "opacity-100" : "opacity-0",
          "bg-black/30",
        ].join(" ")}
      />
      <div
        className={[
          "fixed inset-y-0 left-0 z-50 w-[86vw] max-w-[360px] bg-white shadow-xl border-r border-slate-200 transition-transform",
          open ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <div className="h-full flex flex-col">
          <div className="p-3 border-b border-slate-200 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-900">환자 목록 / 등록</div>
            <button
              onClick={onClose}
              className="text-xs font-semibold rounded-xl px-3 py-2 border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            >
              닫기
            </button>
          </div>
          <div className="p-3 overflow-auto">{children}</div>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);

  // ✅ 모바일: 세션 화면이 메인 / 좌측은 드로어로
  const [drawerOpen, setDrawerOpen] = useState(false);

  // 모바일 스크롤 타겟
  const rightTopRef = useRef<HTMLDivElement | null>(null);

  // 사이드바 모드 (목록 vs 등록)
  const [sidebarMode, setSidebarMode] = useState<"list" | "new">("list");

  // 환자 정보(초진 메모) 접기/펼치기
  const [showPatientMemo, setShowPatientMemo] = useState(false);

  // ✅ 숙제: 삭제됨 목록 토글 (기본 숨김)
  const [showDeletedHw, setShowDeletedHw] = useState(false);

  // ✅ Wrap-up accordion 토글
  const [showWrapUp, setShowWrapUp] = useState(false);
  const wrapUpRef = useRef<HTMLDivElement | null>(null);

  // UI states
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  // patients
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const selectedPatient = useMemo(
    () => patients.find((p) => p.id === selectedPatientId) ?? null,
    [patients, selectedPatientId]
  );

  // search
  const [q, setQ] = useState("");
  const filteredPatients = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return patients;
    return patients.filter((p) =>
      `${p.name} ${p.concern}`.toLowerCase().includes(s)
    );
  }, [patients, q]);

  // sessions
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const sessionsAsc = useMemo(
    () => sessions.slice().sort((a, b) => a.session_no - b.session_no),
    [sessions]
  );

  // range summaries
  const [rangeSummaries, setRangeSummaries] = useState<RangeSummary[]>([]);
  const [selectedRangeKey, setSelectedRangeKey] = useState("");
  const [showAllRanges, setShowAllRanges] = useState(false);

  const selectedRange = useMemo(() => {
    if (!rangeSummaries.length) return null;
    const found = rangeSummaries.find(
      (r) => `${r.start_no}-${r.end_no}` === selectedRangeKey
    );
    return found ?? rangeSummaries[0];
  }, [rangeSummaries, selectedRangeKey]);

  const latestRangeKey = useMemo(() => {
    if (!rangeSummaries.length) return "";
    return `${rangeSummaries[0].start_no}-${rangeSummaries[0].end_no}`;
  }, [rangeSummaries]);

  // logs
  const [logs, setLogs] = useState<(PatientLog & { did_homework?: boolean | null })[]>([]);
  const logsDesc = useMemo(
    () => logs.slice().sort((a, b) => (a.log_date < b.log_date ? 1 : -1)),
    [logs]
  );

  // highlight stats
  const highlightStats = useMemo(() => {
    if (logs.length === 0) return { maxInt: 0, minSleep: 999, maxSleep: 0 };

    let maxInt = 0;
    let minSleep = 999;
    let maxSleep = 0;

    logs.forEach((l) => {
      if (l.intensity > maxInt) maxInt = l.intensity;
      if (l.sleep_hours !== null && l.sleep_hours !== undefined) {
        const s = Number(l.sleep_hours);
        if (s < minSleep) minSleep = s;
        if (s > maxSleep) maxSleep = s;
      }
    });

    if (minSleep === 999) minSleep = 0;
    return { maxInt, minSleep, maxSleep };
  }, [logs]);

  // homeworks
  const [homeworksDraft, setHomeworksDraft] = useState<HomeworkDraft[]>([]);
  const activeDraft = useMemo(
    () => homeworksDraft.filter((h) => !h._deleted && h.is_active),
    [homeworksDraft]
  );
  const inactiveDraft = useMemo(
    () => homeworksDraft.filter((h) => !h._deleted && !h.is_active),
    [homeworksDraft]
  );
  const deletedDraft = useMemo(
    () => homeworksDraft.filter((h) => !!h._deleted),
    [homeworksDraft]
  );

  // forms
  const [pName, setPName] = useState("");
  const [pConcern, setPConcern] = useState("");
  const [pMemo, setPMemo] = useState("");
  const [pNextDate, setPNextDate] = useState(dateISO(addDays(new Date(), 7)));
  const FIXED_REMINDER = "23:00";

  const [nextReserve, setNextReserve] = useState(dateISO(addDays(new Date(), 7)));
  const [hwTitle, setHwTitle] = useState("");

  /* ===============================
   * auth + role guard
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

      const { data: prof, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", uid)
        .single();

      if (error || !prof?.role) {
        router.replace("/role");
        return;
      }
      if ((prof.role as Role) !== "counselor") {
        router.replace("/p");
        return;
      }
    })().catch(console.error);

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      const uid = s?.user?.id ?? null;
      if (!uid) router.replace("/");
      setUserId(uid);
    });

    return () => sub.subscription.unsubscribe();
  }, [router]);

  /* ===============================
   * fetchers
   * =============================== */
  const fetchPatients = async () => {
    const { data, error } = await supabase
      .from("patients")
      .select("*, invite_codes(code)")
      .order("created_at", { ascending: false });
    if (error) throw error;

    const arr = (data ?? []) as Patient[];
    setPatients(arr);
    if (!selectedPatientId && arr[0]?.id) setSelectedPatientId(arr[0].id);
  };

  const fetchSessions = async (pid: string) => {
    const { data, error } = await supabase
      .from("sessions")
      .select("*")
      .eq("patient_id", pid)
      .order("session_no", { ascending: true });
    if (error) throw error;
    setSessions((data ?? []) as SessionRow[]);
  };

  const fetchHomeworks = async (pid: string) => {
    const { data, error } = await supabase
      .from("homeworks")
      .select("*")
      .eq("patient_id", pid)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const hw = (data ?? []) as Homework[];
    setHomeworksDraft(
      hw.map((h) => ({
        id: h.id,
        title: h.title,
        is_active: h.is_active,
        _dirty: false,
        _deleted: false,
      }))
    );
  };

  const fetchRangeSummaries = async (pid: string) => {
    const { data, error } = await supabase
      .from("session_range_summaries")
      .select("*")
      .eq("patient_id", pid)
      .order("end_no", { ascending: false });
    if (error) throw error;

    const arr = (data ?? []) as RangeSummary[];
    setRangeSummaries(arr);

    if (arr.length) {
      const latestKey = `${arr[0].start_no}-${arr[0].end_no}`;
      if (!selectedRangeKey) setSelectedRangeKey(latestKey);
      else {
        const exists = arr.some((r) => `${r.start_no}-${r.end_no}` === selectedRangeKey);
        if (!exists) setSelectedRangeKey(latestKey);
      }
    } else {
      setSelectedRangeKey("");
    }
  };

  const fetchLogsForRange = async (pid: string, start: string, end: string) => {
    const { data, error } = await supabase
      .from("patient_logs")
      .select("*")
      .eq("patient_id", pid)
      .gte("log_date", start)
      .lte("log_date", end)
      .order("log_date", { ascending: false });
    if (error) throw error;
    setLogs((data ?? []) as any[]);
  };

  useEffect(() => {
    if (!userId) return;
    fetchPatients().catch(console.error);
  }, [userId]);

  useEffect(() => {
    if (!selectedPatientId) return;
    fetchSessions(selectedPatientId).catch(console.error);
    fetchHomeworks(selectedPatientId).catch(console.error);
    fetchRangeSummaries(selectedPatientId).catch(console.error);

    // 환자 바뀌면 상태 정리
    setShowPatientMemo(false);
    setShowDeletedHw(false);
    setShowWrapUp(false);
    setSaveMsg("");
  }, [selectedPatientId]);

  useEffect(() => {
    if (!selectedPatient) return;
    setNextReserve(selectedPatient.next_session_date ?? dateISO(addDays(new Date(), 7)));
    setSaveMsg("");
  }, [selectedPatient?.id]);

  useEffect(() => {
    if (!selectedPatientId || !selectedRange) {
      setLogs([]);
      return;
    }
    fetchLogsForRange(selectedPatientId, selectedRange.start_date, selectedRange.end_date).catch(console.error);
  }, [selectedPatientId, selectedRangeKey]);

  // ✅ 모바일: 환자 선택하면 드로어 자동 닫기 + 세션 영역으로 스크롤
  useEffect(() => {
    if (!selectedPatientId) return;
    const isMobile =
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 1023px)").matches;

    if (isMobile) {
      setDrawerOpen(false);
      const t = window.setTimeout(() => {
        rightTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 60);
      return () => window.clearTimeout(t);
    }
  }, [selectedPatientId]);

  /* ===============================
   * draft ops
   * =============================== */
  const addHomeworkDraft = () => {
    const title = hwTitle.trim();
    if (!title) return;
    const key = normTitle(title);
    const exists = homeworksDraft.some((h) => !h._deleted && normTitle(h.title) === key);
    if (exists) {
      setSaveMsg("같은 숙제가 이미 있습니다.");
      return;
    }
    const tmpId = `tmp_${Math.random().toString(16).slice(2)}`;
    setHomeworksDraft((prev) => [{ id: tmpId, title, is_active: true, _dirty: true }, ...prev]);
    setHwTitle("");
  };

  const editHomework = (id: string, title: string) => {
    setHomeworksDraft((prev) => prev.map((h) => (h.id === id ? { ...h, title, _dirty: true } : h)));
  };
  const toggleHomework = (id: string, is_active: boolean) => {
    setHomeworksDraft((prev) =>
      prev.map((h) => (h.id === id ? { ...h, is_active, _dirty: true } : h))
    );
  };
  const deleteHomework = (id: string) => {
    setHomeworksDraft((prev) =>
      prev.map((h) => (h.id === id ? { ...h, _deleted: true, _dirty: true } : h))
    );
    setShowDeletedHw(true);
  };
  const undoDeleteHomework = (id: string) => {
    setHomeworksDraft((prev) =>
      prev.map((h) => (h.id === id ? { ...h, _deleted: false, _dirty: true } : h))
    );
  };

  const hasPendingChanges = useMemo(() => {
    if (!selectedPatient) return false;
    const reserveDirty = (selectedPatient.next_session_date ?? "") !== (nextReserve ?? "");
    const hwDirty = homeworksDraft.some((h) => h._dirty);
    const hasBlank = homeworksDraft.some((h) => !h._deleted && !h.title.trim());
    if (hasBlank) return true;
    return reserveDirty || hwDirty;
  }, [selectedPatient, nextReserve, homeworksDraft]);

  // ✅ 자동 오픈 조건 1: 변경사항 생기면 Wrap-up 자동 오픈
  useEffect(() => {
    if (!selectedPatient) return;
    if (!hasPendingChanges) return;

    setShowWrapUp(true);

    // 모바일/데스크탑 모두 "마무리로 가자" 느낌을 위해 살짝 스크롤 (너무 공격적이지 않게)
    const t = window.setTimeout(() => {
      wrapUpRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);

    return () => window.clearTimeout(t);
  }, [hasPendingChanges, selectedPatient?.id]);

  /* ===============================
   * actions
   * =============================== */
  const createPatient = async () => {
    if (!pName.trim()) return alert("이름 입력");
    if (!pConcern.trim()) return alert("주호소 필수");

    const { data, error } = await supabase.rpc("create_patient_with_invite", {
      p_name: pName.trim(),
      p_concern: pConcern.trim(),
      p_initial_memo: pMemo.trim(),
      p_next_session_date: pNextDate,
      p_reminder_time: FIXED_REMINDER,
    });
    if (error) return alert(error.message);

    await Haptics.impact({ style: ImpactStyle.Medium });
    alert(`초대코드: ${data[0].invite_code}`);

    setPName("");
    setPConcern("");
    setPMemo("");

    await fetchPatients();
    setSelectedPatientId(data[0].patient_id);
    setSidebarMode("list");
  };

  const saveAndComplete = async () => {
    if (!selectedPatient || saving) return;

    // ✅ 자동 오픈 조건 2: 저장 누를 때 Wrap-up 닫혀있으면 먼저 열기 (1번에 1결정)
    if (!showWrapUp) {
      setShowWrapUp(true);
      setSaveMsg("마무리 섹션을 확인하세요");
      try {
        await Haptics.impact({ style: ImpactStyle.Light });
      } catch {}
      setTimeout(() => {
        wrapUpRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 120);
      return;
    }

    if (homeworksDraft.some((h) => !h._deleted && !h.title.trim())) {
      alert("숙제 제목이 비어있습니다.");
      return;
    }
    const seen = new Set<string>();
    for (const h of homeworksDraft) {
      if (h._deleted) continue;
      const k = normTitle(h.title);
      if (seen.has(k)) {
        alert("숙제 제목 중복입니다.");
        return;
      }
      seen.add(k);
    }

    setSaving(true);
    setSaveMsg("");

    try {
      const payload = homeworksDraft.map((h) => ({
        id: h.id.startsWith("tmp_") ? null : h.id,
        title: (h.title ?? "").trim(),
        is_active: !!h.is_active,
        action: h._deleted ? "delete" : "upsert",
      }));

      const { data, error } = await supabase.rpc("complete_session_atomic", {
        p_patient_id: selectedPatient.id,
        p_next_session_date: nextReserve,
        p_reminder_time: FIXED_REMINDER,
        p_homeworks: payload,
      });

      if (error) {
        const msg = (error.message ?? "").toLowerCase();
        if (msg.includes("duplicate") || msg.includes("already") || msg.includes("unique")) {
          setSaveMsg("이미 처리됨");
        } else {
          throw error;
        }
      } else {
        await Haptics.impact({ style: ImpactStyle.Medium });
        const n = data?.[0]?.session_no as number | undefined;
        if (typeof n === "number" && n >= 2) setSelectedRangeKey(`${n - 1}-${n}`);
        setSaveMsg("저장 완료");
      }

      await fetchPatients();
      await fetchSessions(selectedPatient.id);
      await fetchHomeworks(selectedPatient.id);
      await fetchRangeSummaries(selectedPatient.id);

      setTimeout(() => setSaveMsg(""), 1500);
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  /* ===============================
   * Sidebar content (reused for desktop + drawer)
   * =============================== */
  const SidebarContent = (
    <div className="space-y-3">
      <div className="grid grid-cols-2 text-center text-[13px] font-semibold border border-slate-200 rounded-2xl overflow-hidden">
        <button
          onClick={() => setSidebarMode("list")}
          className={`py-2 transition-colors ${
            sidebarMode === "list"
              ? "bg-emerald-600 text-white"
              : "bg-white text-slate-500 hover:bg-slate-50"
          }`}
        >
          목록
        </button>
        <button
          onClick={() => setSidebarMode("new")}
          className={`py-2 transition-colors ${
            sidebarMode === "new"
              ? "bg-emerald-600 text-white"
              : "bg-white text-slate-500 hover:bg-slate-50"
          }`}
        >
          등록
        </button>
      </div>

      {sidebarMode === "list" ? (
        <>
          <div className="space-y-2">
            <Field placeholder="검색" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>

          <div className="space-y-1">
            {filteredPatients.length === 0 ? (
              <p className="text-sm text-slate-600 py-6 text-center">환자가 없습니다.</p>
            ) : (
              filteredPatients.map((p) => {
                const active = p.id === selectedPatientId;
                const isToday = p.next_session_date === dateISO(new Date());

                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPatientId(p.id)}
                    className={[
                      "w-full text-left rounded-xl px-2.5 py-2 transition border",
                      active
                        ? "bg-emerald-600 text-white border-emerald-600 shadow-md transform scale-[1.01]"
                        : "bg-white border-slate-200 hover:bg-slate-50",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div
                        className={`text-[14px] min-w-0 truncate ${
                          active ? "font-bold" : "font-bold text-slate-900"
                        }`}
                      >
                        {p.name}
                      </div>

                      <div
                        className={[
                          "shrink-0 text-right font-mono tabular-nums whitespace-nowrap text-[11px] px-2 py-0.5 rounded-md",
                          isToday && !active
                            ? "bg-emerald-50 text-emerald-600 font-semibold"
                            : active
                            ? "bg-white/20 text-white"
                            : "bg-slate-100 text-slate-500",
                        ].join(" ")}
                        title={p.next_session_date ? relLabel(p.next_session_date) : undefined}
                      >
                        {p.next_session_date ? mmdd(p.next_session_date) : "-"}
                      </div>
                    </div>

                    <div className={`mt-1 flex items-center justify-between gap-2 ${active ? "opacity-90" : ""}`}>
                      <div className={`text-[12px] min-w-0 truncate ${active ? "" : "text-slate-500"}`}>
                        {p.concern || "주호소 미기입"}
                      </div>
                      <div className={`shrink-0 text-[10px] font-mono tabular-nums ${active ? "opacity-80" : "text-slate-400"}`}>
                        {p.invite_codes?.[0]?.code ? `#${p.invite_codes[0].code}` : "#-"}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">이름</label>
            <Field placeholder="환자 이름" value={pName} onChange={(e) => setPName(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">주호소</label>
            <Field
              placeholder="상담 사유 (필수)"
              value={pConcern}
              onChange={(e) => setPConcern(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">초진 메모</label>
            <textarea
              className={inputBase + " min-h-[96px]"}
              placeholder="특이사항, 복용 약물 등"
              value={pMemo}
              onChange={(e) => setPMemo(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">다음 상담 예정일</label>
            <input
              type="date"
              className={inputBase}
              value={pNextDate}
              onChange={(e) => setPNextDate(e.target.value)}
            />
          </div>

          <div className="text-xs text-slate-500 px-1">
            알림은 <strong>밤 11시</strong> 자동 설정
          </div>

          <button className={hwBtnPrimary + " w-full"} onClick={() => void createPatient()}>
            저장 & 초대코드
          </button>
        </div>
      )}
    </div>
  );

  /* ===============================
   * UI
   * =============================== */
  if (!userId) return null;

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* ✅ 모바일 상단바 */}
      <div className="lg:hidden sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <button
            onClick={() => setDrawerOpen(true)}
            className="text-xs font-semibold rounded-xl px-3 py-2 border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          >
            환자 목록/등록
          </button>

          <div className="min-w-0 text-right">
            <div className="text-sm font-semibold text-slate-900 truncate">
              {selectedPatient ? selectedPatient.name : "환자 미선택"}
            </div>
            <div className="text-[11px] text-slate-500">
              {selectedPatient?.next_session_date
                ? `다음 상담 ${mmdd(selectedPatient.next_session_date)}`
                : "—"}
            </div>
          </div>
        </div>
      </div>

      {/* ✅ 모바일 드로어 */}
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        {SidebarContent}
      </MobileDrawer>

      <main className="max-w-6xl mx-auto px-4 py-4 pb-36">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* ✅ 데스크탑 좌측 */}
          <aside className="hidden lg:block lg:col-span-3 space-y-3">
            <Card className="p-3">{SidebarContent}</Card>
          </aside>

          {/* ✅ Right: 세션 메인 */}
          <section className="lg:col-span-9 space-y-5">
            <div ref={rightTopRef} />

            {!selectedPatient ? (
              <Card>
                <h2 className="font-semibold text-slate-900">환자를 선택하세요</h2>
                <p className="text-sm text-slate-600 mt-1">
                  모바일: 상단의 “환자 목록/등록” 버튼을 누르세요. <br />
                  데스크탑: 왼쪽 목록에서 선택하세요.
                </p>
              </Card>
            ) : (
              <>
                {/* 1) 상황 파악 섹션 */}
                <Card className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="text-[16px] font-semibold truncate">{selectedPatient.name}</h2>
                        <Pill tone="muted" title="주호소">
                          {selectedPatient.concern || "주호소 미기입"}
                        </Pill>
                      </div>

                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        <div className="text-[12px] text-slate-500">다음 상담</div>
                        <div className="font-mono tabular-nums text-[12px] text-slate-800">
                          {selectedPatient.next_session_date ?? "-"}
                        </div>
                        {selectedPatient.next_session_date && (
                          <Pill tone="muted" title="상대 날짜">
                            {relLabel(selectedPatient.next_session_date)}
                          </Pill>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => setShowPatientMemo((v) => !v)}
                      className="shrink-0 text-xs font-semibold rounded-xl px-3 py-2 border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition"
                    >
                      {showPatientMemo ? "초진 메모 접기" : "초진 메모 열기"}
                    </button>
                  </div>

                  {showPatientMemo && (
                    <div className="mt-3">
                      <div className="text-xs text-slate-500">초진 메모</div>
                      <div className="mt-1 text-sm bg-slate-50 border border-slate-200 rounded-xl p-3 whitespace-pre-wrap">
                        {selectedPatient.initial_memo?.trim() ? selectedPatient.initial_memo : "—"}
                      </div>
                    </div>
                  )}
                </Card>

                {/* 2) 지난 1주 회상 섹션 */}
                <Card>
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                    <h3 className="font-semibold text-slate-900">세션 관리</h3>
                    <span className="text-xs text-slate-500 font-mono tabular-nums">
                      Current: {Math.max(1, sessionsAsc.length)}회차
                    </span>
                  </div>

                  {/* 분석 구간 */}
                  <div className="mb-6">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-500">분석 구간</div>
                        {rangeSummaries.length ? (
                          <div className="mt-1 text-sm text-slate-700">
                            <span className="font-semibold">
                              {selectedRange?.start_no}회차 이후 → {selectedRange?.end_no}회차
                            </span>
                            <span className="text-slate-500">
                              {" "}
                              ({selectedRange ? `${mmdd(selectedRange.start_date)} ~ ${mmdd(selectedRange.end_date)}` : ""})
                            </span>
                          </div>
                        ) : (
                          <div className="mt-1 text-sm text-slate-400">
                            세션 2회 이상부터 구간 요약이 생성됩니다.
                          </div>
                        )}
                        {rangeSummaries.length > 0 && (
                          <div className="mt-1 text-[11px] text-slate-400">
                            지난 상담 직후부터 오늘까지 기록을 모아봅니다.
                          </div>
                        )}
                      </div>

                      {rangeSummaries.length > 0 && (
                        <div className="shrink-0 flex items-center gap-2">
                          <button
                            onClick={() => {
                              setShowAllRanges(false);
                              setSelectedRangeKey(latestRangeKey);
                            }}
                            className={[
                              "text-xs font-semibold rounded-xl px-3 py-2 border transition",
                              (selectedRangeKey === latestRangeKey || !selectedRangeKey)
                                ? "bg-emerald-600 text-white border-emerald-600"
                                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
                            ].join(" ")}
                          >
                            최근
                          </button>
                          <button
                            onClick={() => setShowAllRanges((v) => !v)}
                            className="text-xs font-semibold rounded-xl px-3 py-2 border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition"
                          >
                            {showAllRanges ? "이전 구간 접기" : "이전 구간 보기"}
                          </button>
                        </div>
                      )}
                    </div>

                    {rangeSummaries.length > 0 && showAllRanges && (
                      <div className="mt-3">
                        <select
                          className={inputMuted}
                          value={selectedRangeKey || latestRangeKey}
                          onChange={(e) => setSelectedRangeKey(e.target.value)}
                        >
                          {rangeSummaries.map((r) => (
                            <option key={`${r.start_no}-${r.end_no}`} value={`${r.start_no}-${r.end_no}`}>
                              {r.start_no}회차 이후 → {r.end_no}회차 ({mmdd(r.start_date)}~{mmdd(r.end_date)})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* 기록 테이블 */}
                  <div className="mb-6 overflow-auto border border-slate-200 rounded-xl bg-white">
                    <table className="min-w-[760px] w-full text-sm">
                      <thead className="bg-slate-50 text-slate-700">
                        <tr className="border-b border-slate-200">
                          <th className="text-left font-semibold p-3">날짜</th>
                          <th className="text-left font-semibold p-3">감정</th>
                          <th className="text-left font-semibold p-3">강도</th>
                          <th className="text-left font-semibold p-3">트리거</th>
                          <th className="text-left font-semibold p-3">수면</th>
                          <th className="text-left font-semibold p-3">약</th>
                          <th className="text-left font-semibold p-3">숙제</th>
                        </tr>
                      </thead>
                      <tbody>
                        {logsDesc.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="p-4 text-slate-600">
                              기록이 없습니다.
                            </td>
                          </tr>
                        ) : (
                          logsDesc.map((r) => {
                            const isPeak = r.intensity === highlightStats.maxInt && r.intensity > 0;

                            const hasSleep = r.sleep_hours !== null && r.sleep_hours !== undefined;
                            const sleepVal = hasSleep ? Number(r.sleep_hours) : null;

                            // ✅ 수면 규칙 고정: 최저만 에메랄드 / 최고는 bold만
                            const isMinSleep = hasSleep && sleepVal === highlightStats.minSleep;
                            const isMaxSleep = hasSleep && sleepVal === highlightStats.maxSleep && !isMinSleep;

                            // ✅ 피크날만 행 tint
                            const rowCls = isPeak ? "bg-emerald-50/60" : "bg-white";

                            const medsTone =
                              r.took_meds == null ? "muted" : r.took_meds ? "good" : "bad";
                            const medsText =
                              r.took_meds == null ? "미기록" : r.took_meds ? "복용" : "복용 안 함";

                            const hwTone =
                              r.did_homework == null ? "muted" : r.did_homework ? "good" : "bad";
                            const hwText =
                              r.did_homework == null ? "미기록" : r.did_homework ? "수행" : "미수행";

                            return (
                              <tr key={r.id} className={["border-b border-slate-100", rowCls].join(" ")}>
                                <td className="p-3">
                                  <div className="font-mono tabular-nums whitespace-nowrap">{r.log_date}</div>
                                  <div className="text-[11px] text-slate-400" title={`${r.log_date} (${relLabel(r.log_date)})`}>
                                    {relLabel(r.log_date)}
                                  </div>
                                </td>

                                <td className="p-3">{r.emotion}</td>

                                <td className="p-3">
                                  <span
                                    className={[
                                      "font-mono tabular-nums",
                                      isPeak ? "text-emerald-700 font-semibold" : "text-slate-800",
                                    ].join(" ")}
                                  >
                                    {r.intensity}
                                  </span>
                                  {isPeak && (
                                    <span className="ml-2">
                                      <Pill tone="good">피크</Pill>
                                    </span>
                                  )}
                                </td>

                                <td className="p-3">{r.trigger}</td>

                                <td className="p-3">
                                  <span
                                    className={[
                                      "font-mono tabular-nums",
                                      isMinSleep ? "text-emerald-700 font-semibold" : "",
                                      isMaxSleep ? "font-semibold text-slate-900" : "text-slate-700",
                                    ].join(" ")}
                                  >
                                    {r.sleep_hours ?? "-"}
                                  </span>
                                </td>

                                <td className="p-3">
                                  <Pill tone={medsTone}>{medsText}</Pill>
                                </td>

                                <td className="p-3">
                                  <Pill tone={hwTone}>{hwText}</Pill>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* ===============================
                   * 3) 오늘 세션 마무리 (Accordion)
                   * =============================== */}
                  <div ref={wrapUpRef} className="mt-2 border-t border-slate-200 pt-4">
                    <button
                      onClick={() => setShowWrapUp((v) => !v)}
                      className="w-full flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 hover:bg-slate-50 transition"
                    >
                      <div className="text-sm font-semibold text-slate-900">오늘 세션 마무리</div>
                      <div className="text-xs text-slate-500">{showWrapUp ? "접기 ▲" : "열기 ▼"}</div>
                    </button>

                    {showWrapUp && (
                      <div className="mt-4 space-y-8">
                        {/* ===== 숙제 ===== */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-sm font-semibold">숙제</div>

                            <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-500">
                                활성 {activeDraft.length} / 비활성 {inactiveDraft.length}
                              </span>

                              {deletedDraft.length > 0 && (
                                <button
                                  onClick={() => setShowDeletedHw((v) => !v)}
                                  className="text-xs font-semibold rounded-xl px-3 py-2 border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                >
                                  {showDeletedHw
                                    ? "삭제된 숙제 접기"
                                    : `삭제된 숙제 ${deletedDraft.length}개`}
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-col sm:flex-row gap-2 mb-2">
                            <input
                              className={hwInputCls}
                              placeholder="예: 하루에 10분 산책 기록하기"
                              value={hwTitle}
                              onChange={(e) => setHwTitle(e.target.value)}
                            />
                            <button className={hwBtnPrimary + " w-full sm:w-auto shrink-0"} onClick={addHomeworkDraft}>
                              추가
                            </button>
                          </div>

                          <div className="space-y-2">
                            {activeDraft.map((h) => (
                              <div key={h.id} className={hwRowCls}>
                                <input
                                  className={hwInputCls}
                                  value={h.title}
                                  onChange={(e) => editHomework(h.id, e.target.value)}
                                />
                                <div className="flex gap-2 shrink-0">
                                  <button className={hwBtnSecondary} onClick={() => toggleHomework(h.id, false)}>
                                    이번 주는 쉬기
                                  </button>
                                  <button className={hwBtnDangerLite} onClick={() => deleteHomework(h.id)}>
                                    삭제
                                  </button>
                                </div>
                              </div>
                            ))}

                            {inactiveDraft.map((h) => (
                              <div key={h.id} className={hwRowCls}>
                                <input
                                  className={hwInputMutedCls}
                                  value={h.title}
                                  onChange={(e) => editHomework(h.id, e.target.value)}
                                />
                                <div className="flex gap-2 shrink-0">
                                  <button className={hwBtnSecondary} onClick={() => toggleHomework(h.id, true)}>
                                    이번 주에 다시 사용
                                  </button>
                                  <button className={hwBtnDangerLite} onClick={() => deleteHomework(h.id)}>
                                    삭제
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>

                          {deletedDraft.length > 0 && showDeletedHw && (
                            <div className="mt-3 pt-3 border-t border-slate-100">
                              <div className="text-xs font-semibold text-slate-500 mb-2">삭제된 숙제</div>
                              <div className="space-y-2">
                                {deletedDraft.map((h) => (
                                  <div
                                    key={h.id}
                                    className="border border-slate-200 rounded-xl bg-slate-50 px-2.5 py-2 flex items-center justify-between gap-2"
                                  >
                                    <div className="text-[13px] text-slate-700 line-clamp-1">{h.title}</div>
                                    <button className={hwBtnSecondary} onClick={() => undoDeleteHomework(h.id)}>
                                      복구
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* ===== 다음 세션 ===== */}
                        <div>
                          <div className="text-sm font-semibold mb-2">다음 세션</div>

                          <div className="flex flex-col lg:flex-row gap-3">
                            <div className="flex-1 bg-white border border-slate-200 rounded-xl p-3">
                              <div className="text-xs text-slate-500 mb-1">다음 상담 예약일</div>
                              <input
                                type="date"
                                className="w-full text-base font-semibold text-slate-900 outline-none bg-transparent"
                                value={nextReserve}
                                onChange={(e) => setNextReserve(e.target.value)}
                              />
                            </div>

                            <div className="flex-1 bg-slate-100 border border-slate-200 rounded-xl p-3">
                              <div className="text-sm font-semibold text-slate-700">일기 알림</div>
                              <div className="text-xs text-slate-500">매일 밤 11시 자동 발송</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              </>
            )}
          </section>
        </div>
      </main>

      {/* 플로팅 하단 바 */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white/90 backdrop-blur-md shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-50 transition-all">
        <div className="max-w-6xl mx-auto p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="text-sm font-medium flex items-center justify-center sm:justify-start gap-2">
            {saveMsg ? (
              <span className="text-emerald-600 flex items-center gap-1 animate-pulse">
                <span>{saveMsg}</span>
              </span>
            ) : hasPendingChanges ? (
              <span className="text-slate-600 flex items-center gap-1">
                <span>변경사항 저장 필요</span>
              </span>
            ) : (
              <span className="text-slate-400">최신 상태입니다</span>
            )}
          </div>

          <Btn
            className="w-full sm:w-auto shadow-lg active:scale-95 transition-transform bg-emerald-600 hover:bg-emerald-700 text-white border-none"
            onClick={() => void saveAndComplete()}
            disabled={!selectedPatient || saving}
            variant="primary"
          >
            {saving ? "처리 중..." : "세션 저장"}
          </Btn>
        </div>
      </div>
    </div>
  );
}
