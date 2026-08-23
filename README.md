# UWF YT Agent

Production-oriented operations dashboard and API foundation for an English, male-voice Crypto / Finance / Investing / Earning YouTube channel. The editorial policy publishes **two videos daily**: Shorts (30–60 seconds) on Friday and Sunday, and 5–10 minute long-form videos on every other day.

## What is included

- Responsive Next.js dashboard with queue, job states, connection/API visibility, schedule rule, and activity logs.
- A strict job-state model and a stage-by-stage pipeline contract: research → script → voice → visuals → assembly → thumbnail → quality check → upload → scheduled/published.
- Validated job APIs: `GET/POST /api/jobs`, `POST /api/jobs/:id/advance`, plus `GET /api/health`.
- Google OAuth authorization routes and a YouTube Data API upload function. Secrets remain server-only.
- Supabase schema for jobs, logs, and channel connections, plus a Vercel deployment configuration.

> **Important:** the dashboard's in-memory store is a safe local-development fallback and resets on server restart. It does not perform AI generation or upload content. Configure credentials, apply the database schema, provide durable encrypted token storage, and test each provider before enabling workers in production.

## Local development

1. Install Node.js 20.9+ and dependencies: `npm install`.
2. Copy `.env.example` to `.env.local`, then fill in real values locally (never commit this file).
3. Start: `npm run dev`; open `http://localhost:3000`.
4. Validate before deployment with `npm run lint`, `npm run typecheck`, and `npm run build`.

## Supabase

Create a Supabase project and run [`supabase/schema.sql`](supabase/schema.sql) in its SQL editor. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and the **server-only** `SUPABASE_SERVICE_ROLE_KEY` in the deployment environment. Enable RLS and create tenant-specific policies before exposing a multi-user dashboard. Persist OAuth refresh tokens encrypted at rest in `youtube_connections`; do not use browser storage or public environment variables for them.

## Google / YouTube OAuth

1. In Google Cloud, enable **YouTube Data API v3** and create a Web application OAuth client.
2. Add `http://localhost:3000/api/youtube/oauth/callback` locally and `https://YOUR_DOMAIN/api/youtube/oauth/callback` in production as authorized redirect URIs.
3. Add the client ID, secret, and exact callback URI as server environment variables.
4. Use **Connect YouTube** in the dashboard to grant `youtube.upload`. The callback returns an HTTP-only short-lived handoff cookie; production workers must exchange that result for encrypted server-side refresh-token storage.

The uploader in `lib/youtube.ts` supports title, description, tags, privacy, scheduled publish time, and a video stream. Add your worker runtime/queue (for example a protected Vercel Cron dispatcher plus a durable worker) to call it only after the quality gate. YouTube's `publishAt` requires an appropriate private scheduled upload.

## AI providers and workers

Provider keys are intentionally configuration-only in this repository. Set `AI_PROVIDER`, `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, and `VIDEO_PROVIDER` server-side, then implement adapters behind the pipeline stage boundary in `lib/pipeline.ts`. Do not claim generation has completed merely because a state advances: workers should validate artifacts, record structured logs, retry bounded transient errors with backoff, and mark the job `failed` with a safe error message after exhaustion.

## Vercel

Import the repository in Vercel, set all variables from `.env.example` in Project Settings, and deploy. `vercel.json` declares a 60-second API duration; long media work must run in an external worker/queue rather than an HTTP request. Protect cron/worker entry points with `CRON_SECRET` and never prefix secrets with `NEXT_PUBLIC_`.
