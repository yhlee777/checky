"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { Patient } from "@/lib/types";

type BootState = {
  booting: boolean;
  userId: string | null;
  linkedPatient: Patient | null;
};

type CachePayload = {
  v: 1;
  ts: number;
  userId: string;
  linkedPatient: Patient | null;
};

const CACHE_KEY = "checky:pboot:v1";
const TTL_MS = 60_000; // ✅ 60초 캐시 (원하면 120_000로 늘려도 됨)

function readCache(): CachePayload | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachePayload;
    if (!parsed || parsed.v !== 1) return null;
    if (!parsed.ts || Date.now() - parsed.ts > TTL_MS) return null;
    if (!parsed.userId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(payload: CachePayload) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {}
}

function clearCache() {
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {}
}

export function usePatientBoot(): BootState {
  const router = useRouter();

  const [booting, setBooting] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [linkedPatient, setLinkedPatient] = useState<Patient | null>(null);

  useEffect(() => {
    let alive = true;

    // ✅ 0) 캐시가 있으면 즉시 화면을 띄움 (탭 이동 시 체감 “즉시”)
    const cached = readCache();
    if (cached) {
      setUserId(cached.userId);
      setLinkedPatient(cached.linkedPatient);
      setBooting(false);
    }

    (async () => {
      // ✅ 캐시가 없을 때만 로딩을 “진짜로” 유지
      if (!cached) setBooting(true);

      // 1) session
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id ?? null;

      if (!uid) {
        clearCache();
        router.replace("/");
        return;
      }
      if (!alive) return;
      setUserId(uid);

      // 2) role
      const { data: prof } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", uid)
        .single();

      const role = prof?.role ?? null;
      if (!role) {
        clearCache();
        router.replace("/role");
        return;
      }
      if (role !== "patient") {
        clearCache();
        router.replace("/c");
        return;
      }

      // 3) link -> patient
      const { data: link } = await supabase
        .from("patient_links")
        .select("patient_id")
        .eq("user_id", uid)
        .single();

      let patient: Patient | null = null;

      if (link?.patient_id) {
        const { data: p } = await supabase
          .from("patients")
          .select("*")
          .eq("id", link.patient_id)
          .single();

        if (p) patient = p as Patient;
      }

      if (!alive) return;

      // ✅ 상태 반영 + 캐시 갱신
      setLinkedPatient(patient);
      writeCache({
        v: 1,
        ts: Date.now(),
        userId: uid,
        linkedPatient: patient,
      });

      // ✅ 캐시로 이미 렌더된 상태라도, 여기서 확정적으로 부팅 종료
      setBooting(false);
    })().catch((e) => {
      console.error(e);
      if (!alive) return;

      // ✅ 캐시가 있으면 UX상 그냥 유지(갑자기 화면 비우지 않음)
      // 캐시가 없었으면 무한 로딩 방지로 종료
      if (!cached) setBooting(false);
    });

    return () => {
      alive = false;
    };
  }, [router]);

  return { booting, userId, linkedPatient };
}
