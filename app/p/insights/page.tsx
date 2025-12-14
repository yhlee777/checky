"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { Patient } from "@/lib/types";
import { Btn, Card } from "@/components/ui";
import { usePatientBoot } from "@/lib/usePatientBoot";

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
function shortMMDD(iso: string) {
  return `${iso.slice(5, 7)}/${iso.slice(8, 10)}`;
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

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700">
      {children}
    </span>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-[11px] text-slate-500 font-semibold">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-900 font-mono tabular-nums">
        {value}
      </div>
      {sub && <div className="mt-1 text-[12px] text-slate-500">{sub}</div>}
    </div>
  );
}

function Sparkline({
  values,
  height = 44,
  strokeWidth = 2,
}: {
  values: (number | null)[];
  height?: number;
  strokeWidth?: number;
}) {
  const w = 220;
  const h = height;

  const clean = values.map((v) =>
    typeof v === "number" && Number.isFinite(v) ? v : null
  );
  const nums = clean.filter((v): v is number => typeof v === "number");
  if (nums.length <= 1) {
    return (
      <div className="h-[44px] flex items-center text-sm text-slate-500">
        데이터가 더 쌓이면 그래프가 보여요
      </div>
    );
  }

  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = Math.max(1e-6, max - min);

  const pts = clean.map((v, i) => {
    const x = (i / Math.max(1, clean.length - 1)) * (w - 2) + 1;
    const y = v == null ? null : (h - 2) - ((v - min) / span) * (h - 2) + 1;
    return { x, y };
  });

  let d = "";
  pts.forEach((p, i) => {
    if (p.y == null) return;
    const prev = pts[i - 1];
    if (!prev || prev.y == null) d += `M ${p.x} ${p.y} `;
    else d += `L ${p.x} ${p.y} `;
  });

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} className="block">
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-emerald-600"
      />
    </svg>
  );
}

function topN(items: string[], n: number) {
  const m = new Map<string, number>();
  for (const it of items) m.set(it, (m.get(it) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

function StatusPill({ done }: { done: boolean }) {
  return done ? (
    <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
      오늘 기록 완료 ✓
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600">
      오늘 기록 미완료
    </span>
  );
}

export default function InsightsPage() {
  const router = useRouter();

  // ✅ 공통 부팅 훅
  const { booting, userId, linkedPatient } = usePatientBoot();

  const [range, setRange] = useState<"7d" | "30d">("7d");
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(false);

  const today = useMemo(() => isoToday(), []);

  const fetchLogs = async (pid: string, rangeKey: "7d" | "30d") => {
    const end = today;
    const start = rangeKey === "7d" ? addDaysISO(end, -6) : addDaysISO(end, -29);

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("patient_logs")
        .select("*")
        .eq("patient_id", pid)
        .gte("log_date", start)
        .lte("log_date", end)
        .order("log_date", { ascending: true });
      if (error) throw error;
      setLogs((data ?? []) as LogRow[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!linkedPatient) return;
    fetchLogs(linkedPatient.id, range).catch(console.error);
  }, [linkedPatient?.id, range]); // eslint-disable-line react-hooks/exhaustive-deps

  const daySeries = useMemo(() => {
    const days =
      range === "7d"
        ? Array.from({ length: 7 }, (_, i) => addDaysISO(today, -6 + i))
        : Array.from({ length: 30 }, (_, i) => addDaysISO(today, -29 + i));

    const map = new Map(logs.map((l) => [l.log_date, l]));
    return days.map((d) => ({ date: d, row: map.get(d) ?? null }));
  }, [logs, range, today]);

  const todayDone = useMemo(() => {
    const map = new Map(logs.map((l) => [l.log_date, l]));
    return !!map.get(today);
  }, [logs, today]);

  const stats = useMemo(() => {
    const rows = daySeries.map((x) => x.row).filter(Boolean) as LogRow[];
    const filled = rows.length;
    const total = daySeries.length;

    const intens = rows
      .map((r) => r.intensity)
      .filter((v): v is number => typeof v === "number");
    const sleeps = rows
      .map((r) => r.sleep_hours)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));

    const avgInt = intens.length
      ? Math.round((intens.reduce((a, b) => a + b, 0) / intens.length) * 10) / 10
      : null;
    const avgSleep = sleeps.length
      ? Math.round((sleeps.reduce((a, b) => a + b, 0) / sleeps.length) * 10) / 10
      : null;

    const medsYes = rows.filter((r) => r.took_meds === true).length;
    const hwYes = rows.filter((r) => r.did_homework === true).length;

    const emotions = rows.map((r) => r.emotion).filter(Boolean);
    const triggers = rows.map((r) => r.trigger).filter(Boolean);
    const topEmo = topN(emotions, 3);
    const topTri = topN(triggers, 3);

    const peak = rows
      .filter((r) => typeof r.intensity === "number")
      .sort((a, b) => (b.intensity ?? 0) - (a.intensity ?? 0))[0];

    let insight = "이번 기간의 흐름을 가볍게만 확인해도 충분해요.";
    if (peak) {
      const sh = typeof peak.sleep_hours === "number" ? peak.sleep_hours : null;
      if (sh != null && sh <= 4) {
        insight = `강도가 가장 높았던 날(${peak.log_date})은 수면이 ${sh}시간이었어요.`;
      } else if (sh != null) {
        insight = `강도가 가장 높았던 날은 ${peak.log_date} (수면 ${sh}시간)였어요.`;
      } else {
        insight = `강도가 가장 높았던 날은 ${peak.log_date}였어요.`;
      }
    }

    return {
      filled,
      total,
      avgInt,
      avgSleep,
      medsYes,
      hwYes,
      topEmo,
      topTri,
      insight,
    };
  }, [daySeries]);

  const intensitySeries = useMemo(
    () => daySeries.map((d) => (d.row ? d.row.intensity : null)),
    [daySeries]
  );
  const sleepSeries = useMemo(
    () => daySeries.map((d) => (d.row ? d.row.sleep_hours : null)),
    [daySeries]
  );

  // ✅ 핵심: 부팅 중엔 렌더 안 함(플래시 제거)
  if (booting) return null;
  if (!userId) return null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main className="max-w-xl mx-auto p-4 pb-28 space-y-4">
        {!linkedPatient ? (
          <Card>
            <div className="text-sm text-slate-700">연결된 환자 정보가 없습니다.</div>
            <div className="mt-2 text-sm text-slate-500">
              먼저 “오늘 기록”에서 초대코드를 연결해주세요.
            </div>
            <a href="/p" className="inline-block mt-4 text-sm font-semibold text-emerald-700">
              오늘 기록으로 이동 →
            </a>
          </Card>
        ) : (
          <>
            <Card>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">나의 한 주</h2>
                  <div className="mt-1 text-sm text-slate-700">
                    {linkedPatient.name} · <span className="font-semibold">{today}</span>
                  </div>
                  <div className="mt-2">
                    <StatusPill done={todayDone} />
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setRange("7d")}
                    className={`px-3 py-1.5 text-xs rounded-full border ${
                      range === "7d"
                        ? "bg-white shadow-sm font-bold border-slate-200"
                        : "bg-transparent text-slate-500 border-transparent"
                    }`}
                  >
                    7일
                  </button>
                  <button
                    onClick={() => setRange("30d")}
                    className={`px-3 py-1.5 text-xs rounded-full border ${
                      range === "30d"
                        ? "bg-white shadow-sm font-bold border-slate-200"
                        : "bg-transparent text-slate-500 border-transparent"
                    }`}
                  >
                    30일
                  </button>
                </div>
              </div>

              <div className="mt-3 text-sm text-slate-600">{stats.insight}</div>
            </Card>

            <div className="grid grid-cols-2 gap-3">
              <Stat label="기록한 날" value={`${stats.filled}/${stats.total}`} sub="빈 날도 괜찮아요" />
              <Stat label="평균 강도" value={stats.avgInt == null ? "-" : String(stats.avgInt)} sub="1~10" />
              <Stat label="평균 수면" value={stats.avgSleep == null ? "-" : `${stats.avgSleep}h`} sub="0~24" />
              <Stat label="루틴" value={`${stats.medsYes} / ${stats.hwYes}`} sub="약 복용일 / 숙제 수행일" />
            </div>

            <Card>
              <div className="flex items-center justify-between">
                <div className="font-semibold text-slate-900">추이</div>
                {loading && <div className="text-xs text-slate-500">불러오는 중…</div>}
              </div>

              <div className="mt-4 space-y-4">
                <div>
                  <div className="text-xs text-slate-500 font-semibold mb-2">강도</div>
                  <div className="text-slate-900">
                    <Sparkline values={intensitySeries} />
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-500 font-semibold mb-2">수면</div>
                  <div className="text-slate-900">
                    <Sparkline values={sleepSeries} />
                  </div>
                </div>

                <div className="flex justify-between text-[11px] text-slate-500 font-mono">
                  <span>{shortMMDD(daySeries[0]?.date ?? today)}</span>
                  <span>{shortMMDD(daySeries[daySeries.length - 1]?.date ?? today)}</span>
                </div>
              </div>
            </Card>

            <Card>
              <div className="font-semibold text-slate-900">자주 나온 항목</div>

              <div className="mt-3">
                <div className="text-xs text-slate-500 font-semibold mb-2">감정 TOP3</div>
                <div className="flex flex-wrap gap-2">
                  {stats.topEmo.length ? (
                    stats.topEmo.map(([k, v]) => (
                      <Tag key={k}>
                        {k} · {v}
                      </Tag>
                    ))
                  ) : (
                    <span className="text-sm text-slate-500">데이터가 더 필요해요</span>
                  )}
                </div>
              </div>

              <div className="mt-4">
                <div className="text-xs text-slate-500 font-semibold mb-2">트리거 TOP3</div>
                <div className="flex flex-wrap gap-2">
                  {stats.topTri.length ? (
                    stats.topTri.map(([k, v]) => (
                      <Tag key={k}>
                        {k} · {v}
                      </Tag>
                    ))
                  ) : (
                    <span className="text-sm text-slate-500">데이터가 더 필요해요</span>
                  )}
                </div>
              </div>
            </Card>

            <Card>
              <div className="flex items-center justify-between">
                <div className="font-semibold text-slate-900">작은 보상</div>
                <StatusPill done={todayDone} />
              </div>

              <div className="mt-2 text-sm text-slate-600">
                이번 {range === "7d" ? "7일" : "30일"}에서{" "}
                <span className="font-semibold">{stats.filled}일</span> 기록했어요.
                <br />
                {todayDone
                  ? "오늘은 완료했으니, 패턴만 가볍게 훑고 끝내도 충분해요."
                  : "오늘 한 줄만 남기면, 내일 그래프가 더 선명해져요."}
              </div>

              <div className="mt-3">
                <Btn
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => router.push("/p")}
                >
                  {todayDone ? "오늘 기록 수정하기" : "오늘 기록하러 가기"}
                </Btn>
              </div>
            </Card>
          </>
        )}
      </main>

      <BottomTabs active="insights" />
    </div>
  );
}
