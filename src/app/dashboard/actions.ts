"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getBot, requireBot, requireUser } from "@/lib/bot";
import { encrypt } from "@/lib/crypto";
import { env } from "@/lib/env";
import { extractFileText, MAX_SOURCE_CHARS, reindexSource } from "@/lib/knowledge";
import * as line from "@/lib/line";

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const back = (path: string, kind: "ok" | "error", msg: string) =>
  redirect(`${path}?${kind}=${encodeURIComponent(msg)}`);

// ── 機器人 ──
export async function createBot(fd: FormData) {
  const { supabase, user } = await requireUser();
  const businessName = str(fd, "business_name");
  if (!businessName) back("/dashboard", "error", "請輸入店家名稱");
  const { error } = await supabase
    .from("bots")
    .insert({ owner_id: user.id, business_name: businessName, handoff_email: user.email });
  if (error && error.code !== "23505") back("/dashboard", "error", "建立失敗：" + error.message);
  redirect("/dashboard/knowledge?ok=" + encodeURIComponent("機器人已建立！接著新增您的知識庫內容"));
}

export async function updateBotSettings(fd: FormData) {
  const { supabase, bot } = await requireBot();
  const businessName = str(fd, "business_name");
  if (!businessName) back("/dashboard", "error", "請輸入店家名稱");
  const { error } = await supabase
    .from("bots")
    .update({
      business_name: businessName,
      custom_instructions: str(fd, "custom_instructions").slice(0, 4000),
      handoff_email: str(fd, "handoff_email") || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", bot.id);
  if (error) back("/dashboard", "error", "儲存失敗：" + error.message);
  revalidatePath("/dashboard");
  back("/dashboard", "ok", "設定已儲存");
}

// ── 知識庫 ──
async function saveSource(title: string, content: string, kind: "text" | "file", id?: string) {
  const { supabase, bot } = await requireBot();
  const path = "/dashboard/knowledge";
  if (!title) back(path, "error", "請輸入標題");
  if (!content) back(path, "error", "內容不可為空白");
  if (content.length > MAX_SOURCE_CHARS) back(path, "error", `內容過長（上限 ${MAX_SOURCE_CHARS.toLocaleString()} 字）`);

  const now = new Date().toISOString();
  const query = id
    ? supabase.from("knowledge_sources").update({ title, content, updated_at: now }).eq("id", id).eq("bot_id", bot.id)
    : supabase.from("knowledge_sources").insert({ bot_id: bot.id, title, content, kind });
  const { data: source, error } = await query.select("id, bot_id, title, content").single();
  if (error || !source) back(path, "error", "儲存失敗：" + (error?.message ?? "找不到資料"));

  let count = 0;
  try {
    count = await reindexSource(supabase, source!);
  } catch (err) {
    console.error("[knowledge] 建立索引失敗", err);
    back(path, "error", "已儲存，但建立向量索引失敗，請稍後再按一次儲存");
  }
  revalidatePath(path);
  back(path, "ok", `已儲存「${title}」（${count} 個段落）`);
}

export async function addTextSource(fd: FormData) {
  await saveSource(str(fd, "title"), str(fd, "content"), "text");
}

export async function updateSource(fd: FormData) {
  await saveSource(str(fd, "title"), str(fd, "content"), "text", str(fd, "id"));
}

export async function uploadFileSource(fd: FormData) {
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) back("/dashboard/knowledge", "error", "請選擇檔案");
  const f = file as File;
  if (f.size > 10 * 1024 * 1024) back("/dashboard/knowledge", "error", "檔案不可超過 10MB");
  let text = "";
  try {
    text = (await extractFileText(f)).trim();
  } catch (err) {
    back("/dashboard/knowledge", "error", err instanceof Error ? err.message : "無法讀取檔案");
  }
  if (!text) back("/dashboard/knowledge", "error", "無法從檔案擷取文字（掃描版 PDF 目前不支援）");
  await saveSource(str(fd, "title") || f.name, text, "file");
}

export async function deleteSource(fd: FormData) {
  const { supabase, bot } = await requireBot();
  await supabase.from("knowledge_sources").delete().eq("id", str(fd, "id")).eq("bot_id", bot.id);
  revalidatePath("/dashboard/knowledge");
  back("/dashboard/knowledge", "ok", "已刪除");
}

// ── LINE 連線 ──
export async function connectLine(fd: FormData) {
  const { supabase, bot } = await requireBot();
  const path = "/dashboard/line";
  const secret = str(fd, "channel_secret");
  const token = str(fd, "channel_access_token");
  if (!secret || !token) back(path, "error", "請填入 Channel Secret 與 Channel Access Token");
  if (!/^[0-9a-f]{32}$/i.test(secret)) back(path, "error", "Channel Secret 格式不正確（應為 32 碼英數）");

  let info: Awaited<ReturnType<typeof line.getBotInfo>>;
  try {
    info = await line.getBotInfo(token);
  } catch {
    back(path, "error", "Channel Access Token 驗證失敗，請確認是否複製完整（長期 token）");
  }

  // 嘗試自動設定 webhook 網址（失敗時請店家手動貼上）
  const webhookUrl = `${env.appUrl}/api/line/webhook/${bot.id}`;
  let webhookSet = true;
  try {
    await line.setWebhookEndpoint(token, webhookUrl);
  } catch (err) {
    console.warn("[line] 自動設定 webhook 失敗", err);
    webhookSet = false;
  }

  const { error } = await supabase
    .from("bots")
    .update({
      line_channel_secret_enc: encrypt(secret),
      line_access_token_enc: encrypt(token),
      line_bot_user_id: info!.userId,
      line_bot_name: info!.displayName,
      line_basic_id: info!.basicId,
      line_token_verified_at: new Date().toISOString(),
      line_webhook_verified_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", bot.id);
  if (error) back(path, "error", "儲存失敗：" + error.message);
  revalidatePath(path);
  back(
    path,
    "ok",
    `已連線「${info!.displayName}」` +
      (webhookSet ? "，Webhook 網址已自動設定。" : "。請手動將 Webhook 網址貼到 LINE Developers。") +
      "請完成下方步驟並按「Verify」。",
  );
}

export async function disconnectLine() {
  const { supabase, bot } = await requireBot();
  await supabase
    .from("bots")
    .update({
      line_channel_secret_enc: null,
      line_access_token_enc: null,
      line_bot_user_id: null,
      line_bot_name: null,
      line_basic_id: null,
      line_token_verified_at: null,
      line_webhook_verified_at: null,
    })
    .eq("id", bot.id);
  revalidatePath("/dashboard/line");
  back("/dashboard/line", "ok", "已中斷 LINE 連線");
}

// ── 對話 ──
export async function resumeAi(fd: FormData) {
  const { supabase } = await getBot();
  const id = str(fd, "id");
  await supabase.from("conversations").update({ handoff_requested_at: null }).eq("id", id);
  revalidatePath(`/dashboard/conversations/${id}`);
  back(`/dashboard/conversations/${id}`, "ok", "已恢復 AI 自動回覆");
}
