import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ----- Types (בלי any) -----
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
  source: string | null;
  campaign: string | null;
  medium: string | null;
  term: string | null;
  content: string | null;
};

// ----- CORS -----
const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ----- Helpers -----
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function formDataToObject(fd: FormData): Record<string, string> {
  const obj: Record<string, string> = {};
  fd.forEach((val, key) => {
    if (typeof val === 'string') obj[key] = val;
  });
  return obj;
}

function urlEncodedToObject(text: string): Record<string, string> {
  const params = new URLSearchParams(text);
  const obj: Record<string, string> = {};
  params.forEach((v, k) => (obj[k] = v));
  return obj;
}

function hasAnyValue(obj: CleanLead): boolean {
  return Object.values(obj).some((v) => typeof v === 'string' && v.trim() !== '');
}

// ----- Body parser (ללא any) -----
async function readBody(req: Request): Promise<RawPayload> {
  const ct = req.headers.get('content-type') || '';

  if (ct.includes('application/json')) {
    const j = await req.json();
    return isRecord(j) ? (j as RawPayload) : {};
  }

  if (ct.includes('application/x-www-form-urlencoded')) {
    const text = await req.text();
    return urlEncodedToObject(text) as RawPayload;
  }

  if (ct.includes('multipart/form-data')) {
    const fd = await req.formData();
    return formDataToObject(fd) as RawPayload;
  }

  return {};
}

// ----- Handlers -----
export async function POST(req: Request) {
  try {
    console.log('--- REQUEST RECEIVED AT /api/leads/web ---');

    const raw = await readBody(req);
    console.log('RAW BODY:', JSON.stringify(raw, null, 2));

    // מיפוי מסודר ללא any
    const clean: CleanLead = {
      status: 'new',
      full_name:
        (typeof raw.full_name === 'string' && raw.full_name) ||
        (typeof raw.name === 'string' && raw.name) ||
        null,
      phone:
        (typeof raw.contact_phone === 'string' && raw.contact_phone) ||
        (typeof raw.phone === 'string' && raw.phone) ||
        null,
      email: (typeof raw.email === 'string' && raw.email) || null,
      source: (typeof raw.utm_source === 'string' && raw.utm_source) || null,
      campaign: (typeof raw.utm_campaign === 'string' && raw.utm_campaign) || null,
      medium: (typeof raw.utm_medium === 'string' && raw.utm_medium) || null,
      term: (typeof raw.utm_term === 'string' && raw.utm_term) || null,
      content: (typeof raw.utm_content === 'string' && raw.utm_content) || null,
    };

    if (!hasAnyValue(clean)) {
      console.error('Refusing empty insert. Clean object is empty:', clean);
      return new NextResponse(JSON.stringify({ ok: false, error: 'Empty payload' }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Supabase (צד שרת בלבד)
    const supabase = createClient(
      process.env.SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE_KEY as string
    );

    const { error } = await supabase.from('leads').insert(clean);
    if (error) {
      console.error('Supabase insert error:', error);
      return new NextResponse(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    console.log('Lead inserted OK:', clean);
    return new NextResponse(JSON.stringify({ ok: true }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('CRITICAL ERROR:', msg);
    return new NextResponse(JSON.stringify({ ok: false, error: 'Server error' }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}

export function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders });
}
