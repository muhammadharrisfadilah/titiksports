# TitikSports — Streaming Bola (streaming-bola)

This repository contains the Next.js frontend and guidance for the Cloudflare Worker backend used as a streaming proxy. The app supports P2P signaling (Supabase) to reduce server bandwidth.

## Quick start (development)

1. Copy `.env.example` → `.env.local` and fill the values (do NOT commit `.env.local`).
2. Install and run the frontend:

```powershell
cd streaming-bola
npm install
npm run dev
```

3. Start the Cloudflare Worker (in a separate terminal):

```powershell
cd backend
wrangler secret put TOKEN_SECRET_KEY
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_ANON_KEY
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put ADMIN_USERNAME
wrangler secret put ADMIN_PASSWORD
wrangler dev
```

4. Visit `http://localhost:3000` and open two browser tabs to test P2P signaling.

## Environment variables
See `.env.example`. Key server-side secrets:

- `SUPABASE_SERVICE_ROLE_KEY` — server-only (used by `supabaseAdmin`)
- `TOKEN_SECRET_KEY` — worker HMAC secret
- `ADMIN_USERNAME` / `ADMIN_PASSWORD`

## Database migration
Run `backend/schema.sql` in your Supabase SQL editor to create tables, including `signals`.

## P2P signaling (Supabase REST)
- The app ships a polling-based signaling implementation using Supabase `signals` table. It's low-cost and suitable for small-to-medium traffic.
- For lower latency, consider a WebSocket solution (Durable Objects or a `ws` server).

## Maintenance
- A cleanup route `POST /api/signals/cleanup` is provided to purge old signals. Protect this endpoint with admin credentials or call it from a scheduled job.

### Automatic cleanup (recommended)

I added a GitHub Actions workflow `.github/workflows/cleanup-signals.yml` that calls the cleanup endpoint every hour. To enable it:

1. In your repository Secrets, add:
	- `CLEANUP_URL` — the full URL to your deployed cleanup endpoint (e.g. `https://example.com/api/signals/cleanup`)
	- `ADMIN_USERNAME` and `ADMIN_PASSWORD` — used to generate a base64 token for the call

2. The workflow will send a base64 token (username:timestamp) and call the endpoint to delete signals older than 600s.

If you prefer HMAC-signed tokens, you can modify the workflow to sign the payload with `TOKEN_SECRET_KEY` and post the signed token instead.

## Next steps I can help with
- Add scheduled cleanup (GitHub Action or cron job).
- Implement WebSocket signaling (Durable Objects or small `ws` server).
- Add observability and alerts (Logflare / Sentry).

If you want, tell me which of the next steps to implement and I'll apply the changes.
This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.js`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
