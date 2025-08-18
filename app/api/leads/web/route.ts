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

function hasAnyValue(obj: CleanLead): boolean {
  return Object.values(obj).some((v) => typeof v === 'string' && v.trim() !== '');
}

function errToJson(e: unknown): PgErrorLike {
  if (isRecord(e)) {
    return {
      message: typeof e.message === 'string' ? e.message : 'Unknown error',
      details: typeof e.details === 'string' ? e.details : null,
      hint: typeof e.hint === 'string' ? e.hint : null,
      code: typeof e.code === 'string' ? e.code : null,
    };
  }
  return { message: String(e), details: null, hint: null, code: null };
}

// ---------- Body parser ----------
async function readBody(req: Request): Promise<RawPayload> {
  const ct = req.headers.get('content-type') || '';

  if (ct.includes('application/json')) {
    const j = await req.json();
    return isRecord(j) ? (j as RawPayload) : {};
  }

  if (ct.includes('application/x-www-form-urlencoded')) {
    const text = await req.text(); // חשוב ל-urlencoded
    return urlEncodedToObject(text) as RawPayload;
  }

  if (ct.includes('multipart/form-data')) {
    const fd = await req.formData();
    return formDataToObject(fd) as RawPayload;
  }

  return {};
}

// ---------- Handlers ----------
export async function POST(req: Request) {
  try {
    const raw = await readBody(req);

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

    const r: Record<string, unknown> = isRecord(raw) ? raw : {};

    // >>> המפתח כאן: הכנסה ישירות לעמודות עם הקידומת utm_ <<<
    const clean: CleanLead = {
      status: 'new',
      full_name: pickStr(r, 'full_name') ?? pickStr(r, 'name'),
      phone:     pickStr(r, 'contact_phone') ?? pickStr(r, 'phone'),
      email:     pickStr(r, 'email'),
      utm_source:   pickStr(r, 'utm_source'),
      utm_campaign: pickStr(r, 'utm_campaign'),
      utm_medium:   pickStr(r, 'utm_medium'),
      utm_term:     pickStr(r, 'utm_term'),
      utm_content:  pickStr(r, 'utm_content'),
    };

    if (!hasAnyValue(clean)) {
      return new NextResponse(
        JSON.stringify({ ok: false, error: 'Empty payload after parsing', raw }),
        { status: 400, headers: corsHeaders }
      );
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { error } = await supabase.from('leads').insert(clean);

    if (error) {
      const ej = errToJson(error);
      return new NextResponse(JSON.stringify({ ok: false, supabase_error: ej, clean }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    return new NextResponse(JSON.stringify({ ok: true, inserted: clean }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (err) {
    const ej = errToJson(err);
    return new NextResponse(JSON.stringify({ ok: false, error: ej }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}

export function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders });
}
