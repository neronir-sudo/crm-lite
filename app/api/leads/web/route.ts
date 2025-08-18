import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ---------- Types ----------
type RawPayload = Partial<{
  full_name: string;
  name: string;
  contact_phone: string;
  phone: string;
  email: string;
  utm_source: string;
  utm_campaign: string;
  utm_medium: string;
  utm_term: string;
  utm_content: string;
}> & Record<string, unknown>;

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
};

type PgErrorLike = {
  message: string;
  details: string | null;
  hint: string | null;
  code: string | null;
};

// ---------- CORS ----------
const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ---------- Helpers ----------
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function formDataToObject(fd: FormData): Record<string, string> {
  const obj: Record<string, string> = {};
  fd.forEach((val, key) => { if (typeof val === 'string') obj[key] = val; });
  return obj;
}

function urlEncodedToObject(text: string): Record<string, string> {
  const params = new URLSearchParams(text);
  const obj: Record<string, string> = {};
  params.forEach((v, k) => (obj[k] = v));
  return obj;
}

function pickStr(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

function errToJson(e: unknown): PgErrorLike {
  if (isRecord(e)) {
    return {
      message: typeof e.message === 'string' ? e.message : 'Unknown error',
      details: typeof (e as { details?: unknown }).details === 'string' ? (e as { details: string }).details : null,
      hint: typeof (e as { hint?: unknown }).hint === 'string' ? (e as { hint: string }).hint : null,
      code: typeof (e as { code?: unknown }).code === 'string' ? (e as { code: string }).code : null,
    };
  }
  return { message: String(e), details: null, hint: null, code: null };
}

// -------- Elementor field normalization --------
// תומך בכל הצורות הנפוצות של אלמנטור:
// 1) form_fields[email]=...
// 2) fields[0][id]=email & fields[0][value]=...
// 3) "<תווית>_email"  (לייבלים בעברית עם מזהה בסוף)
function normalizeElementorKeys(raw: Record<string, unknown>): Record<string, string> {
  const normalized: Record<string, string> = {};
  const allowed = new Set([
    'full_name', 'email', 'contact_phone',
    'utm_source', 'utm_campaign', 'utm_medium', 'utm_term', 'utm_content',
    'name', 'phone' // גיבויים כלליים
  ]);

  // אוסף ביניים לצורה fields[i][id/value]
  const byIndex: Record<string, { id?: string; value?: string }> = {};

  for (const [k, v] of Object.entries(raw)) {
    if (typeof v !== 'string') continue;

    // form_fields[xxx]
    const m1 = k.match(/^form_fields\[(.+)\]$/);
    if (m1) {
      const id = m1[1];
      normalized[id] = v;
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

    // label_id -> ניקח את החלק האחרון אחרי _
    const last = k.split('_').pop() || '';
    if (allowed.has(last)) {
      normalized[last] = v;
      continue;
    }

    // גם אם השם כבר מדויק ("email", "full_name" וכו')
    if (allowed.has(k)) {
      normalized[k] = v;
    }
  }

  // מרכיבים מהצורה fields[i][id/value]
  for (const it of Object.values(byIndex)) {
    if (it.id && typeof it.value === 'string') {
      normalized[it.id] = it.value;
    }
  }

  return normalized;
}

function hasAnyValue(obj: CleanLead): boolean {
  return Object.values(obj).some((v) => typeof v === 'string' && v.trim() !== '');
}

// ---------- Body parser ----------
async function readBody(req: Request): Promise<Record<string, unknown>> {
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const j = await req.json();
    return isRecord(j) ? j : {};
  }
  if (ct.includes('application/x-www-form-urlencoded')) {
    const text = await req.text();
    return urlEncodedToObject(text);
  }
  if (ct.includes('multipart/form-data')) {
    const fd = await req.formData();
    return formDataToObject(fd);
  }
  return {};
}

// ---------- Handlers ----------
export async function POST(req: Request) {
  try {
    const raw = await readBody(req);
    const norm = normalizeElementorKeys(isRecord(raw) ? raw : {});

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return new NextResponse(
        JSON.stringify({
          ok: false,
          error: 'Missing Supabase env vars',
          haveUrl: Boolean(process.env.SUPABASE_URL),
          haveKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
        }),
        { status: 500, headers: corsHeaders }
      );
    }

    // נכניס לטבלה **עם הקידומת utm_** כמו בסכמה שלך
    const clean: CleanLead = {
      status: 'new',
      full_name: pickStr(norm, 'full_name') ?? pickStr(norm, 'name'),
      phone:     pickStr(norm, 'contact_phone') ?? pickStr(norm, 'phone'),
      email:     pickStr(norm, 'email'),
      utm_source:   pickStr(norm, 'utm_source'),
      utm_campaign: pickStr(norm, 'utm_campaign'),
      utm_medium:   pickStr(norm, 'utm_medium'),
      utm_term:     pickStr(norm, 'utm_term'),
      utm_content:  pickStr(norm, 'utm_content'),
    };

    if (!hasAnyValue(clean)) {
      return new NextResponse(
        JSON.stringify({ ok: false, error: 'Empty payload after parsing', receivedKeys: Object.keys(norm) }),
        { status: 400, headers: corsHeaders }
      );
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { error } = await supabase.from('leads').insert(clean);
    if (error) {
      return new NextResponse(
        JSON.stringify({ ok: false, supabase_error: errToJson(error), clean }),
        { status: 500, headers: corsHeaders }
      );
    }

    return new NextResponse(JSON.stringify({ ok: true, inserted: clean }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (err) {
    return new NextResponse(JSON.stringify({ ok: false, error: errToJson(err) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}

export function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders });
}
