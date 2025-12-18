// app/api/naver/places/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const query = (searchParams.get("query") ?? "").trim();

    if (query.length < 2) {
      return NextResponse.json({ items: [], message: "query too short" }, { status: 400 });
    }

    const id = process.env.NAVER_CLIENT_ID;
    const secret = process.env.NAVER_CLIENT_SECRET;

    if (!id || !secret) {
      // ✅ env 없으면 여기서 JSON으로만 종료
      return NextResponse.json(
        { items: [], message: "Missing NAVER env", need: ["NAVER_CLIENT_ID", "NAVER_CLIENT_SECRET"] },
        { status: 500 }
      );
    }

    const url =
      "https://openapi.naver.com/v1/search/local.json?" +
      new URLSearchParams({
        query,
        display: "10",
        start: "1",
        sort: "random",
      }).toString();

    const res = await fetch(url, {
      headers: {
        "X-Naver-Client-Id": id,
        "X-Naver-Client-Secret": secret,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { items: [], message: "Naver API error", status: res.status, detail: text.slice(0, 200) },
        { status: 502 }
      );
    }

    const data = await res.json();
    return NextResponse.json({ items: data?.items ?? [] }, { status: 200 });
  } catch (e: any) {
    // ✅ 어떤 예외가 나도 HTML 말고 JSON으로만
    return NextResponse.json(
      { items: [], message: "Route crashed", error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
