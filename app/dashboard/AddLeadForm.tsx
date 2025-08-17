async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
  e.preventDefault()
  setMsg('')
  setLoading(true)
  const form = new FormData(e.currentTarget)

  // קורא UTM/UID שנשמרו ע"י הסקריפט
  let attrib: any = {}
  try {
    const j = localStorage.getItem('lead_attrib')
    if (j) attrib = JSON.parse(j).data || {}
  } catch {}

  // גוף הבקשה = שדות הטופס + האטריביושן שנשמר
  const body = {
    ...attrib,
    full_name: String(form.get('full_name') || ''),
    phone: String(form.get('phone') || ''),
    utm_source: String(form.get('utm_source') || attrib.utm_source || ''),
    utm_term: String(form.get('utm_term') || attrib.utm_term || '')
  }

  try {
    const res = await fetch('/api/leads/web', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'failed')
    setMsg(`נוסף בהצלחה (id: ${json.id})`)
    setTimeout(() => window.location.reload(), 600)
  } catch (err:any) {
    setMsg('שגיאה: ' + (err.message || String(err)))
  } finally {
    setLoading(false)
  }
}
