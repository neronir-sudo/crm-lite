// app/api/leads/web/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

type Body = Record<string, string>;

/** ---------- Helpers: safe string ---------- **/
function toStr(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

/** ---------- CORS ---------- **/
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

/** ---------- 1) BODY PARSING ---------- **/
async function readBody(req: Request): Promise<Body> {
  const contentType = (req.headers.get('content-type') || '').toLowerCase();

  // JSON
  if (contentType.includes('application/json')) {
    try {
      const json = await req.json();
      const obj: Body = {};
      Object.entries(json || {}).forEach(([k, v]) => (obj[k] = toStr(v)));
      return obj;
    } catch {}
  }

  // x-www-form-urlencoded
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const text = await req.text();
    const p = new URLSearchParams(text);
    const obj: Body = {};
    p.forEach((v, k) => (obj[k] = v));
    return obj;
  }

  // multipart/form-data
  if (contentType.includes('multipart/form-data')) {
    const fd = await req.formData();
    const obj: Body = {};
    for (const [k, v] of fd.entries()) {
      obj[k] = typeof v === 'string' ? v : v.name;
    }
    return obj;
  }

  // Fallback ל-JSON
  try {
    const json = await req.json();
    const obj: Body = {};
    Object.entries(json || {}).forEach(([k, v]) => (obj[k] = toStr(v)));
    return obj;
  } catch {
    return {};
  }
}

/** ---------- 2) PICK / ALIASES ---------- **/
const ALIASES: Record<string, string[]> = {
  full_name: ['full_name', 'name', 'שם', 'your-name'],
  email: ['email', 'אימייל', 'your-email'],
  phone: ['phone', 'טלפון', 'נייד', 'your-phone'],
  message: ['message', 'הודעה', 'messages'],
};

function pick(body: Body, canonical: keyof typeof ALIASES): string {
  for (const key of ALIASES[canonical]) {
    const v = body[key] ?? body[`אין תווית ${key}`];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  // חיפוש לפי הכללה בשם שדה (עברית/וריאציות)
  const lowered = Object.fromEntries(
    Object.entries(body).map(([k, v]) => [k.toLowerCase(), v])
  );
  for (const needle of ALIASES[canonical].map((k) => k.toLowerCase())) {
    for (const [k, v] of Object.entries(lowered)) {
      if (k.includes(needle) && typeof v === 'string' && v.trim()) return v.trim();
    }
  }
  return '';
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

/** ---------- 4) IP + Geo ---------- **/
function firstPublicIp(xff: string): string {
  const cand = (xff || '').split(',')[0]?.trim() || '';
  return cand;
}

async function lookupIp(ip: string) {
  try {
    if (
      !ip ||
      ip === '127.0.0.1' ||
      ip === '::1' ||
      ip.startsWith('10.') ||
      ip.startsWith('192.168.') ||
      ip.startsWith('172.16.')
    ) {
      return null;
    }
    const url =
      `http://ip-api.com/json/${encodeURIComponent(ip)}` +
      `?fields=status,message,country,regionName,city,lat,lon&lang=he`;

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3500);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);

    if (!res.ok) return null;
    const j = await res.json();
    if (j.status !== 'success') return null;

    return {
      geo_country: j.country || null,
      geo_region: j.regionName || null,
      geo_city: j.city || null,
      geo_lat: typeof j.lat === 'number' ? j.lat : null,
      geo_lon: typeof j.lon === 'number' ? j.lon : null,
      geo_text: (j.city ? `${j.city}, ` : '') + (j.country || '') || null,
    };
  } catch {
    return null;
  }
}

/** ---------- 5) Supabase ---------- **/
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** ---------- 6) POST ---------- **/
export async function POST(req: Request) {
  // 1) Body
  const body = await readBody(req);

  // 2) IP
  const ipFromBody = body.ip || '';
  const xff = req.headers.get('x-forwarded-for') || '';
  const ip = ipFromBody || firstPublicIp(xff) || (undefined as any as string) || '';

  // 3) Geo
  const geo = await lookupIp(ip);

  // 4) UTM + Referrer + Landing Page
  const directRef = toStr(body.referrer) || toStr(req.headers.get('referer'));
  const landing_page = toStr(body.landing_page) || '';
  const utmRaw: Partial<Body> = {
    utm_source: body.utm_source || '',
    utm_medium: body.utm_medium || '',
    utm_campaign: body.utm_campaign || '',
    utm_content: body.utm_content || '',
    utm_term: body.utm_term || body.keyword || '',
    gclid: body.gclid || '',
    wbraid: body.wbraid || '',
    gbraid: body.gbraid || '',
    fbclid: body.fbclid || '',
  };
  // אם אין UTM בגוף – ננסה לחלץ מה-Referer
  if (!utmRaw.utm_source && directRef) {
    Object.assign(utmRaw, extractUtmFromUrl(directRef));
  }

  // 5) שדות עיקריים
  const full_name = pick(body, 'full_name');
  const email = pick(body, 'email');
  const phone = pick(body, 'phone');
  const message = pick(body, 'message');

  // 6) דוגמית לוג (עוזר בבדיקות)
  try {
    const sample: Record<string, string> = {};
    for (const k of [
      'full_name', 'email', 'phone', 'message',
      'utm_source','utm_campaign','utm_medium','utm_content','utm_term','keyword',
      'form_id','form_name'
    ]) {
      const v = body[k] ?? body[`אין תווית ${k}`];
      if (typeof v === 'string') sample[k] = v;
    }
    console.info('[LEAD] sample values:', sample);
  } catch {}

  // 7) בניית הרשומה
  const leadDraft: Record<string, any> = {
    status: 'new',
    full_name,
    email,
    phone,
    message,
    ...utmRaw,
    referrer: directRef || '',
    landing_page: landing_page,
    ip: ip || null,
    ...(geo || {}), // geo_text, geo_city, geo_region, geo_country, geo_lat, geo_lon
  };

  // ניקוי ערכים ריקים
  Object.keys(leadDraft).forEach((k) => {
    const v = leadDraft[k];
    if (v === '' || v === undefined) delete leadDraft[k];
  });

  // 8) Insert
  const { data, error } = await supabase
    .from('leads')
    .insert(leadDraft)
    .select('id')
    .single();

  if (error) {
    console.error('Insert error:', error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500, headers: corsHeaders }
    );
  }

  return NextResponse.json(
    { ok: true, id: data.id, ip: ip || null, geo: geo || null },
    { status: 200, headers: corsHeaders }
  );
}
