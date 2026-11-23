// Simulates a LINE text message hitting your local webhook, signed with your channel secret.
// Usage: node scripts/send-test-webhook.mjs <botId> <channelSecret> "營業時間是幾點？" [baseUrl]
//
// The AI reply is generated and saved (check 對話紀錄 in the dashboard). Sending it back to LINE
// will fail because the replyToken / userId are fake — that's expected.
import { createHmac, randomUUID } from "node:crypto";

const [botId, secret, text = "你好，請問營業時間？", base = "http://localhost:3000"] = process.argv.slice(2);
if (!botId || !secret) {
  console.error('Usage: node scripts/send-test-webhook.mjs <botId> <channelSecret> "message" [baseUrl]');
  process.exit(1);
}

const body = JSON.stringify({
  destination: "Utest",
  events: [
    {
      type: "message",
      mode: "active",
      timestamp: Date.now(),
      webhookEventId: randomUUID(),
      deliveryContext: { isRedelivery: false },
      replyToken: "test-reply-token",
      source: { type: "user", userId: "Utest-local-user" },
      message: { id: String(Date.now()), type: "text", text },
    },
  ],
});
const signature = createHmac("sha256", secret).update(body).digest("base64");
const res = await fetch(`${base}/api/line/webhook/${botId}`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-line-signature": signature },
  body,
});
console.log(res.status, await res.text());
