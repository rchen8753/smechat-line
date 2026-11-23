import "server-only";
import { Resend } from "resend";
import { env } from "@/lib/env";

// 寄送「客人要求真人客服」通知。未設定 RESEND_API_KEY 時只記錄 log。
export async function sendHandoffEmail(opts: {
  to: string;
  businessName: string;
  customerName: string;
  lastMessage: string;
  conversationUrl: string;
}) {
  const subject = `【${opts.businessName}】LINE 客人要求真人客服：${opts.customerName}`;
  const text = `您好，

LINE 客人「${opts.customerName}」要求真人客服協助。
最後一則訊息：「${opts.lastMessage}」

AI 已暫停回覆此對話。請至 LINE Official Account Manager 的聊天功能回覆客人，
處理完畢後可在後台恢復 AI 回覆：
${opts.conversationUrl}
`;
  if (!env.resendApiKey) {
    console.warn("[handoff] 未設定 RESEND_API_KEY，略過寄信：", subject);
    return;
  }
  const resend = new Resend(env.resendApiKey);
  const { error } = await resend.emails.send({ from: env.emailFrom, to: opts.to, subject, text });
  if (error) console.error("[handoff] 寄信失敗", error);
}
