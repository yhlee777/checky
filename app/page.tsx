"use client";

import React, { useEffect, useMemo, useState } from "react";

type Emotion =
  | "불안"
  | "우울"
  | "무기력"
  | "분노"
  | "자책"
  | "긴장"
  | "평온"
  | "만족감";

type TriggerCategory =
  | "대인관계"
  | "연애/성"
  | "가족"
  | "외모/자존감"
  | "미래 걱정"
  | "학업/일"
  | "금전"
  | "건강/몸"
  | "기타";

type MedicationStatus = "정상 복용" | "일부 누락" | "복용 안 함";

type DailyCheck = {
  date: string; // YYYY-MM-DD
  emotion: Emotion;
  trigger: TriggerCategory;
  intensity: number; // 0~100
  sleepHours: number; // 0.0~24.0
  medication: MedicationStatus;
  note?: string; // optional
  noteVisibleToDoctor: boolean;
};

type Settings = {
  pilotEndDate: string; // YYYY-MM-DD
  reminderTime: string; // "23:00" (for now informational)
};

type Role = "patient" | "doctor";

const EMOTIONS: Emotion[] = [
  "불안",
  "우울",
  "무기력",
  "분노",
  "자책",
  "긴장",
  "평온",
  "만족감",
];

const TRIGGERS: TriggerCategory[] = [
  "대인관계",
  "연애/성",
  "가족",
  "외모/자존감",
  "미래 걱정",
  "학업/일",
  "금전",
  "건강/몸",
  "기타",
];

const MEDS: MedicationStatus[] = ["정상 복용", "일부 누락", "복용 안 함"];

const SETTINGS_KEY = "checky_settings_v2";
const ENTRIES_KEY = "checky_entries_v2";

export default function Page() {
  const [role, setRole] = useState<Role>("patient");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [entries, setEntries] = useState<DailyCheck[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const today = useMemo(() => formatDate(new Date()), []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const rawSettings = window.localStorage.getItem(SETTINGS_KEY);
      if (rawSettings) {
        setSettings(JSON.parse(rawSettings));
      } else {
        const defaultEnd = addDays(new Date(), 13);
        setSettings({
          pilotEndDate: formatDate(defaultEnd),
          reminderTime: "23:00",
        });
      }

      const rawEntries = window.localStorage.getItem(ENTRIES_KEY);
      if (rawEntries) {
        setEntries(JSON.parse(rawEntries));
      }
    } catch (e) {
      console.error("Failed to load from localStorage", e);
    }

    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || !settings) return;
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      console.error("Failed to save settings", e);
    }
  }, [settings, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries));
    } catch (e) {
      console.error("Failed to save entries", e);
    }
  }, [entries, hydrated]);

  const todayEntry = entries.find((e) => e.date === today) || null;

  const pilotStatus = useMemo(() => {
    if (!settings) return null;
    const now = new Date();
    const end = parseDate(settings.pilotEndDate);
    const diff = diffDays(now, end);

    if (diff < 0) {
      return { state: "ended" as const, dDayText: "기간 종료", diff };
    }
    if (diff === 0) {
      return { state: "last" as const, dDayText: "D-DAY (오늘까지)", diff };
    }
    return { state: "running" as const, dDayText: `D-${diff}`, diff };
  }, [settings]);

  const saveEntry = (entry: DailyCheck) => {
    setEntries((prev) => {
      const others = prev.filter((e) => e.date !== entry.date);
      return [...others, entry].sort((a, b) =>
        a.date < b.date ? -1 : a.date > b.date ? 1 : 0
      );
    });
  };

  if (!hydrated || !settings) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm text-slate-500">Checky 불러오는 중...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-400">
              <span className="text-xl font-bold text-white">✔</span>
            </div>
            <span className="text-lg font-semibold">Checky</span>
          </div>

          <div className="flex items-center gap-4">
            <PilotBadge
              today={today}
              settings={settings}
              pilotStatus={pilotStatus}
            />

            <div className="flex gap-2 rounded-full bg-slate-100 p-1 text-sm">
              <button
                onClick={() => setRole("patient")}
                className={`rounded-full px-3 py-1 ${
                  role === "patient"
                    ? "bg-white shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                환자 화면
              </button>
              <button
                onClick={() => setRole("doctor")}
                className={`rounded-full px-3 py-1 ${
                  role === "doctor"
                    ? "bg-white shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                의사 화면
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 space-y-6">
        <SettingsCard
          settings={settings}
          onChange={setSettings}
          pilotStatus={pilotStatus}
        />

        {role === "patient" ? (
          <PatientView
            today={today}
            todayEntry={todayEntry}
            pilotStatus={pilotStatus}
            onSave={saveEntry}
          />
        ) : (
          <DoctorView entries={entries} settings={settings} />
        )}
      </main>
    </div>
  );
}

function PilotBadge({
  today,
  settings,
  pilotStatus,
}: {
  today: string;
  settings: Settings;
  pilotStatus: { state: string; dDayText: string; diff: number } | null;
}) {
  if (!pilotStatus) return null;
  return (
    <div className="hidden sm:flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
      <span>
        오늘: <span className="font-medium">{today}</span>
      </span>
      <span>
        다음 진료일까지{" "}
        <span className="font-semibold text-emerald-600">
          {pilotStatus.dDayText}
        </span>{" "}
        (종료 {settings.pilotEndDate})
      </span>
    </div>
  );
}

function SettingsCard({
  settings,
  onChange,
  pilotStatus,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  pilotStatus: { state: string; dDayText: string; diff: number } | null;
}) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">
            2주 파일럿 설정
          </h2>
          <p className="text-xs text-slate-500">
            다음 진료일까지 매일 밤 1분만 기록합니다. (현재는 폰 기본 알람 권장)
          </p>
        </div>
        {pilotStatus && (
          <span
            className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
              pilotStatus.state === "ended"
                ? "bg-slate-100 text-slate-500"
                : "bg-emerald-50 text-emerald-700"
            }`}
          >
            {pilotStatus.dDayText}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500">파일럿 종료일 (다음 진료일)</label>
          <input
            type="date"
            value={settings.pilotEndDate}
            onChange={(e) => onChange({ ...settings, pilotEndDate: e.target.value })}
            className="rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500">기록 시간 (권장)</label>
          <input
            type="time"
            value={settings.reminderTime}
            onChange={(e) => onChange({ ...settings, reminderTime: e.target.value })}
            className="rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none focus:border-emerald-500"
          />
          <div className="text-[10px] text-slate-400">
            폰 알람에 “Checky”로 맞춰두면 완전 위장됩니다.
          </div>
        </div>
      </div>
    </section>
  );
}

function PatientView({
  today,
  todayEntry,
  pilotStatus,
  onSave,
}: {
  today: string;
  todayEntry: DailyCheck | null;
  pilotStatus: { state: string; dDayText: string; diff: number } | null;
  onSave: (entry: DailyCheck) => void;
}) {
  const isEnded = pilotStatus?.state === "ended";

  const [emotion, setEmotion] = useState<Emotion | null>(todayEntry?.emotion ?? null);
  const [trigger, setTrigger] = useState<TriggerCategory | null>(todayEntry?.trigger ?? null);
  const [intensity, setIntensity] = useState<number>(todayEntry?.intensity ?? 50);

  const [sleepHours, setSleepHours] = useState<string>(
    todayEntry ? String(todayEntry.sleepHours) : ""
  );

  const [medication, setMedication] = useState<MedicationStatus | null>(
    todayEntry?.medication ?? null
  );

  const [note, setNote] = useState<string>(todayEntry?.note ?? "");
  const [noteVisibleToDoctor, setNoteVisibleToDoctor] = useState<boolean>(
    todayEntry?.noteVisibleToDoctor ?? false
  );

  const [saved, setSaved] = useState<boolean>(!!todayEntry);

  const canSubmit =
    !!emotion &&
    !!trigger &&
    medication !== null &&
    isValidSleepHours(sleepHours) &&
    !isEnded;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emotion || !trigger || medication === null) return;
    const sleep = Number(sleepHours);

    const entry: DailyCheck = {
      date: today,
      emotion,
      trigger,
      intensity,
      sleepHours: sleep,
      medication,
      note: note.trim() ? note.trim() : undefined,
      noteVisibleToDoctor: !!note.trim() && noteVisibleToDoctor,
    };

    onSave(entry);
    setSaved(true);
  };

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div>
        <h1 className="mb-1 text-2xl font-semibold">오늘 하루 체크</h1>
        <p className="text-xs text-slate-600">
          {today} · 다음 진료일까지 {pilotStatus?.dDayText ?? ""} · 하루 1분
        </p>
      </div>

      {isEnded && (
        <div className="rounded-xl bg-slate-100 p-3 text-xs text-slate-600">
          파일럿 기간이 종료되었습니다. 종료일을 바꾸거나, 의사 화면에서 리포트를
          확인하세요.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl bg-white p-5 shadow-sm">
        {/* 감정 */}
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-800">
            1) 오늘 하루를 가장 지배한 감정
          </h2>
          <div className="flex flex-wrap gap-2">
            {EMOTIONS.map((e) => (
              <button
                key={e}
                type="button"
                disabled={isEnded}
                onClick={() => setEmotion(e)}
                className={`rounded-full border px-3 py-1 text-sm ${
                  emotion === e
                    ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                    : "border-slate-200 text-slate-700 hover:bg-slate-50"
                } ${isEnded ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {e}
              </button>
            ))}
          </div>
        </section>

        {/* 원인 */}
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-800">
            2) 그 감정의 가장 큰 원인(Trigger)
          </h2>
          <div className="flex flex-wrap gap-2">
            {TRIGGERS.map((t) => (
              <button
                key={t}
                type="button"
                disabled={isEnded}
                onClick={() => setTrigger(t)}
                className={`rounded-full border px-3 py-1 text-sm ${
                  trigger === t
                    ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                    : "border-slate-200 text-slate-700 hover:bg-slate-50"
                } ${isEnded ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {t}
              </button>
            ))}
          </div>
        </section>

        {/* 강도 */}
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-800">
            3) 감정 강도 (0~100)
          </h2>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={100}
              value={intensity}
              onChange={(e) => setIntensity(Number(e.target.value))}
              disabled={isEnded}
              className="w-full"
            />
            <span className="w-10 text-right text-sm font-medium">{intensity}</span>
          </div>
        </section>

        {/* 수면 */}
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-800">
            4) 수면 시간 (시간)
          </h2>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              step="0.5"
              min={0}
              max={24}
              value={sleepHours}
              onChange={(e) => setSleepHours(e.target.value)}
              disabled={isEnded}
              placeholder="예: 7.0"
              className="w-32 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 disabled:opacity-50"
            />
            <span className="text-sm text-slate-600">시간</span>
            {!isValidSleepHours(sleepHours) && sleepHours !== "" && (
              <span className="text-xs text-rose-500">0~24 사이로 입력</span>
            )}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            어젯밤 실제 잔 시간을 대략 입력해도 됩니다.
          </p>
        </section>

        {/* 약 복용 */}
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-800">
            5) 약 복용 여부
          </h2>
          <div className="flex flex-wrap gap-2">
            {MEDS.map((m) => (
              <button
                key={m}
                type="button"
                disabled={isEnded}
                onClick={() => setMedication(m)}
                className={`rounded-full border px-3 py-1 text-sm ${
                  medication === m
                    ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                    : "border-slate-200 text-slate-700 hover:bg-slate-50"
                } ${isEnded ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {m}
              </button>
            ))}
          </div>
        </section>

        {/* 메모 */}
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-800">
            6) 기타 (선택)
          </h2>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={isEnded}
            placeholder="자유롭게 서술해주세요."
            className="h-24 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:bg-white disabled:opacity-50"
          />
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={noteVisibleToDoctor}
              onChange={(e) => setNoteVisibleToDoctor(e.target.checked)}
              disabled={isEnded || !note.trim()}
            />
            이 내용은 의사에게도 보여줘도 괜찮아요.
          </label>
        </section>

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full rounded-xl bg-emerald-500 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {saved ? "오늘 기록 업데이트" : "오늘 기록 저장"}
        </button>

        {saved && (
          <p className="text-[11px] text-emerald-600">
            저장 완료 ✔ 내일도 같은 방식으로 1분만 기록하면 됩니다.
          </p>
        )}
      </form>
    </div>
  );
}

function DoctorView({ entries, settings }: { entries: DailyCheck[]; settings: Settings }) {
  const last14 = useMemo(() => {
    if (!entries.length) return [];
    return [...entries].sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-14);
  }, [entries]);

  const emotionCounts = useMemo(() => countBy(last14, (d) => d.emotion), [last14]);
  const triggerCounts = useMemo(() => countBy(last14, (d) => d.trigger), [last14]);

  const sleepAvg = useMemo(() => {
    if (!last14.length) return null;
    const sum = last14.reduce((acc, d) => acc + (Number.isFinite(d.sleepHours) ? d.sleepHours : 0), 0);
    return round1(sum / last14.length);
  }, [last14]);

  const medStats = useMemo(() => {
    const stats: Record<MedicationStatus, number> = {
      "정상 복용": 0,
      "일부 누락": 0,
      "복용 안 함": 0,
    };
    for (const d of last14) stats[d.medication] += 1;
    return stats;
  }, [last14]);

  const openNotes = useMemo(
    () => last14.filter((d) => d.note && d.noteVisibleToDoctor),
    [last14]
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="mb-1 text-2xl font-semibold">의사용 리포트 (최근 14일)</h1>
        <p className="text-sm text-slate-600">
          환자가 기록한 데이터 중 핵심 항목(감정/원인/수면/약)은 항상 포함되고,
          메모는 “의사 공개”로 선택된 것만 표시됩니다.
        </p>
        <p className="mt-1 text-xs text-slate-500">파일럿 종료일: {settings.pilotEndDate}</p>
      </header>

      {last14.length === 0 ? (
        <div className="rounded-2xl bg-white p-5 text-sm text-slate-600 shadow-sm">
          아직 기록이 없습니다. 최소 3일만 쌓여도 패턴이 보이기 시작합니다.
        </div>
      ) : (
        <>
          {/* 핵심 요약 */}
          <section className="rounded-2xl bg-white p-5 shadow-sm space-y-2">
            <h2 className="text-sm font-semibold text-slate-800">핵심 요약</h2>
            <div className="text-sm text-slate-800">
              주요 감정: <span className="font-semibold">{topKey(emotionCounts) ?? "-"}</span> ·
              주요 원인: <span className="font-semibold">{topKey(triggerCounts) ?? "-"}</span>
            </div>
            <div className="text-sm text-slate-800">
              평균 수면: <span className="font-semibold">{sleepAvg ?? "-"}</span> 시간
            </div>
            <div className="text-sm text-slate-800">
              약 복용:{" "}
              <span className="font-semibold">정상 {medStats["정상 복용"]}</span> ·{" "}
              <span className="font-semibold">누락 {medStats["일부 누락"]}</span> ·{" "}
              <span className="font-semibold">미복용 {medStats["복용 안 함"]}</span>
            </div>
            <p className="text-xs text-slate-500">
              * “누락/미복용”이 있는 날의 감정 강도·수면과 함께 비교해보면 진료에 도움이 됩니다.
            </p>
          </section>

          {/* 감정 그래프 */}
          <section className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">
              감정 강도 추이 (필수 데이터)
            </h2>
            <div className="flex gap-2 overflow-x-auto rounded-xl bg-slate-50 p-3 text-xs">
              {last14.map((d) => (
                <div key={d.date} className="flex min-w-[88px] flex-col items-center gap-1">
                  <span className="text-[10px] text-slate-500">{d.date.slice(5)}</span>
                  <div className="flex h-20 w-6 items-end rounded-full bg-slate-100">
                    <div
                      className="w-full rounded-full bg-emerald-400"
                      style={{ height: `${clamp(d.intensity, 0, 100)}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-medium text-slate-700">{d.emotion}</span>
                  <span className="text-[10px] text-slate-500">
                    {d.intensity}/100 · {d.sleepHours}h
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Top */}
          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-slate-800">감정 Top</h2>
              <ul className="space-y-1 text-sm">
                {Object.entries(emotionCounts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([k, v]) => (
                    <li key={k} className="flex items-center justify-between">
                      <span>{k}</span>
                      <span className="text-slate-500">{v}회</span>
                    </li>
                  ))}
              </ul>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-slate-800">원인 Top</h2>
              <ul className="space-y-1 text-sm">
                {Object.entries(triggerCounts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([k, v]) => (
                    <li key={k} className="flex items-center justify-between">
                      <span>{k}</span>
                      <span className="text-slate-500">{v}회</span>
                    </li>
                  ))}
              </ul>
            </div>
          </section>

          {/* 공개 메모 */}
          <section className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">
              공개된 메모 (환자 선택 공개)
            </h2>
            {openNotes.length === 0 ? (
              <p className="text-xs text-slate-500">
                이번 기간에는 공개된 메모가 없습니다.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {openNotes.map((d) => (
                  <li key={d.date} className="rounded-xl bg-slate-50 p-3">
                    <div className="mb-1 text-[11px] text-slate-500">
                      {d.date} · {d.emotion} / {d.trigger} · 수면 {d.sleepHours}h · 약 {d.medication}
                    </div>
                    <div className="text-slate-800">{d.note}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

// ---- utils ----

function isValidSleepHours(v: string): boolean {
  if (v.trim() === "") return false;
  const n = Number(v);
  if (!Number.isFinite(n)) return false;
  return n >= 0 && n <= 24;
}

function countBy<T>(arr: T[], keyFn: (item: T) => string): Record<string, number> {
  const res: Record<string, number> = {};
  for (const item of arr) {
    const k = keyFn(item);
    res[k] = (res[k] ?? 0) + 1;
  }
  return res;
}

function topKey(obj: Record<string, number>): string | null {
  const es = Object.entries(obj);
  if (!es.length) return null;
  es.sort((a, b) => b[1] - a[1]);
  return es[0][0];
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map((x) => Number(x));
  return new Date(y, m - 1, d);
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d.getTime());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function diffDays(a: Date, b: Date): number {
  const ms = stripTime(b).getTime() - stripTime(a).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function stripTime(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function round1(n: number): string {
  return (Math.round(n * 10) / 10).toFixed(1);
}
