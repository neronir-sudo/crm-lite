'use client'
import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

// זהו כל הקוד הלוגי שהיה לנו קודם, אבל עכשיו הוא ברכיב נפרד.
// מכיוון שהוא משתמש ב-useSearchParams, הוא חייב להיות 'use client'.

interface StoredLeadAttrib {
  data: Record<string, string>;
  ts?: number;
}

function uuidv4() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((globalThis as any).crypto?.randomUUID) return (globalThis as any).crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8); return v.toString(16)
  })
}

export default function WaRedirectClient() {
  const sp = useSearchParams()
  useEffect(() => {
    const target = sp.get('r')
    if (!target) return
    const keys = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid','ttclid','wbraid','gbraid','campaign_id','adgroup_id','ad_id','creative_id','placement','device','platform','keyword','client_uid']
    try {
      const storeKey = 'lead_attrib'
      const existing = localStorage.getItem(storeKey)
      const parsed: StoredLeadAttrib = existing ? JSON.parse(existing) : { data: {} }
      const data: Record<string,string> = { ...parsed.data }
      data.client_uid = sp.get('client_uid') || data.client_uid || uuidv4()
      for (const k of keys) { 
        const v = sp.get(k); 
        if (v) data[k] = v 
      }
      localStorage.setItem(storeKey, JSON.stringify({ data, ts: Date.now() }))
    } catch {}
    window.location.href = decodeURIComponent(target)
  }, [sp])
  return <div style={{padding:20}}>מעביר לוואטסאפ…</div>
}