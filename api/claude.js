// Revolv API Proxy — Vercel Edge Function
// Deploy this to Vercel and point revolv-studio.html at it.
//
// This proxy exists for ONE reason: Anthropic API cannot be called directly from a browser
// (CORS block). The browser calls THIS endpoint, which calls Anthropic server-side.
// Dealers never see this file — it runs on Vercel automatically.

export const config = {
  runtime: 'edge',
};

// Rate limit: simple in-memory per-IP counter (resets with each cold start)
// For production, move to Upstash Redis or similar.
const rateLimits = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 30; // 30 requests per minute per IP

function checkRateLimit(ip) {
  const now = Date.now();
  const bucket = rateLimits.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }
  bucket.count++;
  rateLimits.set(ip, bucket);
  return bucket.count <= RATE_LIMIT_MAX;
}

// CORS headers — allow the dealer's browser to call this endpoint
function corsHeaders(origin) {
  const allowed = origin || '*';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

export default async function handler(request) {
  const origin = request.headers.get('origin') || '*';

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
                                            status: 405,
                                            headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
                                          });
  }

  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
  if (!checkRateLimit(ip)) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Try again in a minute.' }), {
                                            status: 429,
                                            headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
                                          });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured on server' }), {
                                            status: 500,
                                            headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
                                          });
  }

  try {
    const body = await request.json();

    if (body.max_tokens && body.max_tokens > 4000) {
      body.max_tokens = 4000;
    }

    const allowedModels = [
      'claude-sonnet-4-20250514',
      'claude-haiku-4-5-20251001',
      'claude-opus-4-7',
    ];
    if (body.model && !allowedModels.includes(body.model)) {
      body.model = 'claude-sonnet-4-20250514';
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
                                        method: 'POST',
                                        headers: {
                                          'Content-Type': 'application/json',
                                          'x-api-key': apiKey,
                                          'anthropic-version': '2023-06-01',
                                        },
                                        body: JSON.stringify(body),
                                      });

    const data = await response.text();

    return new Response(data, {
                                  status: response.status,
                                  headers: {
                                    'Content-Type': 'application/json',
                                    ...corsHeaders(origin),
                                  },
                                });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Proxy error: ' + err.message }), {
                                            status: 500,
                                            headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
                                          });
  }
}
