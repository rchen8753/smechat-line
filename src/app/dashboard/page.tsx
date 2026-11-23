import Link from "next/link";
import { getBot } from "@/lib/bot";
import { Flash, type FlashParams } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { currentPeriod, effectivePlan, PLANS } from "@/lib/plans";
import { createBot, updateBotSettings } from "./actions";

export default async function DashboardPage({ searchParams }: { searchParams: FlashParams }) {
  const flash = await searchParams;
  const { supabase, bot } = await getBot();

  if (!bot) {
    return (
      <div className="mx-auto max-w-md">
        <Flash {...flash} />
        <div className="card">
          <h1 className="h1">建立您的 AI 客服</h1>
          <p className="muted mt-2">先輸入店家名稱，之後隨時可以修改。</p>
          <form action={createBot} className="mt-4 space-y-3">
            <div>
              <label className="label" htmlFor="business_name">店家名稱</label>
              <input id="business_name" name="business_name" required className="input" placeholder="例如：小林咖啡" />
            </div>
            <SubmitButton>建立機器人</SubmitButton>
          </form>
        </div>
      </div>
    );
  }

  const [{ data: sub }, { data: usage }, { count: sourceCount }, { count: convCount }, { count: handoffCount }] =
    await Promise.all([
      supabase.from("subscriptions").select("plan, status").eq("bot_id", bot.id).maybeSingle(),
      supabase.from("usage_counters").select("count").eq("bot_id", bot.id).eq("period", currentPeriod()).maybeSingle(),
      supabase.from("knowledge_sources").select("id", { count: "exact", head: true }).eq("bot_id", bot.id),
      supabase.from("conversations").select("id", { count: "exact", head: true }).eq("bot_id", bot.id),
      supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("bot_id", bot.id)
        .not("handoff_requested_at", "is", null),
    ]);

  const plan = PLANS[effectivePlan(sub)];
  const used = usage?.count ?? 0;
  const lineReady = !!bot.line_token_verified_at && !!bot.line_webhook_verified_at;

  return (
    <div className="space-y-6">
      <Flash {...flash} />
      <h1 className="h1">{bot.business_name}</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={`本月 AI 回覆（${plan.name}）`} value={`${used.toLocaleString()} / ${plan.monthlyMessages.toLocaleString()}`}>
          <div className="mt-2 h-2 rounded bg-slate-100">
            <div className="h-2 rounded bg-emerald-500" style={{ width: `${Math.min(100, (used / plan.monthlyMessages) * 100)}%` }} />
          </div>
          <div className="muted mt-1">剩餘 {Math.max(0, plan.monthlyMessages - used).toLocaleString()} 則</div>
        </Stat>
        <Stat label="LINE 連線" value={lineReady ? "✅ 已連線" : bot.line_token_verified_at ? "⏳ 等待驗證" : "❌ 未連線"}>
          <Link href="/dashboard/line" className="text-sm text-emerald-700 hover:underline">管理 →</Link>
        </Stat>
        <Stat label="知識庫資料" value={`${sourceCount ?? 0} 筆`}>
          <Link href="/dashboard/knowledge" className="text-sm text-emerald-700 hover:underline">管理 →</Link>
        </Stat>
        <Stat label="對話數" value={`${convCount ?? 0}`}>
          {!!handoffCount && <div className="text-sm text-amber-700">{handoffCount} 個等待真人回覆</div>}
          <Link href="/dashboard/conversations" className="text-sm text-emerald-700 hover:underline">查看 →</Link>
        </Stat>
      </div>

      <div className="card">
        <h2 className="h2">機器人設定</h2>
        <form action={updateBotSettings} className="mt-4 space-y-4">
          <div>
            <label className="label" htmlFor="business_name">店家名稱</label>
            <input id="business_name" name="business_name" required className="input" defaultValue={bot.business_name} />
          </div>
          <div>
            <label className="label" htmlFor="custom_instructions">語氣與規則（選填）</label>
            <textarea
              id="custom_instructions"
              name="custom_instructions"
              rows={5}
              className="input"
              defaultValue={bot.custom_instructions}
              placeholder={"例如：\n- 語氣活潑親切，稱呼客人為「您」\n- 不接受電話訂位，請客人使用線上訂位連結\n- 回覆結尾加上「祝您有美好的一天 ☕」"}
            />
            <p className="muted mt-1">AI 一律只根據知識庫內容回答，不知道時會請客人聯絡真人。</p>
          </div>
          <div>
            <label className="label" htmlFor="handoff_email">真人客服通知 Email</label>
            <input id="handoff_email" name="handoff_email" type="email" className="input" defaultValue={bot.handoff_email ?? ""} />
            <p className="muted mt-1">客人輸入「真人」或點選「聯絡真人客服」時，會寄信通知此信箱。</p>
          </div>
          <SubmitButton>儲存設定</SubmitButton>
        </form>
      </div>
    </div>
  );
}

function Stat({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="card">
      <div className="muted">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}
