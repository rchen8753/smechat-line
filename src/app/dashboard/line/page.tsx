import { requireBot } from "@/lib/bot";
import { Flash, type FlashParams } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { env } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { connectLine, disconnectLine } from "../actions";

export default async function LinePage({ searchParams }: { searchParams: FlashParams }) {
  const flash = await searchParams;
  const { bot } = await requireBot();
  const webhookUrl = `${env.appUrl}/api/line/webhook/${bot.id}`;
  const connected = !!bot.line_token_verified_at;

  return (
    <div className="space-y-6">
      <Flash {...flash} />
      <h1 className="h1">LINE 官方帳號連線</h1>

      <div className="card">
        <h2 className="h2">連線狀態</h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-[10rem_1fr]">
          <dt className="text-slate-500">官方帳號</dt>
          <dd>{bot.line_bot_name ? `${bot.line_bot_name}（${bot.line_basic_id}）` : "—"}</dd>
          <dt className="text-slate-500">Access Token</dt>
          <dd>{connected ? `✅ 驗證成功（${formatDateTime(bot.line_token_verified_at)}）` : "❌ 尚未設定"}</dd>
          <dt className="text-slate-500">Webhook</dt>
          <dd>
            {bot.line_webhook_verified_at
              ? `✅ 已收到 LINE 的請求（${formatDateTime(bot.line_webhook_verified_at)}）`
              : "⏳ 尚未收到 LINE 的請求，請完成下方步驟 3～4"}
          </dd>
          <dt className="text-slate-500">Webhook 網址</dt>
          <dd className="break-all font-mono text-xs">{webhookUrl}</dd>
        </dl>
        {connected && (
          <form action={disconnectLine} className="mt-4">
            <SubmitButton className="btn-danger" pendingText="中斷中…">中斷連線</SubmitButton>
          </form>
        )}
      </div>

      <div className="card">
        <h2 className="h2">{connected ? "更新憑證" : "連線步驟"}</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-700">
          <li>
            登入 <a className="text-emerald-700 underline" href="https://developers.line.biz/console/" target="_blank">LINE Developers Console</a>，
            選擇您官方帳號的 Messaging API channel。
          </li>
          <li>
            在「Basic settings」複製 <b>Channel secret</b>；在「Messaging API」頁籤最下方發行並複製 <b>Channel access token（long-lived）</b>，貼到下方表單送出。
          </li>
          <li>
            在「Messaging API」頁籤確認 Webhook URL 為上方網址（系統會嘗試自動設定），開啟 <b>Use webhook</b>，並按 <b>Verify</b>。
          </li>
          <li>
            到 <a className="text-emerald-700 underline" href="https://manager.line.biz/" target="_blank">LINE Official Account Manager</a> →
            設定 → 回應設定：關閉「自動回應訊息」，開啟「Webhook」。（若要親自回覆轉真人的客人，請同時開啟「聊天」。）
          </li>
          <li>用手機傳訊息給您的官方帳號測試！</li>
        </ol>
        <form action={connectLine} className="mt-5 space-y-3">
          <div>
            <label className="label" htmlFor="channel_secret">Channel secret</label>
            <input id="channel_secret" name="channel_secret" required className="input font-mono" autoComplete="off" />
          </div>
          <div>
            <label className="label" htmlFor="channel_access_token">Channel access token（long-lived）</label>
            <textarea id="channel_access_token" name="channel_access_token" required rows={3} className="input font-mono text-xs" autoComplete="off" />
          </div>
          <p className="muted">憑證會加密儲存，不會顯示於頁面上。</p>
          <SubmitButton pendingText="驗證中…">驗證並連線</SubmitButton>
        </form>
      </div>
    </div>
  );
}
