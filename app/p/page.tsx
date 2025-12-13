"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { Patient, Role } from "@/lib/types";
import { Badge, Btn, Card, Field } from "@/components/ui";

export default function Page() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [linkedPatient, setLinkedPatient] = useState<Patient | null>(null);

  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);

  // entry form
  const today = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }, []);

  const [emotion, setEmotion] = useState("Anxious");
  const [trigger, setTrigger] = useState("Work");
  const [intensity, setIntensity] = useState(5);
  const [sleepHours, setSleepHours] = useState<string>("6.5");
  const [tookMeds, setTookMeds] = useState<boolean | null>(null);
  const [memo, setMemo] = useState("");

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

      // 이미 연결되어 있으면 patient_links로 patient_id 찾기
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

  const redeem = async () => {
    const code = inviteCode.trim();
    if (!code) return alert("초대코드 입력");
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("redeem_invite_code", { p_code: code });
      if (error) throw error;

      const pid = data[0].patient_id as string;
      const { data: p, error: e2 } = await supabase.from("patients").select("*").eq("id", pid).single();
      if (e2) throw e2;
      setLinkedPatient(p as Patient);
    } catch (e: any) {
      alert(e?.message ?? "연결 실패");
    } finally {
      setLoading(false);
    }
  };

  const submitLog = async () => {
    if (!linkedPatient) return;
    setLoading(true);
    try {
      const sleep = sleepHours.trim() ? Number(sleepHours) : null;

      const { error } = await supabase.from("patient_logs").insert({
        patient_id: linkedPatient.id,
        counselor_id: linkedPatient.counselor_id,
        log_date: today,
        emotion,
        trigger,
        intensity,
        sleep_hours: Number.isFinite(sleep as any) ? sleep : null,
        took_meds: tookMeds,
        memo: memo.trim() ? memo.trim() : null,
      });

      if (error) throw error;
      alert("저장됨");
      setMemo("");
    } catch (e: any) {
      // 1일 1로그 unique 켰으면 여기서 “오늘은 이미 기록됨”
      const msg = (e?.message ?? "").toLowerCase();
      if (msg.includes("duplicate") || msg.includes("unique")) {
        alert("오늘 기록은 이미 저장되어 있습니다.");
      } else {
        alert(e?.message ?? "저장 실패");
      }
    } finally {
      setLoading(false);
    }
  };

  if (!userId) return null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-xl mx-auto p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="font-bold tracking-tight">Checky</div>
            <Badge>내담자</Badge>
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto p-4 space-y-4">
        {!linkedPatient ? (
          <Card>
            <h2 className="font-semibold">초대코드 연결</h2>
            <p className="text-sm text-slate-600 mt-1">상담자가 준 코드를 1회 입력하면 유지됩니다.</p>
            <div className="mt-3 flex gap-2">
              <Field placeholder="예: 8자리 코드" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} />
              <Btn onClick={redeem} disabled={loading}>{loading ? "연결 중..." : "연결"}</Btn>
            </div>
          </Card>
        ) : (
          <>
            <Card>
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold">{linkedPatient.name}</h2>
                  <p className="text-sm text-slate-600 mt-1">{linkedPatient.concern}</p>
                </div>
                <Badge>연결됨</Badge>
              </div>
              <div className="mt-3 text-sm text-slate-700">
                오늘: <span className="font-semibold">{today}</span>
              </div>
            </Card>

            <Card>
              <h3 className="font-semibold">오늘 기록</h3>
              <div className="mt-3 space-y-2">
                <Field placeholder="감정(1개)" value={emotion} onChange={(e) => setEmotion(e.target.value)} />
                <Field placeholder="트리거(1개)" value={trigger} onChange={(e) => setTrigger(e.target.value)} />
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
                <Field placeholder="수면시간(예: 6.5)" value={sleepHours} onChange={(e) => setSleepHours(e.target.value)} />
                <div className="flex gap-2">
                  <Btn variant={tookMeds === true ? "primary" : "secondary"} onClick={() => setTookMeds(true)}>약 O</Btn>
                  <Btn variant={tookMeds === false ? "primary" : "secondary"} onClick={() => setTookMeds(false)}>약 X</Btn>
                  <Btn variant={tookMeds === null ? "primary" : "secondary"} onClick={() => setTookMeds(null)}>미기입</Btn>
                </div>
                <textarea
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-slate-200 min-h-[90px]"
                  placeholder="기타 메모(선택)"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                />
                <Btn onClick={submitLog} disabled={loading}>
                  {loading ? "저장 중..." : "저장"}
                </Btn>
              </div>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
