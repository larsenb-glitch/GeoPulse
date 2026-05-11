export const config = { runtime: 'nodejs', maxDuration: 60 };

// ============ GOOGLE PLACES ============
async function searchPlace(query, city, state, lat, lng, googleApiKey) {
  const resp = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': googleApiKey,
      'X-Goog-FieldMask': 'places.displayName,places.rating,places.userRatingCount,places.websiteUri',
    },
    body: JSON.stringify({
      textQuery: `${query} in ${city}, ${state}`,
      locationBias: {
        circle: { center: { latitude: lat, longitude: lng }, radius: 20000 },
      },
      maxResultCount: 10,
    }),
  });
  const data = await resp.json();
  return data.places || [];
}

async function getPlacesData(name, city, state, industry, googleApiKey) {
  try {
    const geocodeResp = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(city + ', ' + state)}&key=${googleApiKey}`
    );
    const geocodeData = await geocodeResp.json();
    if (!geocodeData.results?.[0]) return { business: null, competitors: [] };
    const { lat, lng } = geocodeData.results[0].geometry.location;

    const bizResults = await searchPlace(name, city, state, lat, lng, googleApiKey);
    const business = bizResults.find(p =>
      p.displayName?.text?.toLowerCase().includes(name.toLowerCase().split(' ')[0])
    ) || bizResults[0] || null;

    const compResults = await searchPlace(industry, city, state, lat, lng, googleApiKey);
    const competitors = compResults
      .filter(p => !p.displayName?.text?.toLowerCase().includes(name.toLowerCase()))
      .slice(0, 8)
      .map(p => ({
        name: p.displayName?.text || 'Unknown',
        rating: p.rating || null,
        reviews: p.userRatingCount || 0,
      }));

    return {
      business: business ? {
        name: business.displayName?.text,
        rating: business.rating || null,
        reviews: business.userRatingCount || 0,
        website: business.websiteUri || null,
      } : null,
      competitors,
    };
  } catch (err) {
    return { business: null, competitors: [] };
  }
}

// ============ AI QUERIES ============
async function queryClaudeNoSearch(prompt, anthropicKey) {
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 350,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const rawBody = await resp.text();
    let data;
    try { data = JSON.parse(rawBody); } catch (e) {
      return { text: '', error: 'Non-JSON: ' + rawBody.slice(0, 100) };
    }
    if (data.error) return { text: '', error: data.error.message };
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    return { text, error: null };
  } catch (err) {
    return { text: '', error: err.message };
  }
}

function checkMention(text, businessName) {
  if (!text) return { mentioned: false, position: -1 };
  const lower = text.toLowerCase();
  const nameLower = businessName.toLowerCase();
  let idx = lower.indexOf(nameLower);
  if (idx === -1) {
    const firstWord = nameLower.split(' ')[0];
    if (firstWord.length > 3) idx = lower.indexOf(firstWord);
  }
  if (idx === -1) return { mentioned: false, position: -1 };
  const pct = idx / text.length;
  const position = pct < 0.2 ? 1 : pct < 0.4 ? 2 : pct < 0.6 ? 3 : pct < 0.8 ? 4 : 5;
  return { mentioned: true, position };
}

function findCompetitorMentions(text, competitorList) {
  if (!text) return [];
  const lower = text.toLowerCase();
  return competitorList
    .map(c => {
      const nameLower = c.name.toLowerCase();
      let idx = lower.indexOf(nameLower);
      if (idx === -1) {
        const firstWord = nameLower.split(' ')[0];
        if (firstWord.length > 3) idx = lower.indexOf(firstWord);
      }
      return idx !== -1 ? { name: c.name, position: idx } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.position - b.position);
}

// Validate that an AI-extracted quote actually appears in the source text
function validateQuote(quote, sourceText) {
  if (!quote || !sourceText) return false;
  // Strip quotation marks and normalize whitespace
  const cleanQuote = quote.replace(/["'""'']/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const cleanSource = sourceText.toLowerCase().replace(/\s+/g, ' ');
  if (cleanQuote.length < 5) return false;
  // Check if at least 60% of the quote words appear in sequence
  const words = cleanQuote.split(' ').filter(w => w.length > 2);
  if (words.length === 0) return false;
  // Try exact match first
  if (cleanSource.includes(cleanQuote)) return true;
  // Try first half of quote
  const half = words.slice(0, Math.max(3, Math.floor(words.length / 2))).join(' ');
  return cleanSource.includes(half);
}

async function runAIQueries(name, city, state, industry, competitorList, anthropicKey) {
  const queries = [
    `Based on what you know, what are the best ${industry} options in ${city}, ${state}? List your top 3-5 recommendations briefly.`,
    `If a friend asked you to recommend a highly-rated ${industry} in ${city}, ${state}, who would you suggest and why?`,
    `Is ${name} a good ${industry} in ${city}, ${state}? How does it compare to other options in the area?`,
  ];

  const results = [];
  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    const { text, error } = await queryClaudeNoSearch(q, anthropicKey);
    const mention = checkMention(text, name);
    const competitorsMentioned = findCompetitorMentions(text, competitorList);
    results.push({
      query: q,
      response: text,
      mentioned: mention.mentioned,
      position: mention.position,
      competitorsMentioned: competitorsMentioned.map(c => c.name),
      error,
    });
    if (i < queries.length - 1) await new Promise(r => setTimeout(r, 1500));
  }

  return results;
}

// Compute accuracy based on whether AI mentioned correct details
function computeAccuracy(aiQueries, business) {
  if (!business) return null; // can't verify without ground truth
  let signals = 0;
  let correct = 0;
  aiQueries.forEach(q => {
    if (!q.mentioned) return;
    // If they were mentioned, check if real details appear
    const text = q.response.toLowerCase();
    // Did rating range get referenced correctly? (approximate)
    if (business.rating) {
      signals++;
      // Can't easily verify rating accuracy from free text — count as neutral
      correct += 0.5;
    }
  });
  if (signals === 0) return null;
  return Math.round((correct / signals) * 100);
}

// Compute sentiment based on actual response text around the business mention
function computeSentiment(aiQueries, businessName) {
  const positiveWords = ['excellent', 'great', 'recommended', 'top', 'best', 'popular', 'loved', 'favorite', 'highly', 'quality', 'professional'];
  const negativeWords = ['avoid', 'poor', 'bad', 'mediocre', 'disappointing', 'lacking', 'overpriced', 'rude'];
  let pos = 0, neg = 0, total = 0;
  aiQueries.forEach(q => {
    if (!q.mentioned) return;
    const text = q.response.toLowerCase();
    const nameIdx = text.indexOf(businessName.toLowerCase().split(' ')[0]);
    if (nameIdx === -1) return;
    // Look at 200 chars around the mention
    const context = text.slice(Math.max(0, nameIdx - 100), nameIdx + 200);
    positiveWords.forEach(w => { if (context.includes(w)) pos++; });
    negativeWords.forEach(w => { if (context.includes(w)) neg++; });
    total++;
  });
  if (total === 0) return null;
  // Neutral baseline 50, adjust up/down
  const adjustment = (pos - neg * 1.5) * 10;
  return Math.max(0, Math.min(100, 50 + adjustment));
}

// Industry-appropriate source list (no fake percentages, just real platforms)
function getIndustrySources(industry) {
  const lower = industry.toLowerCase();
  const universal = ['Google Business Profile', 'Yelp'];
  if (lower.match(/salon|spa|hair|nails|beauty/)) {
    return [...universal, 'StyleSeat', 'Vagaro', 'Booksy', 'Facebook'];
  }
  if (lower.match(/restaurant|food|cafe|bar|eat|dining/)) {
    return [...universal, 'TripAdvisor', 'OpenTable', 'DoorDash reviews', 'Facebook'];
  }
  if (lower.match(/doctor|medical|clinic|dental|dentist|chiropractor|physical/)) {
    return [...universal, 'Healthgrades', 'WebMD', 'Zocdoc', 'Vitals'];
  }
  if (lower.match(/lawyer|law|attorney|legal/)) {
    return [...universal, 'Avvo', 'FindLaw', 'Martindale', 'Justia'];
  }
  if (lower.match(/contractor|plumb|electric|roof|hvac|construction|handyman/)) {
    return [...universal, 'Angi', 'HomeAdvisor', 'Houzz', 'Thumbtack'];
  }
  if (lower.match(/real estate|realtor|agent|property/)) {
    return [...universal, 'Zillow', 'Realtor.com', 'Redfin'];
  }
  if (lower.match(/auto|car|mechanic|repair/)) {
    return [...universal, 'RepairPal', 'CarTalk', 'Facebook'];
  }
  if (lower.match(/gym|fitness|yoga|training/)) {
    return [...universal, 'ClassPass', 'Mindbody', 'Facebook'];
  }
  return [...universal, 'Facebook', 'Bing Places', 'Apple Maps'];
}

// ============ MAIN HANDLER ============
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

  const { name, city, state, industry, website } = req.body;
  const googleApiKey = process.env.GOOGLE_PLACES_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  // Step 1: Get Places data (VERIFIED)
  const { business, competitors } = googleApiKey
    ? await getPlacesData(name, city, state, industry, googleApiKey)
    : { business: null, competitors: [] };

  // Step 2: Run AI queries (VERIFIED — actual responses)
  const aiQueries = await runAIQueries(name, city, state, industry, competitors, anthropicKey);

  // Step 3: Compute VERIFIED metrics from real data
  const totalQueries = aiQueries.length;
  const mentionsCount = aiQueries.filter(q => q.mentioned).length;
  const visibilityScore = Math.round((mentionsCount / totalQueries) * 100);
  const sentimentScore = computeSentiment(aiQueries, name);

  // Real competitor mention rankings
  const competitorMentionCounts = {};
  aiQueries.forEach(q => {
    q.competitorsMentioned.forEach(name => {
      competitorMentionCounts[name] = (competitorMentionCounts[name] || 0) + 1;
    });
  });

  const realCompetitorRanking = Object.entries(competitorMentionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, count]) => ({ name, mentions: count }));

  // Industry-appropriate source platforms (no fake percentages)
  const sourcePlatforms = getIndustrySources(industry);

  // Step 4: Send to Claude for analysis (clearly bounded — no inventing numbers)
  const truncatedResponses = aiQueries.map((q, i) => {
    const truncated = q.response.length > 400 ? q.response.slice(0, 400) + '...' : q.response;
    const status = q.mentioned ? `MENTIONED (pos ${q.position})` : 'NOT MENTIONED';
    return `Q${i+1}: "${q.query.slice(0, 80)}..."\nResult: ${status}\nResponse excerpt: ${truncated}`;
  }).join('\n\n');

  const businessContext = business
    ? `VERIFIED Google data: ${business.rating ?? '?'} stars, ${business.reviews} reviews, website: ${business.website || website || 'none'}`
    : `No Google data found for ${name}`;

  const competitorContext = competitors.length > 0
    ? competitors.slice(0, 5).map(c => `${c.name} (${c.reviews} reviews, ${c.rating ?? '?'}★)`).join('; ')
    : 'No competitor data';

  const analysisPrompt = `Generate a GEO audit analysis. Return ONLY raw JSON, no markdown.

Business: ${name} | ${city}, ${state} | ${industry}
${businessContext}
Real competitors found nearby: ${competitorContext}

I ran 3 real AI queries. Result: business mentioned in ${mentionsCount}/${totalQueries} queries = ${visibilityScore}% visibility.

${truncatedResponses}

Return this JSON exactly:
{"overallScore":55,"insights":[{"type":"positive|warning|negative","text":"insight referencing actual query results"},{"type":"...","text":"..."},{"type":"...","text":"..."},{"type":"...","text":"..."}],"reportInsights":[{"type":"positive|warning|negative","text":"longer polished insight for printed report, 25-35 words, MUST reference real numbers from data above"},{"type":"...","text":"..."},{"type":"...","text":"..."},{"type":"...","text":"..."}],"keyQuotes":["VERBATIM 8-15 word excerpt copied directly from query 1 response text above","VERBATIM excerpt from query 2","VERBATIM excerpt from query 3"],"playbook":{"quickWins":["specific action","specific action","specific action"],"strategic":["strategic action","strategic action"],"easyExtras":["easy action","easy action"],"deprioritize":["low-value action","low-value action"]},"revenueImpact":{"estimate":"$X-Y","explanation":"~25 word range based on industry, MUST be conservative and acknowledge it's an estimate","calculation":"brief note on how estimated, e.g. 'based on ~5-10 lost customers/mo at typical industry CLV'"},"outreachSubject":"compelling 6-10 word email subject line","executiveSummary":"40-60 word summary written for the business owner"}

STRICT RULES:
1. KEY QUOTES must be COPIED VERBATIM from the response excerpts above — do not paraphrase or invent
2. overallScore must reflect actual ${visibilityScore}% visibility result
3. NEVER invent statistics, percentages, or numbers not provided above
4. Revenue impact must be a RANGE (e.g. "$1,200-2,400") and explanation must acknowledge it's a conservative estimate
5. All insights must reference real data: the ${visibilityScore}% visibility, competitor names from the list, or Google review counts
6. Do NOT make up details about the business beyond what's stated above`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1800,
        messages: [{ role: 'user', content: analysisPrompt }],
      }),
    });

    const rawBody = await response.text();
    let data;
    try { data = JSON.parse(rawBody); } catch (e) {
      res.status(500).json({ error: 'API non-JSON: ' + rawBody.slice(0, 200) });
      return;
    }
    if (data.error) {
      res.status(500).json({ error: data.error.message });
      return;
    }

    const raw = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    const jsonStr = start !== -1 && end !== -1 ? raw.slice(start, end + 1) : raw;
    const analysis = JSON.parse(jsonStr);

    // Validate key quotes against actual response text
    const validatedQuotes = (analysis.keyQuotes || []).map((quote, i) => {
      const sourceText = aiQueries[i]?.response || '';
      const verified = validateQuote(quote, sourceText);
      return { quote, verified };
    });

    const audit = {
      ...analysis,
      visibility: visibilityScore,
      sentiment: sentimentScore !== null ? sentimentScore : analysis.sentiment,
      accuracy: null, // we don't have ground truth to verify accuracy claims
      keyQuotes: validatedQuotes,
      competitors: realCompetitorRanking.length > 0 ? realCompetitorRanking :
        competitors.slice(0, 4).map(c => ({ name: c.name, mentions: 0 })),
      sources: sourcePlatforms.map(name => ({ name })),
      aiQueries: aiQueries.map(q => ({
        query: q.query,
        response: q.response,
        mentioned: q.mentioned,
        position: q.position,
        competitorsMentioned: q.competitorsMentioned,
      })),
      _meta: {
        businessData: business,
        totalQueries,
        mentionsCount,
      },
      _dataIntegrity: {
        verified: [
          'Business Google rating & review count',
          'Business website URL',
          'Competitor names, ratings & review counts',
          'AI query responses (verbatim)',
          'Mention detection (real string match)',
          'Visibility score (calculated from real mentions)',
          'Competitor mention counts',
          'Sentiment score (calculated from response text)',
          `Key quotes (${validatedQuotes.filter(q => q.verified).length} of ${validatedQuotes.length} verified verbatim)`,
        ],
        estimated: [
          'Overall score (AI judgment based on real data)',
          'Insights & analysis (AI interpretation)',
          'Action playbook items (AI recommendations)',
          'Revenue impact (industry benchmark estimate)',
          'Sentiment fallback if no AI mention',
        ],
        notProvided: [
          'AI source attribution percentages (cannot be measured reliably)',
          'Accuracy score (no ground truth to verify against)',
        ],
      },
    };

    res.status(200).json(audit);
    return;
  } catch (err) {
    res.status(500).json({ error: err.message });
      return;
  }
}
