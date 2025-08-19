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
    'em
