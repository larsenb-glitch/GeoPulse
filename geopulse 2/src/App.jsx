import { useState } from 'react'
import AuditForm from './components/AuditForm.jsx'
import AuditResults from './components/AuditResults.jsx'
import styles from './App.module.css'

export default function App() {
  const [state, setState] = useState('idle')
  const [audit, setAudit] = useState(null)
  const [bizInfo, setBizInfo] = useState(null)
  const [loadingStep, setLoadingStep] = useState('')
  const [error, setError] = useState('')

  const steps = [
    'Pulling Google Places data...',
    'Identifying local competitors...',
    'Asking AI: "best [industry] in your city?"',
    'Asking AI: "would you recommend them?"',
    'Asking AI: "is [your business] any good?"',
    'Analyzing AI responses for mentions...',
    'Estimating revenue impact...',
    'Building your action playbook...',
    'Generating report-ready content...',
  ]

  async function handleSubmit(formData) {
    setBizInfo(formData)
    setState('loading')
    setError('')

    let si = 0
    setLoadingStep(steps[0])
    const iv = setInterval(() => {
      si = Math.min(si + 1, steps.length - 1)
      setLoadingStep(steps[si])
    }, 4500)

    try {
      const resp = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const data = await resp.json()
      clearInterval(iv)

      if (data.error) throw new Error(data.error)

      setAudit(data)
      setState('results')
    } catch (err) {
      clearInterval(iv)
      setError(err.message || 'Something went wrong. Please try again.')
      setState('error')
    }
  }

  function handleReset() {
    setState('idle')
    setAudit(null)
    setBizInfo(null)
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.logo}>
          Geo<span>Pulse</span>
        </div>
        <p className={styles.tagline}>AI visibility audits for local businesses</p>
      </header>

      <main className={styles.main}>
        {(state === 'idle' || state === 'error') && (
          <AuditForm onSubmit={handleSubmit} error={state === 'error' ? error : ''} />
        )}

        {state === 'loading' && (
          <div className={styles.loading}>
            <div className={styles.spinner} />
            <p className={styles.loadingTitle}>Running your GEO audit...</p>
            <p className={styles.loadingStep}>{loadingStep}</p>
            <p className={styles.loadingNote}>This takes about 20 seconds — we're running 3 real AI queries</p>
          </div>
        )}

        {state === 'results' && audit && (
          <AuditResults audit={audit} bizInfo={bizInfo} onReset={handleReset} />
        )}
      </main>
    </div>
  )
}
