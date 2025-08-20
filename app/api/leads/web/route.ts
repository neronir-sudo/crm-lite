// app/api/leads/web/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type Body = Record<string, string>;

/** ---------- 1) BODY PARSING ---------- **/
async function readBody(req: Request): Promise<Body> {
  const contentType = req.headers.get('content-type') || '';
  // JSON
  if (contentType.includes('application/json')) {
    const data = (await req.json()) as Record<string, unknown>;
    const out: Body = {};
    for (const [key, val] of Object.entries(data)) out[key] = String(val ?? '');
    return out;
  }
  // x-www-form-urlencoded
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const text = await req.text();
    const params = new URLSearchParams(text);
    const out: Body = {};
    params.forEach((v, k) => (out[k] = v));
    return out;
  }
  // multipart/form-data
  if (contentType.includes('multipart/form-data')) {
    const fd = await req.formData();
    const out: Body = {};
    for (const [k, v] of fd.entries()) out[k] = String(v);
    return out;
  }
  // fallback: try json, else empty
  try {
    const data = (await req.json()) as Record<string, unknown>;
    const out: Body = {};
    for (const [key, val] of Object.entries(data)) out[key] = String(val ?? '');
    return out;
  } catch {
    return {};
  }
}

/** ---------- 2) FIELD NORMALIZATION ---------- **/
const ALIASES: Record<string, string[]> = {
  // לידים בסיסיים
  full_name: [
    'full_name',
    'שם',
    'שם מלא',
    'שם פרטי',
    'Name',
    'Your Name',
    'אין תווית full_name',
  ],
  email: ['email', 'אימייל', 'דוא"ל', 'מייל', 'כתובת אימייל', 'אין תווית email'],
  contact_phone: [
    'contact_phone',
    'phone',
    'טלפון',
    'מספר טלפון',
    'טלפון נייד',
    'אין תווית contact_phone',
  ],
  message: ['message', 'הודעה', 'תוכן', 'אין תווית message'],

  // UTM + Keyword (כולל שמות העמודה בעברית מהדאשבורד)
  utm_source: ['utm_source', 'source', '(Source) מקור'],
  utm_medium: ['utm_medium', 'medium'],
  utm_campaign: ['utm_campaign', 'campaign', '(Campaign) קמפיין'],
  utm_content: ['utm_content', 'content'],
  utm_term: ['utm_term', 'term', 'keyword', '(Keyword) מילת מפתח', 'מילת מפתח'],
  keyword: ['keyword', '(Keyword) מילת מפתח', 'מילת מפתח'],

  // פרטי טופס
  form_id: ['form_id', 'formid'],
  form_name: ['form_name', 'formname', 'שם טופס', 'אין תווית form_name'],
};

function pick(body: Body, canonical: string): string | undefined {
  const candidates = [
    ...(ALIASES[canonical] || [canonical]),
    // אלמנטור לפעמים שולח "אין תווית {id}"
    `אין תווית ${canonical}`,
  ];
  for (const key of candidates) {
    const val = body[key];
    if (val && String(val).trim() !== '') return String(val).trim();
  }
  return undefined;
}

/** ---------- 3) HANDLERS ---------- **/
export async function POST(req: Request) {
  const raw = await readBody(req);

  // לוג עוזר (כמו שהשתמשנו בו עד עכשיו)
  try {
    console.info('[LEAD] keys:', Object.keys(raw));
    const sample: Record<string, string> = {};
    for (const k of [
      'full_name',
      'email',
      'contact_phone',
      'message',
      'utm_source',
      'utm_campaign',
      'utm_medium',
      'utm_content',
      'utm_term',
      'keyword',
      'form_id',
      'form_name',
    ]) {
      const v = raw[k] ?? raw[`אין תווית ${k}`];
      if (typeof v === 'string') sample[k] = v;
    }
    console.info('[LEAD] sample values:', sample);
  } catch {}

  // יצירת אובייקט מסודר לשמירה
  const lead = {
    status: 'new' as const,
    full_name: pick(raw, 'full_name'),
    email: pick(raw, 'email'),
    // בעמודה בטבלה זה phone, לכן נמפה בהתאם
    phone: pick(raw, 'contact_phone'),
    message: pick(raw, 'message'),
    utm_source: pick(raw, 'utm_source'),
    utm_medium: pick(raw, 'utm_medium'),
    utm_campaign: pick(raw, 'utm_campaign'),
    utm_content: pick(raw, 'utm_content'),
    // ממפים גם ל-keyword אם מגיע רק אחד מהם
    utm_term: pick(raw, 'utm_term') ?? pick(raw, 'keyword'),
    keyword: pick(raw, 'keyword') ?? pick(raw, 'utm_term'),
    form_id: pick(raw, 'form_id'),
    form_name: pick(raw, 'form_name'),
  };

  // מסננים undefined/ריקים
  const toInsert: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(lead)) {
    if (v !== undefined && v !== '') toInsert[k] = v;
  }

  // Supabase
  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error('Missing Supabase env vars');
    return NextResponse.json(
      { ok: false, error: 'Server not configured' },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase
    .from('leads')
    .insert(toInsert)
    .select('id')
    .single();

  if (error) {
    console.error('Supabase insert error:', error);
    return NextResponse.json(
      { ok: false, supabase_error: error },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, id: data.id }, { status: 200 });
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}
