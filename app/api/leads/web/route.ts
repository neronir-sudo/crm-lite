// app/api/leads/web/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/* ----------------------------- Types ----------------------------- */

type Body = Record<string, string>;

interface GeoInfo {
  geo_country?: string | null;
  geo_region?: string | null;
  geo_city?: string | null;
  geo_lat?: number | null;
  geo_lon?: number | null;
  geo_text?: string | null;
}

interface LeadInsert {
  status: string;
  full_name?: string;
  email?: string;
  phone?: string;
  message?: string;

  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;

  gclid?: string;
  wbraid?: string;
  gbraid?: string;
  fbclid?: string;

  referrer?: string;
  landing_page?: string;

  ip?: string | null;

  geo_country?: string | null;
  geo_region?: string | null;
  geo_city?: string | null;
  geo_lat?: number | null;
  geo_lon?: number | null;
  geo_text?: string | null;
}

/* ----------------------------- Utils ----------------------------- */

const toStr = (v: unknown): string =>
  typeof v === "string" ? v : v == null ? "" : String(v);

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

async function readBody(req: Request): Promise<Body> {
  const ct = (req.headers.get("content-type") || "").toLowerCase();

  // JSON
  if (ct.includes("application/json")) {
    try {
      const j = (await req.json()) as unknown;
      const obj: Body = {};
      Object.entries((j as Record<string, unknown>) ?? {}).forEach(
        ([k, v]) => (obj[k] = toStr(v))
      );
      return obj;
    } catch {
      /* ignore */
    }
  }

  // x-www-form-urlencoded
  if (ct.includes("application/x-www-form-urlencoded")) {
    const txt = await req.text();
    const p = new URLSearchParams(txt);
    const obj: Body = {};
    p.forEach((v, k) => (obj[k] = v));
    return obj;
  }

  // multipart/form-data
  if (ct.includes("multipart/form-data")) {
    const fd = await req.formData();
    const obj: Body = {};
    for (const [k, v] of fd.entries()) {
      obj[k] = typeof v === "string" ? v : v.name;
    }
    return obj;
  }

  // Fallback JSON
  try {
    const j = (await req.json()) as unknown;
    const obj: Body = {};
    Object.entries((j as Record<string, unknown>) ?? {}).forEach(
      ([k, v]) => (obj[k] = toStr(v))
    );
    return obj;
  } catch {
    return {};
  }
}

const ALIASES: Record<string, string[]> = {
  full_name: ["full_name", "name", "שם", "your-name"],
  email: ["email", "אימייל", "your-email"],
  phone: ["phone", "טלפון", "נייד", "your-phone"],
  message: ["message", "הודעה", "messages"],
};

function pick(body: Body, canonical: keyof typeof ALIASES): string {
  for (const key of ALIASES[canonical]) {
    const v = body[key] ?? body[`אין תווית ${key}`];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  // חיפוש רופף לפי lowercase
  const lowered = Object.fromEntries(
    Object.entries(body).map(([k, v]) => [k.toLowerCase(), v])
  ) as Record<string, unknown>;
  for (const needle of ALIASES[canonical].map((k) => k.toLowerCase())) {
    for (const [k, v] of Object.entries(lowered)) {
      if (k.includes(needle) && typeof v === "string" && v.trim()) {
        return v.trim();
      }
    }
  }
  return "";
}

function extractUtmFromUrl(url: string): Partial<Body> {
  try {
    const u = new URL(url);
    const p = u.searchParams;
    const obj: Partial<Body> = {};
    const keys = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_content",
      "utm_term",
      "gclid",
      "wbraid",
      "gbraid",
      "fbclid",
    ];
    for (const k of keys) {
      const v = p.get(k);
      if (v) obj[k] = v;
    }
    return obj;
  } catch {
    return {};
  }
}

function firstPublicIp(xff: string): string {
  return (xff || "").split(",")[0]?.trim() || "";
}

async function lookupIp(ip: string): Promise<GeoInfo | null> {
  try {
    if (
      !ip ||
      ip === "127.0.0.1" ||
      ip === "::1" ||
      ip.startsWith("10.") ||
      ip.startsWith("192.168.") ||
      ip.startsWith("172.16.")
    ) {
      return null;
    }
    const url =
      `http://ip-api.com/json/${encodeURIComponent(ip)}` +
      `?fields=status,message,country,regionName,city,lat,lon&lang=he`;

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3500);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);

    if (!res.ok) return null;
    const j = (await res.json()) as {
      status?: string;
      country?: string;
      regionName?: string;
      city?: string;
      lat?: number;
      lon?: number;
    };
    if (j.status !== "success") return null;

    return {
      geo_country: j.country ?? null,
      geo_region: j.regionName ?? null,
      geo_city: j.city ?? null,
      geo_lat: typeof j.lat === "number" ? j.lat : null,
      geo_lon: typeof j.lon === "number" ? j.lon : null,
      geo_text:
        ((j.city ? `${j.city}, ` : "") + (j.country ?? "")).trim() || null,
    };
  } catch {
    return null;
  }
}

/** מסיר שדות ריקים/undefined/null ומחזיר אובייקט כללי (בלי any) */
function cleanLead(obj: LeadInsert): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  (Object.keys(obj) as Array<keyof LeadInsert>).forEach((k) => {
    const v = obj[k];
    const isEmptyString = typeof v === "string" && v === "";
    if (v !== undefined && v !== null && !isEmptyString) {
      out[k as string] = v as unknown;
    }
  });
  return out;
}

/* --------------------------- Supabase --------------------------- */

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/* ----------------------------- POST ----------------------------- */

export async function POST(req: Request) {
  // 1) Body
  const body = await readBody(req);

  // 2) IP
  const ipFromBody = body.ip || "";
  const xff = req.headers.get("x-forwarded-for") || "";
  const ip = ipFromBody || firstPublicIp(xff) || "";

  // 3) Geo
  const geo = await lookupIp(ip);

  // 4) UTM / Context
  const referrer = toStr(body.referrer) || toStr(req.headers.get("referer"));
  const landing_page = toStr(body.landing_page);

  const utm: Partial<Body> = {
    utm_source: body.utm_source || "",
    utm_medium: body.utm_medium || "",
    utm_campaign: body.utm_campaign || "",
    utm_content: body.utm_content || "",
    utm_term: body.utm_term || body.keyword || "",
    gclid: body.gclid || "",
    wbraid: body.wbraid || "",
    gbraid: body.gbraid || "",
    fbclid: body.fbclid || "",
  };
  if (!utm.utm_source && referrer) Object.assign(utm, extractUtmFromUrl(referrer));

  // 5) Core fields
  const full_name = pick(body, "full_name");
  const email = pick(body, "email");
  const phone = pick(body, "phone");
  const message = pick(body, "message");

  // 6) Draft lead
  const leadDraft: LeadInsert = {
    status: "new",
    full_name,
    email,
    phone,
    message,
    utm_source: utm.utm_source,
    utm_medium: utm.utm_medium,
    utm_campaign: utm.utm_campaign,
    utm_content: utm.utm_content,
    utm_term: utm.utm_term,
    gclid: utm.gclid,
    wbraid: utm.wbraid,
    gbraid: utm.gbraid,
    fbclid: utm.fbclid,
    referrer,
    landing_page,
    ip: ip || null,
    ...(geo ?? {}),
  };

  const leadRow = cleanLead(leadDraft);

  // 7) Insert
  const { data, error } = await supabase
    .from("leads")
    .insert(leadRow)
    .select("id")
    .single();

  if (error) {
    console.error("Insert error:", error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500, headers: corsHeaders }
    );
  }

  return NextResponse.json(
    { ok: true, id: data.id, ip: ip || null, geo: geo ?? null },
    { status: 200, headers: corsHeaders }
  );
}
