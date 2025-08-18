// crm-lite/app/dashboard/leads/page.tsx

import { supabaseAdmin } from '@/lib/db'

export default async function LeadsPage() {
  const { data: leads, error } = await supabaseAdmin
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return <p>אירעה שגיאה בטעינת הלידים: {error.message}</p>
  }

  if (!leads || leads.length === 0) {
    return <p>עדיין אין לידים במערכת.</p>
  }

  return (
    <div style={{ padding: '20px', direction: 'rtl' }}>
      <h1>רשימת לידים</h1>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '20px', tableLayout: 'fixed' }}>
        <thead>
          <tr style={{ backgroundColor: '#f2f2f2' }}>
            <th style={{ width: '15%', padding: '8px', border: '1px solid #ddd', textAlign: 'right' }}>תאריך יצירה</th>
            <th style={{ width: '15%', padding: '8px', border: '1px solid #ddd', textAlign: 'right' }}>שם מלא</th>
            <th style={{ width: '10%', padding: '8px', border: '1px solid #ddd', textAlign: 'right' }}>טלפון</th>
            <th style={{ width: '15%', padding: '8px', border: '1px solid #ddd', textAlign: 'right' }}>אימייל</th>
            <th style={{ width: '10%', padding: '8px', border: '1px solid #ddd', textAlign: 'right' }}>מקור (Source)</th>
            <th style={{ width: '15%', padding: '8px', border: '1px solid #ddd', textAlign: 'right' }}>קמפיין (Campaign)</th>
            <th style={{ width: '15%', padding: '8px', border: '1px solid #ddd', textAlign: 'right' }}>מילת מפתח (Keyword)</th>
            <th style={{ width: '5%', padding: '8px', border: '1px solid #ddd', textAlign: 'right' }}>סטטוס</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead: any) => ( // Using any here for simplicity in this display component
            <tr key={lead.id}>
              <td style={{ padding: '8px', border: '1px solid #ddd', wordWrap: 'break-word' }}>
                {new Date(lead.created_at).toLocaleString('he-IL')}
              </td>
              <td style={{ padding: '8px', border: '1px solid #ddd', wordWrap: 'break-word' }}>{lead.full_name}</td>
              <td style={{ padding: '8px', border: '1px solid #ddd', wordWrap: 'break-word' }}>{lead.phone}</td>
              <td style={{ padding: '8px', border: '1px solid #ddd', wordWrap: 'break-word' }}>{lead.email}</td>
              <td style={{ padding: '8px', border: '1px solid #ddd', wordWrap: 'break-word' }}>{lead.utm_source}</td>
              <td style={{ padding: '8px', border: '1px solid #ddd', wordWrap: 'break-word' }}>{lead.utm_campaign}</td>
              <td style={{ padding: '8px', border: '1px solid #ddd', wordWrap: 'break-word' }}>{lead.keyword}</td>
              <td style={{ padding: '8px', border: '1px solid #ddd', wordWrap: 'break-word' }}>{lead.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export const revalidate = 0;