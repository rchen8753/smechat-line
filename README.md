# LINE AI 客服 (SME Chatbot MVP)

Taiwan-focused, LINE-first AI customer-service bot for SMEs. Owners sign up, paste FAQs / upload docs, connect their LINE Official Account, and customers get Traditional Chinese answers grounded only in that knowledge base.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind v4 · Supabase (Auth + Postgres + pgvector) · Claude (replies) · OpenAI `text-embedding-3-small` (embeddings) · LINE Messaging API · Stripe · Resend (email)

## How a LINE message is answered

```
LINE ──POST──▶ /api/line/webhook/[botId]
                 │ verify x-line-signature (HMAC-SHA256, per-bot channel secret)
                 │ return 200 immediately, continue in after()
                 ▼
          lib/line-handler.ts
           1. upsert conversation (fetch LINE display name)
           2. save message (unique line_message_id → redeliveries ignored)
           3. "真人 / 聯絡真人客服 / talk to human" → pause AI for this chat, email owner
           4. conversation in handoff → stay silent
           5. consume_message_quota() (atomic, per Taipei calendar month)
           6. show LINE loading animation
           7. embed question → match_chunks() (pgvector) → Claude with knowledge + last 12 msgs
           8. save reply → LINE reply API (falls back to push if replyToken expired)
```

Every bot reply carries a quick-reply button 「聯絡真人客服」.

## Project layout

```
supabase/migrations/0001_init.sql   schema, RLS, match_chunks(), consume_message_quota()
src/proxy.ts                        Supabase session refresh + /dashboard guard (Next 16 "proxy" = middleware)
src/lib/
  line.ts            LINE API client, signature check, handoff keywords
  line-handler.ts    the webhook → RAG → reply flow
  rag.ts             system prompt, retrieval, Claude call
  knowledge.ts       chunk + embed + store; .txt/.pdf extraction
  chunk.ts           character-based chunker (works for Chinese)
  plans.ts           plan limits (free 100 / pro 3,000 replies per month)
  crypto.ts          AES-256-GCM for LINE credentials at rest
src/app/
  api/line/webhook/[botId]   LINE webhook
  api/stripe/{checkout,portal,webhook}
  dashboard/                 總覽與設定 · 知識庫 · LINE 連線 · 對話紀錄 · 方案與付款
  login/, auth/callback, auth/signout
scripts/send-test-webhook.mjs  fire a signed fake LINE message at your local server
```

## Setup

### 1. Supabase
1. Create a project. In **SQL Editor**, run `supabase/migrations/0001_init.sql`.
2. **Authentication → Providers**: Email is on by default. Enable **Google** (needs a Google OAuth client; redirect URI shown in Supabase).
3. **Authentication → URL Configuration**: Site URL = your app URL; add `http://localhost:3000/auth/callback` and `https://<prod>/auth/callback` to redirect URLs.
4. Copy URL, anon key, service-role key into `.env.local`.

### 2. Environment
```bash
cp .env.example .env.local
openssl rand -base64 32   # → ENCRYPTION_KEY
npm install
npm run dev
```

### 3. LINE (testing locally)
LINE must reach your webhook over HTTPS, so expose your dev server (e.g. `ngrok http 3000`) and set `NEXT_PUBLIC_APP_URL` to that URL **before** connecting.

1. In LINE Developers, create a Messaging API channel for your Official Account.
2. In the dashboard → **LINE 連線**, paste the Channel secret + long-lived Channel access token. The app verifies the token (`GET /v2/bot/info`) and sets the webhook URL automatically.
3. In LINE Developers turn on **Use webhook** and press **Verify** — the dashboard flips to "✅ 已收到 LINE 的請求".
4. In LINE Official Account Manager → 回應設定: turn **off** 自動回應訊息, **on** Webhook (and 聊天 if the owner wants to answer handoffs manually).

Without LINE at all, you can exercise the RAG path:
```bash
node scripts/send-test-webhook.mjs <botId> <channelSecret> "請問營業時間？"
```
The AI answer appears under 對話紀錄 (sending to LINE fails because the reply token is fake — expected).

### 4. Stripe
1. Create a product with a recurring monthly price (e.g. NT$1,990 TWD) → `STRIPE_PRICE_ID_PRO`.
2. Add a webhook endpoint `https://<app>/api/stripe/webhook` with events `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted` → `STRIPE_WEBHOOK_SECRET`.
   Locally: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
3. Enable the **Customer portal** in Stripe settings (used by 管理訂閱).

### 5. Deploy (Vercel)
Import the repo, set all env vars, deploy, then update `NEXT_PUBLIC_APP_URL`, the Supabase redirect URLs, and re-save LINE credentials once so the webhook URL points at production. The webhook route sets `maxDuration = 60` for the background AI reply.

## Design notes

- **Security:** LINE secrets are encrypted with `ENCRYPTION_KEY`. Owners can read/write their own bot and knowledge via RLS, but `subscriptions`, `usage_counters` and `messages` are read-only to them — only the service role (webhooks) writes plan and usage, so an owner can't upgrade themselves with the anon key.
- **Quota** counts AI replies (not handoff/quota notices) per Taipei calendar month. Over quota, customers get a polite "staff will reply" message.
- **Handoff:** the AI pauses for that customer until the owner clicks 恢復 AI 回覆 on the conversation page.
- **Model:** `ANTHROPIC_MODEL` (default `claude-opus-5-5`) at `effort: "low"` for fast, short replies, with server-side refusal fallback enabled. For high message volume you can point `ANTHROPIC_MODEL` at a cheaper model; check reply quality on your own FAQs first.
- **Embeddings** are OpenAI `text-embedding-3-small` (1536-d). Changing the model means changing `vector(1536)` and re-indexing.

## Out of scope (first wave)
FB/IG/WhatsApp, website widget, mobile app, flow builder, team seats, voice, CRM, analytics.
