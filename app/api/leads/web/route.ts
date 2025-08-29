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

/** ---------- 2) FIELD NORMALIZATION (supports Elementor form_fields[...]) ---------- **/
const ALIASES: Record<string, string[]> = {
  // בסיס
  full_name: [
    'full_name', 'form_fields[full_name]',
    'שם','שם מלא','שם פרטי','Name','Your Name','אין תווית full_name',
  ],
  email: [
    'email','form_fields[email]',
    'אימייל','דוא"ל','מייל','כתובת אימייל','אין תווית email',
  ],
  contact_phone: [
    'contact_phone','form_fields[contact_phone]',
    'phone','form_fields[phone]',
    'טלפון','מספר טלפון','טלפון נייד','אין תווית contact_phone',
  ],
  message: [
    'message','form_fields[message]',
    'הודעה','תוכן','אין תווית message',
  ],

  // UTM + Keyword
  utm_source:   ['utm_source','form_fields[utm_source]','source','(Source) מקור'],
  utm_medium:   ['utm_medium','form_fields[utm_medium]','medium'],
  utm_campaign: ['utm_campaign','form_fields[utm_campaign]','campaign','(Campaign) קמפיין'],
  utm_content:  ['utm_content','form_fields[utm_content]','content'],
  utm_term:     ['utm_term','form_fields[utm_term]','term','keyword','(Keyword) מילת מפתח','מילת מפתח'],
  keyword:      ['keyword','form_fields[keyword]','(Keyword) מילת מפתח','מילת מפתח'],

  // פרטי טופס/עמוד
  form_id:   ['form_id','form_fields[form_id]','formid'],
  form_name: ['form_name','form_fields[form_name]','formname','שם טופס','אין תווית form_name'],
  page_url:  ['page_url','form_fields[page_url]','url','page-url','Page URL','כתובת עמוד'],

  // מזהי אטריביושן
  gclid:  ['gclid','form_fields[gclid]'],
  wbraid: ['wbraid','form_fields[wbraid]'],
  gbraid: ['gbraid','form_fields[gbraid]'],
  fbclid: ['fbclid','form_fields[fbclid]'],
};

function pick(body: Body, canonical: string): string | undefined {
  const candidates = [
    ...(ALIASES[canonical] || [canonical]),
    `אין תווית ${canonical}`, // Elementor "no label" quirk
  ];
  for (const key of candidates) {
    const val = body[key];
    if (val && String(val).trim() !== '') return String(val).trim();
  }
  return undefined;
}

/** ---------- 2.1) UTM FALLBACK FROM URL/REFERER ---------- **/
function parseUTMsFromUrl(url?: string | null): Partial<Record<string, string>> {
  if (!url) return {};
  try {
    const u = new URL(url);
    const q = u.searchParams;
    const out: Record<string, string> = {};
    const keys = [
      'utm_source','utm_campaign','utm_medium','utm_content','utm_term',
      'gclid','wbraid','gbraid','fbclid','ttclid','msclkid',
    ];
    keys.forEach((k) => {
      const v = q.get(k);
      if (v) out[k] = v;
    });
    const kw = q.get('keyword') ?? q.get('q');
    if (kw && !out.utm_term) out.utm_term = kw;
    return out;
  } catch {
    return {};
  }
}

/** ---------- 3) HANDLERS ---------- **/
export async function POST(req: Request) {
  const raw = await readBody(req);

  // לוג דיבוג
  try {
    console.info('[LEAD] keys:', Object.keys(raw));
    const sample: Record<string, string> = {};
    for (const k of [
      'full_name','email','contact_phone','message',
      'utm_source','utm_campaign','utm_medium','utm_content','utm_term','keyword',
      'form_id','form_name','page_url','gclid','wbraid','gbraid','fbclid',
    ]) {
      const v = raw[k] ?? raw[`אין תווית ${k}`] ?? raw[`form_fields[${k}]`];
      if (typeof v === 'string') sample[k] = v;
    }
    console.info('[LEAD] sample values:', sample);
  } catch {}

  const referer = req.headers.get('referer') ?? undefined;

  // UTM מהגוף + Fallback מ־page_url/Referer
  const utm_body = {
    utm_source: pick(raw, 'utm_source'),
    utm_medium: pick(raw, 'utm_medium'),
    utm_campaign: pick(raw, 'utm_campaign'),
    utm_content: pick(raw, 'utm_content'),
    utm_term: pick(raw, 'utm_term') ?? pick(raw, 'keyword'),
  };

  if (!utm_body.utm_source || !utm_body.utm_campaign || !utm_body.utm_medium) {
    const pageUrl = pick(raw, 'page_url');
    const fb = parseUTMsFromUrl(pageUrl ?? referer);
    utm_body.utm_source  ||= fb.utm_source;
    utm_body.utm_campaign||= fb.utm_campaign;
    utm_body.utm_medium  ||= fb.utm_medium;
    utm_body.utm_content ||= fb.utm_content;
    utm_body.utm_term    ||= fb.utm_term;
    if (fb.gclid && !raw.gclid) raw.gclid = fb.gclid;
    if (fb.wbraid && !raw.wbraid) raw.wbraid = fb.wbraid;
    if (fb.gbraid && !raw.gbraid) raw.gbraid = fb.gbraid;
    if (fb.fbclid && !raw.fbclid) raw.fbclid = fb.fbclid;
  }

  const lead = {
    status: 'new' as const,
    full_name: pick(raw, 'full_name'),
    email: pick(raw, 'email'),
    phone: pick(raw, 'contact_phone'),
    message: pick(raw, 'message'),

    utm_source: utm_body.utm_source,
    utm_medium: utm_body.utm_medium,
    utm_campaign: utm_body.utm_campaign,
    utm_content: utm_body.utm_content,
    utm_term: utm_body.utm_term,
    keyword: pick(raw, 'keyword') ?? utm_body.utm_term ?? undefined,

    form_id: pick(raw, 'form_id'),
    form_name: pick(raw, 'form_name'),

    gclid:  pick(raw, 'gclid'),
    wbraid: pick(raw, 'wbraid'),
    gbraid: pick(raw, 'gbraid'),
    fbclid: pick(raw, 'fbclid'),
  };

  const toInsert: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(lead)) if (v !== undefined && v !== '') toInsert[k] = v;

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('Missing Supabase env vars');
    return withCORS(NextResponse.json({ ok: false, error: 'Server not configured' }, { status: 500 }));
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await supabase.from('leads').insert(toInsert).select('id').single();

  if (error) {
    console.error('Supabase insert error:', error);
    return withCORS(NextResponse.json({ ok: false, supabase_error: error }, { status: 500 }));
  }

  return withCORS(NextResponse.json({ ok: true, id: data.id }, { status: 200 }));
}

/** ---------- 4) CORS ---------- **/
function withCORS(res: NextResponse) {
  res.headers.set('Access-Control-Allow-Origin', '*');
  res.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  res.headers.set('Access-Control-Max-Age', '86400');
  return res;
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
