-- SME LINE AI 客服 — 初始資料庫結構
-- 在 Supabase SQL Editor 執行，或使用 `supabase db push`。

create extension if not exists vector;

-- ───────────────────────── 機器人（每位店家一個） ─────────────────────────
create table public.bots (
  id                        uuid primary key default gen_random_uuid(),
  owner_id                  uuid not null unique references auth.users(id) on delete cascade,
  business_name             text not null,
  -- 店家自訂的語氣、規則（會加入系統提示詞）
  custom_instructions       text not null default '',
  -- 「轉真人」通知寄送的 email
  handoff_email             text,
  -- LINE 憑證（以 ENCRYPTION_KEY 進行 AES-256-GCM 加密後儲存）
  line_channel_secret_enc   text,
  line_access_token_enc     text,
  line_bot_user_id          text,
  line_bot_name             text,
  line_basic_id             text,
  line_token_verified_at    timestamptz,
  line_webhook_verified_at  timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- ───────────────────────── 訂閱（只由伺服器 / Stripe webhook 寫入） ─────────────────────────
create table public.subscriptions (
  bot_id                  uuid primary key references public.bots(id) on delete cascade,
  plan                    text not null default 'free' check (plan in ('free', 'pro')),
  status                  text not null default 'none',
  stripe_customer_id      text unique,
  stripe_subscription_id  text unique,
  updated_at              timestamptz not null default now()
);

-- ───────────────────────── 知識庫 ─────────────────────────
create table public.knowledge_sources (
  id          uuid primary key default gen_random_uuid(),
  bot_id      uuid not null references public.bots(id) on delete cascade,
  title       text not null,
  kind        text not null check (kind in ('text', 'file')),
  content     text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on public.knowledge_sources (bot_id);

-- text-embedding-3-small = 1536 維
create table public.knowledge_chunks (
  id          bigint generated always as identity primary key,
  source_id   uuid not null references public.knowledge_sources(id) on delete cascade,
  bot_id      uuid not null references public.bots(id) on delete cascade,
  content     text not null,
  embedding   vector(1536) not null
);
create index on public.knowledge_chunks (bot_id);
create index on public.knowledge_chunks using hnsw (embedding vector_cosine_ops);

-- ───────────────────────── 對話與訊息 ─────────────────────────
create table public.conversations (
  id                    uuid primary key default gen_random_uuid(),
  bot_id                uuid not null references public.bots(id) on delete cascade,
  line_user_id          text not null,
  display_name          text,
  -- 不為 null 時：客人要求真人，AI 暫停回覆此對話
  handoff_requested_at  timestamptz,
  last_message_at       timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  unique (bot_id, line_user_id)
);
create index on public.conversations (bot_id, last_message_at desc);

create table public.messages (
  id               bigint generated always as identity primary key,
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  bot_id           uuid not null references public.bots(id) on delete cascade,
  role             text not null check (role in ('user', 'assistant', 'system')),
  content          text not null,
  -- LINE 訊息 id，用來避免 webhook 重送造成重複處理
  line_message_id  text unique,
  created_at       timestamptz not null default now()
);
create index on public.messages (conversation_id, created_at);

-- ───────────────────────── 用量（每月 AI 回覆數，以台北時間計） ─────────────────────────
create table public.usage_counters (
  bot_id  uuid not null references public.bots(id) on delete cascade,
  period  text not null, -- 'YYYY-MM'
  count   integer not null default 0,
  primary key (bot_id, period)
);

create or replace function public.current_usage_period()
returns text language sql stable as $$
  select to_char(now() at time zone 'Asia/Taipei', 'YYYY-MM');
$$;

-- 原子性地扣一則額度；超過上限回傳 false
create or replace function public.consume_message_quota(p_bot_id uuid, p_limit integer)
returns boolean language plpgsql as $$
declare
  v_count integer;
begin
  insert into public.usage_counters (bot_id, period, count)
  values (p_bot_id, public.current_usage_period(), 1)
  on conflict (bot_id, period)
    do update set count = public.usage_counters.count + 1
    where public.usage_counters.count < p_limit
  returning count into v_count;
  return v_count is not null;
end;
$$;

-- 向量相似度搜尋
create or replace function public.match_chunks(
  p_bot_id uuid,
  p_embedding vector(1536),
  p_match_count integer default 6,
  p_min_similarity float default 0.2
)
returns table (id bigint, content text, similarity float)
language sql stable as $$
  select c.id, c.content, 1 - (c.embedding <=> p_embedding) as similarity
  from public.knowledge_chunks c
  where c.bot_id = p_bot_id
    and 1 - (c.embedding <=> p_embedding) >= p_min_similarity
  order by c.embedding <=> p_embedding
  limit p_match_count;
$$;

-- 這些函式只給伺服器（service role）使用
revoke execute on function public.consume_message_quota(uuid, integer) from public, anon, authenticated;
revoke execute on function public.match_chunks(uuid, vector, integer, float) from public, anon, authenticated;

-- ───────────────────────── Row Level Security ─────────────────────────
alter table public.bots              enable row level security;
alter table public.subscriptions     enable row level security;
alter table public.knowledge_sources enable row level security;
alter table public.knowledge_chunks  enable row level security;
alter table public.conversations     enable row level security;
alter table public.messages          enable row level security;
alter table public.usage_counters    enable row level security;

create or replace function public.owns_bot(p_bot_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.bots where id = p_bot_id and owner_id = auth.uid());
$$;

-- 店家可完整管理自己的機器人與知識庫
create policy "own bot" on public.bots
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own sources" on public.knowledge_sources
  for all using (public.owns_bot(bot_id)) with check (public.owns_bot(bot_id));
create policy "own chunks" on public.knowledge_chunks
  for all using (public.owns_bot(bot_id)) with check (public.owns_bot(bot_id));

-- 對話：可讀、可更新（例如恢復 AI 回覆）
create policy "read own conversations" on public.conversations
  for select using (public.owns_bot(bot_id));
create policy "update own conversations" on public.conversations
  for update using (public.owns_bot(bot_id)) with check (public.owns_bot(bot_id));

-- 唯讀：訊息、訂閱、用量（只由伺服器寫入，避免店家自行改方案或用量）
create policy "read own messages" on public.messages
  for select using (public.owns_bot(bot_id));
create policy "read own subscription" on public.subscriptions
  for select using (public.owns_bot(bot_id));
create policy "read own usage" on public.usage_counters
  for select using (public.owns_bot(bot_id));

-- 建立機器人時自動建立免費方案訂閱列
create or replace function public.handle_new_bot()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.subscriptions (bot_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
create trigger on_bot_created after insert on public.bots
  for each row execute function public.handle_new_bot();
