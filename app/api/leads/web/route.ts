import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ---------- Types ----------
type Dict = Record<string, string>;

// ---------- Helpers ----------
async function readBody(req: Request): Promise<Dict> {
  const ctype = req.headers.get('content-type') || '';
  try {
    if (ctype.includes('application/json')) {
      const json = (await req.json()) as unknown;
      return Object.fromEntries(Object.entries(json as Dict).map(([k, v]) => [k, String(v ?? '')]));
    }
    if (ctype.includes('application/x-www-form-urlencoded') || ctype.includes('multipart/form-data')) {
      const fd = await req.formData();
      const out: Dict = {};
      for (const [k, v] of fd.entries()) out[k] = String(v);
      return out;
    }
  } catch {
    // fallthrough to empty
  }
  return {};
}

function normalizeKey(k: string): string {
  // מסיר תוספות כמו "אין תווית", נקודותיים, רווחים מיותרים וכו'
  let key = k.trim();
  const prefixes = ['אין תווית', 'שדה', 'no label', 'Field'];
  for (const p of prefixes) if (key.startsWith(p)) key = key.slice(p.length).trim();
  key = key.replace(/^[:\-\s_]+/, '').toLowerCase();

  // מיפוי וריאציות/עברית -> שם קאנוני
  const map: Dict = {
    // name
    'full name': 'full_name',
    'full_name': 'full_name',
    'שם מלא': 'full_name',
    'שם': 'full_name',
    // email
    'email': 'email',
    'אימייל': 'email',
    'דוא"ל': 'email',
    // phone
    'contact_phone': 'contact_phone',
    'phone': 'contact_phone',
    'מספר טלפון': 'contact_phone',
    'טלפון': 'contact_phone',
    // message
    'message': 'message',
    'הודעה': 'message',
    // page url / referer sent by elementor
    'קישור לעמוד': 'page_url',
    'עמוד': 'page_url',
    'link': 'page_url',
    // utm
    'utm_source': 'utm_source',
    'source': 'utm_source',
    'מקור': 'utm_source',
    'utm campaign': 'utm_campaign',
    'utm_campaign': 'utm_campaign',
    'campaign': 'utm_campaign',
    'קמפיין': 'utm_campaign',
    'utm_medium': 'utm_medium',
    'medium': 'utm_medium',
    'utm_content': 'utm_content',
    'content': 'utm_content',
    'utm_term': 'utm_term',
    'term': 'utm_term',
    'keyword': 'utm_term', // חשוב: keyword -> utm_term
    'מילת מפתח': 'utm_term',
  };

  const keyNoSpaces = key.replace(/\s+/g, '_');
  return map[key] ?? map[keyNoSpaces] ?? keyNoSpaces;
}

function parseUTMsFromURL(urlLike: string): Partial<Dict> {
  if (!urlLike) return {};
  let url: URL;
  try {
    url = new URL(urlLike);
  } catch {
    // אם הגיע רק query string, נעטוף ב־base
    try {
      url = new URL(urlLike, 'https://dummy.local');
    } catch {
      return {};
    }
  }
  const q = url.searchParams;
  const utm_source = q.get('utm_source') ?? '';
  const utm_campaign = q.get('utm_campaign') ?? '';
  const utm_medium = q.get('utm_medium') ?? '';
  const utm_content = q.get('utm_content') ?? '';
  // keyword הוא פרמטר לא-UTM שאנחנו ממפים ל־utm_term
  const utm_term = q.get('utm_term') ?? q.get('keyword') ?? '';

  return { utm_source, utm_campaign, utm_medium, utm_content, utm_term };
}

function pick<T extends string>(obj: Dict, key: T, fallback = ''): string {
  const v = obj[key];
  return v !== undefined && v !== null && String(v).trim() !== '' ? String(v) : fallback;
}

// ---------- Handler ----------
export async function POST(req: Request) {
  // קורא גוף הבקשה
  const raw = await readBody(req);

  // נרמל מפתחות (גם אם אלמנטור שלח "אין תווית full_name" וכו')
  const normalized: Dict = {};
  for (const [k, v] of Object.entries(raw)) normalized[normalizeKey(k)] = String(v ?? '').trim();

  // חילוץ URL של העמוד אם אלמנטור צירף
  const pageUrl = pick(normalized, 'page_url');
  // פרמטרים מה-URL במקרה שהשדות בטופס ריקים
  const utmFromUrl = parseUTMsFromURL(pageUrl || req.headers.get('referer') || '');

  // מאחדים ערכים: קודם מהטופס, ואם ריק – מה-URL
  const utm_source   = pick(normalized, 'utm_source', utmFromUrl.utm_source ?? '');
  const utm_campaign = pick(normalized, 'utm_campaign', utmFromUrl.utm_campaign ?? '');
  const utm_medium   = pick(normalized, 'utm_medium', utmFromUrl.utm_medium ?? '');
  const utm_content  = pick(normalized, 'utm_content', utmFromUrl.utm_content ?? '');
  const utm_term     = pick(normalized, 'utm_term', utmFromUrl.utm_term ?? '');

  // שדות לידים בסיסיים
  const full_name     = pick(normalized, 'full_name');
  const email         = pick(normalized, 'email');
  const contact_phone = pick(normalized, 'contact_phone');
  const message       = pick(normalized, 'message');

  // לוג קצר (יעזור אם משהו שוב ישתנה באלמנטור)
  console.info('[LEAD] keys:', Object.keys(raw));
  console.info('[LEAD] sample values:', {
    full_name, email, contact_phone, message,
    utm_source, utm_campaign, utm_medium, utm_content, utm_term,
    pageUrl,
  });

  // כתיבה ל-Supabase
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Supabase credentials are missing');
    return NextResponse.json({ ok: false, error: 'Missing Supabase env vars' }, { status: 500 });
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // התאמה לשמות העמודות אצלך:
  // phone = contact_phone, keyword = utm_term
  const payload = {
    status: 'new',
    full_name,
    email,
    phone: contact_phone,
    utm_source,
    utm_campaign,
    utm_medium,
    utm_content,
    keyword: utm_term,
  };

  const { error } = await supabase.from('leads').insert([payload]);
  if (error) {
    console.error('Supabase insert error:', error);
    return NextResponse.json({ ok: false, supabase_error: error }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function OPTIONS() {
  const headers = new Headers();
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return new Response(null, { headers });
}
