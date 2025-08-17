import { Suspense } from 'react'
import WaRedirectClient from './WaRedirectClient' // נייבא רכיב חדש שניצור

// זהו העמוד הראשי. הוא מאוד פשוט.
// כל מה שהוא עושה זה להציג את ה"שלט" (Suspense)
// ובתוכו את הרכיב שבאמת עושה את העבודה.
export default function WaRedirectPage() {
  return (
    <Suspense fallback={<div style={{padding:20}}>טוען...</div>}>
      <WaRedirectClient />
    </Suspense>
  )
}