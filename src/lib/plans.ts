// 方案設定。月額度 = 每月 AI 回覆則數（以台北時間的自然月計算）。
export const PLANS = {
  free: { name: "免費方案", monthlyMessages: 100, priceLabel: "NT$0" },
  pro: { name: "專業方案", monthlyMessages: 3000, priceLabel: "NT$1,990 / 月" },
} as const;

export type PlanId = keyof typeof PLANS;

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

export function effectivePlan(sub: { plan: string; status: string } | null | undefined): PlanId {
  return sub?.plan === "pro" && ACTIVE_STATUSES.has(sub.status) ? "pro" : "free";
}

export function currentPeriod(): string {
  // 與資料庫 current_usage_period() 一致：台北時間 YYYY-MM
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  return `${y}-${m}`;
}
