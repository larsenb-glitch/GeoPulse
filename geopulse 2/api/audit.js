export const config = { runtime: 'edge' };

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

  const systemPrompt = `You are a GEO (Generative Engine Optimization) analyst. You research local businesses and audit how they appear in AI-generated search results. Return ONLY raw JSON — no markdown, no backticks, no explanation whatsoever. Just the JSON object.`;

  const userPrompt = `Research this business and generate a detailed GEO visibility audit:

Business: ${name}
Location: ${city}, ${state}
Industry: ${industry}
Website: ${website || 'not provided'}

Simulate querying multiple AI models with prompts like:
- "Best ${industry} in ${city}"
- "Is ${name} a good ${industry}?"  
- "Top ${industry} near ${city}, ${state}"
- "Reviews of ${name}"

Return ONLY this exact JSON structure with realistic data specific to this business:

{"overallScore":55,"visibility":60,"accuracy":50,"sentiment":65,"insights":[{"type":"positive","text":"Specific insight about this business's AI presence"},{"type":"warning","text":"Specific warning about a gap or issue"},{"type":"negative","text":"Specific problem with their AI visibility"},{"type":"positive","text":"Another positive finding"}],"sources":[{"name":"Google","pct":30},{"name":"Yelp","pct":25},{"name":"Source3","pct":20},{"name":"Source4","pct":15},{"name":"Source5","pct":10}],"competitors":[{"name":"Real Competitor Name in ${city}","mentions":8},{"name":"Real Competitor 2","mentions":6},{"name":"Real Competitor 3","mentions":5},{"name":"Real Competitor 4","mentions":3}],"playbook":{"quickWins":["Specific actionable task","Specific actionable task","Specific actionable task"],"strategic":["Longer-term strategic action","Longer-term strategic action"],"easyExtras":["Easy low-impact action","Easy low-impact action"],"deprioritize":["Low-value action","Low-value action"]}}

Rules:
- Scores should reflect how well a typical ${industry} in ${city} would appear in AI searches (smaller cities = lower scores generally)
- Use industry-appropriate sources (Healthgrades/WebMD for medical, Avvo/FindLaw for legal, TripAdvisor/OpenTable for restaurants, Houzz for home services, etc.)
- Name REAL competitors that actually exist in ${city} for ${industry}
- Make insights and playbook actions highly specific to this business type and location`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
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

    const raw = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    const jsonStr = start !== -1 && end !== -1 ? raw.slice(start, end + 1) : raw;
    const audit = JSON.parse(jsonStr);

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
