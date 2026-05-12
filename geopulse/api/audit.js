export const config = { runtime: 'nodejs', maxDuration: 60 };

// ============ GOOGLE PLACES ============
async function searchPlace(query, city, state, lat, lng, googleApiKey) {
  const resp = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': googleApiKey,
      'X-Goog-FieldMask': 'places.displayName,places.rating,places.userRatingCount,places.websiteUri,places.formattedAddress',
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
        address: p.formattedAddress || null,
      }));

    return {
      business: business ? {
        name: business.displayName?.text,
        rating: business.rating || null,
        reviews: business.userRatingCount || 0,
        website: business.websiteUri || null,
        address: business.formattedAddress || null,
      } : null,
      competitors,
    };
  } catch (err) {
    return { business: null, competitors: [] };
  }
}

// ============ ONE WEB-SEARCHED AI QUERY ============
async function queryClaudeWithSearch(prompt, anthropicKey) {
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
        max_tokens: 500,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }],
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

// ============ NO-SEARCH AI QUERIES (using context from search + Places) ============
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
        max_tokens: 400,
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

function validateQuote(quote, sourceText) {
  if (!quote || !sourceText) return false;
  const cleanQuote = quote.replace(/["'""'']/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const cleanSource = sourceText.toLowerCase().replace(/\s+/g, ' ');
  if (cleanQuote.length < 5) return false;
  if (cleanSource.includes(cleanQuote)) return true;
  const words = cleanQuote.split(' ').filter(w => w.length > 2);
  if (words.length === 0) return false;
  const half = words.slice(0, Math.max(3, Math.floor(words.length / 2))).join(' ');
  return cleanSource.includes(half);
}

function computeSentiment(aiQueries, businessName) {
  const positiveWords = ['excellent', 'great', 'recommended', 'top', 'best', 'popular', 'loved', 'favorite', 'highly', 'quality', 'professional'];
  const negativeWords = ['avoid', 'poor', 'bad', 'mediocre', 'disappointing', 'lacking', 'overpriced', 'rude'];
  let pos = 0, neg = 0, total = 0;
  aiQueries.forEach(q => {
    if (!q.mentioned) return;
    const text = q.response.toLowerCase();
    const nameIdx = text.indexOf(businessName.toLowerCase().split(' ')[0]);
    if (nameIdx === -1) return;
    const context = text.slice(Math.max(0, nameIdx - 100), nameIdx + 200);
    positiveWords.forEach(w => { if (context.includes(w)) pos++; });
    negativeWords.forEach(w => { if (context.includes(w)) neg++; });
    total++;
  });
  if (total === 0) return null;
  const adjustment = (pos - neg * 1.5) * 10;
  return Math.max(0, Math.min(100, 50 + adjustment));
}

function getIndustrySources(industry) {
  const lower = industry.toLowerCase();
  const universal = ['Google Business Profile', 'Yelp'];
  if (lower.match(/salon|spa|hair|nails|beauty/)) return [...universal, 'StyleSeat', 'Vagaro', 'Booksy', 'Facebook'];
  if (lower.match(/restaurant|food|cafe|bar|eat|dining/)) return [...universal, 'TripAdvisor', 'OpenTable', 'DoorDash reviews', 'Facebook'];
  if (lower.match(/doctor|medical|clinic|dental|dentist|chiropractor|physical/)) return [...universal, 'Healthgrades', 'WebMD', 'Zocdoc', 'Vitals'];
  if (lower.match(/lawyer|law|attorney|legal/)) return [...universal, 'Avvo', 'FindLaw', 'Martindale', 'Justia'];
  if (lower.match(/contractor|plumb|electric|roof|hvac|construction|handyman/)) return [...universal, 'Angi', 'HomeAdvisor', 'Houzz', 'Thumbtack'];
  if (lower.match(/real estate|realtor|agent|property/)) return [...universal, 'Zillow', 'Realtor.com', 'Redfin'];
  if (lower.match(/auto|car|mechanic|repair/)) return [...universal, 'RepairPal', 'CarTalk', 'Facebook'];
  if (lower.match(/gym|fitness|yoga|training/)) return [...universal, 'ClassPass', 'Mindbody', 'Facebook'];
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

  // Step 1: Get real Google Places data
  const { business, competitors } = googleApiKey
    ? await getPlacesData(name, city, state, industry, googleApiKey)
    : { business: null, competitors: [] };

  // Step 2: ONE web-searched query — the killer evidence
  const searchedQuery = `Search for the best ${industry} in ${city}, ${state} right now. List the top 3-5 real businesses with their names, star ratings, and key strengths. Only include businesses you have actual evidence for from your search.`;

  const { text: searchedResponse, error: searchError } = await queryClaudeWithSearch(searchedQuery, anthropicKey);

  // Wait 4 seconds before next call to reset the per-minute token bucket
  await new Promise(r => setTimeout(r, 4000));

  // Step 3: Two follow-up queries using the search context (no additional searches)
  const competitorListStr = competitors.length > 0
    ? competitors.slice(0, 5).map(c => `${c.name} (${c.reviews} reviews, ${c.rating ?? '?'}★)`).join(', ')
    : 'unknown';

  const followUpQuery1 = `Based ONLY on what's stated below, would you recommend ${name} in ${city}, ${state}?

What an AI search just returned about ${industry} in ${city}: "${searchedResponse.slice(0, 600)}"

Real businesses pulled from Google Places nearby: ${competitorListStr}

${name} has ${business?.reviews || 'unknown'} Google reviews and a ${business?.rating || 'unknown'} star rating.

Write a brief honest comparison: is ${name} likely to be the top recommendation, or are competitors winning? 2-3 sentences max.`;

  const followUpQuery2 = `A friend asks: "where should I go for ${industry} in ${city}, ${state}?"

You just researched this. The top businesses appearing in AI recommendations were: "${searchedResponse.slice(0, 400)}"

${name} has ${business?.reviews || '?'} reviews / ${business?.rating || '?'}★. Other real options: ${competitorListStr}.

In 2-3 sentences, what's your honest recommendation, and how does ${name} factor in?`;

  await new Promise(r => setTimeout(r, 2000));
  const { text: followUp1Response } = await queryClaudeNoSearch(followUpQuery1, anthropicKey);

  await new Promise(r => setTimeout(r, 2000));
  const { text: followUp2Response } = await queryClaudeNoSearch(followUpQuery2, anthropicKey);

  // Build the AI queries array (frontend expects this shape)
  const aiQueries = [
    {
      query: `Search: What are the best ${industry} in ${city}, ${state}?`,
      response: searchedResponse,
      ...checkMention(searchedResponse, name),
      mentioned: checkMention(searchedResponse, name).mentioned,
      position: checkMention(searchedResponse, name).position,
      competitorsMentioned: findCompetitorMentions(searchedResponse, competitors).map(c => c.name),
    },
    {
      query: `Compare: Would AI recommend ${name} over competitors?`,
      response: followUp1Response,
      mentioned: checkMention(followUp1Response, name).mentioned,
      position: checkMention(followUp1Response, name).position,
      competitorsMentioned: findCompetitorMentions(followUp1Response, competitors).map(c => c.name),
    },
    {
      query: `Recommend: Where should I go for ${industry} in ${city}?`,
      response: followUp2Response,
      mentioned: checkMention(followUp2Response, name).mentioned,
      position: checkMention(followUp2Response, name).position,
      competitorsMentioned: findCompetitorMentions(followUp2Response, competitors).map(c => c.name),
    },
  ];

  const totalQueries = aiQueries.length;
  const mentionsCount = aiQueries.filter(q => q.mentioned).length;
  const visibilityScore = Math.round((mentionsCount / totalQueries) * 100);
  const sentimentScore = computeSentiment(aiQueries, name);

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

  const sourcePlatforms = getIndustrySources(industry);

  // Step 4: Final analysis call — very compact
  await new Promise(r => setTimeout(r, 3000));

  const truncatedResponses = aiQueries.map((q, i) => {
    const truncated = q.response.length > 200 ? q.response.slice(0, 200) + '...' : q.response;
    const status = q.mentioned ? `MENTIONED (pos ${q.position})` : 'NOT MENTIONED';
    const compsList = q.competitorsMentioned.length > 0 ? `Comps: ${q.competitorsMentioned.join(', ')}` : 'No comps';
    return `Q${i+1} [${status}]: ${truncated}\n${compsList}`;
  }).join('\n\n');

  const businessContext = business
    ? `${name}: ${business.rating ?? '?'}★, ${business.reviews} reviews`
    : `${name}: no Google data`;

  const competitorContext = competitors.length > 0
    ? competitors.slice(0, 4).map(c => `${c.name} (${c.reviews}rev, ${c.rating ?? '?'}★)`).join('; ')
    : 'No competitor data';

  const analysisPrompt = `Generate a GEO audit. Return ONLY raw JSON.

Business: ${name} | ${city}, ${state} | ${industry}
${businessContext}
Competitors: ${competitorContext}
Visibility: ${mentionsCount}/${totalQueries} (${visibilityScore}%)

${truncatedResponses}

Return:
{"overallScore":55,"insights":[{"type":"positive|warning|negative","text":"insight"},{"type":"...","text":"..."},{"type":"...","text":"..."},{"type":"...","text":"..."}],"reportInsights":[{"type":"positive|warning|negative","text":"polished 25-35 word insight with real numbers"},{"type":"...","text":"..."},{"type":"...","text":"..."},{"type":"...","text":"..."}],"keyQuotes":["VERBATIM 8-15 word excerpt from Q1","VERBATIM excerpt from Q2","VERBATIM excerpt from Q3"],"playbook":{"quickWins":["action","action","action"],"strategic":["action","action"],"easyExtras":["action","action"],"deprioritize":["action","action"]},"revenueImpact":{"estimate":"$X-Y","explanation":"~25 word conservative range","calculation":"brief calc method"},"outreachSubject":"6-10 word subject","executiveSummary":"40-60 word summary"}

Rules: keyQuotes MUST be verbatim from responses above. overallScore reflects ${visibilityScore}% visibility. No inventing numbers.`;

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
        max_tokens: 1200,
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

    const validatedQuotes = (analysis.keyQuotes || []).map((quote, i) => {
      const sourceText = aiQueries[i]?.response || '';
      const verified = validateQuote(quote, sourceText);
      return { quote, verified };
    });

    const audit = {
      ...analysis,
      visibility: visibilityScore,
      sentiment: sentimentScore !== null ? sentimentScore : analysis.sentiment,
      accuracy: null,
      keyQuotes: validatedQuotes,
      competitors: realCompetitorRanking.length > 0 ? realCompetitorRanking :
        competitors.slice(0, 4).map(c => ({ name: c.name, mentions: 0 })),
      sources: sourcePlatforms.map(name => ({ name })),
      aiQueries,
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
          'Web-searched AI response (Q1, verbatim)',
          'Follow-up AI responses (Q2/Q3, verbatim)',
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
