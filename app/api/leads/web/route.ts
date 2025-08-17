
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '../../../../lib/db'

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
})

async function readBody(req: Request): Promise<Record<string, any>> {
  const ct = req.headers.get('content-type') || ''
  try {
    if (ct.includes('application/json')) return await req.json()
    if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data')) {
      const form = await req.formData()
      const obj: Record<string, any> = {}
      for (const [k, v] of form.entries()) obj[k] = String(v)
      return obj
    }
  } catch {}
  return {}
}

export async function POST(req: Request) {
  try {
    const raw = await readBody(req)
    const cleaned: Record<string, any> = {
      full_name: raw.full_name || raw.name || undefined,
      phone: raw.phone ? String(raw.phone).trim() : undefined,
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
    }

    const parsed = LeadSchema.safeParse(cleaned)
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, where: 'validation', issues: parsed.error.issues, cleaned },
        { status: 400 }
      )
    }

    const { data, error } = await supabaseAdmin
      .from('leads')
      .insert([ parsed.data ])    // מכניס רק מה שבטבלה קיימות לו עמודות
      .select('id')
      .single()

    if (error) {
      return NextResponse.json(
        { ok: false, where: 'supabase', message: error.message, details: (error as any).details, hint: (error as any).hint, code: (error as any).code },
        { status: 400 }
      )
    }
    return NextResponse.json({ ok: true, id: data.id })
  } catch (e: any) {
    return NextResponse.json({ ok: false, where: 'catch', error: e?.message || String(e) }, { status: 400 })
  }
}
