import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type Dict = Record<string, string>;

function formDataToDict(fd: FormData): Dict {
  const out: Dict = {};
  for (const [k, v] of fd.entries()) out[String(k)] = String(v);
  return out;
}

async function readBody(req: Request): Promise<Dict> {
  const ct = req.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    const json = (await req.json()) as unknown;
    if (json && typeof json === 'object') {
      const out: Dict = {};
      for (const [k, v] of Object.entries(json as Record<string, unknown>)) {
        out[k] = String(v ?? '');
      }
      return out;
    }
  }
  if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data')) {
    return formDataToDict(await req.formData());
  }
  return {};
}

// מיפוי מפתחות נפוצים בעברית/שונות
const heToStd: Record<string, string> = {
  'שם מלא': 'full_name',
  'אימייל': 'email',
  'דואל': 'email',
  'טלפון': 'contact_phone',
  'מספר טלפון': 'contact_phone',
  'הודעה': 'message',
  'מקור': 'utm_source',
  'קמפיין': 'utm_campaign',
  'מדיה': 'utm_medium',
  'ערוץ': 'utm_medium',
  'תוכן': 'utm_content',
  'מילת מפתח': 'utm_term',
  'קישור לעמוד': 'page_url',
  'פרטי משתמש': 'user_agent',
  'ip השולח': 'ip',
  'מופעל באמצעות': 'powered_by',
};

function normalizeKey(raw: string): string {
  let k = raw.trim().replace(/^אין תווית\s+/i, ''); // Elementor לפעמים מוסיף "אין תווית "
  const lower = k.toLowerCase();

  const direct: Record<string, string> = {
    'full_name': 'full_name',
    'email': 'email',
    'contact_phone': 'contact_phone',
    'phone': 'contact_phone',
    'message': 'message',
    'utm_source': 'utm_source',
    'utm_campaign': 'utm_campaign',
    'utm_medium': 'utm_medium',
    'utm_content': 'utm_content',
    'utm_term': 'utm_term',
    'keyword': 'utm_term',
    'form_id': 'form_id',
    'form_name': 'form_name',
    'page_url': 'page_url',
  };
  if (direct[lower]) return direct[lower];

  // עברית → סטנדרטי
  for (const [he, std] of Object.entries(heToStd)) {
    if (lower === he.toLowerCase()) return std;
  }

  // ברירת מחדל: לרווחים → קווים תחתונים
  return k.replace(/\s+/g, '_').toLowerCase();
}

function normalizeDict(src: Dict): Dict {
  const out: Dict = {};
  for (const [k, v] of Object.entries(src)) out[normalizeKey(k)] = String(v);
  return out;
}

function cleanPhone(p?: string): string | undefined {
  if (!p) return undefined;
  const d = p.replace(/\D+/g, '');
  return d || undefined;
}

function parseUTMsFromUrl(url?: string): Partial<Dict> {
  if (!url) return {};
  try {
    const u = new URL(url);
    const q = u.searchParams;
    const o: Partial<Dict> = {};
    const keys = ['utm_source', 'utm_campaign', 'utm_medium', 'utm_content', 'utm_term',
                  'gclid', 'wbraid', 'gbraid', 'fbclid', 'ttclid', 'msclkid'];
    keys.forEach(k => {
      const val = q.get(k);
      if (val) (o as Dict)[k] = val;
    });
    const kw = q.get('keyword') ?? q.get('q');
    if (kw && !o.utm_term) (o as Dict).utm_term = kw;
    return o;
  } catch {
    return {};
  }
}

export async function POST(req: Request) {
  try {
    const raw = await readBody(req);
    const body = normalizeDict(raw);

    // UTM – עדיפות לשדות המפורשים; אם חסר, נקרא מה-URL של העמוד/Referer
    const utm: Dict = {
      utm_source: body.utm_source ?? '',
      utm_campaign: body.utm_campaign ?? '',
      utm_medium: body.utm_medium ?? '',
      utm_content: body.utm_content ?? '',
      utm_term: body.utm_term ?? '',
    };

    if (!utm.utm_source || !utm.utm_campaign || !utm.utm_medium) {
      const fallback = parseUTMsFromUrl(body.page_url ?? req.headers.get('referer') ?? undefined);
      Object.assign(utm, Object.fromEntries(Object.entries(fallback).filter(([, v]) => v)));
    }

    const full_name = body.full_name ?? '';
    const email = body.email ?? '';
    const phone = cleanPhone(body.contact_phone);

    const supabase = createClient(
      process.env.SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE_KEY as string
    );

    const insert = {
      status: 'new',
      full_name,
      email,
      phone,
      utm_source: utm.utm_source || null,
      utm_campaign: utm.utm_campaign || null,
      utm_medium: utm.utm_medium || null,
      utm_content: utm.utm_content || null,
      utm_term: utm.utm_term || null,
    };

    await supabase.from('leads').insert(insert);

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function OPTIONS() {
  const headers = new Headers();
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return new Response(null, { headers });
}
