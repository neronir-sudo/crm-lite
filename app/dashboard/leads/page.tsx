import { supabaseAdmin } from '@/lib/db'

// יצרנו "תעודת זהות" רשמית עבור כל ליד
// היא אומרת למערכת בדיוק אילו שדות קיימים ומה הסוג שלהם
interface Lead {
  id: string;
  created_at: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  status: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  keyword: string | null;
}

export default async function LeadsPage() {
  // כאן אנו אומרים ל-Supabase שאנחנו מצפים לקבל מערך של לידים שתואם לתעודת הזהות
  const { data: leads, error } = await supabaseAdmin
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })
    .returns<Lead[]>(); // This tells TypeScript what to expect

  if (error) {
    return <p>אירעה שגיאה בטעינת הלידים: {error.message}</p>
  }

  if (!leads || leads.length === 0) {
    return <p>עדיין אין לידים במערכת.</p>
  }

  return (
    <div style={{ padding: '20px', direction: 'rtl' }}>
      <h1>רשומת לידים</h1>
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
          {/* עכשיו אנחנו משתמשים בתעודת הזהות במקום ב-'any' */}
          {leads.map((lead: Lead) => (
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