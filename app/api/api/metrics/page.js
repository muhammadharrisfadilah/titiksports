// app/api/metrics/route.js

export const runtime = 'edge';

export async function POST(request) {
  try {
    const body = await request.json();
    
    // Log metrics (atau kirim ke analytics service)
    if (process.env.NODE_ENV === 'development') {
      console.log('[Metrics]', body.event, body);
    }
    
    // Optional: Store in database/analytics
    // await storeMetrics(body);
    
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}