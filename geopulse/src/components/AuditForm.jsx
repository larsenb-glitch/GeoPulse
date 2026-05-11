import { useState } from 'react'
import styles from './AuditForm.module.css'

export default function AuditForm({ onSubmit, error }) {
  const [form, setForm] = useState({
    name: '', city: '', state: '', industry: '', website: ''
  })

  function handleChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  }

  function handleSubmit() {
    if (!form.name || !form.city || !form.industry) return
    onSubmit(form)
  }

  const ready = form.name && form.city && form.industry

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>New audit</h2>
        <p className={styles.cardSub}>Enter a local business to analyze its AI search visibility</p>
      </div>

      <div className={styles.fields}>
        <div className={styles.fieldFull}>
          <label className={styles.label}>Business name</label>
          <input
            className={styles.input}
            name="name"
            value={form.name}
            onChange={handleChange}
            placeholder="e.g. Peak Physical Therapy"
          />
        </div>

        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label className={styles.label}>City</label>
            <input
              className={styles.input}
              name="city"
              value={form.city}
              onChange={handleChange}
              placeholder="e.g. Salt Lake City"
            />
          </div>
          <div className={styles.fieldSmall}>
            <label className={styles.label}>State</label>
            <input
              className={styles.input}
              name="state"
              value={form.state}
              onChange={handleChange}
              placeholder="UT"
              maxLength={2}
            />
          </div>
        </div>

        <div className={styles.fieldFull}>
          <label className={styles.label}>Industry / type</label>
          <input
            className={styles.input}
            name="industry"
            value={form.industry}
            onChange={handleChange}
            placeholder="e.g. hair salon, Italian restaurant, personal injury law"
          />
        </div>

        <div className={styles.fieldFull}>
          <label className={styles.label}>Website <span className={styles.optional}>(optional)</span></label>
          <input
            className={styles.input}
            name="website"
            value={form.website}
            onChange={handleChange}
            placeholder="https://example.com"
          />
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <button
        className={styles.btn}
        onClick={handleSubmit}
        disabled={!ready}
      >
        Run GEO Audit
        <span className={styles.arrow}>→</span>
      </button>
    </div>
  )
}
