export const config = { runtime: 'edge' };

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
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: 20000,
        },
      },
      maxResultCount: 10,
    }),
  });
  const data = await resp.json();
  return data.places || [];
}

async function getPlacesData(name, city, state, industry, googleApiKey) {
  try {
    // Geocode the city
    const geocodeResp = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(city + ', ' + state)}&key=${googleApiKey}`
    );
    const geocodeData = await geocodeResp.json();
    if (!geocodeData.results?.[0]) return { business: null, competitors: [] };

    const { lat, lng } = geocodeData.results[0].geometry.location;

    // Look up the actual business
    const bizResults = await searchPlace(name, city, state, lat, lng, googleApiKey);
    const business = bizResults.find(p =>
      p.displayName?.text?.toLowerCase().includes(name.toLowerCase().split(' ')[0])
    ) || bizResults[0] || null;

    // Look up competitors in the same industry
    const compResults = await searchPlace(industry, city, state, lat, lng, googleApiKey);
    const competitors = compResults
      .filter(p => !p.displayName?.text?.toLowerCase().includes(name.toLowerCase()))
      .slice(0, 5)
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

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const { name, city, state, industry, website } = await req.json();
  const googleApiKey = process.env.GOOGLE_PLACES_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  const { business, competitors } = googleApiKey
    ? await getPlacesData(name, city, state, industry, googleApiKey)
    : { business: null, competitors: [] };

  // Build business context with real data
  const businessContext = business
    ? `REAL DATA for ${name} from Google:
- Google rating: ${business.rating ?? 'not found'} stars
- Google review count: ${business.reviews} reviews
- Website: ${business.website || website || 'not found'}`
    : `Business: ${name} (no Google Places data found, use your best knowledge)`;

  const competitorContext = competitors.length > 0
    ? `REAL local competitors from Google Places:\n` +
      competitors.map(c => `- ${c.name}: ${c.reviews} Google reviews, ${c.rating ?? 'no'} star rating`).join('\n')
    : `No competitor data found — use your best knowledge of ${industry} in ${city}, ${state}.`;

  const systemPrompt = `You are a GEO (Generative Engine Optimization) analyst. You audit how local businesses appear in AI-generated search results. Return ONLY raw JSON — no markdown, no backticks, no explanation. Just the JSON object.`;

  const userPrompt = `Generate a GEO visibility audit using the REAL data provided below. Do not contradict or ignore the real data.

Business: ${name}
Location: ${city}, ${state}
Industry: ${industry}

${businessContext}

${competitorContext}

Consider how AI models respond to queries like:
- "Best ${industry} in ${city}"
- "Is ${name} a good ${industry}?"
- "Top ${industry} near ${city}, ${state}"

Return ONLY raw JSON (no markdown, no backticks):

{"overallScore":55,"visibility":60,"accuracy":50,"sentiment":65,"insights":[{"type":"positive","text":"Specific insight using the real data above"},{"type":"warning","text":"Specific warning based on real data"},{"type":"negative","text":"Specific issue based on real data"},{"type":"positive","text":"Another finding"}],"sources":[{"name":"Google Business","pct":35},{"name":"Yelp","pct":25},{"name":"Source3","pct":20},{"name":"Source4","pct":12},{"name":"Source5","pct":8}],"competitors":[{"name":"EXACT name from competitor list","mentions":8},{"name":"EXACT name","mentions":6},{"name":"EXACT name","mentions":5},{"name":"EXACT name","mentions":3}],"playbook":{"quickWins":["Specific action","Specific action","Specific action"],"strategic":["Strategic action","Strategic action"],"easyExtras":["Easy action","Easy action"],"deprioritize":["Low-value action","Low-value action"]}}

CRITICAL RULES:
- Use the EXACT real review counts and ratings provided — never make up different numbers
- Use ONLY competitor names from the list above
- If ${name} has MORE reviews than competitors, frame that as a strength
- If ${name} has FEWER reviews than competitors, frame that as a weakness
- Use industry-appropriate sources (StyleSeat/Vagaro for salons, Healthgrades for medical, Avvo for legal, TripAdvisor for restaurants)
- All insights must reference the real data provided`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    const data = await response.json();
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
    const audit = JSON.parse(jsonStr);

    // Attach raw data for transparency
    audit._meta = {
      competitorsSource: competitors.length > 0 ? 'google_places' : 'ai_generated',
      businessData: business,
      competitorData: competitors,
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
