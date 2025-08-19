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
  landing_page: string | null;
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
  fd.forEach((val, key) => {
    if (typeof val === 'string') o[key] = val;
  });
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
    const message =
      typeof (e as { message?: unknown }).message === 'string'
        ? (e as { message: string }).message
        : 'Unknown error';
    const details =
      typeof (e as { details?: unknown }).details === 'string'
        ? (e as { details: string }).details
        : null;
    const hint =
      typeof (e as { hint?: unknown }).hint === 'string'
        ? (e as { hint: string }).hint
        : null;
    const code =
      typeof (e as { code?: unknown }).code === 'string'
        ? (e as { code: string }).code
        : null;
    return { message, details, hint, code };
  }
  return { message: String(e), details: null, hint: null, code: null };
}

// ----- UTM מתוך ה־URL (כולל keyword / q / k) -----
function utmFromUrl(urlStr: string | null): Partial<CleanLead> {
  if (!urlStr) return {};
  try {
    const u = new URL(urlStr);
    const qp = u.searchParams;
    const source = qp.get('utm_source');
    const campaign = qp.get('utm_campaign');
    const medium = qp.get('utm_medium');
    const content = qp.get('utm_content');
    const term = qp.get('utm_term') ?? qp.get('keyword') ?? qp.get('k') ?? qp.get('q');
    return {
      utm_source: source ?? null,
      utm_campaign: campaign ?? null,
      utm_medium: medium ?? null,
      utm_content: content ?? null,
      utm_term: term ?? null,
    };
  } catch {
    return {};
  }
}

// ----- נירמול ספציפי לאלמנטור + עברית -----
function normalizeElementor(raw: Raw): Raw {
  const out: Raw = {};
  const byIndex: Record<string, { id?: string; value?: string }> = {};
  const ignoreExact = new Set(['form_name', 'form_id']);

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

    // נשמור כל מפתח כמו שהוא – נבחר לפי חוקים בהמשך
    out[k] = v;
  }

  // חבר id->value מהאינדקסים
  for (const it of Object.values(byIndex)) {
    if (it.id && typeof it.value === 'string') out[it.id] = it.value;
  }

  // keyword -> utm_term אם חסר
  if (!out['utm_term'] && typeof raw['keyword'] === 'string') out['utm_term'] = raw['keyword'];

  return out;
}

// ----- חיפוש לפי רמזים בשם שדה (כולל עברית) -----
function findByHints(obj: Raw, hints: string[]): string | null {
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v !== 'string' || !v.trim()) continue;
    const low = k.toLowerCase();
    const heb = k;
    if (hints.some((h) => low.includes(h))) return v;
    if (hints.some((h) => heb.includes(h))) return v;
  }
  return null;
}

// ----- מציאת ערכים לפי תבנית (Fallbacks חכמים) -----
function firstEmailLike(obj: Raw): string | null {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
  for (const v of Object.values(obj)) {
    if (typeof v === 'string' && re.test(v.trim())) return v.trim();
  }
  return null;
}

function firstPhoneLike(obj: Raw): string | null {
  for (const v of Object.values(obj)) {
    if (typeof v !== 'string') continue;
    const digits = v.replace(/\D+/g, '');
    if (digits.length >= 8 && digits.length <= 15) return v.trim();
  }
  return null;
}

function firstNameLike(obj: Raw): string | null {
  const banKeys = ['message', 'notes', 'utm', 'source', 'campaign', 'medium', 'term', 'content', 'page', 'url', 'form', 'id', 'user', 'agent'];
  const emailRe = /@/;
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v !== 'string') continue;
    const val = v.trim();
    if (!val) continue;
    const low = k.toLowerCase();

    if (banKeys.some((b) => low.includes(b))) continue; // אל תיקח תיאור/הודעה/utm/וכו׳
    if (emailRe.test(val)) continue;                   // אל תיקח אימייל
    const digits = val.replace(/\D+/g, '');
    if (digits.length >= 8) continue;                  // אל תיקח טלפון

    // יש אותיות/רווחים – נראה כמו שם
    if (/[^\d]/.test(val) && val.length >= 2) return val;
  }
  return null;
}

function hasAnyValue(c: CleanLead): boolean {
  return Object.values(c).some((v) => typeof v === 'string' && v.trim() !== '');
}

async function readBody(req: Request): Promise<Raw> {
  const ct = (req.headers.get('content-type') || '').toLowerCase();
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
    const all = normalizeElementor(isRec(raw) ? raw : {});

    // דיבאג ברור בלוגים
    try {
      console.log('[LEAD] keys:', Object.keys(all));
      const sample: Record<string, string> = {};
      for (const [k, v] of Object.entries(all)) {
        if (typeof v === 'string') sample[k] = v.slice(0, 120);
      }
      console.log('[LEAD] sample values:', sample);
    } catch { /* ignore */ }

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return new NextResponse(
        JSON.stringify({ ok: false, error: 'Missing Supabase env vars' }),
        { status: 500, headers: cors }
      );
    }

    // landing/page url (מגיע מאלמנטור כש"נתונים מתקדמים" פעיל)
    const landing =
      pickStr(all, 'landing_page') ??
      pickStr(all, 'page_url') ??
      pickStr(all, 'url') ??
      pickStr(all, 'עמוד') ??
      pickStr(all, 'קישור_לעמוד');

    const utmFallback = utmFromUrl(landing ?? null);

    // 1) ניסיון לפי מזהי שדות קלאסיים/עברית
    let full_name =
      pickStr(all, 'full_name') ??
      pickStr(all, 'name') ??
      findByHints(all, ['name', 'full_name', 'שם', 'שם_מלא']);

    let email =
      pickStr(all, 'email') ??
      findByHints(all, ['email', 'mail', 'e-mail', 'אימייל', 'דוא', 'דואל']);

    let phone =
      pickStr(all, 'contact_phone') ??
      pickStr(all, 'phone') ??
      findByHints(all, ['phone', 'tel', 'mobile', 'cell', 'טלפון', 'טל', 'נייד', 'סלול']);

    // 2) אם עדיין חסר – חפש לפי תבניות (דפוס ערך)
    if (!email) email = firstEmailLike(all);
    if (!phone) phone = firstPhoneLike(all);
    if (!full_name) full_name = firstNameLike(all);

    const clean: CleanLead = {
      status: 'new',
      full_name: full_name ?? null,
      phone: phone ?? null,
      email: email ?? null,
      utm_source: pickStr(all, 'utm_source') ?? (utmFallback.utm_source ?? null),
      utm_campaign: pickStr(all, 'utm_campaign') ?? (utmFallback.utm_campaign ?? null),
      utm_medium: pickStr(all, 'utm_medium') ?? (utmFallback.utm_medium ?? null),
      utm_term: pickStr(all, 'utm_term') ?? (utmFallback.utm_term ?? null),
      utm_content: pickStr(all, 'utm_content') ?? (utmFallback.utm_content ?? null),
      landing_page: landing ?? null,
    };

    if (!hasAnyValue(clean)) {
      return new NextResponse(
        JSON.stringify({ ok: false, error: 'Empty payload after parsing', received: Object.keys(all) }),
        { status: 400, headers: cors }
      );
    }

    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { error } = await sb.from('leads').insert(clean);
    if (error) {
      return new NextResponse(JSON.stringify({ ok: false, supabase_error: errJson(error), clean }), {
        status: 500,
        headers: cors,
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
