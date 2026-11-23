import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/crypto";
import { sendHandoffEmail } from "@/lib/email";
import { env } from "@/lib/env";
import * as line from "@/lib/line";
import { effectivePlan, PLANS } from "@/lib/plans";
import { FALLBACK_REPLY, generateReply } from "@/lib/rag";

export type BotRow = {
  id: string;
  owner_id: string;
  business_name: string;
  custom_instructions: string;
  handoff_email: string | null;
  line_access_token_enc: string | null;
};

const HISTORY_LIMIT = 12;

const MSG = {
  handoff: "好的，已為您通知專人，將盡快由真人客服回覆您，請稍候 🙏",
  quotaExceeded: "感謝您的訊息！目前線上客服忙碌中，我們已收到您的訊息，將由專人盡快回覆您。",
  unsupported: "目前僅支援文字訊息，請直接輸入您的問題，謝謝！",
};

// 處理單一 LINE 事件。由 webhook 在回應 200 之後（after()）執行。
export async function handleLineEvent(admin: SupabaseClient, bot: BotRow, event: line.LineEvent) {
  if (event.type !== "message" || !("message" in event)) return;
  const userId = event.source.type === "user" ? event.source.userId : undefined;
  if (!userId || !bot.line_access_token_enc) return; // MVP：只處理一對一聊天

  const token = decrypt(bot.line_access_token_enc);
  const replyText = (text: string, withButton = true) =>
    sendReply(token, event.replyToken, userId, line.textMessage(text, withButton));

  if (event.message.type !== "text" || !("text" in event.message)) {
    await replyText(MSG.unsupported);
    return;
  }
  const text = event.message.text.trim();

  // 1) 取得或建立對話
  const conversation = await upsertConversation(admin, bot.id, userId, token);

  // 2) 存客人訊息（line_message_id 唯一，避免 webhook 重送重複處理）
  const { error: insertErr } = await admin.from("messages").insert({
    conversation_id: conversation.id,
    bot_id: bot.id,
    role: "user",
    content: text,
    line_message_id: event.message.id,
  });
  if (insertErr) {
    if (insertErr.code === "23505") return; // 已處理過
    throw insertErr;
  }
  await admin.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversation.id);

  // 3) 轉真人
  if (line.wantsHuman(text)) {
    if (!conversation.handoff_requested_at) {
      await admin
        .from("conversations")
        .update({ handoff_requested_at: new Date().toISOString() })
        .eq("id", conversation.id);
      await notifyOwner(admin, bot, conversation, text);
    }
    await saveAndReply(admin, bot.id, conversation.id, MSG.handoff, () => replyText(MSG.handoff, false));
    return;
  }

  // 4) 真人處理中：AI 不回覆
  if (conversation.handoff_requested_at) return;

  // 5) 額度檢查
  const { data: sub } = await admin.from("subscriptions").select("plan, status").eq("bot_id", bot.id).maybeSingle();
  const limit = PLANS[effectivePlan(sub)].monthlyMessages;
  const { data: allowed, error: quotaErr } = await admin.rpc("consume_message_quota", {
    p_bot_id: bot.id,
    p_limit: limit,
  });
  if (quotaErr) throw quotaErr;
  if (!allowed) {
    await saveAndReply(admin, bot.id, conversation.id, MSG.quotaExceeded, () => replyText(MSG.quotaExceeded, false), "system");
    return;
  }

  // 6) RAG + Claude
  await line.showLoading(token, userId);
  const { data: rows } = await admin
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversation.id)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  const history = (rows ?? []).reverse() as { role: "user" | "assistant"; content: string }[];

  let answer: string;
  try {
    answer = await generateReply(admin, bot, history);
  } catch (err) {
    console.error("[line] 產生回覆失敗", err);
    answer = FALLBACK_REPLY;
  }
  await saveAndReply(admin, bot.id, conversation.id, answer, () => replyText(answer));
}

async function upsertConversation(admin: SupabaseClient, botId: string, userId: string, token: string) {
  const { data: existing } = await admin
    .from("conversations")
    .select("id, display_name, handoff_requested_at")
    .eq("bot_id", botId)
    .eq("line_user_id", userId)
    .maybeSingle();
  if (existing) return existing;

  let displayName: string | null = null;
  try {
    displayName = (await line.getUserProfile(token, userId)).displayName;
  } catch {
    /* 客人未加好友時可能取不到 */
  }
  const { data, error } = await admin
    .from("conversations")
    .upsert({ bot_id: botId, line_user_id: userId, display_name: displayName }, { onConflict: "bot_id,line_user_id" })
    .select("id, display_name, handoff_requested_at")
    .single();
  if (error) throw error;
  return data;
}

async function saveAndReply(
  admin: SupabaseClient,
  botId: string,
  conversationId: string,
  content: string,
  send: () => Promise<void>,
  role: "assistant" | "system" = "assistant",
) {
  await admin.from("messages").insert({ conversation_id: conversationId, bot_id: botId, role, content });
  await send();
}

// replyToken 約 1 分鐘內有效；若失效則改用 push（會計入 LINE 官方帳號的訊息則數）。
async function sendReply(token: string, replyToken: string, userId: string, message: line.LineMessage) {
  try {
    await line.reply(token, replyToken, [message]);
  } catch (err) {
    if (err instanceof line.LineApiError && err.status === 400) {
      await line.push(token, userId, [message]);
    } else {
      throw err;
    }
  }
}

async function notifyOwner(
  admin: SupabaseClient,
  bot: BotRow,
  conversation: { id: string; display_name: string | null },
  lastMessage: string,
) {
  let to = bot.handoff_email;
  if (!to) {
    const { data } = await admin.auth.admin.getUserById(bot.owner_id);
    to = data.user?.email ?? null;
  }
  if (!to) return;
  await sendHandoffEmail({
    to,
    businessName: bot.business_name,
    customerName: conversation.display_name ?? "LINE 使用者",
    lastMessage,
    conversationUrl: `${env.appUrl}/dashboard/conversations/${conversation.id}`,
  });
}
