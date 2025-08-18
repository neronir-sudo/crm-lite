import { NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '../../../../lib/db'

// --- CORS & Schema remain the same ---
const allowedOrigins = ['https://dr-shirihendel.co.il'];
const corsHeaders = (origin: string) => {
    const headers = new Headers();
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
    if (allowedOrigins.includes(origin)) {
        headers.set('Access-Control-Allow-Origin', origin);
    }
    return headers;
};
const LeadSchema = z.object({
    full_name: z.string().min(1).optional(),
    phone: z.string().min(3).optional(),
    email: z.string().email().optional(),
    notes: z.string().optional(),
    utm_source: z.string().optional(),
    utm_campaign: z.string().optional(),
    utm_medium: z.string().optional(),
    utm_term: z.string().optional(),
    utm_content: z.string().optional(),
    keyword: z.string().optional(),
    // other fields...
});

async function readBody(req: Request): Promise<Record<string, string>> {
    try {
        const contentType = req.headers.get('content-type') || '';
        if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
            const formData = await req.formData();
            const body: Record<string, string> = {};
            for (const [key, value] of formData.entries()) {
                body[key] = String(value);
            }
            return body;
        }
        if (contentType.includes('application/json')) {
            const json = await req.json() as Record<string, unknown>;
            const stringifiedJson: Record<string, string> = {};
            for (const key in json) {
                if (json[key] !== null && json[key] !== undefined) {
                    stringifiedJson[key] = String(json[key]);
                }
            }
            return stringifiedJson;
        }
        return {};
    } catch (error) {
        console.error("Error reading request body:", error);
        return {};
    }
}

export async function OPTIONS(request: Request) {
    const origin = request.headers.get('origin') ?? '';
    return new Response(null, { headers: corsHeaders(origin) });
}

export async function POST(req: Request) {
  const origin = req.headers.get('origin') ?? '';

  try {
    const raw = await readBody(req);

    // THIS IS THE CORRECTED LOGIC - THE "TRANSLATOR" IS BACK
    const cleaned = {
      full_name: raw['form_fields[name]'] || raw.full_name,
      phone: raw['form_fields[tel]'] || raw.contact_phone || raw.phone,
      email: raw['form_fields[email]'] || raw.email,
      notes: raw['form_fields[message]'] || raw.message || raw.notes,

      utm_source: raw.utm_source,
      utm_campaign: raw.utm_campaign,
      utm_medium: raw.utm_medium,
      utm_term: raw.utm_term,
      utm_content: raw.utm_content,
      keyword: raw.keyword,
    };

    const parsed = LeadSchema.safeParse(cleaned);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, where: 'validation', issues: parsed.error.issues },
        { status: 400, headers: corsHeaders(origin) }
      );
    }

    const { data, error } = await supabaseAdmin.from('leads').insert([parsed.data]).select('id').single();

    if (error) {
      return NextResponse.json(
        { ok: false, where: 'supabase', message: error.message },
        { status: 400, headers: corsHeaders(origin) }
      );
    }

    return NextResponse.json(
      { ok: true, id: data.id },
      { headers: corsHeaders(origin) }
    );

  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, where: 'catch', error: errorMsg },
      { status: 400, headers: corsHeaders(origin) }
    );
  }
}