import Link from "next/link";
import { requireUser } from "@/lib/bot";

const NAV = [
  { href: "/dashboard", label: "總覽與設定" },
  { href: "/dashboard/knowledge", label: "知識庫" },
  { href: "/dashboard/line", label: "LINE 連線" },
  { href: "/dashboard/conversations", label: "對話紀錄" },
  { href: "/dashboard/billing", label: "方案與付款" },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
          <Link href="/dashboard" className="font-bold text-emerald-700">LINE AI 客服</Link>
          <nav className="flex flex-wrap gap-4 text-sm">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="text-slate-600 hover:text-slate-900">{n.label}</Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm text-slate-500">
            <span>{user.email}</span>
            <form action="/auth/signout" method="post">
              <button className="hover:text-slate-900">登出</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
