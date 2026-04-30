export const config = { runtime: 'edge' };

async function getRealCompetitors(name, city, state, industry, googleApiKey) {
  try {
    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(city + ', ' + state)}&key=${googleApiKey}`;
    const geocodeResp = await fetch(geocodeUrl);
    const geocodeData = await geocodeResp.json();

    if (!geocodeData.results?.[0]) return [];

    const { lat, lng } = geocodeData.results[0].geometry.location;

    const placesResp = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': googleApiKey,
        'X-Goog-FieldMask': 'places.displayName,places.rating,places.userRatingCount',
      },
      body: JSON.stringify({
        textQuery: `${industry} in ${city}, ${state}`,
        locationBias: {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius: 20000,
          },
        },
        maxResultCount: 10,
      }),
    });

    const placesData = await placesResp.json();
    if (!placesData.places) return [];

    return placesData.places
      .filter(p => !p.displayName?.text?.toLowerCase().includes(name.toLowerCase()))
      .slice(0, 5)
      .map(p => ({
        name: p.displayName?.text || 'Unknown',
        rating: p.rating || null,
        reviews: p.userRatingCount || 0,
      }));
  } catch (err) {
    return [];
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

  const realCompetitors = googleApiKey
    ? await getRealCompetitors(name, city, state, industry, googleApiKey)
    : [];

  const competitorContext = realCompetitors.length > 0
    ? `Here are REAL competitors pulled from Google Places for ${industry} in ${city}, ${state}:\n` +
      realCompetitors.map(c => `- ${c.name} (${c.reviews} Google reviews, ${c.rating ?? 'no'} star rating)`).join('\n')
    : `No competitor data available — use your best knowledge of ${industry} businesses in ${city}, ${state}.`;

  const systemPrompt = `You are a GEO (Generative Engine Optimization) analyst. You audit how local businesses appear in AI-generated search results. Return ONLY raw JSON — no markdown, no backticks, no explanation. Just the JSON object.`;

  const userPrompt = `Research this business and generate a detailed GEO visibility audit:

Business: ${name}
Location: ${city}, ${state}
Industry: ${industry}
Website: ${website || 'not provided'}

${competitorContext}

Consider how this business appears when AI models are asked:
- "Best ${industry} in ${city}"
- "Is ${name} a good ${industry}?"
- "Top ${industry} near ${city}, ${state}"
- "Reviews of ${name}"

Return ONLY this exact JSON — no markdown, no backticks, raw JSON only:

{"overallScore":55,"visibility":60,"accuracy":50,"sentiment":65,"insights":[{"type":"positive","text":"Specific insight about this business"},{"type":"warning","text":"Specific warning"},{"type":"negative","text":"Specific problem"},{"type":"positive","text":"Another finding"}],"sources":[{"name":"Google Business","pct":35},{"name":"Yelp","pct":25},{"name":"Source3","pct":20},{"name":"Source4","pct":12},{"name":"Source5","pct":8}],"competitors":[{"name":"EXACT name from list above","mentions":8},{"name":"EXACT name","mentions":6},{"name":"EXACT name","mentions":5},{"name":"EXACT name","mentions":3}],"playbook":{"quickWins":["Specific action","Specific action","Specific action"],"strategic":["Strategic action","Strategic action"],"easyExtras":["Easy action","Easy action"],"deprioritize":["Low-value action","Low-value action"]}}

IMPORTANT:
- Use ONLY real competitor names from the list provided — never invent businesses
- Use industry-appropriate sources (StyleSeat/Vagaro for salons, Healthgrades for medical, Avvo for legal, TripAdvisor for restaurants, etc.)
- Make all insights and playbook actions specific to ${name} in ${city}, ${state}`;

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

    audit._competitorsSource = realCompetitors.length > 0 ? 'google_places' : 'ai_generated';

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
