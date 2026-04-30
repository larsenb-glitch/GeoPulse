import { useState } from 'react'
import styles from './AuditResults.module.css'

function scoreColor(s) {
  if (s >= 70) return 'var(--teal-500)'
  if (s >= 45) return '#EF9F27'
  return '#E24B4A'
}

function scoreLabel(s) {
  if (s >= 70) return 'Strong'
  if (s >= 45) return 'Moderate'
  return 'Weak'
}

function CopyableField({ label, value, multiline = false }) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(value || '')
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className={styles.copyField}>
      <div className={styles.copyFieldHeader}>
        <span className={styles.copyFieldLabel}>{label}</span>
        <button className={styles.copyBtn} onClick={copy}>
          {copied ? '✓ Copied' : '📋 Copy'}
        </button>
      </div>
      <div className={multiline ? styles.copyFieldValueMulti : styles.copyFieldValue}>{value}</div>
    </div>
  )
}

export default function AuditResults({ audit, bizInfo, onReset }) {
  const maxPct = Math.max(...(audit.sources || []).map(s => s.pct), 1)

  return (
    <div className={styles.results}>
      <div className={styles.topBar}>
        <div>
          <h2 className={styles.bizName}>{bizInfo.name}</h2>
          <p className={styles.bizSub}>{bizInfo.city}{bizInfo.state ? `, ${bizInfo.state}` : ''} · {bizInfo.industry}</p>
        </div>
        <button className={styles.resetBtn} onClick={onReset}>← New audit</button>
      </div>

      {/* Executive summary - new */}
      {audit.executiveSummary && (
        <div className={styles.execSummary}>
          <div className={styles.execLabel}>Executive Summary</div>
          <p className={styles.execText}>{audit.executiveSummary}</p>
        </div>
      )}

      {/* Score cards */}
      <div className={styles.scoreGrid}>
        <div className={styles.scoreCardPrimary}>
          <div className={styles.scoreCardLabel}>AI overall score</div>
          <div className={styles.scoreCardNumLarge}>{audit.overallScore}<span>/100</span></div>
          <div className={styles.scoreCardTag} style={{ color: scoreColor(audit.overallScore) }}>
            {scoreLabel(audit.overallScore)}
          </div>
        </div>
        {[
          { label: 'Visibility', val: audit.visibility, suffix: `${audit._meta?.mentionsCount || 0}/${audit._meta?.totalQueries || 0} queries` },
          { label: 'Accuracy', val: audit.accuracy },
          { label: 'Sentiment', val: audit.sentiment },
        ].map(c => (
          <div key={c.label} className={styles.scoreCard}>
            <div className={styles.scoreCardLabel}>{c.label}</div>
            <div className={styles.scoreCardNum} style={{ color: scoreColor(c.val) }}>
              {c.val}<span>/100</span>
            </div>
            {c.suffix && <div className={styles.scoreSuffix}>{c.suffix}</div>}
            <div className={styles.scoreBar}>
              <div className={styles.scoreBarFill} style={{ width: `${c.val}%`, background: scoreColor(c.val) }} />
            </div>
          </div>
        ))}
      </div>

      {/* Revenue impact - new */}
      {audit.revenueImpact && (
        <div className={styles.revenuePanel}>
          <div className={styles.revenueHeader}>
            <div>
              <div className={styles.revenueLabel}>💰 Estimated revenue impact</div>
              <div className={styles.revenueAmount}>{audit.revenueImpact.estimate}<span>/month lost</span></div>
            </div>
          </div>
          <p className={styles.revenueExplanation}>{audit.revenueImpact.explanation}</p>
        </div>
      )}

      {/* AI Query Results */}
      {audit.aiQueries && audit.aiQueries.length > 0 && (
        <Section label="🔍 What AI actually said when we asked">
          <div className={styles.queriesContainer}>
            {audit.aiQueries.map((q, i) => (
              <QueryCard key={i} query={q} businessName={bizInfo.name} keyQuote={audit.keyQuotes?.[i]} />
            ))}
          </div>
        </Section>
      )}

      {/* Insights */}
      <Section label="Key insights">
        <div className={styles.insightsCard}>
          {(audit.insights || []).map((ins, i) => (
            <div key={i} className={styles.insightRow}>
              <div className={`${styles.insightDot} ${styles['dot_' + ins.type]}`} />
              <p className={styles.insightText}>{ins.text}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Sources + Competitors */}
      <Section label="Sources & competitors">
        <div className={styles.twoCol}>
          <div className={styles.panel}>
            <h3 className={styles.panelTitle}>Where AI gets its info</h3>
            {(audit.sources || []).map((s, i) => (
              <div key={i} className={styles.sourceRow}>
                <span className={styles.sourceName}>{s.name}</span>
                <div className={styles.barTrack}>
                  <div className={styles.barFill} style={{ width: `${Math.round(s.pct / maxPct * 100)}%` }} />
                </div>
                <span className={styles.sourcePct}>{s.pct}%</span>
              </div>
            ))}
          </div>
          <div className={styles.panel}>
            <h3 className={styles.panelTitle}>Competitors mentioned by AI</h3>
            {(audit.competitors || []).length > 0 ? (
              audit.competitors.map((c, i) => (
                <div key={i} className={styles.compRow}>
                  <span className={styles.compName}>{c.name}</span>
                  <span className={styles.compBadge}>{c.mentions}x</span>
                </div>
              ))
            ) : (
              <div className={styles.emptyState}>No competitors detected in AI responses</div>
            )}
          </div>
        </div>
      </Section>

      {/* Playbook */}
      <Section label="Action playbook">
        <div className={styles.playbookGrid}>
          <PlaybookCell title="Quick wins" subtitle="High impact · Easy" chipClass={styles.chipGreen} items={audit.playbook?.quickWins} />
          <PlaybookCell title="Strategic investments" subtitle="High impact · More effort" chipClass={styles.chipAmber} items={audit.playbook?.strategic} />
          <PlaybookCell title="Easy extras" subtitle="Low impact · Easy" chipClass={styles.chipBlue} items={audit.playbook?.easyExtras} />
          <PlaybookCell title="Deprioritize" subtitle="Low impact · More effort" chipClass={styles.chipGray} items={audit.playbook?.deprioritize} />
        </div>
      </Section>

      {/* === REPORT-READY EXPORT SECTION === */}
      <Section label="📄 Report-ready content (for client PDF)">
        <div className={styles.exportPanel}>
          <p className={styles.exportIntro}>
            Polished content for your printed client report. Click any field to copy.
          </p>

          {audit.reportInsights && (
            <div className={styles.exportGroup}>
              <div className={styles.exportGroupLabel}>Polished insights for report</div>
              {audit.reportInsights.map((ins, i) => (
                <CopyableField
                  key={i}
                  label={`INSIGHT_${i + 1}`}
                  value={ins.text}
                  multiline
                />
              ))}
            </div>
          )}

          {audit.outreachSubject && (
            <div className={styles.exportGroup}>
              <div className={styles.exportGroupLabel}>Outreach email subject line</div>
              <CopyableField label="SUBJECT" value={audit.outreachSubject} />
            </div>
          )}
        </div>
      </Section>
    </div>
  )
}

function QueryCard({ query, businessName, keyQuote }) {
  const [expanded, setExpanded] = useState(false)
  const preview = query.response.slice(0, 240)
  const showMore = query.response.length > 240

  const highlightText = (text) => {
    let result = text
    const bizRegex = new RegExp(`(${businessName.split(' ')[0]}[\\w\\s&]*)`, 'gi')
    result = result.replace(bizRegex, '<mark class="biz-mark">$1</mark>')
    query.competitorsMentioned.forEach(comp => {
      const compRegex = new RegExp(`(${comp.split(' ')[0]}[\\w\\s&]*)`, 'gi')
      result = result.replace(compRegex, '<mark class="comp-mark">$1</mark>')
    })
    return result
  }

  return (
    <div className={styles.queryCard}>
      <div className={styles.queryHeader}>
        <div className={styles.queryText}>"{query.query}"</div>
        <div className={`${styles.queryBadge} ${query.mentioned ? styles.badgeYes : styles.badgeNo}`}>
          {query.mentioned ? `✓ Mentioned` : '✗ Not mentioned'}
        </div>
      </div>

      {keyQuote && (
        <div className={styles.keyQuote}>
          <span className={styles.keyQuoteLabel}>Key takeaway:</span> "{keyQuote}"
        </div>
      )}

      <div
        className={styles.queryResponse}
        dangerouslySetInnerHTML={{ __html: highlightText(expanded ? query.response : preview) + (showMore && !expanded ? '...' : '') }}
      />
      {showMore && (
        <button className={styles.expandBtn} onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Show less' : 'Show full response'}
        </button>
      )}
      {query.competitorsMentioned.length > 0 && (
        <div className={styles.queryFooter}>
          <span className={styles.queryFooterLabel}>Competitors that AI mentioned instead:</span>
          {query.competitorsMentioned.map((c, i) => (
            <span key={i} className={styles.compTag}>{c}</span>
          ))}
        </div>
      )}
    </div>
  )
}

function Section({ label, children }) {
  return (
    <div style={{ marginBottom: '2rem' }}>
      <p style={{ fontFamily: 'Syne, sans-serif', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '12px' }}>
        {label}
      </p>
      {children}
    </div>
  )
}

function PlaybookCell({ title, subtitle, chipClass, items = [] }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.25rem' }}>
      <p style={{ fontFamily: 'Syne, sans-serif', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '2px' }}>{title}</p>
      <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '12px' }}>{subtitle}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {items.map((a, i) => <span key={i} className={chipClass}>{a}</span>)}
      </div>
    </div>
  )
}
