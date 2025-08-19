import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type Raw = Record<string, unknown>;

type CleanLead = {
  status: 'new';
  full_name: string | null;
  phone: string | null;
  email: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  utm_medium: string | null;
  utm_term: string | null;
  utm_content: string | null;
  landing_page: string | null; // יש לך עמודה כזו בטבלה
};

type PgErr = { message: string; details: string | null; hint: string | null; code: string | null };

const cors: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function isRec(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function pickStr(obj: Raw, key: string): string | null {
  const v = obj[key];
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}
function formDataToObj(fd: FormData): Record<string, string> {
  const o: Record<string, string> = {};
  fd.forEach((val, key) => { if (typeof val === 'string') o[key] = val; });
  return o;
}
function urlEncToObj(txt: string): Record<string, string> {
  const p = new URLSearchParams(txt);
  const o: Record<string, string> = {};
  p.forEach((v, k) => (o[k] = v));
  return o;
}
function errJson(e: unknown): PgErr {
  if (isRec(e)) {
    return {
      message: typeof e.message === 'string' ? e.message : 'Unknown error',
      details: typeof (e as { details?: unknown }).details === 'string' ? (e as { details: string }).details : null,
      hint: typeof (e as { hint?: unknown }).hint === 'string' ? (e as { hint: string }).hint : null,
      code: typeof (e as { code?: unknown }).code === 'string' ? (e as { code: string }).code : null,
    };
  }
  return { message: String(e), details: null, hint: null, code: null };
}

// --- חליצת UTM מ-URL ---
function utmFromUrl(urlStr: string | null): Partial<CleanLead> {
  if (!urlStr) return {};
  try {
    const u = new URL(urlStr);
    const qp = u.searchParams;
    const source = qp.get('utm_source');
    const campaign = qp.get('utm_campaign');
    const medium = qp.get('utm_medium');
    const content = qp.get('utm_content');
    const term = qp.get('utm_term') ?? qp.get('keyword'); // תמיכה ב-keyword
    return {
      utm_source: source ?? null,
      utm_campaign: campaign ?? null,
      utm_medium: medium ?? null,
      utm_content: content ?? null,
      utm_term: term ?? null,
    } as Partial<CleanLead>;
  } catch {
    return {};
  }
}

// --- נורמליזציה לפורמטים של אלמנטור ---
function normalizeElementor(raw: Raw): Raw {
  const out: Raw = {};
  const byIndex: Record<string, { id?: string; value?: string }> = {};
  const ignoreExact = new Set(['form_name', 'form_id']); // לא להתבלבל עם name האמיתי

  for (const [k, v] of Object.entries(raw)) {
    if (typeof v !== 'string') continue;

    if (ignoreExact.has(k)) continue;

    // form_fields[xxx]
    const m1 = k.match(/^form_fields\[(.+)\]$/);
    if (m1) {
      out[m1[1]] = v;
      continue;
    }

    // fields[0][id] / fields[0][value]
    const m2 = k.match(/^fields\[(\d+)\]\[(id|value)\]$/);
    if (m2) {
      const idx = m2[1];
      byIndex[idx] = byIndex[idx] || {};
      (byIndex[idx] as Record<string, string>)[m2[2]] = v;
      continue;
    }

    // לייבלים: נתעלם מ-form_name. נשמור שדות באנגלית אם הם מדויקים
    const allowedDirect = new Set([
      'full_name', 'email', 'contact_phone', 'phone',
      'utm_source', 'utm_campaign', 'utm_medium', 'utm_term', 'utm_content',
      'landing_page', 'page_url', 'url'
    ]);
    if (allowedDirect.has(k)) {
      out[k] = v;
      continue;
    }

    // זיהוי “קישור_לעמוד”/“עמוד”/“link/url/page” כדי לשמור כ-landing_page
    const low = k.toLowerCase();
    const isHebPage = k.includes('קישור') || k.includes('עמוד');
    if (isHebPage || low.includes('page') || low.includes('url') || low.includes('link')) {
      if (v.startsWith('http')) out['landing_page'] = v;
    }
  }

  for (const it of Object.values(byIndex)) {
    if (it.id && typeof it.value === 'string') {
      out[it.id] = it.value;
    }
  }

  // תמיכה ב-keyword → utm_term
  if (!out['utm_term'] && typeof raw['keyword'] === 'string') {
    out['utm_term'] = raw['keyword'];
  }

  return out;
}

function hasAnyValue(c: CleanLead): boolean {
  return Object.values(c).some((v) => typeof v === 'string' && v.trim() !== '');
}

async function readBody(req: Request): Promise<Raw> {
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const j = await req.json();
    return isRec(j) ? j : {};
  }
  if (ct.includes('application/x-www-form-urlencoded')) {
    const txt = await req.text();
    return urlEncToObj(txt);
  }
  if (ct.includes('multipart/form-data')) {
    const fd = await req.formData();
    return formDataToObj(fd);
  }
  return {};
}

export async function POST(req: Request) {
  try {
    const raw = await readBody(req);
    const norm = normalizeElementor(isRec(raw) ? raw : {});

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return new NextResponse(JSON.stringify({ ok: false, error: 'Missing Supabase env vars' }), {
        status: 500, headers: cors
      });
    }

    const landing = pickStr(norm, 'landing_page') ?? pickStr(norm, 'page_url') ?? pickStr(norm, 'url');
    const utmFallback = utmFromUrl(landing);

    const clean: CleanLead = {
      status: 'new',
      full_name: pickStr(norm, 'full_name') ?? pickStr(norm, 'name'), // name אמיתי בלבד (כי form_name נחתך)
      phone:     pickStr(norm, 'contact_phone') ?? pickStr(norm, 'phone'),
      email:     pickStr(norm, 'email'),
      utm_source:   pickStr(norm, 'utm_source')   ?? (utmFallback.utm_source   ?? null),
      utm_campaign: pickStr(norm, 'utm_campaign') ?? (utmFallback.utm_campaign ?? null),
      utm_medium:   pickStr(norm, 'utm_medium')   ?? (utmFallback.utm_medium   ?? null),
      utm_term:     pickStr(norm, 'utm_term')     ?? (utmFallback.utm_term     ?? null),
      utm_content:  pickStr(norm, 'utm_content')  ?? (utmFallback.utm_content  ?? null),
      landing_page: landing ?? null,
    };

    if (!hasAnyValue(clean)) {
      return new NextResponse(
        JSON.stringify({ ok: false, error: 'Empty payload after parsing', received: Object.keys(norm) }),
        { status: 400, headers: cors }
      );
    }

    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { error } = await sb.from('leads').insert(clean);

    if (error) {
      return new NextResponse(JSON.stringify({ ok: false, supabase_error: errJson(error), clean }), {
        status: 500, headers: cors
      });
    }

    return new NextResponse(JSON.stringify({ ok: true, inserted: clean }), { status: 200, headers: cors });
  } catch (e) {
    return new NextResponse(JSON.stringify({ ok: false, error: errJson(e) }), { status: 500, headers: cors });
  }
}

export function OPTIONS() {
  return new NextResponse(null, { headers: cors });
}
