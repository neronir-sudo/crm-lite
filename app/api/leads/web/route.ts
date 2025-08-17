import { NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '../../../../lib/db'

// --- CORS HEADERS CONFIGURATION ---
// This is the list of websites allowed to send data to our API.
// We've added your client's live site. You can add more domains in the future.
const allowedOrigins = ['https://drshirihendel.co.il'];

const corsHeaders = (origin: string) => {
  const headers = new Headers();
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');

  // If the incoming request is from an allowed website, add it to the response header.
  if (allowedOrigins.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
  }
  return headers;
};
// --- END OF CORS CONFIGURATION ---


const LeadSchema = z.object({
  account_id: z.string().uuid().optional(),
  full_name: z.string().min(1).optional(),
  phone: z.string().min(3).optional(),
  email: z.string().email().optional(),
  age: z.coerce.number().int().min(0).max(120).optional(),
  city: z.string().optional(),
  region: z.string().optional(),
  notes: z.string().optional(),
  form_name: z.string().optional(),
  landing_page: z.string().optional(),
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
  utm_term: z.string().optional(),
  utm_content: z.string().optional(),
  gclid: z.string().optional(),
  fbclid: z.string().optional(),
  ttclid: z.string().optional(),
  wbraid: z.string().optional(),
  gbraid: z.string().optional(),
  platform: z.string().optional(),
  campaign_id: z.string().optional(),
  adgroup_id: z.string().optional(),
  ad_id: z.string().optional(),
  creative_id: z.string().optional(),
  keyword: z.string().optional(),
  placement: z.string().optional(),
  device: z.string().optional(),
  client_uid: z.string().optional()
});

async function readBody(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get('content-type') || ''
  try {
    if (ct.includes('application/json')) {
      const json = await req.json() as Record<string, unknown>;
      const stringifiedJson: Record<string, string> = {};
      for (const key in json) {
        stringifiedJson[key] = String(json[key]);
      }
      return stringifiedJson;
    }
    if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data')) {
      const form = await req.formData()
      const obj: Record<string, string> = {}
      for (const [k, v] of form.entries()) obj[k] = String(v)
      return obj
    }
  } catch {}
  return {}
}

// This OPTIONS function is new. It handles the "pre-flight" request
// that browsers send to check security before sending the actual data.
export async function OPTIONS(request: Request) {
    const origin = request.headers.get('origin') ?? '';
    return new Response(null, { headers: corsHeaders(origin) });
}

export async function POST(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  
  try {
    const raw = await readBody(req);
    
    const cleaned = {
      full_name: raw.full_name || raw.name || undefined,
      phone: raw.phone || raw.contact_phone ? String(raw.phone || raw.contact_phone).trim() : undefined,
      email: raw.email || undefined,
      age: raw.age ?? undefined,
      city: raw.city || undefined,
      region: raw.region || undefined,
      notes: raw.notes || undefined,
      form_name: raw.form_name || raw.form || undefined,
      landing_page: raw.landing_page || raw.lp || undefined,
      utm_source: raw.utm_source || undefined,
      utm_medium: raw.utm_medium || undefined,
      utm_campaign: raw.utm_campaign || undefined,
      utm_term: raw.utm_term || undefined,
      utm_content: raw.utm_content || undefined,
      gclid: raw.gclid || undefined,
      fbclid: raw.fbclid || undefined,
      ttclid: raw.ttclid || undefined,
      wbraid: raw.wbraid || undefined,
      gbraid: raw.gbraid || undefined,
      platform: raw.platform || undefined,
      campaign_id: raw.campaign_id || undefined,
      adgroup_id: raw.adgroup_id || undefined,
      ad_id: raw.ad_id || undefined,
      creative_id: raw.creative_id || undefined,
      keyword: raw.keyword || undefined,
      placement: raw.placement || undefined,
      device: raw.device || undefined,
      client_uid: raw.client_uid || undefined,
      account_id: raw.account_id || undefined
    };

    const parsed = LeadSchema.safeParse(cleaned);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, where: 'validation', issues: parsed.error.issues, cleaned },
        { status: 400, headers: corsHeaders(origin) } // Added headers
      );
    }

    const { data, error } = await supabaseAdmin.from('leads').insert([parsed.data]).select('id').single();

    if (error) {
      const { message, details, hint, code } = error;
      return NextResponse.json(
        { ok: false, where: 'supabase', message, details, hint, code },
        { status: 400, headers: corsHeaders(origin) } // Added headers
      );
    }
    
    return NextResponse.json(
      { ok: true, id: data.id },
      { headers: corsHeaders(origin) } // Added headers
    );

  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, where: 'catch', error: errorMsg },
      { status: 400, headers: corsHeaders(origin) } // Added headers
    );
  }
}
