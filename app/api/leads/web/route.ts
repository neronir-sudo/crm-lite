// app/api/leads/web/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/** Types */
type Body = Record<string, string>;
type Utms = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  keyword?: string;
};
type LeadInsert = {
  status: "new";
  full_name?: string;
  email?: string;
  phone?: string;
  message?: string;
  form_id?: string;
  form_name?: string;
} & Utms;

/** ---------- 1) BODY PARSING (תומך JSON / x-www-form-urlencoded / multipart) ---------- **/
async function readBody(req: Request): Promise<Body> {
  const contentType = (req.headers.get("content-type") || "").toLowerCase();

  // JSON
  if (contentType.includes("application/json")) {
    const data = (await req.json()) as unknown;
    return normalizeUnknownToBody(data);
  }

  // x-www-form-urlencoded
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const text = await req.text();
    const params = new URLSearchParams(text);
    const out: Body = {};
    params.forEach((v, k) => {
      out[k] = String(v);
    });
    return out;
  }

  // multipart/form-data
  if (contentType.includes("multipart/form-data")) {
    const fd = await req.formData();
    const out: Body = {};
    for (const [k, v] of fd.entries()) out[k] = String(v);
    return out;
  }

  // fallback: ננסה JSON, ואם לא – נחזיר אובייקט ריק
  try {
    const data = (await req.json()) as unknown;
    return normalizeUnknownToBody(data);
  } catch {
    return {};
  }
}

function normalizeUnknownToBody(data: unknown): Body {
  const out: Body = {};
  if (data && typeof data === "object") {
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      out[k] = String(v ?? "");
    }
  }
  return out;
}

/** ---------- 2) FIELD NORMALIZATION (גם בעברית מאלמנטור) ---------- **/
const ALIASES: Record<string, string[]> = {
  full_name: [
    "full_name",
    "שם",
    "שם מלא",
    "שם פרטי",
    "Name",
    "Your Name",
    "אין תווית full_name",
  ],
  email: ["email", "אימייל", 'דוא"ל', "מייל", "כתובת אימייל", "אין תווית email"],
  contact_phone: [
    "contact_phone",
    "phone",
    "טלפון",
    "מספר טלפון",
    "טלפון נייד",
    "אין תווית contact_phone",
  ],
  message: ["message", "הודעה", "תוכן", "אין תווית message"],

  utm_source: ["utm_source", "source", "(Source) מקור"],
  utm_medium: ["utm_medium", "medium"],
  utm_campaign: ["utm_campaign", "campaign", "(Campaign) קמפיין"],
  utm_content: ["utm_content", "content"],
  utm_term: ["utm_term", "term", "keyword", "(Keyword) מילת מפתח", "מילת מפתח"],
  keyword: ["keyword", "(Keyword) מילת מפתח", "מילת מפתח"],

  form_id: ["form_id", "formid"],
  form_name: ["form_name", "formname", "שם טופס", "אין תווית form_name"],
};

function pick(body: Body, canonical: keyof typeof ALIASES): string | undefined {
  const candidates = [
    ...(ALIASES[canonical] || [canonical]),
    `אין תווית ${canonical}`, // Elementor pattern
  ];
  for (const key of candidates) {
    const raw = body[key];
    if (raw && String(raw).trim() !== "") return String(raw).trim();
  }
  return undefined;
}

/** ---------- 3) UTM EXTRACTORS ---------- **/
function utmsFromBody(body: Body): Utms {
  const u: Utms = {
    utm_source: pick(body, "utm_source"),
    utm_medium: pick(body, "utm_medium"),
    utm_campaign: pick(body, "utm_campaign"),
    utm_content: pick(body, "utm_content"),
    utm_term: pick(body, "utm_term") ?? pick(body, "keyword"),
    keyword: pick(body, "keyword") ?? pick(body, "utm_term"),
  };
  return u;
}

function utmsFromUrl(urlStr: string): Utms {
  const u: Utms = {};
  try {
    const uObj = new URL(urlStr);
    const qp = uObj.searchParams;
    const get = (k: string) => {
      const v = qp.get(k);
      return v && v.trim() !== "" ? v : undefined;
    };
    u.utm_source = get("utm_source");
    u.utm_medium = get("utm_medium");
    u.utm_campaign = get("utm_campaign");
    u.utm_content = get("utm_content");
    u.utm_term = get("utm_term");
    // common ad IDs → נשמור בשדות קיימים אם אין ערך
    const termFallback =
      u.utm_term ??
      get("keyword") ??
      get("gclid") ??
      get("wbraid") ??
      get("gbraid") ??
      undefined;
    if (!u.utm_term && termFallback) u.utm_term = termFallback;
  } catch {
    // ignore
  }
  return u;
}

function mergeUtms(primary: Utms, fallback: Utms): Utms {
  return {
    utm_source: primary.utm_source ?? fallback.utm_source,
    utm_medium: primary.utm_medium ?? fallback.utm_medium,
    utm_campaign: primary.utm_campaign ?? fallback.utm_campaign,
    utm_content: primary.utm_content ?? fallback.utm_content,
    utm_term: primary.utm_term ?? fallback.utm_term,
    keyword: primary.keyword ?? fallback.keyword,
  };
}

/** ---------- 4) HANDLERS ---------- **/
export async function POST(req: Request) {
  const raw = await readBody(req);

  // לוג דיבוג ידידותי (ללא PII)
  try {
    const sampleKeys = [
      "full_name",
      "email",
      "contact_phone",
      "message",
      "utm_source",
      "utm_campaign",
      "utm_medium",
      "utm_content",
      "utm_term",
      "keyword",
      "form_id",
      "form_name",
    ];
    const sample: Record<string, string> = {};
    for (const k of sampleKeys) {
      const v = raw[k] ?? raw[`אין תווית ${k}`];
      if (typeof v === "string" && v !== "") sample[k] = v;
    }
    console.info("[LEAD] keys:", Object.keys(raw));
    console.info("[LEAD] sample values:", sample);
  } catch {
    // ignore
  }

  // שדות מובנים
  const lead: LeadInsert = {
    status: "new",
    full_name: pick(raw, "full_name"),
    email: pick(raw, "email"),
    phone: pick(raw, "contact_phone"),
    message: pick(raw, "message"),
    form_id: pick(raw, "form_id"),
    form_name: pick(raw, "form_name"),
    ...utmsFromBody(raw),
  };

  // השלמה מ־URL הקריאה (query string) ומ־Referer (אם חסר)
  const selfUrlUtms = utmsFromUrl(req.url);
  const refererHeader = req.headers.get("referer") || "";
  const refererUtms = refererHeader ? utmsFromUrl(refererHeader) : {};

  const mergedUtms = mergeUtms(
    lead,
    mergeUtms(selfUrlUtms, refererUtms) // סדר עדיפויות: BODY → URL → Referer
  );

  // הרכבת אובייקט סופי לשמירה (ללא undefined/ריק)
  const toInsert: Record<string, string | "new"> = { status: "new" };
  const assignIf = (k: keyof LeadInsert, v: string | undefined) => {
    if (v !== undefined && v !== "") toInsert[k] = v;
  };
  assignIf("full_name", lead.full_name);
  assignIf("email", lead.email);
  assignIf("phone", lead.phone);
  assignIf("message", lead.message);
  assignIf("form_id", lead.form_id);
  assignIf("form_name", lead.form_name);
  assignIf("utm_source", mergedUtms.utm_source);
  assignIf("utm_medium", mergedUtms.utm_medium);
  assignIf("utm_campaign", mergedUtms.utm_campaign);
  assignIf("utm_content", mergedUtms.utm_content);
  assignIf("utm_term", mergedUtms.utm_term);
  assignIf("keyword", mergedUtms.keyword);

  // Supabase
  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error("Missing Supabase env vars");
    return NextResponse.json(
      { ok: false, error: "Server not configured" },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase
    .from("leads")
    .insert(toInsert)
    .select("id")
    .single();

  if (error) {
    console.error("Supabase insert error:", error);
    return NextResponse.json({ ok: false, supabase_error: error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data.id }, { status: 200 });
}

/** Preflight */
export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
