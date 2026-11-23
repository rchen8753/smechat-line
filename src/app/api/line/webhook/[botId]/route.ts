import { after, NextResponse } from "next/server";
import { decrypt } from "@/lib/crypto";
import { verifySignature, type LineWebhookBody } from "@/lib/line";
import { handleLineEvent, type BotRow } from "@/lib/line-handler";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
// after() 中的 AI 回覆最長可執行的秒數（Vercel）
export const maxDuration = 60;

// 每個機器人有自己的 webhook 網址：/api/line/webhook/<botId>
export async function POST(request: Request, { params }: { params: Promise<{ botId: string }> }) {
  const { botId } = await params;
  const rawBody = await request.text();
  const admin = createAdminClient();

  const { data: bot } = await admin
    .from("bots")
    .select(
      "id, owner_id, business_name, custom_instructions, handoff_email, line_access_token_enc, line_channel_secret_enc, line_webhook_verified_at",
    )
    .eq("id", botId)
    .maybeSingle();
  if (!bot?.line_channel_secret_enc) return new NextResponse("Not found", { status: 404 });

  if (!verifySignature(rawBody, request.headers.get("x-line-signature"), decrypt(bot.line_channel_secret_enc))) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  // 第一次收到合法簽章的請求（包含 LINE 後台的「Verify」按鈕）時標記為已驗證
  if (!bot.line_webhook_verified_at) {
    await admin.from("bots").update({ line_webhook_verified_at: new Date().toISOString() }).eq("id", bot.id);
  }

  const body = JSON.parse(rawBody) as LineWebhookBody;

  // 先回 200 給 LINE，再於背景處理（避免 LINE 逾時重送）
  after(async () => {
    for (const event of body.events) {
      try {
        await handleLineEvent(admin, bot as BotRow, event);
      } catch (err) {
        console.error("[line webhook] 事件處理失敗", event.webhookEventId, err);
      }
    }
  });

  return NextResponse.json({ ok: true });
}
