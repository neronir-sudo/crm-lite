// app/api/leads/web/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type Body = Record<string, string>;

/** ---------- Helpers: safe string ---------- **/
function toStr(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

/** ---------- 1) BODY PARSING ---------- **/
async function readBody(req: Request): Promise<Body> {
  const contentType = (req.headers.get('content-type') || '').toLowerCase();

  // JSON
  if (contentType.includes('application/json')) {
    const data = (await req.json()) as unknown;
    const out: Body = {};
    if (data && typeof data === 'object') {
      for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
        out[k] = toStr(v);
      }
    }
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
    for (const [k, v] of fd.entries()) out[k] = toStr(v);
    return out;
  }

  // fallback: try JSON, else empty
  try {
    const data = (await req.json()) as Record<string, unknown>;
    const out: Body = {};
    for (const [k, v] of Object.entries(data)) out[k] = toStr(v);
    return out;
  } catch {
    return {};
  }
}

/** ---------- 2) FLATTEN Elementor shapes ---------- **/
// תומך ב: form_fields[utm_source]=..., fields (מערך/אובייקט), וגם form_fields כ-JSON
function flattenElementor(raw: Body): Body {
  const out: Body = { ...raw };

  // 2.1 מפענח מפתחות בסגנון form_fields[utm_source] -> utm_source
  for (const [k, v] of Object.entries(raw)) {
    const m = k.match(/^form_fields\[(.+?)\]$/i);
    if (m && m[1]) {
      out[m[1]] = v;
    }
  }

  // 2.2 אם יש שדה form_fields שהוא JSON – נפרוס אותו
  const maybeFormFields = raw['form_fields'];
  if (maybeFormFields) {
    try {
      const parsed = JSON.parse(maybeFormFields) as unknown;
      if (parsed && typeof parsed === 'object') {
        // יכול להיות אובייקט { utm_source: '...' } או מערך [{id:'utm_source', value:'...'}]
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            const id = (item as Record<string, unknown>)['id'];
            const val = (item as Record<string, unknown>)['value'];
            if (typeof id === 'string') out[id] = toStr(val);
          }
        } else {
          for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
            out[k] = toStr(v);
          }
        }
      }
    } catch {/* ignore */}
  }

  // 2.3 אם יש שדה fields (חלק מתוספים של אלמנטור) – נפרוס אותו
  const maybeFields = raw['fields'];
  if (maybeFields) {
    try {
      const parsed = JSON.parse(maybeFields) as unknown;
      if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            const id = (item as Record<string, unknown>)['id'];
            const val = (item as Record<string, unknown>)['value'];
            if (typeof id === 'string') out[id] = toStr(val);
          }
        } else {
          for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
            out[k] = toStr(v);
          }
        }
      }
    } catch {/* ignore */}
  }

  return out;
}

/** ---------- 3) UTM from Referer (fallback) ---------- **/
function extractUtmFromUrl(url: string): Partial<Body> {
  try {
    const u = new URL(url);
    const p = u.searchParams;
    const obj: Partial<Body> = {};
    const keys = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
      'gclid', 'wbraid', 'gbraid', 'fbclid',
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

/** ---------- 4) ALIASES + picker ---------- **/
const ALIASES: Record<string, string[]> = {
  full_name: ['full_name', 'שם', 'שם מלא', 'שם פרטי', 'Name', 'Your Name', 'אין תווית full_name'],
  email: ['email', 'אימייל', 'דוא"ל', 'מייל', 'כתובת אימייל', 'אין תווית email'],
  contact_phone: ['contact_phone', 'phone', 'טלפון', 'מספר טלפון', 'טלפון נייד', 'אין תווית contact_phone'],
  message: ['message', 'הודעה', 'תוכן', 'אין תווית message'],

  utm_source: ['utm_source', 'source', '(Source) מקור', 'form_fields[utm_source]'],
  utm_medium: ['utm_medium', 'medium', 'form_fields[utm_medium]'],
  utm_campaign: ['utm_campaign', 'campaign', '(Campaign) קמפיין', 'form_fields[utm_campaign]'],
  utm_content: ['utm_content', 'content', 'form_fields[utm_content]'],
  utm_term: ['utm_term', 'term', 'keyword', '(Keyword) מילת מפתח', 'מילת מפתח', 'form_fields[utm_term]'],
  keyword: ['keyword', '(Keyword) מילת מפתח', 'מילת מפתח', 'form_fields[keyword]'],

  form_id: ['form_id', 'formid'],
  form_name: ['form_name', 'formname', 'שם טופס', 'אין תווית form_name'],
};

function pick(body: Body, canonical: string): string | undefined {
  const candidates = [
    ...(ALIASES[canonical] || [canonical]),
    `אין תווית ${canonical}`,
  ];

  // בנוסף: חיפוש כללי – אם יש מפתח שמכיל את שם השדה (כיסוי למקרי קצה)
  for (const key of Object.keys(body)) {
    if (key === canonical || candidates.includes(key)) {
      const val = body[key];
      if (val && val.trim() !== '') return val.trim();
    }
  }
  for (const key of Object.keys(body)) {
    if (key.includes(canonical)) {
      const val = body[key];
      if (val && val.trim() !== '') return val.trim();
    }
  }
  return undefined;
}

/** ---------- 5) HANDLERS ---------- **/
export async function POST(req: Request) {
  const raw = await readBody(req);
  const body = flattenElementor(raw);

  // לוג שימושי לבדיקה
  try {
    console.info('[LEAD] keys:', Object.keys(body));
    const sample: Record<string, string> = {};
    for (const k of [
      'full_name','email','contact_phone','message',
      'utm_source','utm_campaign','utm_medium','utm_content','utm_term','keyword',
      'form_id','form_name'
    ]) {
      const v = body[k] ?? body[`אין תווית ${k}`];
      if (typeof v === 'string') sample[k] = v;
    }
    console.info('[LEAD] sample values:', sample);
  } catch {}

  // בניית הרשומה
  const leadDraft: Record<string, string> = {
    status: 'new',
  };

  const full_name = pick(body, 'full_name');
  if (full_name) leadDraft.full_name = full_name;

  const email = pick(body, 'email');
  if (email) leadDraft.email = email;

  const phone = pick(body, 'contact_phone');
  if (phone) leadDraft.phone = phone;

  const message = pick(body, 'message');
  if (message) leadDraft.message = message;

  // UTM (ננסה קודם מה-body; אם חסר – מה-Referer)
  const utmKeys = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','keyword'] as const;
  for (const k of utmKeys) {
    const val = pick(body, k);
    if (val) leadDraft[k] = val;
  }

  // אם חסר משהו – להשלים מהרפרר
  const ref = req.headers.get('referer') || req.headers.get('x-forwarded-referer') || '';
  if (ref) {
    const fromRef = extractUtmFromUrl(ref);
    for (const [k, v] of Object.entries(fromRef)) {
      if (v && !leadDraft[k]) leadDraft[k] = v;
    }
  }

  // מזהה/שם טופס (אם יש)
  const form_id = pick(body, 'form_id');
  if (form_id) leadDraft.form_id = form_id;

  const form_name = pick(body, 'form_name');
  if (form_name) leadDraft.form_name = form_name;

  // סינון undefined/ריקים
  const toInsert: Record<string, string> = {};
  for (const [k, v] of Object.entries(leadDraft)) {
    if (v != null && v !== '') toInsert[k] = v;
  }

  // Supabase
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error('Missing Supabase env vars');
    return NextResponse.json({ ok: false, error: 'Server not configured' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data, error } = await supabase
    .from('leads')
    .insert(toInsert)
    .select('id')
    .single();

  if (error) {
    console.error('Supabase insert error:', error);
    return NextResponse.json({ ok: false, supabase_error: error }, { status: 500 });
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
