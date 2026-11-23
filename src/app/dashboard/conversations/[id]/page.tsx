import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBot } from "@/lib/bot";
import { Flash } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { formatDateTime } from "@/lib/format";
import { resumeAi } from "../../actions";

export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const [{ id }, flash] = await Promise.all([params, searchParams]);
  const { supabase, bot } = await requireBot();
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, display_name, handoff_requested_at")
    .eq("id", id)
    .eq("bot_id", bot.id)
    .maybeSingle();
  if (!conversation) notFound();

  const { data: messages } = await supabase
    .from("messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true })
    .limit(500);

  return (
    <div className="space-y-4">
      <Flash {...flash} />
      <Link href="/dashboard/conversations" className="text-sm text-emerald-700 hover:underline">← 返回列表</Link>
      <h1 className="h1">{conversation.display_name ?? "LINE 使用者"}</h1>

      {conversation.handoff_requested_at && (
        <div className="card flex flex-wrap items-center gap-3 border-amber-200 bg-amber-50">
          <div className="text-sm text-amber-900">
            客人於 {formatDateTime(conversation.handoff_requested_at)} 要求真人客服，AI 已暫停回覆此對話。
            請至 LINE Official Account Manager 的聊天功能回覆客人。
          </div>
          <form action={resumeAi} className="ml-auto">
            <input type="hidden" name="id" value={conversation.id} />
            <SubmitButton>恢復 AI 回覆</SubmitButton>
          </form>
        </div>
      )}

      <div className="card space-y-3">
        {messages?.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
            <div
              className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${
                m.role === "user"
                  ? "bg-slate-100"
                  : m.role === "system"
                    ? "bg-amber-50 text-amber-900"
                    : "bg-emerald-600 text-white"
              }`}
            >
              {m.content}
              <div className={`mt-1 text-[10px] ${m.role === "assistant" ? "text-emerald-100" : "text-slate-400"}`}>
                {m.role === "user" ? "客人" : m.role === "assistant" ? "AI" : "系統"} · {formatDateTime(m.created_at)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
