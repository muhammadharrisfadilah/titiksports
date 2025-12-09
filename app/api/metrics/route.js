// app/api/metrics/route.js
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { anonymizeIP } from '@/lib/utils';

// Setup rate limiter (5 requests per second per IP)
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const limiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '1 s'),
});

export const runtime = 'edge';
const REQUEST_WINDOW = '1 s';

async function processInBackground(data) {
  // Simpan ke database atau analytics service
  // ...
}

function validateEventData(body) {
  if (!body.event || typeof body.event !== 'string') {
    return false;
  }

  if (body.value !== undefined && typeof body.value !== 'number') {
    return false;
  }

  return true;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
    const userAgent = request.headers.get('User-Agent') || 'unknown';

    // Validasi input
    if (!validateEventData(body)) {
      return Response.json(
        { success: false, error: 'Invalid event data' },
        { status: 400 }
      );
    }

    // Rate limiting (5 requests per second)
    const { success } = await limiter.limit(ip);
    if (!success) {
      return Response.json(
        { success: false, error: 'Too many requests' },
        { status: 429 }
      );
    }

    // Structured logging
    const logData = {
      event: body.event,
      path: body.path || '',
      value: body.value || 1,
      meta: {
        ip: anonymizeIP(ip),
        country: request.geo?.country || 'XX',
        ua: userAgent.substring(0, 120),
      }
    };

    console.log('[METRICS]', JSON.stringify(logData));

    // Async processing tidak-blocking
    processInBackground(logData);

    return Response.json({ success: true });
  } catch (error) {
    console.error('[Metrics API] Internal error:', error.message);
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
