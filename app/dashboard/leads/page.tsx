// app/dashboard/leads/page.tsx
import { createClient } from '@supabase/supabase-js';

type LeadRow = {
  id: string;
  created_at: string;
  status: string | null;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  utm_medium: string | null;
  utm_term: string | null;
  utm_content: string | null;
  // נפילות-חסד לשמות ישנים אם קיימים בטבלה
  source?: string | null;
  campaign?: string | null;
  keyword?: string | null;
};

export default async function LeadsPage() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const sb = createClient(url, key);

  const { data, error } = await sb
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    return <pre style={{ direction: 'ltr', padding: 16 }}>Error: {JSON.stringify(error, null, 2)}</pre>;
  }

  const rows = (data ?? []) as LeadRow[];

  return (
    <div style={{ padding: 24, direction: 'rtl', fontFamily: 'sans-serif' }}>
      <h2>רשומת לידים</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f6f6f6' }}>
            <th style={th}>סטטוס</th>
            <th style={th}>(Keyword) מילות מפתח</th>
            <th style={th}>(Campaign) קמפיין</th>
            <th style={th}>(Source) מקור</th>
            <th style={th}>אימייל</th>
            <th style={th}>טלפון</th>
            <th style={th}>שם מלא</th>
            <th style={th}>תאריך יצירה</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const source   = r.utm_source   ?? r.source   ?? '';
            const campaign = r.utm_campaign ?? r.campaign ?? '';
            const keyword  = r.utm_term     ?? r.keyword  ?? '';
            return (
              <tr key={r.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={td}>{r.status ?? 'new'}</td>
                <td style={td}>{keyword}</td>
                <td style={td}>{campaign}</td>
                <td style={td}>{source}</td>
                <td style={td}>{r.email ?? ''}</td>
                <td style={td}>{r.phone ?? ''}</td>
                <td style={td}>{r.full_name ?? ''}</td>
                <td style={td}>{new Date(r.created_at).toLocaleString('he-IL')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: 'right',
  padding: '8px 10px',
  borderBottom: '1px solid #ddd',
  whiteSpace: 'nowrap',
};

const td: React.CSSProperties = {
  textAlign: 'right',
  padding: '8px 10px',
  whiteSpace: 'nowrap',
};
