export const config = { runtime: 'edge' };

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

// ============ AI QUERIES (no web search to save tokens) ============
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

async function runAIQueries(name, city, state, industry, competitorList, anthropicKey) {
  const queries = [
    `Based on what you know, what are the best ${industry} options in ${city}, ${state}? List your top 3-5 recommendations briefly.`,
    `If a friend asked you to recommend a highly-rated ${industry} in ${city}, ${state}, who would you suggest and why?`,
    `Is ${name} a good ${industry} in ${city}, ${state}? How does it compare to other options in the area?`,
  ];

  // Sequential with 1.5s delays - keeps us under rate limits comfortably
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

// ============ MAIN HANDLER ============
export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const { name, city, state, industry, website } = await req.json();
  const googleApiKey = process.env.GOOGLE_PLACES_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  // Step 1: Get Places data
  const { business, competitors } = googleApiKey
    ? await getPlacesData(name, city, state, industry, googleApiKey)
    : { business: null, competitors: [] };

  // Step 2: Run AI queries
  const aiQueries = await runAIQueries(name, city, state, industry, competitors, anthropicKey);

  // Step 3: Compute REAL metrics
  const totalQueries = aiQueries.length;
  const mentionsCount = aiQueries.filter(q => q.mentioned).length;
  const visibilityScore = Math.round((mentionsCount / totalQueries) * 100);

  // Build competitor mention rankings from actual responses
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

  // Step 4: Truncate query responses to save tokens for analysis
  const truncatedResponses = aiQueries.map((q, i) => {
    const truncated = q.response.length > 400 ? q.response.slice(0, 400) + '...' : q.response;
    const status = q.mentioned ? `MENTIONED (pos ${q.position})` : 'NOT MENTIONED';
    return `Q${i+1}: "${q.query.slice(0, 80)}..."\nResult: ${status}\nResponse excerpt: ${truncated}`;
  }).join('\n\n');

  const businessContext = business
    ? `Real Google data: ${business.rating ?? '?'} stars, ${business.reviews} reviews, website: ${business.website || website || 'none'}`
    : `No Google data found`;

  const competitorContext = competitors.length > 0
    ? competitors.slice(0, 5).map(c => `${c.name} (${c.reviews} reviews, ${c.rating ?? '?'}★)`).join('; ')
    : 'No competitor data';

  const analysisPrompt = `Generate a GEO audit analysis. Return ONLY raw JSON, no markdown.

Business: ${name} | ${city}, ${state} | ${industry}
${businessContext}
Competitors: ${competitorContext}

I ran 3 real AI queries. Visibility result: mentioned in ${mentionsCount}/${totalQueries} queries (${visibilityScore}%)

${truncatedResponses}

Return this JSON exactly:
{"overallScore":55,"accuracy":50,"sentiment":65,"insights":[{"type":"positive|warning|negative","text":"insight that references actual query results, ~20 words"},{"type":"...","text":"..."},{"type":"...","text":"..."},{"type":"...","text":"..."}],"reportInsights":[{"type":"positive|warning|negative","text":"longer polished insight for printed report, 25-35 words, references real numbers"},{"type":"...","text":"..."},{"type":"...","text":"..."},{"type":"...","text":"..."}],"keyQuotes":["damaging or revealing 8-15 word excerpt from query 1 response","excerpt from query 2","excerpt from query 3"],"sources":[{"name":"Google Business","pct":35},{"name":"Yelp","pct":25},{"name":"Source3","pct":20},{"name":"Source4","pct":12},{"name":"Source5","pct":8}],"playbook":{"quickWins":["specific action","specific action","specific action"],"strategic":["strategic action","strategic action"],"easyExtras":["easy action","easy action"],"deprioritize":["low-value action","low-value action"]},"revenueImpact":{"estimate":"$2,400-4,800","explanation":"~25 words explaining how missing AI visibility costs them this monthly based on industry benchmarks"},"outreachSubject":"compelling 6-10 word email subject line that would make this owner open it","executiveSummary":"40-60 word summary of findings written for the business owner"}

CRITICAL:
- All scores must reflect actual ${visibilityScore}% visibility result
- Use industry-appropriate sources (StyleSeat/Vagaro for salons, Healthgrades for medical, Avvo for legal, TripAdvisor for restaurants)
- All insights/playbook items must be specific to ${name}, ${city}, ${industry}`;

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
      return new Response(JSON.stringify({ error: 'API non-JSON: ' + rawBody.slice(0, 200) }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    if (data.error) {
      return new Response(JSON.stringify({ error: data.error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const raw = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    const jsonStr = start !== -1 && end !== -1 ? raw.slice(start, end + 1) : raw;
    const analysis = JSON.parse(jsonStr);

    const audit = {
      ...analysis,
      visibility: visibilityScore,
      competitors: realCompetitorRanking.length > 0 ? realCompetitorRanking :
        competitors.slice(0, 4).map(c => ({ name: c.name, mentions: 0 })),
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
    };

    return new Response(JSON.stringify(audit), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
