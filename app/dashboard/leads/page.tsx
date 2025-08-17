// crm-lite/app/dashboard/leads/page.tsx

import { supabaseAdmin } from '../../../lib/db'

export default async function LeadsPage() {
  // שלב א: בקשת הנתונים ממסד הנתונים
  const { data: leads, error } = await supabaseAdmin
    .from('leads') // לך לטבלה 'leads'
    .select('*') // תביא את כל העמודות
    .order('created_at', { ascending: false }); // תמיין אותם מהחדש לישן

  // אם יש שגיאה בקבלת הנתונים, הצג הודעה
  if (error) {
    return <p>אירעה שגיאה בטעינת הלידים: {error.message}</p>
  }

  // אם אין לידים, הצג הודעה מתאימה
  if (!leads || leads.length === 0) {
    return <p>עדיין אין לידים במערכת.</p>
  }

  // שלב ב: הצגת הנתונים בטבלה
  return (
    <div style={{ padding: '20px', direction: 'rtl' }}>
      <h1>רשימת לידים</h1>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '20px' }}>
        <thead>
          <tr style={{ backgroundColor: '#f2f2f2' }}>
            <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'right' }}>תאריך יצירה</th>
            <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'right' }}>שם מלא</th>
            <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'right' }}>טלפון</th>
            <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'right' }}>סטטוס</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr key={lead.id}>
              <td style={{ padding: '8px', border: '1px solid #ddd' }}>
                {new Date(lead.created_at).toLocaleString('he-IL')}
              </td>
              <td style={{ padding: '8px', border: '1px solid #ddd' }}>{lead.full_name}</td>
              <td style={{ padding: '8px', border: '1px solid #ddd' }}>{lead.phone}</td>
              <td style={{ padding: '8px', border: '1px solid #ddd' }}>{lead.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// הגדרה זו גורמת לעמוד להתעדכן כל פעם שנכנסים אליו
export const revalidate = 0;