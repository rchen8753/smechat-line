import { requireBot } from "@/lib/bot";
import { Flash } from "@/components/flash";
import { currentPeriod, effectivePlan, PLANS } from "@/lib/plans";

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ success?: string }> }) {
  const { success } = await searchParams;
  const { supabase, bot } = await requireBot();
  const [{ data: sub }, { data: usage }] = await Promise.all([
    supabase.from("subscriptions").select("plan, status, stripe_customer_id").eq("bot_id", bot.id).maybeSingle(),
    supabase.from("usage_counters").select("count").eq("bot_id", bot.id).eq("period", currentPeriod()).maybeSingle(),
  ]);
  const planId = effectivePlan(sub);

  return (
    <div className="space-y-6">
      <Flash ok={success ? "付款成功！方案將在幾秒內更新，若未更新請重新整理頁面。" : undefined} />
      <h1 className="h1">方案與付款</h1>
      <p className="muted">
        本月已使用 {(usage?.count ?? 0).toLocaleString()} 則 AI 回覆。額度於每月 1 日（台灣時間）重置。
        {sub?.status === "past_due" && " ⚠️ 您的付款失敗，請更新付款方式。"}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {(Object.keys(PLANS) as (keyof typeof PLANS)[]).map((id) => {
          const p = PLANS[id];
          const current = id === planId;
          return (
            <div key={id} className={`card ${current ? "border-emerald-500 ring-2 ring-emerald-100" : ""}`}>
              <div className="flex items-center gap-2">
                <div className="h2">{p.name}</div>
                {current && <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">目前方案</span>}
              </div>
              <div className="mt-1 text-2xl font-bold">{p.priceLabel}</div>
              <ul className="muted mt-3 list-disc space-y-1 pl-5">
                <li>每月 {p.monthlyMessages.toLocaleString()} 則 AI 回覆</li>
                <li>1 個 LINE 官方帳號</li>
                <li>知識庫、對話紀錄、轉真人通知</li>
              </ul>
              <div className="mt-4">
                {id === "pro" && planId === "free" && (
                  <form action="/api/stripe/checkout" method="post">
                    <button className="btn-primary">升級專業方案</button>
                  </form>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {sub?.stripe_customer_id && (
        <form action="/api/stripe/portal" method="post">
          <button className="btn-secondary">管理訂閱 / 付款方式 / 發票</button>
        </form>
      )}
    </div>
  );
}
