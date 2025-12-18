"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Btn, Card, Field } from "@/components/ui";
import { Building2, Search, Check, Loader2, X } from "lucide-react";

type ProfileRow = {
  user_id: string;
  role: "patient" | "counselor" | "center_admin";
  center_id: string | null;
};

type NaverPlace = {
  title: string; // <b>...</b> 포함 가능
  address: string;
  roadAddress: string;
  telephone: string;
  link: string;
  category?: string;
  mapx?: string;
  mapy?: string;
  placeId?: string;
};

function stripHtml(s: string) {
  return s.replace(/<[^>]*>/g, "");
}

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

async function safeJsonFetch(url: string) {
  const res = await fetch(url, { cache: "no-store" });

  const ct = res.headers.get("content-type") || "";
  const text = await res.text();

  if (!res.ok) {
    throw new Error(`API Error ${res.status}: ${text.slice(0, 120)}`);
  }

  if (!ct.includes("application/json")) {
    throw new Error(
      `Invalid response (not JSON). Got content-type="${ct}". First bytes: ${text.slice(
        0,
        80
      )}`
    );
  }

  return JSON.parse(text);
}

/* ===============================
 * Confirm Modal
 * =============================== */
function ConfirmPickModal({
  open,
  place,
  loading,
  onClose,
  onConfirm,
}: {
  open: boolean;
  place: NaverPlace | null;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  if (!open || !place) return null;

  const name = stripHtml(place.title);
  const addr = place.roadAddress || place.address || "-";

  return (
    <div className="fixed inset-0 z-[120] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden">
        <div className="p-5 border-b border-slate-100">
          <div className="text-sm font-extrabold text-slate-900">센터 선택 확인</div>
          <div className="mt-1 text-xs text-slate-500">
            선택 후 자동으로 센터가 연결됩니다.
          </div>
        </div>

        <div className="p-5 space-y-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-extrabold text-slate-900">{name}</div>
            <div className="mt-1 text-xs text-slate-600">{addr}</div>
            {place.telephone && (
              <div className="mt-1 text-xs text-slate-600">{place.telephone}</div>
            )}
            {place.category && (
              <div className="mt-2 text-[11px] text-slate-600 font-semibold">
                {place.category}
              </div>
            )}
          </div>

          <div className="text-xs text-slate-500 leading-relaxed">
            맞으면 <span className="font-extrabold">연결하기</span>를 누르세요.
            <br />
            아니면 <span className="font-extrabold">취소</span>를 누르면 다시 검색할 수 있어요.
          </div>
        </div>

        <div className="p-5 border-t border-slate-100 flex items-center gap-2 justify-end">
          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-2xl px-4 py-2 text-sm font-extrabold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            취소
          </button>
          <Btn onClick={onConfirm} disabled={loading} className="px-5">
            {loading ? "연결 중..." : "연결하기"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

export default function CenterJoinPage() {
  const router = useRouter();

  const [booting, setBooting] = useState(true);
  const [profile, setProfile] = useState<ProfileRow | null>(null);

  const [q, setQ] = useState("");
  const dq = useDebounced(q, 250);

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<NaverPlace[]>([]);
  const [err, setErr] = useState("");

  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  // ✅ 확인 모달 상태
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingPlace, setPendingPlace] = useState<NaverPlace | null>(null);

  const canUse = useMemo(() => {
    return profile?.role === "center_admin" && !profile?.center_id;
  }, [profile]);

  // 부팅
  useEffect(() => {
    (async () => {
      setBooting(true);
      try {
        const { data: auth } = await supabase.auth.getUser();
        const user = auth?.user;
        if (!user) {
          router.replace("/");
          return;
        }

        const { data: p, error } = await supabase
          .from("profiles")
          .select("user_id, role, center_id")
          .eq("user_id", user.id)
          .single();

        if (error) throw error;

        const prof = p as ProfileRow;
        setProfile(prof);

        if (prof.role === "center_admin" && prof.center_id) {
          router.replace("/admin/center");
          return;
        }
      } catch (e: any) {
        setErr(e?.message ?? "부팅 실패");
      } finally {
        setBooting(false);
      }
    })();
  }, [router]);

  // 드롭다운 바깥 클릭 시 닫기 (모달이 떠있을 땐 드롭다운 닫는 동작만)
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, []);

  // 자동 검색 (디바운스)
  useEffect(() => {
    if (!canUse) return;

    const query = dq.trim();
    if (query.length < 2) {
      setItems([]);
      setErr("");
      return;
    }

    let alive = true;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const json = await safeJsonFetch(
          `/api/naver/places?query=${encodeURIComponent(query)}`
        );
        if (!alive) return;

        const list = (json?.items ?? []) as NaverPlace[];
        setItems(list);
        setOpen(true);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message ?? "검색 실패");
        setItems([]);
        setOpen(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [dq, canUse]);

  // ✅ 실제 연결 수행 (confirm에서만 호출)
  const commitPickCenter = async (place: NaverPlace) => {
    if (!profile?.user_id) return;

    const resolvedName = stripHtml(place.title);
    const resolvedRoad = place.roadAddress || null;
    const resolvedAddr = place.address || null;
    const resolvedPhone = place.telephone || null;

    const resolvedPlaceId =
      (place.placeId && String(place.placeId)) ||
      (place.link ? String(place.link) : null);

    if (!resolvedPlaceId) {
      throw new Error("place_id를 만들 수 없습니다. (API 응답에 placeId/link가 없음)");
    }

    const centerInsert = {
      name: resolvedName,
      address: resolvedAddr,
      road_address: resolvedRoad,
      phone: resolvedPhone,
      place_id: resolvedPlaceId,
    };

    const { data: centerRow, error: cErr } = await supabase
      .from("centers")
      .upsert(centerInsert, { onConflict: "place_id" })
      .select("id")
      .single();

    if (cErr) throw cErr;

    const centerId = centerRow?.id as string;
    if (!centerId) throw new Error("센터 ID 생성 실패");

    const { error: pErr } = await supabase
      .from("profiles")
      .update({ center_id: centerId })
      .eq("user_id", profile.user_id);

    if (pErr) throw pErr;

    router.replace("/admin/center");
  };

  // 드롭다운에서 클릭 → “확인 모달”만 연다 (바로 연결 X)
  const onClickItem = (place: NaverPlace) => {
    setPendingPlace(place);
    setConfirmOpen(true);
    setOpen(false);
  };

  if (booting) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 flex items-center justify-center">
        <Card className="max-w-lg w-full">
          <div className="text-sm font-extrabold text-slate-900">로딩 중...</div>
        </Card>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 flex items-center justify-center">
        <Card className="max-w-lg w-full">
          <div className="text-sm font-extrabold text-slate-900">로그인이 필요합니다.</div>
        </Card>
      </div>
    );
  }

  if (profile.role !== "center_admin") {
    return (
      <div className="min-h-screen bg-slate-50 p-4 flex items-center justify-center">
        <Card className="max-w-lg w-full">
          <div className="text-sm font-extrabold text-slate-900">접근 불가</div>
          <div className="mt-2 text-sm text-slate-600">센터장 계정만 센터를 등록할 수 있어요.</div>
        </Card>
      </div>
    );
  }

  if (profile.center_id) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 flex items-center justify-center">
        <Card className="max-w-lg w-full">
          <div className="text-sm font-extrabold text-slate-900">이미 센터가 연결되어 있습니다.</div>
          <div className="mt-4">
            <Btn className="w-full" onClick={() => router.replace("/admin/center")}>
              센터장 화면으로 이동
            </Btn>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-3xl mx-auto space-y-4">
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-emerald-600" />
                센터 등록하기
              </div>
              <div className="mt-1 text-sm text-slate-600">
                센터명/주소를 입력하면 검색 결과가 아래로 내려옵니다.
              </div>
            </div>
          </div>

          {/* 검색 입력 + 드롭다운 */}
          <div className="mt-4 relative" ref={boxRef}>
            <div className="relative">
              <Field
                placeholder="예: 마음샘 상담센터 / 광진구 상담센터"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                autoComplete="off"
              />

              {/* 오른쪽 아이콘들 */}
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2 text-slate-400">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                {q.trim().length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setQ("");
                      setItems([]);
                      setErr("");
                      setOpen(false);
                    }}
                    className="hover:text-slate-600"
                    aria-label="clear"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* 드롭다운 */}
            {open && (q.trim().length >= 2 || err) && (
              <div className="absolute z-50 mt-2 w-full rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden">
                {err ? (
                  <div className="p-4 text-sm text-rose-600 bg-rose-50">{err}</div>
                ) : items.length === 0 ? (
                  <div className="p-4 text-sm text-slate-500">검색 결과가 없습니다.</div>
                ) : (
                  <div className="max-h-[360px] overflow-auto divide-y divide-slate-100">
                    {items.map((it, idx) => (
                      <button
                        key={`${it.link}-${idx}`}
                        onClick={() => onClickItem(it)}
                        disabled={loading}
                        className="w-full text-left p-4 hover:bg-slate-50 transition disabled:opacity-60"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-extrabold text-slate-900">
                              {stripHtml(it.title)}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              {it.roadAddress || it.address || "-"}
                            </div>
                            {it.telephone && (
                              <div className="mt-1 text-xs text-slate-500">{it.telephone}</div>
                            )}
                            {it.category && (
                              <div className="mt-2 text-[11px] text-slate-600 font-semibold">
                                {it.category}
                              </div>
                            )}
                          </div>

                          <div className="pt-1 text-emerald-600">
                            <Check className="w-5 h-5" />
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-4 text-xs text-slate-500">
            드롭다운에서 센터를 선택하면 한 번 더 확인한 뒤 연결합니다.
          </div>
        </Card>
      </div>

      <ConfirmPickModal
        open={confirmOpen}
        place={pendingPlace}
        loading={loading}
        onClose={() => {
          if (loading) return;
          setConfirmOpen(false);
          setPendingPlace(null);
        }}
        onConfirm={async () => {
          if (!pendingPlace) return;
          setErr("");
          setLoading(true);
          try {
            await commitPickCenter(pendingPlace);
          } catch (e: any) {
            setErr(e?.message ?? "센터 연결 실패");
            setConfirmOpen(false);
            setPendingPlace(null);
            setOpen(true);
          } finally {
            setLoading(false);
          }
        }}
      />
    </div>
  );
}
