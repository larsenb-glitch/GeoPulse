// Generates a fully-prefilled HTML report from audit data
// Opens in a new tab, ready to print to PDF

const REPORT_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --teal: #1D9E75; --teal-dark: #0F6E56; --teal-darkest: #04342C;
    --teal-50: #E1F5EE; --teal-100: #9FE1CB;
    --amber: #EF9F27; --amber-50: #FAEEDA; --amber-text: #854F0B;
    --red: #E24B4A; --red-50: #FCEBEB; --red-text: #A32D2D;
    --bg: #FAF8F4; --paper: #FFFFFF;
    --ink: #1A1A1A; --ink-light: #555; --ink-muted: #999;
    --border: #E5E1D8;
  }
  html, body { background: var(--bg); color: var(--ink); font-family: 'Inter', sans-serif; line-height: 1.5; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { width: 8.5in; min-height: 11in; margin: 20px auto; padding: 0.6in 0.7in; background: var(--paper); box-shadow: 0 4px 24px rgba(0,0,0,0.06); page-break-after: always; }
  .page:last-child { page-break-after: auto; }

  .cover { display: flex; flex-direction: column; justify-content: space-between; min-height: 9.8in; }
  .cover-top { padding-top: 0.4in; }
  .logo { font-family: 'Syne', sans-serif; font-size: 22px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 0.6in; }
  .logo span { color: var(--teal); }
  .cover-eyebrow { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 2px; color: var(--teal); margin-bottom: 14px; }
  .cover-title { font-family: 'Syne', sans-serif; font-size: 56px; font-weight: 800; line-height: 1.05; letter-spacing: -1.5px; margin-bottom: 24px; }
  .cover-sub { font-size: 18px; color: var(--ink-light); line-height: 1.5; max-width: 5.5in; margin-bottom: 0.5in; }
  .cover-business-card { background: var(--teal-darkest); color: white; padding: 32px 36px; border-radius: 14px; }
  .cover-business-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px; color: var(--teal-100); margin-bottom: 6px; }
  .cover-business-name { font-family: 'Syne', sans-serif; font-size: 32px; font-weight: 700; margin-bottom: 4px; letter-spacing: -0.5px; }
  .cover-business-meta { font-size: 14px; color: var(--teal-100); }
  .cover-bottom { display: flex; justify-content: space-between; align-items: flex-end; padding-top: 32px; border-top: 1px solid var(--border); font-size: 12px; color: var(--ink-muted); }
  .cover-bottom strong { color: var(--ink); font-weight: 600; }

  .section-eyebrow { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: var(--teal); margin-bottom: 6px; }
  .section-title { font-family: 'Syne', sans-serif; font-size: 30px; font-weight: 800; line-height: 1.15; letter-spacing: -0.5px; margin-bottom: 8px; }
  .section-sub { font-size: 14px; color: var(--ink-light); margin-bottom: 24px; max-width: 6in; }

  .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 24px; }
  .stat-card { background: var(--bg); border: 1px solid var(--border); border-radius: 12px; padding: 22px; }
  .stat-card.featured { background: var(--teal-darkest); color: white; border-color: var(--teal-darkest); }
  .stat-card.featured .stat-num { color: white; }
  .stat-card.featured .stat-label { color: var(--teal-100); }
  .stat-card.featured .stat-source { color: var(--teal-100); opacity: 0.7; }
  .stat-num { font-family: 'Syne', sans-serif; font-size: 44px; font-weight: 800; line-height: 1; color: var(--ink); margin-bottom: 8px; letter-spacing: -1.5px; }
  .stat-label { font-size: 13px; color: var(--ink-light); line-height: 1.45; margin-bottom: 10px; }
  .stat-source { font-size: 10px; color: var(--ink-muted); text-transform: uppercase; letter-spacing: 0.5px; }
  .quote-block { background: var(--teal-50); border-left: 4px solid var(--teal); padding: 20px 24px; border-radius: 0 12px 12px 0; margin: 28px 0; font-size: 15px; line-height: 1.55; color: var(--ink); }
  .quote-block strong { color: var(--teal-dark); }

  .exec-summary { background: linear-gradient(135deg, var(--teal-darkest), #0a4937); color: white; border-radius: 14px; padding: 26px 30px; margin-bottom: 24px; }
  .exec-label { font-family: 'Syne', sans-serif; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: var(--teal-100); margin-bottom: 10px; }
  .exec-text { font-size: 15px; line-height: 1.6; color: white; }

  .score-row { display: grid; grid-template-columns: 1.4fr 1fr 1fr 1fr; gap: 10px; margin-bottom: 24px; }
  .score-card { background: var(--bg); border: 1px solid var(--border); border-radius: 12px; padding: 18px 16px; }
  .score-card.primary { background: var(--teal-darkest); border-color: var(--teal-darkest); }
  .score-card-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: var(--ink-muted); margin-bottom: 8px; }
  .score-card.primary .score-card-label { color: var(--teal-100); }
  .score-card-num { font-family: 'Syne', sans-serif; font-size: 38px; font-weight: 800; line-height: 1; margin-bottom: 4px; letter-spacing: -1px; }
  .score-card-num span { font-size: 16px; color: var(--ink-muted); font-weight: 400; }
  .score-card.primary .score-card-num { color: white; }
  .score-card.primary .score-card-num span { color: var(--teal-100); }
  .score-card-tag { font-size: 11px; font-weight: 600; margin-top: 4px; }
  .score-card-sub { font-size: 10px; color: var(--ink-muted); margin-top: 2px; }
  .score-bar { height: 4px; background: var(--border); border-radius: 99px; overflow: hidden; margin-top: 8px; }
  .score-bar-fill { height: 100%; border-radius: 99px; }

  .revenue-panel { background: var(--bg); border: 1px solid var(--amber); border-left-width: 4px; border-radius: 12px; padding: 20px 24px; margin-bottom: 28px; }
  .revenue-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: var(--amber-text); margin-bottom: 4px; }
  .revenue-amount { font-family: 'Syne', sans-serif; font-size: 30px; font-weight: 800; color: var(--ink); line-height: 1.1; margin-bottom: 6px; letter-spacing: -0.5px; }
  .revenue-amount span { font-size: 13px; font-weight: 500; color: var(--ink-muted); margin-left: 6px; }
  .revenue-explanation { font-size: 13px; line-height: 1.55; color: var(--ink-light); margin-bottom: 8px; }
  .revenue-calc { font-size: 11px; color: var(--ink-muted); font-style: italic; padding-top: 8px; border-top: 1px dashed var(--border); margin-top: 8px; }

  .query-card { background: var(--bg); border: 1px solid var(--border); border-radius: 12px; padding: 18px 22px; margin-bottom: 12px; page-break-inside: avoid; }
  .query-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 10px; }
  .query-text { font-size: 13px; font-style: italic; color: var(--ink); line-height: 1.4; }
  .query-badge { font-size: 10px; font-weight: 700; padding: 4px 10px; border-radius: 99px; white-space: nowrap; text-transform: uppercase; letter-spacing: 0.5px; }
  .badge-yes { background: var(--teal-50); color: var(--teal-dark); }
  .badge-no { background: var(--red-50); color: var(--red-text); }
  .key-takeaway { background: rgba(239, 159, 39, 0.1); border-left: 2px solid var(--amber); padding: 8px 12px; margin-bottom: 10px; font-size: 12px; line-height: 1.5; color: var(--amber-text); font-style: italic; border-radius: 0 6px 6px 0; }
  .key-takeaway-label { font-style: normal; font-weight: 700; text-transform: uppercase; font-size: 9px; letter-spacing: 0.5px; color: var(--ink-muted); display: block; margin-bottom: 2px; }
  .query-response { font-size: 12px; line-height: 1.6; color: var(--ink-light); padding: 12px 14px; background: white; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 10px; }
  .query-response mark.biz { background: var(--teal-50); color: var(--teal-dark); padding: 0 4px; border-radius: 3px; font-weight: 600; }
  .query-response mark.comp { background: var(--amber-50); color: var(--amber-text); padding: 0 4px; border-radius: 3px; font-weight: 600; }
  .query-footer { font-size: 11px; color: var(--ink-muted); }
  .query-footer strong { color: var(--ink); }

  .insights-list { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; margin-bottom: 24px; page-break-inside: avoid; break-inside: avoid; }
  .insight-row { display: flex; gap: 14px; padding: 16px 20px; border-bottom: 1px solid var(--border); align-items: flex-start; }
  .insight-row:last-child { border-bottom: none; }
  .insight-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; margin-top: 6px; }
  .dot-positive { background: var(--teal); }
  .dot-warning { background: var(--amber); }
  .dot-negative { background: var(--red); }
  .insight-text { font-size: 13.5px; line-height: 1.55; color: var(--ink); }

  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
  .panel { background: var(--bg); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
  .panel-title { font-family: 'Syne', sans-serif; font-size: 14px; font-weight: 700; margin-bottom: 4px; }
  .panel-sub { font-size: 11px; color: var(--ink-muted); margin-bottom: 12px; }
  .source-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
  .source-chip { background: white; border: 1px solid var(--border); color: var(--ink); font-size: 11.5px; padding: 4px 10px; border-radius: 99px; font-weight: 500; }
  .comp-row { display: flex; align-items: center; justify-content: space-between; padding: 7px 0; border-bottom: 1px solid var(--border); font-size: 12.5px; }
  .comp-row:last-child { border-bottom: none; }
  .comp-name { font-weight: 500; }
  .comp-badge { background: var(--amber-50); color: var(--amber-text); font-size: 10px; font-weight: 700; padding: 3px 9px; border-radius: 99px; }

  .fix-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
  .fix-cell { background: var(--bg); border: 1px solid var(--border); border-radius: 12px; padding: 14px 18px; page-break-inside: avoid; break-inside: avoid; }
  .fix-cell-icon { font-size: 20px; margin-bottom: 6px; }
  .fix-cell-title { font-family: 'Syne', sans-serif; font-size: 13px; font-weight: 700; margin-bottom: 5px; color: var(--ink); }
  .fix-cell-text { font-size: 11.5px; color: var(--ink-light); line-height: 1.5; }

  .cta-page { display: flex; flex-direction: column; justify-content: space-between; min-height: 9.8in; }
  .cta-hero { background: var(--teal-darkest); color: white; border-radius: 16px; padding: 60px 48px; text-align: center; margin: 60px 0; }
  .cta-hero-title { font-family: 'Syne', sans-serif; font-size: 42px; font-weight: 800; letter-spacing: -1px; margin-bottom: 18px; line-height: 1.1; }
  .cta-hero-sub { font-size: 16px; color: var(--teal-100); line-height: 1.5; margin-bottom: 36px; max-width: 5in; margin-left: auto; margin-right: auto; }
  .cta-package-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 32px; max-width: 6.5in; margin-left: auto; margin-right: auto; }
  .cta-pkg-desc { font-size: 12px; color: var(--ink-muted); line-height: 1.5; margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px solid var(--border); }
  .cta-pkg-footer { font-size: 10px; color: var(--ink-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--border); text-align: center; }
  .cta-package { background: var(--bg); border: 1px solid var(--border); border-radius: 12px; padding: 22px; text-align: left; }
  .cta-package.featured { border-color: var(--teal); border-width: 2px; background: white; }
  .cta-pkg-name { font-family: 'Syne', sans-serif; font-size: 15px; font-weight: 700; margin-bottom: 4px; }
  .cta-pkg-price { font-family: 'Syne', sans-serif; font-size: 28px; font-weight: 800; color: var(--teal); margin-bottom: 12px; letter-spacing: -0.5px; }
  .cta-pkg-price span { font-size: 12px; color: var(--ink-muted); font-weight: 500; }
  .cta-pkg-list { list-style: none; font-size: 12px; color: var(--ink-light); line-height: 1.7; }
  .cta-pkg-list li::before { content: "✓ "; color: var(--teal); font-weight: 700; }
  .cta-contact { text-align: center; padding: 24px 0; font-size: 14px; color: var(--ink-light); }
  .cta-contact strong { color: var(--ink); font-weight: 600; }
  .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid var(--border); font-size: 10px; color: var(--ink-muted); text-align: center; }

  @media print {
    body { background: white; }
    .page { margin: 0; box-shadow: none; width: 100%; min-height: auto; padding: 0.5in 0.6in; }
    .no-print { display: none; }
  }

  .print-bar { position: fixed; top: 0; left: 0; right: 0; background: #1A1A1A; color: white; padding: 12px 16px; text-align: center; font-size: 13px; z-index: 1000; font-family: 'Inter', sans-serif; box-shadow: 0 2px 12px rgba(0,0,0,0.2); }
  .print-bar button { background: var(--teal); color: white; border: none; padding: 8px 18px; border-radius: 6px; margin-left: 12px; cursor: pointer; font-size: 13px; font-weight: 600; font-family: inherit; }
  .print-bar button:hover { background: var(--teal-dark); }
`;

function scoreLabel(s) {
  if (s == null) return '—';
  if (s >= 70) return 'Strong';
  if (s >= 45) return 'Moderate';
  return 'Weak';
}

function escapeHtml(text) {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function highlightInResponse(text, businessName, competitors) {
  if (!text) return '';
  let result = escapeHtml(text);

  const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Build list of phrases to highlight, longest first so partial matches don't preempt longer ones
  const bizPhrases = [businessName];
  // Also add variants — "Noir Studios Salon" → also try "Noir Studios"
  const bizWords = businessName.split(' ').filter(w => w.length > 2);
  if (bizWords.length >= 2) {
    bizPhrases.push(bizWords.slice(0, 2).join(' '));
    bizPhrases.push(bizWords[0]);
  } else if (bizWords[0]) {
    bizPhrases.push(bizWords[0]);
  }

  const compPhrases = [];
  (competitors || []).forEach(comp => {
    compPhrases.push(comp);
    const compWords = comp.split(' ').filter(w => w.length > 2);
    if (compWords.length >= 2) {
      compPhrases.push(compWords.slice(0, 2).join(' '));
    }
    if (compWords[0]) compPhrases.push(compWords[0]);
  });

  // Deduplicate and sort by length descending (longer phrases first to prevent partial overwrites)
  const uniqueBiz = [...new Set(bizPhrases)].sort((a, b) => b.length - a.length);
  const uniqueComp = [...new Set(compPhrases)].sort((a, b) => b.length - a.length);

  // Use a placeholder system so we don't double-wrap or interfere with each other
  const placeholders = [];
  const PLACEHOLDER = (i) => `\x00HL${i}\x00`;

  // Match using word boundaries so "king" doesn't match inside "taking"
  uniqueBiz.forEach(phrase => {
    if (phrase.length < 3) return;
    const regex = new RegExp(`\\b(${escapeRegex(phrase)})\\b`, 'gi');
    result = result.replace(regex, (match) => {
      placeholders.push(`<mark class="biz">${match}</mark>`);
      return PLACEHOLDER(placeholders.length - 1);
    });
  });

  uniqueComp.forEach(phrase => {
    if (phrase.length < 3) return;
    const regex = new RegExp(`\\b(${escapeRegex(phrase)})\\b`, 'gi');
    result = result.replace(regex, (match) => {
      // Don't highlight if this match is inside a placeholder we already made
      placeholders.push(`<mark class="comp">${match}</mark>`);
      return PLACEHOLDER(placeholders.length - 1);
    });
  });

  // Restore placeholders
  placeholders.forEach((html, i) => {
    result = result.replace(PLACEHOLDER(i), html);
  });

  return result;
}

export function generatePDFReport(audit, bizInfo, contact = {}) {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const insights = audit.reportInsights || audit.insights || [];
  const queries = audit.aiQueries || [];
  const competitors = audit.competitors || [];
  const sources = audit.sources || [];
  const playbook = audit.playbook || {};

  const insightHTML = insights.slice(0, 4).map(i => `
    <div class="insight-row">
      <div class="insight-dot dot-${i.type || 'positive'}"></div>
      <div class="insight-text">${escapeHtml(i.text)}</div>
    </div>
  `).join('');

  const queryHTML = queries.slice(0, 3).map((q, i) => {
    const compsMentioned = q.competitorsMentioned || [];
    const takeaway = audit.keyQuotes?.[i]?.quote || '';
    return `
      <div class="query-card">
        <div class="query-header">
          <div class="query-text">"${escapeHtml(q.query)}"</div>
          <div class="query-badge ${q.mentioned ? 'badge-yes' : 'badge-no'}">
            ${q.mentioned ? '✓ Mentioned' : '✗ Not mentioned'}
          </div>
        </div>
        ${takeaway ? `
          <div class="key-takeaway">
            <span class="key-takeaway-label">Key takeaway</span>
            "${escapeHtml(takeaway)}"
          </div>
        ` : ''}
        <div class="query-response">${highlightInResponse(q.response, bizInfo.name, compsMentioned)}</div>
        ${compsMentioned.length > 0 ? `
          <div class="query-footer">
            <strong>Competitors AI mentioned:</strong> ${compsMentioned.map(escapeHtml).join(', ')}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  const sourceChipsHTML = sources.slice(0, 6).map(s =>
    `<span class="source-chip">${escapeHtml(s.name)}</span>`
  ).join('');

  const compRowsHTML = competitors.slice(0, 5).map(c => `
    <div class="comp-row">
      <span class="comp-name">${escapeHtml(c.name)}</span>
      <span class="comp-badge">${c.mentions}×</span>
    </div>
  `).join('');

  const chipList = (items, cls) => (items || []).map(a =>
    `<span class="chip ${cls}">${escapeHtml(a)}</span>`
  ).join('');

  const review = audit._meta?.businessData;
  const overallScore = audit.overallScore || 0;
  const visibility = audit.visibility || 0;
  const sentiment = audit.sentiment;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>GeoPulse — ${escapeHtml(bizInfo.name)} AI Visibility Report</title>
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@500;700;800&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>${REPORT_CSS}</style>
</head>
<body>

<div class="print-bar no-print">
  📄 ${escapeHtml(bizInfo.name)} — GEO Audit Report
  <button onclick="window.print()">🖨️ Print to PDF</button>
</div>

<!-- PAGE 1: COVER -->
<div class="page cover">
  <div class="cover-top">
    <div class="logo">Geo<span>Pulse</span></div>
    <div class="cover-eyebrow">AI Visibility Audit</div>
    <h1 class="cover-title">How AI sees ${escapeHtml(bizInfo.name)} in ${escapeHtml(bizInfo.city)}.</h1>
    <p class="cover-sub">A custom report on how ChatGPT, Claude, and other AI search engines describe your business — and what your competitors are getting that you aren't.</p>
  </div>
  <div class="cover-business-card">
    <div class="cover-business-label">Prepared for</div>
    <div class="cover-business-name">${escapeHtml(bizInfo.name)}</div>
    <div class="cover-business-meta">${escapeHtml(bizInfo.industry)} · ${escapeHtml(bizInfo.city)}${bizInfo.state ? ', ' + escapeHtml(bizInfo.state) : ''}</div>
  </div>
  <div class="cover-bottom">
    <div>Prepared by <strong>${escapeHtml(contact.name || 'Larsen B.')}</strong></div>
    <div>${today}</div>
  </div>
</div>

<!-- PAGE 2: WHY GEO MATTERS -->
<div class="page">
  <div class="section-eyebrow">The shift</div>
  <h2 class="section-title">Your customers are already searching with AI.</h2>
  <p class="section-sub">If your business doesn't show up when people ask AI for recommendations, you're invisible to a fast-growing share of your local market.</p>

  <div class="stats-grid">
    <div class="stat-card featured">
      <div class="stat-num">900M+</div>
      <div class="stat-label">people use ChatGPT every week — over double the number from a year ago</div>
      <div class="stat-source">Source: OpenAI · Backlinko 2026</div>
    </div>
    <div class="stat-card">
      <div class="stat-num">2.5B</div>
      <div class="stat-label">prompts processed daily by ChatGPT alone, with 35% triggering live web searches for businesses, products & places</div>
      <div class="stat-source">Source: Superlines 2026</div>
    </div>
    <div class="stat-card">
      <div class="stat-num">59%</div>
      <div class="stat-label">of AI search queries are local intent — "best [thing] near me" type questions</div>
      <div class="stat-source">Source: Superlines · Nectiv 2026</div>
    </div>
    <div class="stat-card">
      <div class="stat-num">70%</div>
      <div class="stat-label">of consumers turn to generative AI tools over traditional search for product and service recommendations</div>
      <div class="stat-source">Source: Master of Code 2026</div>
    </div>
    <div class="stat-card">
      <div class="stat-num">61%</div>
      <div class="stat-label">drop in click-through rates on traditional Google search when AI summaries are shown</div>
      <div class="stat-source">Source: Seer Interactive 2025</div>
    </div>
    <div class="stat-card">
      <div class="stat-num">5×</div>
      <div class="stat-label">higher conversion rate for visitors who arrive from AI search vs. traditional Google organic traffic</div>
      <div class="stat-source">Source: Pixelmojo 2026</div>
    </div>
  </div>

  <div class="quote-block">
    <strong>Bottom line:</strong> AI search isn't replacing Google overnight, but it's where the next decade of customer discovery is being built. Businesses that show up in AI answers today are training the algorithms that will define their category tomorrow.
  </div>

  <div class="footer">GeoPulse · AI Visibility Audit · Page 1 of 6</div>
</div>

<!-- PAGE 3: EXEC SUMMARY + SCORES + REVENUE -->
<div class="page">
  <div class="section-eyebrow">Your results</div>
  <h2 class="section-title">${escapeHtml(bizInfo.name)}'s AI Visibility Score</h2>
  <p class="section-sub">We ran 3 real AI queries — one with live web search — asking what people in ${escapeHtml(bizInfo.city)} would actually ask. Here's how you performed.</p>

  ${audit.executiveSummary ? `
    <div class="exec-summary">
      <div class="exec-label">Executive Summary</div>
      <p class="exec-text">${escapeHtml(audit.executiveSummary)}</p>
    </div>
  ` : ''}

  <div class="score-row">
    <div class="score-card primary">
      <div class="score-card-label">AI Overall Score</div>
      <div class="score-card-num">${overallScore}<span>/100</span></div>
      <div class="score-card-tag" style="color: var(--teal-100);">${scoreLabel(overallScore)}</div>
    </div>
    <div class="score-card">
      <div class="score-card-label">Visibility</div>
      <div class="score-card-num" style="color: ${visibility >= 70 ? 'var(--teal)' : visibility >= 45 ? 'var(--amber)' : 'var(--red)'};">${visibility}<span>/100</span></div>
      <div class="score-card-sub">${audit._meta?.mentionsCount || 0}/${audit._meta?.totalQueries || 0} queries</div>
      <div class="score-bar"><div class="score-bar-fill" style="width: ${visibility}%; background: ${visibility >= 70 ? 'var(--teal)' : visibility >= 45 ? 'var(--amber)' : 'var(--red)'};"></div></div>
    </div>
    <div class="score-card">
      <div class="score-card-label">Sentiment</div>
      <div class="score-card-num" style="color: ${sentiment >= 70 ? 'var(--teal)' : sentiment >= 45 ? 'var(--amber)' : 'var(--red)'};">${sentiment != null ? sentiment : '—'}${sentiment != null ? '<span>/100</span>' : ''}</div>
      ${sentiment != null ? `<div class="score-bar"><div class="score-bar-fill" style="width: ${sentiment}%; background: ${sentiment >= 70 ? 'var(--teal)' : sentiment >= 45 ? 'var(--amber)' : 'var(--red)'};"></div></div>` : ''}
    </div>
    <div class="score-card">
      <div class="score-card-label">Reviews</div>
      <div class="score-card-num" style="color: var(--ink);">${review?.reviews || '—'}</div>
      ${review?.rating ? `<div class="score-card-sub">${review.rating}★ Google rating</div>` : ''}
    </div>
  </div>

  ${audit.revenueImpact ? `
    <div class="revenue-panel">
      <div class="revenue-label">💰 Estimated revenue impact</div>
      <div class="revenue-amount">${escapeHtml(audit.revenueImpact.estimate)}<span>/month potential loss</span></div>
      <p class="revenue-explanation">${escapeHtml(audit.revenueImpact.explanation)}</p>
      ${audit.revenueImpact.calculation ? `<p class="revenue-calc">📊 ${escapeHtml(audit.revenueImpact.calculation)}</p>` : ''}
    </div>
  ` : ''}

  <div class="footer">GeoPulse · AI Visibility Audit · Page 2 of 6</div>
</div>

<!-- PAGE 4: AI QUERY EVIDENCE -->
<div class="page">
  <div class="section-eyebrow">The evidence</div>
  <h2 class="section-title">What AI actually said when we asked.</h2>
  <p class="section-sub">We asked 3 different questions — the kind real customers ask AI tools daily. Here are the real, verbatim responses.</p>
  ${queryHTML}
  <div class="footer">GeoPulse · AI Visibility Audit · Page 3 of 6</div>
</div>

<!-- PAGE 5: INSIGHTS + COMPETITORS + PLAYBOOK -->
<div class="page">
  <div class="section-eyebrow">Analysis</div>
  <h2 class="section-title">Key insights & action plan</h2>
  <p class="section-sub">Where you stand, who's beating you, and what to do about it.</p>

  <h3 style="font-family: 'Syne', sans-serif; font-size: 14px; font-weight: 700; margin-bottom: 10px;">Key insights</h3>
  <div class="insights-list">${insightHTML}</div>

  <div class="two-col">
    <div class="panel">
      <h3 class="panel-title">Likely AI sources for this industry</h3>
      <p class="panel-sub">Platforms AI models commonly cite when answering about ${escapeHtml(bizInfo.industry)}</p>
      <div class="source-chips">${sourceChipsHTML}</div>
    </div>
    <div class="panel">
      <h3 class="panel-title">Competitors AI mentioned</h3>
      <p class="panel-sub">Real businesses pulled from your AI queries</p>
      ${compRowsHTML || '<div style="font-size: 12px; color: var(--ink-muted); font-style: italic;">No competitors detected</div>'}
    </div>
  </div>

  <h3 style="font-family: 'Syne', sans-serif; font-size: 14px; font-weight: 700; margin-bottom: 4px;">What I can fix for you</h3>
  <p style="font-size: 12px; color: var(--ink-muted); margin-bottom: 14px;">Technical work most local businesses don't have the in-house expertise to execute</p>
  <div class="fix-grid">
    <div class="fix-cell">
      <div class="fix-cell-icon">🔧</div>
      <div class="fix-cell-title">Structured data engineering</div>
      <div class="fix-cell-text">Hand-coded LocalBusiness, Service, and Review schema markup deployed to your website's source — the machine-readable signals AI models prioritize when ranking businesses.</div>
    </div>
    <div class="fix-cell">
      <div class="fix-cell-icon">🎯</div>
      <div class="fix-cell-title">Citation & entity alignment</div>
      <div class="fix-cell-text">Cross-platform audit and reconciliation of your business identity across the 20+ data sources AI models crawl — eliminating the inconsistencies that confuse ranking algorithms.</div>
    </div>
    <div class="fix-cell">
      <div class="fix-cell-icon">📈</div>
      <div class="fix-cell-title">Authority signal building</div>
      <div class="fix-cell-text">Strategic deployment of review velocity campaigns, custom content frameworks, and Q&A targeting designed to feed AI training pipelines with positive brand mentions.</div>
    </div>
    <div class="fix-cell">
      <div class="fix-cell-icon">🔎</div>
      <div class="fix-cell-title">GEO performance tracking</div>
      <div class="fix-cell-text">Ongoing measurement of your visibility across ChatGPT, Claude, Gemini, and Perplexity using proprietary query frameworks — with monthly score reports and remediation roadmaps.</div>
    </div>
  </div>

  <div class="footer">GeoPulse · AI Visibility Audit · Page 4 of 6</div>
</div>

<!-- PAGE 6: CTA -->
<div class="page cta-page">
  <div>
    <div class="section-eyebrow">What's next</div>
    <h2 class="section-title">Want to fix this?</h2>
    <p class="section-sub">I help local ${escapeHtml(bizInfo.city)} businesses become the answer when AI gets asked. Here's how we can work together.</p>
  </div>

  <div class="cta-hero">
    <div class="cta-hero-title">Become the AI's #1 recommendation in ${escapeHtml(bizInfo.city)}.</div>
    <div class="cta-hero-sub">Three months from now, when someone asks ChatGPT for the best ${escapeHtml(bizInfo.industry)} in town — they should hear your name first.</div>
  </div>

  <div class="cta-package-grid">
    <div class="cta-package featured">
      <div class="cta-pkg-name" style="color: var(--teal);">★ GEO Quick Fix</div>
      <div class="cta-pkg-price">$397<span> one-time</span></div>
      <div class="cta-pkg-desc">Everything you need to start showing up in AI search — delivered in 2 weeks</div>
      <ul class="cta-pkg-list">
        <li>Schema markup deployment</li>
        <li>Google Business Profile optimization</li>
        <li>Listing consistency reconciliation</li>
        <li>Targeted review velocity campaign</li>
        <li>30-day re-audit & comparison report</li>
      </ul>
    </div>
    <div class="cta-package">
      <div class="cta-pkg-name">GEO Maintenance</div>
      <div class="cta-pkg-price">$297<span>/month</span></div>
      <div class="cta-pkg-desc">Stay on top of AI visibility once the foundation is in place</div>
      <ul class="cta-pkg-list">
        <li>Monthly visibility tracking</li>
        <li>Ongoing schema & content updates</li>
        <li>Monthly review campaigns</li>
        <li>Quarterly full audit reports</li>
        <li>Competitor monitoring</li>
      </ul>
      <div class="cta-pkg-footer">Add-on after Quick Fix</div>
    </div>
  </div>

  <div class="cta-contact">
    <p style="margin-bottom: 8px;"><strong>Ready to talk?</strong></p>
    <p>${contact.email ? `📧 ${escapeHtml(contact.email)}` : ''} ${contact.email && contact.phone ? '&nbsp;·&nbsp;' : ''} ${contact.phone ? `📱 ${escapeHtml(contact.phone)}` : ''}</p>
    <p style="margin-top: 8px; font-size: 12px; color: var(--ink-muted);">Response within 24 hours · Free 30-minute discovery call</p>
  </div>

  <div class="footer">© 2026 GeoPulse · This report was prepared exclusively for ${escapeHtml(bizInfo.name)}.<br>Data sourced from Anthropic Claude, Google Places API, and live AI search queries conducted on ${today}.</div>
</div>

</body>
</html>`;
}

export function openPDFReport(audit, bizInfo, contact) {
  const html = generatePDFReport(audit, bizInfo, contact);
  const newWindow = window.open('', '_blank');
  if (!newWindow) {
    alert('Please allow popups to generate the PDF report');
    return;
  }
  newWindow.document.write(html);
  newWindow.document.close();
}
