import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// 精簡的 LINE Messaging API 用戶端（直接使用 fetch）。
const API = "https://api.line.me/v2/bot";

export function verifySignature(rawBody: string, signature: string | null, channelSecret: string): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", channelSecret).update(rawBody).digest();
  const given = Buffer.from(signature, "base64");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// ── Webhook 事件型別（只列出用到的欄位） ──
export type LineSource = { type: "user" | "group" | "room"; userId?: string };
export type LineEvent =
  | {
      type: "message";
      replyToken: string;
      source: LineSource;
      timestamp: number;
      webhookEventId: string;
      deliveryContext?: { isRedelivery: boolean };
      message: { id: string; type: "text"; text: string } | { id: string; type: string };
    }
  | { type: "postback"; replyToken: string; source: LineSource; webhookEventId: string; postback: { data: string } }
  | { type: string; source?: LineSource; webhookEventId?: string; replyToken?: string };

export type LineWebhookBody = { destination: string; events: LineEvent[] };

export type LineMessage = {
  type: "text";
  text: string;
  quickReply?: { items: { type: "action"; action: { type: "message"; label: string; text: string } }[] };
};

export class LineApiError extends Error {
  constructor(public status: number, body: string) {
    super(`LINE API ${status}: ${body}`);
  }
}

async function call<T>(token: string, path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: init?.method ?? (init?.body ? "POST" : "GET"),
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new LineApiError(res.status, text);
  return (text ? JSON.parse(text) : {}) as T;
}

export function getBotInfo(token: string) {
  return call<{ userId: string; basicId: string; displayName: string }>(token, "/info");
}

export function setWebhookEndpoint(token: string, endpoint: string) {
  return call(token, "/channel/webhook/endpoint", { method: "PUT", body: { endpoint } });
}

export function getUserProfile(token: string, userId: string) {
  return call<{ displayName: string }>(token, `/profile/${encodeURIComponent(userId)}`);
}

export function reply(token: string, replyToken: string, messages: LineMessage[]) {
  return call(token, "/message/reply", { body: { replyToken, messages } });
}

export function push(token: string, to: string, messages: LineMessage[]) {
  return call(token, "/message/push", { body: { to, messages } });
}

// 顯示「輸入中」動畫（僅一對一聊天有效），失敗不影響主流程。
export async function showLoading(token: string, chatId: string, seconds = 20) {
  try {
    await call(token, "/chat/loading/start", { body: { chatId, loadingSeconds: seconds } });
  } catch {
    /* ignore */
  }
}

export const HUMAN_BUTTON_TEXT = "聯絡真人客服";

export function textMessage(text: string, withHumanButton = true): LineMessage {
  // LINE 單則文字上限 5000 字
  const msg: LineMessage = { type: "text", text: text.slice(0, 5000) };
  if (withHumanButton) {
    msg.quickReply = {
      items: [{ type: "action", action: { type: "message", label: HUMAN_BUTTON_TEXT, text: HUMAN_BUTTON_TEXT } }],
    };
  }
  return msg;
}

// 客人輸入以下關鍵字時轉接真人
const HUMAN_KEYWORDS = [HUMAN_BUTTON_TEXT, "真人", "轉人工", "人工客服", "找客服", "talk to human", "human agent", "real person"];

export function wantsHuman(text: string): boolean {
  const t = text.trim().toLowerCase();
  return HUMAN_KEYWORDS.some((k) => t.includes(k.toLowerCase()));
}
