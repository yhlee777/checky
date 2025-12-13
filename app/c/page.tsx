"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
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

export default function Page() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);

  // ✅ 모바일에서 환자 선택 시 이 섹션으로 스크롤 이동
  const rightTopRef = useRef<HTMLDivElement | null>(null);

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

  // range summaries (from view)
  const [rangeSummaries, setRangeSummaries] = useState<RangeSummary[]>([]);
  const [selectedRangeKey, setSelectedRangeKey] = useState("");

  const selectedRange = useMemo(() => {
    if (!rangeSummaries.length) return null;
    const found = rangeSummaries.find(
      (r) => `${r.start_no}-${r.end_no}` === selectedRangeKey
    );
    return found ?? rangeSummaries[0];
  }, [rangeSummaries, selectedRangeKey]);

  // logs for table
  const [logs, setLogs] = useState<PatientLog[]>([]);
  const logsDesc = useMemo(
    () => logs.slice().sort((a, b) => (a.log_date < b.log_date ? 1 : -1)),
    [logs]
  );

  // ✅ [NEW] 표 강조를 위한 통계 계산 (최고 강도, 최저/최고 수면)
  const highlightStats = useMemo(() => {
    if (logs.length === 0) return { maxInt: 0, minSleep: 999, maxSleep: 0 };
    
    let maxInt = 0;
    let minSleep = 999;
    let maxSleep = 0;

    logs.forEach(l => {
        // 강도
        if (l.intensity > maxInt) maxInt = l.intensity;
        // 수면 (null 제외)
        if (l.sleep_hours !== null && l.sleep_hours !== undefined) {
            const s = Number(l.sleep_hours);
            if (s < minSleep) minSleep = s;
            if (s > maxSleep) maxSleep = s;
        }
    });

    // 수면 기록이 하나도 없으면 초기값 리셋
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

  // add patient
  const [pName, setPName] = useState("");
  const [pConcern, setPConcern] = useState("");
  const [pMemo, setPMemo] = useState("");
  const [pNextDate, setPNextDate] = useState(dateISO(addDays(new Date(), 7)));
  const [pReminder, setPReminder] = useState("23:00");

  // draft reserve
  const [nextReserve, setNextReserve] = useState(dateISO(addDays(new Date(), 7)));
  const [nextReminder, setNextReminder] = useState("23:00");

  // add homework
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
    setLogs((data ?? []) as PatientLog[]);
  };

  useEffect(() => {
    if (!userId) return;
    fetchPatients().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (!selectedPatientId) return;
    fetchSessions(selectedPatientId).catch(console.error);
    fetchHomeworks(selectedPatientId).catch(console.error);
    fetchRangeSummaries(selectedPatientId).catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPatientId]);

  // patient 바뀌면 예약 draft 동기화
  useEffect(() => {
    if (!selectedPatient) return;
    setNextReserve(selectedPatient.next_session_date ?? dateISO(addDays(new Date(), 7)));
    setNextReminder(selectedPatient.reminder_time ?? "23:00");
    setSaveMsg("");
  }, [selectedPatient?.id]);

  // range 바뀌면 logs 로딩
  useEffect(() => {
    if (!selectedPatientId || !selectedRange) {
      setLogs([]);
      return;
    }
    fetchLogsForRange(selectedPatientId, selectedRange.start_date, selectedRange.end_date).catch(
      console.error
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPatientId, selectedRangeKey]);

  // ✅ 모바일에서 환자 선택하면 우측(세션 섹션)으로 스크롤 이동
  useEffect(() => {
    if (!selectedPatientId) return;

    const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches;
    if (!isMobile) return;

    // 약간의 렌더 타이밍 보장
    const t = window.setTimeout(() => {
      rightTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);

    return () => window.clearTimeout(t);
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
      setSaveMsg("같은 숙제가 이미 있습니다(중복 방지).");
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
  };

  const undoDeleteHomework = (id: string) => {
    setHomeworksDraft((prev) =>
      prev.map((h) => (h.id === id ? { ...h, _deleted: false, _dirty: true } : h))
    );
  };

  const hasPendingChanges = useMemo(() => {
    if (!selectedPatient) return false;

    const reserveDirty = (selectedPatient.next_session_date ?? "") !== (nextReserve ?? "");
    const reminderDirty = (selectedPatient.reminder_time ?? "") !== (nextReminder ?? "");
    const hwDirty = homeworksDraft.some((h) => h._dirty);

    const hasBlank = homeworksDraft.some((h) => !h._deleted && !h.title.trim());
    if (hasBlank) return true;

    return reserveDirty || reminderDirty || hwDirty;
  }, [selectedPatient, nextReserve, nextReminder, homeworksDraft]);

  /* ===============================
   * actions
   * =============================== */
  const createPatient = async () => {
    if (!pName.trim()) return alert("이름 입력");
    if (!pConcern.trim()) return alert("주호소는 필수");

    const { data, error } = await supabase.rpc("create_patient_with_invite", {
      p_name: pName.trim(),
      p_concern: pConcern.trim(),
      p_initial_memo: pMemo.trim(),
      p_next_session_date: pNextDate,
      p_reminder_time: pReminder,
    });

    if (error) return alert(error.message);

    alert(`초대코드: ${data[0].invite_code}`);
    setPName("");
    setPConcern("");
    setPMemo("");

    await fetchPatients();
    setSelectedPatientId(data[0].patient_id);
  };

  const saveAndComplete = async () => {
    if (!selectedPatient || saving) return;

    if (homeworksDraft.some((h) => !h._deleted && !h.title.trim())) {
      alert("숙제 제목이 비어있는 항목이 있습니다.");
      return;
    }

    const seen = new Set<string>();
    for (const h of homeworksDraft) {
      if (h._deleted) continue;
      const k = normTitle(h.title);
      if (seen.has(k)) {
        alert("숙제 중복이 있습니다. (같은 제목)");
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
        p_reminder_time: nextReminder,
        p_homeworks: payload, // jsonb
      });

      if (error) {
        const msg = (error.message ?? "").toLowerCase();
        if (msg.includes("duplicate") || msg.includes("already") || msg.includes("unique")) {
          setSaveMsg("이미 처리됨(중복 방지)");
        } else {
          throw error;
        }
      } else {
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
   * UI
   * =============================== */
  if (!userId) return null;

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <main className="max-w-6xl mx-auto px-4 py-4 pb-32">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left */}
          <aside className="lg:col-span-4 space-y-4">
            <Card>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">환자</h2>
                <span className="text-xs text-slate-500">{patients.length}명</span>
              </div>

              <div className="mt-3">
                <Field
                  placeholder="검색: 이름/주호소"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>

              <div className="mt-3 max-h-none lg:max-h-[52vh] overflow-auto pr-1 space-y-1">
                {filteredPatients.length === 0 ? (
                  <p className="text-sm text-slate-600 py-6 text-center">아직 환자가 없습니다.</p>
                ) : (
                  filteredPatients.map((p) => {
                    const active = p.id === selectedPatientId;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setSelectedPatientId(p.id)}
                        className={[
                          "w-full text-left rounded-xl px-3 py-2 transition border",
                          active
                            ? "bg-slate-900 text-white border-slate-900"
                            : "bg-white border-slate-200 hover:bg-slate-50",
                        ].join(" ")}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium min-w-0 truncate">{p.name}</div>

                          {/* ✅ 날짜: 절대 줄바꿈 안되게 + 폭 확보 + 숫자 고정폭 */}
                          <div
                            className={[
                              "shrink-0 text-right font-mono tabular-nums whitespace-nowrap",
                              "text-[11px] sm:text-xs",
                              "min-w-[56px]",
                              active ? "opacity-90" : "text-slate-600",
                            ].join(" ")}
                          >
                            {p.next_session_date ? mmdd(p.next_session_date) : "-"}
                          </div>
                        </div>

                        <div className="text-xs opacity-80 mt-1 line-clamp-1">
                          {p.concern || "주호소 미기입"}
                        </div>

                        <div className="text-[11px] opacity-70 mt-0.5 font-mono whitespace-nowrap">
                          Code: {p.invite_codes?.[0]?.code || "-"}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </Card>

            <Card>
              <h3 className="font-semibold">환자 추가(초진)</h3>
              <div className="mt-3 space-y-2">
                <Field placeholder="이름" value={pName} onChange={(e) => setPName(e.target.value)} />
                <Field
                  placeholder="주호소(필수)"
                  value={pConcern}
                  onChange={(e) => setPConcern(e.target.value)}
                />
                <textarea
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-slate-200 min-h-[92px]"
                  placeholder="초진 메모(약/금기/사건 등)"
                  value={pMemo}
                  onChange={(e) => setPMemo(e.target.value)}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Field type="date" value={pNextDate} onChange={(e) => setPNextDate(e.target.value)} />
                  <Field type="time" value={pReminder} onChange={(e) => setPReminder(e.target.value)} />
                </div>
                <Btn className="w-full" onClick={createPatient}>
                  저장 & 초대코드 생성
                </Btn>
              </div>
            </Card>
          </aside>

          {/* Right */}
          <section className="lg:col-span-8 space-y-4">
            {/* ✅ 스크롤 타겟 */}
            <div ref={rightTopRef} />

            {!selectedPatient ? (
              <Card>
                <h2 className="font-semibold">환자를 선택하세요</h2>
                <p className="text-sm text-slate-600 mt-1">
                  위에서 환자를 클릭하면 세션 관리가 열립니다.
                </p>
              </Card>
            ) : (
              <>
                <Card>
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold">{selectedPatient.name}</h2>
                      <p className="text-sm text-slate-600 mt-1">
                        {selectedPatient.concern || "주호소 미기입"}
                      </p>
                    </div>

                    {/* ✅ 날짜/시간도 줄바꿈 방지 */}
                    <div className="sm:text-right">
                      <div className="text-xs text-slate-500">다음 상담</div>
                      <div className="font-semibold font-mono tabular-nums whitespace-nowrap">
                        {selectedPatient.next_session_date ?? "-"}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        리마인더:{" "}
                        <span className="font-mono tabular-nums whitespace-nowrap">
                          {selectedPatient.reminder_time ?? "-"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="text-xs text-slate-500">초진 메모</div>
                    <div className="mt-1 text-sm bg-slate-50 border border-slate-200 rounded-xl p-3 whitespace-pre-wrap">
                      {selectedPatient.initial_memo?.trim() ? selectedPatient.initial_memo : "—"}
                    </div>
                  </div>
                </Card>

                <Card>
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">세션</h3>
                    <span className="text-xs text-slate-500">
                      총 {Math.max(1, sessionsAsc.length)}회
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-2">
                    <div>
                      <div className="text-xs text-slate-500 mb-1">다음 예약일</div>
                      <Field type="date" value={nextReserve} onChange={(e) => setNextReserve(e.target.value)} />
                    </div>
                    <div>
                      <div className="text-xs text-slate-500 mb-1">리마인더</div>
                      <Field
                        type="time"
                        value={nextReminder}
                        onChange={(e) => setNextReminder(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="mt-5 flex flex-col lg:flex-row lg:items-center justify-between gap-2">
                    <div className="text-sm font-semibold">회차 구간</div>
                    {rangeSummaries.length ? (
                      <select
                        className="w-full lg:w-auto text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white"
                        value={
                          selectedRangeKey ||
                          `${rangeSummaries[0].start_no}-${rangeSummaries[0].end_no}`
                        }
                        onChange={(e) => setSelectedRangeKey(e.target.value)}
                      >
                        {rangeSummaries.map((r) => (
                          <option key={`${r.start_no}-${r.end_no}`} value={`${r.start_no}-${r.end_no}`}>
                            {r.start_no}회차~{r.end_no}회차({mmdd(r.end_date)})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs text-slate-500">세션 2회 이상부터 요약 생성</span>
                    )}
                  </div>

                  {/* ❌ [삭제됨] 30초 브리핑 카드 제거 완료 */}

                  <div className="mt-4 overflow-auto border border-slate-200 rounded-xl bg-white">
                    <table className="min-w-[760px] w-full text-sm">
                      <thead className="bg-slate-50 text-slate-700">
                        <tr className="border-b border-slate-200">
                          <th className="text-left font-semibold p-3">날짜</th>
                          <th className="text-left font-semibold p-3">감정</th>
                          <th className="text-left font-semibold p-3">강도</th>
                          <th className="text-left font-semibold p-3">트리거</th>
                          <th className="text-left font-semibold p-3">수면</th>
                          <th className="text-left font-semibold p-3">약</th>
                        </tr>
                      </thead>
                      <tbody>
                        {logsDesc.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="p-4 text-slate-600">
                              이 구간에 기록이 없습니다.
                            </td>
                          </tr>
                        ) : (
                          logsDesc.map((r) => {
                             // ✅ [테이블 강조 로직]
                             // 1. 강도 피크: 빨강+굵게
                             const isPeak = r.intensity === highlightStats.maxInt && r.intensity > 0;
                             // 2. 수면 최저(빨강), 최고(파랑)
                             const isMinSleep = r.sleep_hours !== null && Number(r.sleep_hours) === highlightStats.minSleep;
                             const isMaxSleep = r.sleep_hours !== null && Number(r.sleep_hours) === highlightStats.maxSleep && !isMinSleep;
                             // 3. 약 안먹음(X): 빨강+굵게
                             const isNoMeds = r.took_meds === false;

                             return (
                                <tr key={r.id} className="border-b border-slate-100">
                                  <td className="p-3 font-mono tabular-nums whitespace-nowrap">{r.log_date}</td>
                                  <td className="p-3">{r.emotion}</td>
                                  <td className={`p-3 ${isPeak ? "text-red-600 font-bold" : ""}`}>
                                    {r.intensity}
                                  </td>
                                  <td className="p-3">{r.trigger}</td>
                                  <td className={`p-3 ${isMinSleep ? "text-red-600 font-bold" : isMaxSleep ? "text-blue-600 font-bold" : ""}`}>
                                    {r.sleep_hours ?? "-"}
                                  </td>
                                  <td className={`p-3 ${isNoMeds ? "text-red-600 font-bold" : ""}`}>
                                    {r.took_meds == null ? "-" : r.took_meds ? "O" : "X"}
                                  </td>
                                </tr>
                             );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-5">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold">숙제</div>
                      <span className="text-xs text-slate-500">
                        활성 {activeDraft.length} / 비활성 {inactiveDraft.length}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-col sm:flex-row gap-2">
                      <Field placeholder="숙제 추가(중복 방지)" value={hwTitle} onChange={(e) => setHwTitle(e.target.value)} />
                      <Btn className="w-full sm:w-auto" variant="secondary" onClick={addHomeworkDraft}>
                        추가
                      </Btn>
                    </div>

                    <div className="mt-3 space-y-2">
                      {activeDraft.map((h) => (
                        <div
                          key={h.id}
                          className="border border-slate-200 rounded-xl p-3 bg-white flex flex-col lg:flex-row gap-2 lg:items-center lg:justify-between"
                        >
                          <input
                            className="w-full text-sm text-slate-900 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-slate-200"
                            value={h.title}
                            onChange={(e) => editHomework(h.id, e.target.value)}
                          />
                          <div className="flex flex-col sm:flex-row gap-2">
                            <Btn variant="secondary" onClick={() => toggleHomework(h.id, false)}>
                              비활성
                            </Btn>
                            <Btn variant="danger" onClick={() => deleteHomework(h.id)}>
                              삭제
                            </Btn>
                          </div>
                        </div>
                      ))}

                      {inactiveDraft.map((h) => (
                        <div
                          key={h.id}
                          className="border border-slate-200 rounded-xl p-3 bg-white flex flex-col lg:flex-row gap-2 lg:items-center lg:justify-between"
                        >
                          <input
                            className="w-full text-sm text-slate-700 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-slate-200"
                            value={h.title}
                            onChange={(e) => editHomework(h.id, e.target.value)}
                          />
                          <div className="flex flex-col sm:flex-row gap-2">
                            <Btn variant="secondary" onClick={() => toggleHomework(h.id, true)}>
                              다시 활성
                            </Btn>
                            <Btn variant="danger" onClick={() => deleteHomework(h.id)}>
                              삭제
                            </Btn>
                          </div>
                        </div>
                      ))}

                      {deletedDraft.map((h) => (
                        <div
                          key={h.id}
                          className="border border-red-200 rounded-xl p-3 bg-red-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                        >
                          <div className="text-sm text-slate-700 line-clamp-1">{h.title}</div>
                          <Btn className="w-full sm:w-auto" variant="secondary" onClick={() => undoDeleteHomework(h.id)}>
                            삭제 취소
                          </Btn>
                        </div>
                      ))}
                    </div>
                  </div>
                </Card>
              </>
            )}
          </section>
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto p-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="text-sm text-slate-600">
            {saveMsg ? (
              <span className="text-emerald-700 font-semibold">{saveMsg}</span>
            ) : hasPendingChanges ? (
              <span>변경사항 있음 · 버튼 1번으로 저장/완료</span>
            ) : (
              <span>변경사항 없음</span>
            )}
          </div>

          <Btn className="w-full sm:w-auto" onClick={saveAndComplete} disabled={!selectedPatient || saving}>
            {saving ? "저장 중..." : "저장 & 이번 세션 완료"}
          </Btn>
        </div>
      </div>
    </div>
  );
}