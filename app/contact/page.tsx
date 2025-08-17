'use client'

import { useState } from 'react'

export default function ContactPage() {
  // "קופסאות זיכרון" לשמירת המידע מהטופס
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  
  // "קופסאות זיכרון" לניהול תהליך השליחה
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  // זו הפונקציה שמופעלת כשלוחצים על כפתור השליחה
  const handleSubmit = async (e) => {
    e.preventDefault() // מונע מהדף להתרענן
    setLoading(true)
    setMessage('')

    try {
      // שלב 1: הולכים ל"מחסן" (LocalStorage) להביא את מידע ה-UTM
      const attribsRaw = localStorage.getItem('lead_attrib')
      const attribs = attribsRaw ? JSON.parse(attribsRaw).data : {}

      // שלב 2: אורזים את הכל לחבילה אחת
      const leadData = {
        full_name: fullName,
        phone: phone,
        ...attribs // מוסיפים את כל המידע מהמחסן
      }

      // שלב 3: שולחים את החבילה בדואר מהיר (fetch) ל-API שלנו
      const response = await fetch('/api/leads/web', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(leadData),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.message || 'אירעה שגיאה בשליחת הטופס')
      }

      // שלב 4: מעדכנים את המשתמש שהחבילה הגיעה
      setMessage('הליד נשלח בהצלחה! תודה רבה.')
      setFullName('')
      setPhone('')

    } catch (error) {
      setMessage('שגיאה: ' + (error as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: '500px', margin: '50px auto', padding: '20px', border: '1px solid #ccc', borderRadius: '8px' }}>
      <h1>טופס יצירת קשר</h1>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '15px' }}>
          <label htmlFor="fullName">שם מלא</label>
          <input
            type="text"
            id="fullName"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            style={{ width: '100%', padding: '8px', marginTop: '5px' }}
          />
        </div>
        <div style={{ marginBottom: '15px' }}>
          <label htmlFor="phone">טלפון</label>
          <input
            type="tel"
            id="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            style={{ width: '100%', padding: '8px', marginTop: '5px' }}
          />
        </div>
        <button type="submit" disabled={loading} style={{ width: '100%', padding: '10px', backgroundColor: '#0070f3', color: 'white', border: 'none', borderRadius: '5px' }}>
          {loading ? 'שולח...' : 'שלח ליד'}
        </button>
      </form>
      {message && <p style={{ marginTop: '20px', textAlign: 'center' }}>{message}</p>}
    </div>
  )
}