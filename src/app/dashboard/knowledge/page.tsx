import { requireBot } from "@/lib/bot";
import { Flash, type FlashParams } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { formatDateTime } from "@/lib/format";
import { addTextSource, deleteSource, updateSource, uploadFileSource } from "../actions";

export default async function KnowledgePage({ searchParams }: { searchParams: FlashParams }) {
  const flash = await searchParams;
  const { supabase, bot } = await requireBot();
  const { data: sources } = await supabase
    .from("knowledge_sources")
    .select("id, title, kind, content, updated_at")
    .eq("bot_id", bot.id)
    .order("updated_at", { ascending: false });

  return (
    <div className="space-y-6">
      <Flash {...flash} />
      <div>
        <h1 className="h1">知識庫</h1>
        <p className="muted mt-1">AI 只會根據這裡的內容回答客人。建議放入：常見問題、營業時間、地址交通、價目表、退換貨政策等。</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <h2 className="h2">貼上文字</h2>
          <form action={addTextSource} className="mt-4 space-y-3">
            <input name="title" required className="input" placeholder="標題，例如：常見問題" />
            <textarea
              name="content"
              required
              rows={10}
              className="input"
              placeholder={"Q：營業時間？\nA：週二至週日 10:00–20:00，週一公休。\n\nQ：可以刷卡嗎？\nA：可以，接受 Visa、Master、LINE Pay。"}
            />
            <SubmitButton pendingText="儲存並建立索引中…">儲存</SubmitButton>
          </form>
        </div>

        <div className="card">
          <h2 className="h2">上傳檔案</h2>
          <p className="muted mt-1">支援 .txt 與 .pdf（文字型 PDF，最大 10MB）。</p>
          <form action={uploadFileSource} className="mt-4 space-y-3">
            <input name="title" className="input" placeholder="標題（選填，預設為檔名）" />
            <input name="file" type="file" accept=".txt,.md,.pdf,text/plain,application/pdf" required className="block w-full text-sm" />
            <SubmitButton pendingText="上傳並建立索引中…">上傳</SubmitButton>
          </form>
        </div>
      </div>

      <div className="card">
        <h2 className="h2">已儲存的資料（{sources?.length ?? 0}）</h2>
        {!sources?.length && <p className="muted mt-3">尚無資料。新增後 AI 就能開始回答相關問題。</p>}
        <ul className="mt-3 divide-y divide-slate-100">
          {sources?.map((s) => (
            <li key={s.id} className="py-3">
              <details>
                <summary className="flex cursor-pointer items-center gap-3">
                  <span className="font-medium">{s.title}</span>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{s.kind === "file" ? "檔案" : "文字"}</span>
                  <span className="muted ml-auto">{s.content.length.toLocaleString()} 字 · {formatDateTime(s.updated_at)}</span>
                </summary>
                <form action={updateSource} className="mt-3 space-y-3">
                  <input type="hidden" name="id" value={s.id} />
                  <input name="title" required className="input" defaultValue={s.title} />
                  <textarea name="content" required rows={10} className="input" defaultValue={s.content} />
                  <div className="flex gap-2">
                    <SubmitButton pendingText="更新中…">更新</SubmitButton>
                  </div>
                </form>
                <form action={deleteSource} className="mt-2">
                  <input type="hidden" name="id" value={s.id} />
                  <SubmitButton className="btn-danger" pendingText="刪除中…">刪除</SubmitButton>
                </form>
              </details>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
