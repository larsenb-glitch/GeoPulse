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

// ============ AI QUERIES ============
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
        model: 'claude-sonnet-4-5',
        max_tokens: 500,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await resp.json();
    if (data.error) return { text: '', error: data.error.message };
    const text = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n');
    return { text, error: null };
  } catch (err) {
    return { text: '', error: err.message };
  }
}

function checkMention(text, businessName) {
  if (!text) return { mentioned: false, position: -1 };
  const lower = text.toLowerCase();
  const nameLower = businessName.toLowerCase();
  // Try full name first, then first word
  let idx = lower.indexOf(nameLower);
  if (idx === -1) {
    const firstWord = nameLower.split(' ')[0];
    if (firstWord.length > 3) idx = lower.indexOf(firstWord);
  }
  if (idx === -1) return { mentioned: false, position: -1 };
  // Estimate "position" by where in the response it appears (1 = top, higher = lower)
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
    `What are the best ${industry} businesses in ${city}, ${state}? List the top 5 with brief descriptions.`,
    `Recommend a good ${industry} near ${city}, ${state}. What are my best options?`,
    `Where should I go for ${industry} services in ${city}? I want highly-rated options.`,
    `What's the most popular ${industry} in ${city}, ${state}?`,
    `I just moved to ${city}, ${state}. Where do locals go for ${industry}?`,
    `Is ${name} a good ${industry} in ${city}? How does it compare to competitors?`,
  ];

  // Run in batches of 2 to avoid rate limits
  const results = [];
  for (let i = 0; i < queries.length; i += 2) {
    const batch = queries.slice(i, i + 2);
    const batchResults = await Promise.all(
      batch.map(async (q) => {
        const { text, error } = await queryClaudeWithSearch(q, anthropicKey);
        const mention = checkMention(text, name);
        const competitorsMentioned = findCompetitorMentions(text, competitorList);
        return {
          query: q,
          response: text,
          mentioned: mention.mentioned,
          position: mention.position,
          competitorsMentioned: competitorsMentioned.map(c => c.name),
          error,
        };
      })
    );
    results.push(...batchResults);
    // Small delay between batches
    if (i + 2 < queries.length) await new Promise(r => setTimeout(r, 1000));
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

  // Step 2: Run real AI queries
  const aiQueries = await runAIQueries(name, city, state, industry, competitors, anthropicKey);

  // Step 3: Calculate REAL metrics from actual AI responses
  const totalQueries = aiQueries.length;
  const mentionsCount = aiQueries.filter(q => q.mentioned).length;
  const visibilityScore = Math.round((mentionsCount / totalQueries) * 100);

  // Aggregate competitor mention counts from real query results
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

  // Step 4: Send everything to Claude for analysis + playbook
  const businessContext = business
    ? `REAL Google data for ${name}:
- Rating: ${business.rating ?? 'unknown'} stars
- Review count: ${business.reviews}
- Website: ${business.website || website || 'none found'}`
    : `Business: ${name} (no Google data found)`;

  const queryResultsContext = aiQueries.map((q, i) => {
    const status = q.mentioned ? `✅ MENTIONED (position ${q.position})` : '❌ NOT MENTIONED';
    const compsList = q.competitorsMentioned.length > 0
      ? `Competitors mentioned: ${q.competitorsMentioned.join(', ')}`
      : 'No tracked competitors mentioned';
    return `Query ${i + 1}: "${q.query}"
Result: ${status}
${compsList}`;
  }).join('\n\n');

  const competitorContext = competitors.length > 0
    ? competitors.map(c => `- ${c.name}: ${c.reviews} reviews, ${c.rating ?? 'no'} stars`).join('\n')
    : 'No competitor data';

  const analysisPrompt = `You are a GEO (Generative Engine Optimization) analyst. I just ran 6 real AI queries to test how this business appears in AI-generated search results. Generate the analysis based on the ACTUAL results below.

Business: ${name}
Location: ${city}, ${state}
Industry: ${industry}

${businessContext}

REAL COMPETITORS:
${competitorContext}

REAL AI QUERY RESULTS (this is what AI actually said):
${queryResultsContext}

ACTUAL VISIBILITY: ${name} appeared in ${mentionsCount} out of ${totalQueries} queries (${visibilityScore}%)

Now generate a JSON analysis. Return ONLY raw JSON — no markdown, no backticks:

{"overallScore":55,"accuracy":50,"sentiment":65,"insights":[{"type":"positive|warning|negative","text":"insight based on real query results"},{"type":"...","text":"..."},{"type":"...","text":"..."},{"type":"...","text":"..."}],"sources":[{"name":"Google Business","pct":35},{"name":"Yelp","pct":25},{"name":"Source3","pct":20},{"name":"Source4","pct":12},{"name":"Source5","pct":8}],"playbook":{"quickWins":["specific action","specific action","specific action"],"strategic":["strategic action","strategic action"],"easyExtras":["easy action","easy action"],"deprioritize":["low-value action","low-value action"]}}

CRITICAL RULES:
- Insights must reference the REAL query results above (e.g. "appeared in only X of 6 queries", "competitor Y dominated 4 of the queries")
- overallScore should reflect actual visibility (${visibilityScore}%) blended with their Google reputation
- Use industry-appropriate sources (StyleSeat/Vagaro for salons, Healthgrades for medical, Avvo for legal, etc.)
- Make playbook actions specific to fixing what the real queries revealed
- Do NOT include "visibility" or "competitors" in the JSON — those are calculated from real data already`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1500,
        messages: [{ role: 'user', content: analysisPrompt }],
      }),
    });

    const data = await resp.json();
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

    // Build the final audit object combining real data + AI analysis
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
