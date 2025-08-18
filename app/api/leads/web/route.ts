import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// כותרות CORS בסיסיות
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

// ממיר טקסט urlencoded לאובייקט
function parseFormUrlEncoded(text: string) {
  const params = new URLSearchParams(text);
  const obj: Record<string, string> = {};
  params.forEach((v, k) => (obj[k] = v));
  return obj;
}

// קריאת גוף הבקשה לפי ה-Content-Type
async function readBody(req: Request): Promise<Record<string, unknown>> {
  const ct = req.headers.get('content-type') || '';

  if (ct.includes('application/json')) {
    return await req.json();
  }

  if (ct.includes('application/x-www-form-urlencoded')) {
    // זו הנקודה הקריטית: urlencoded = טקסט + URLSearchParams
    const text = await req.text();
    return parseFormUrlEncoded(text);
  }

  if (ct.includes('multipart/form-data')) {
    const fd = await req.formData();
    const obj: Record<string, string> = {};
    fd.forEach((v, k) => {
      if (typeof v === 'string') obj[k] = v;
    });
    return obj;
  }

  return {};
}

export async function POST(req: Request) {
  try {
    console.log('--- REQUEST RECEIVED AT /api/leads/web ---');

    const raw = await readBody(req);
    console.log('RAW BODY:', JSON.stringify(raw, null, 2));

    // מיפוי שדות מהטופס לעמודות בטבלה
    const clean = {
      status: 'new',
      full_name: (raw as any).full_name ?? (raw as any).name ?? null,
      phone: (raw as any).contact_phone ?? (raw as any).phone ?? null,
      email: (raw as any).email ?? null,
      source: (raw as any).utm_source ?? null,
      campaign: (raw as any).utm_campaign ?? null,
      medium: (raw as any).utm_medium ?? null,
      term: (raw as any).utm_term ?? null,
      content: (raw as any).utm_content ?? null,
      // אפשר להוסיף שדות נוספים פה אם קיימים בטבלה
    };

    // לא מכניסים שורה ריקה
    const hasAny = Object.values(clean).some(
      v => v !== null && String(v).trim() !== ''
    );
    if (!hasAny) {
      console.error('Refusing empty insert. Clean object is empty:', clean);
      return new NextResponse(JSON.stringify({ ok: false, error: 'Empty payload' }), {
        status: 400,
        headers: corsHeaders
      });
    }

    // חיבור ל-Supabase - חובה להגדיר את המשתנים בסביבה של Vercel (ראה סעיף 2)
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY! // בצד שרת בלבד!
    );

    const { error } = await supabase.from('leads').insert(clean);
    if (error) {
      console.error('Supabase insert error:', error);
      return new NextResponse(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
        headers: corsHeaders
      });
    }

    console.log('Lead inserted OK:', clean);
    return new NextResponse(JSON.stringify({ ok: true }), {
      status: 200,
      headers: corsHeaders
    });
  } catch (err: any) {
    console.error('CRITICAL ERROR:', err?.message || err);
    return new NextResponse(JSON.stringify({ ok: false, error: 'Server error' }), {
      status: 500,
      headers: corsHeaders
    });
  }
}

// מענה ל-OPTIONS (CORS)
export function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders as any });
}
