// app/dashboard/leads/page.tsx
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Row = {
  created_at: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  utm_medium: string | null;   // חדש
  ad_group: string | null;     // חדש (מ-ut m_content)
  keyword: string | null;
  status: string | null;
};

export default async function LeadsDashboardPage() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY!;

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
  });

  // כאן הבעיה תוקנה: שני גנריקים: שם הטבלה + טיפוס הרשומה
  const { data, error } = await supabase
    .from<'leads_dashboard', Row>('leads_dashboard')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    return (
      <div style={{ padding: 16 }}>
        <h2>Leads Dashboard</h2>
        <p style={{ color: 'red' }}>Error loading leads: {error.message}</p>
      </div>
    );
  }

  const rows = data ?? [];

  return (
    <div style={{ padding: 16 }}>
      <h2>Leads Dashboard</h2>
      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            borderCollapse: 'collapse',
            width: '100%',
            minWidth: 1000,
          }}
        >
          <thead>
            <tr>
              <Th>תאריך יצירה</Th>
              <Th>שם מלא</Th>
              <Th>אימייל</Th>
              <Th>טלפון</Th>
              <Th>Source</Th>
              <Th>Campaign</Th>
              <Th>Medium</Th>      {/* חדש */}
              <Th>Ad Group</Th>    {/* חדש */}
              <Th>Keyword</Th>
              <Th>סטטוס</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <Td>{formatDate(r.created_at)}</Td>
                <Td>{r.full_name ?? ''}</Td>
                <Td>{r.email ?? ''}</Td>
                <Td>{r.phone ?? ''}</Td>
                <Td>{r.utm_source ?? ''}</Td>
                <Td>{r.utm_campaign ?? ''}</Td>
                <Td>{r.utm_medium ?? ''}</Td>
                <Td>{r.ad_group ?? ''}</Td>
                <Td>{r.keyword ?? ''}</Td>
                <Td>{r.status ?? ''}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        textAlign: 'right',
        borderBottom: '1px solid #e5e7eb',
        padding: '8px 12px',
        background: '#f9fafb',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td
      style={{
        borderBottom: '1px solid #f1f5f9',
        padding: '8px 12px',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </td>
  );
}

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString('he-IL');
  } catch {
    return iso;
  }
}
