import Link from "next/link";
import { PLANS } from "@/lib/plans";

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-20">
      <h1 className="text-4xl font-bold">LINE AI 客服</h1>
      <p className="mt-4 text-lg text-slate-600">
        上傳您的常見問題與商店資訊，串接 LINE 官方帳號，AI 就能 24 小時用繁體中文回覆客人。
        遇到不會的問題，客人一鍵轉接真人，您會立即收到 Email 通知。
      </p>
      <div className="mt-8 flex gap-3">
        <Link href="/login" className="btn-primary">免費開始使用</Link>
        <Link href="/login" className="btn-secondary">登入</Link>
      </div>
      <div className="mt-16 grid gap-4 sm:grid-cols-2">
        {Object.values(PLANS).map((p) => (
          <div key={p.name} className="card">
            <div className="h2">{p.name}</div>
            <div className="mt-1 text-2xl font-bold">{p.priceLabel}</div>
            <div className="muted mt-2">每月 {p.monthlyMessages.toLocaleString()} 則 AI 回覆</div>
          </div>
        ))}
      </div>
    </main>
  );
}
