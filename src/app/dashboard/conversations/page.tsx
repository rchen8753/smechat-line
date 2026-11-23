import Link from "next/link";
import { requireBot } from "@/lib/bot";
import { formatDateTime } from "@/lib/format";

export default async function ConversationsPage() {
  const { supabase, bot } = await requireBot();
  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, display_name, line_user_id, handoff_requested_at, last_message_at")
    .eq("bot_id", bot.id)
    .order("last_message_at", { ascending: false })
    .limit(200);

  return (
    <div className="space-y-6">
      <h1 className="h1">對話紀錄</h1>
      <div className="card p-0">
        {!conversations?.length && <p className="muted p-5">尚無對話。連線 LINE 後，客人的訊息會出現在這裡。</p>}
        <ul className="divide-y divide-slate-100">
          {conversations?.map((c) => (
            <li key={c.id}>
              <Link href={`/dashboard/conversations/${c.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                <span className="font-medium">{c.display_name ?? "LINE 使用者"}</span>
                {c.handoff_requested_at && (
                  <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">等待真人回覆</span>
                )}
                <span className="muted ml-auto">{formatDateTime(c.last_message_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
