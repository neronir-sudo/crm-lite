// app/api/leads/web/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type AnyObj = Record<string, any>;
type Body = Record<string, string>;

/* ---------- Utils: deep flatten ---------- */
function deepFlatten(obj: any, prefix = '', out: Body = {}): Body {
  const isObj = (v: any) => v && typeof v === 'object' && !Array.isArray(v);
  if (isObj(obj)) {
    for (const [k, v] of Object.entries(obj)) {
      const p = prefix ? `${prefix}[${k}]` : k;
      if (isObj(v) || Array.isArray(v)) deepFlatten(v, p, out);
      else out[p] = String(v ?? '');
    }
  } else if (Array.isArray(obj)) {
    obj.forEach((v, i) => {
      const p = `${prefix}[${i}]`;
      if (v && typeof v === 'object') deepFlatten(v, p, out);
      else out[p] = String(v ?? '');
    });
  } else if (prefix) {
    out[prefix] = String(obj ?? '');
  }
  return out;
}

/* ---------- 1) BODY PARSING ---------- */
async function readBody(req: Request): Promise(Body) {
  const contentType = (req.headers.get('content-type') || '').toLowerCase();

  // JSON (אלמנטור שולח לפעמים JSON עם form_fields וכד')
  if (contentType.includes('application/json')) {
    const raw = (await req.json()) as AnyObj;

    // נבנה מילון שטוח משולב:
    // 1) flatten מלא עם סוגריים [] כדי לתפוס 'form_fields[utm_source]'
    // 2) במקביל נוציא גם מפתחות שטוחים מתוך form_fields/fields/meta/data
    const flat = deepFlatten(raw);

    const mergeFrom = (branch?: AnyObj) => {
      if (!branch || typeof branch !== 'object') return;
      for (const [k, v] of Object.entries(branch)) {
        if (v == null) continue;
        flat[k] = String(v); // מפתח שטוח (utm_source)
        flat[`form_fields[${k}]`] ??= String(v); // גם בסגנון form_fields[...]
      }
    };

    mergeFrom(raw.form_fields);
    mergeFrom(raw.fields);
    mergeFrom(raw.meta);
    mergeFrom(raw.data);

    return flat;
  }

  // x-www-form-urlencoded (הפורמט הקלאסי של וובהוק אלמנטור)
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

  // fallback: ננסה JSON ואז כלום
  try {
    const raw = (await req.json()) as AnyObj;
    return deepFlatten(raw);
  } catch {
    return {};
  }
}

/* ---------- 2) ALIASES (תומך גם ב-form_fields[...]) ---------- */
const ALIASES: Record<string, string[]> = {
  full_name: [
    'full_name', 'form_fields[full_name]',
    'שם','שם מלא','שם פרטי','Name','Your Name','אין תווית full_name',
  ],
  email: [
    'email','form_fields[email]',
    'אימייל','דוא"ל','מייל','כתובת אימייל','אין תווית email',
  ],
  contact_phone: [
    'contact_phone','form_fields[contact_phone]','phone','form_fields[phone]',
    'טלפון','מספר טלפון','טלפון נייד','אין תווית contact_phone',
  ],
  message: ['message','form_fields[message]','הודעה','תוכן','אין תווית message'],

  utm_source:   ['utm_source','form_fields[utm_source]','source','(Source) מקור'],
  utm_medium:   ['utm_medium','form_fields[utm_medium]','medium'],
  utm_campaign: ['utm_campaign','form_fields[utm_campaign]','campaign','(Campaign) קמפיין'],
  utm_content:  ['utm_content','form_fields[utm_content]','content'],
  utm_term:     ['utm_term','form_fields[utm_term]','term','keyword','(Keyword) מילת מפתח','מילת מפתח'],
  keyword:      ['keyword','form_fields[keyword]','(Keyword) מילת מפתח','מילת מפתח'],

  form_id:   ['form_id','form_fields[form_id]','formid'],
  form_name: ['form_name','form_fields[form_name]','formname','שם טופס','אין תווית form_name'],
  page_url:  ['page_url','form_fields[page_url]','url','page-url','Page URL','כתובת עמוד'],

  gclid:  ['gclid','form_fields[gclid]'],
  wbraid: ['wbraid','form_fields[wbraid]'],
  gbraid: ['gbraid','form_fields[gbraid]'],
  fbclid: ['fbclid','form_fields[fbclid]'],
};

function pick(body: Body, canonical: string): string | undefined {
  const candidates = [
    ...(ALIASES[canonical] || [canonical]),
    `אין תווית ${canonical}`,
  ];
  for (const key of candidates) {
    const val = body[key];
    if (val && String(val).trim() !== '') return String(val).trim();
  }
  return undefined;
}

/* ---------- 2.1) UTM fallback מה-URL/Referer ---------- */
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
    keys.forEach(k => { const v = q.get(k); if (v) out[k] = v; });
    const kw = q.get('keyword') ?? q.get('q');
    if (kw && !out.utm_term) out.utm_term = kw;
    return out;
  } catch {
    return {};
  }
}

/* ---------- 3) HANDLER ---------- */
export async function POST(req: Request) {
  const raw = await readBody(req);

  // דיבוג שימושי (תראה ב־Vercel Logs)
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

  // UTM מהגוף + Fallback
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
    email:     pick(raw, 'email'),
    phone:     pick(raw, 'contact_phone'),
    message:   pick(raw, 'message'),

    utm_source:   utm_body.utm_source,
    utm_medium:   utm_body.utm_medium,
    utm_campaign: utm_body.utm_campaign,
    utm_content:  utm_body.utm_content,
    utm_term:     utm_body.utm_term,
    keyword:      pick(raw, 'keyword') ?? utm_body.utm_term ?? undefined,

    form_id:   pick(raw, 'form_id'),
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

/* ---------- 4) CORS ---------- */
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
