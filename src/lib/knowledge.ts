import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chunkText } from "@/lib/chunk";
import { embed, toPgVector } from "@/lib/embeddings";

export const MAX_SOURCE_CHARS = 200_000;

// 重建某筆知識來源的切塊與向量。
export async function reindexSource(
  supabase: SupabaseClient,
  source: { id: string; bot_id: string; title: string; content: string },
) {
  const chunks = chunkText(source.content).map((c) => `【${source.title}】\n${c}`);
  const vectors = await embed(chunks);

  const { error: delErr } = await supabase.from("knowledge_chunks").delete().eq("source_id", source.id);
  if (delErr) throw delErr;
  if (chunks.length === 0) return 0;

  const rows = chunks.map((content, i) => ({
    source_id: source.id,
    bot_id: source.bot_id,
    content,
    embedding: toPgVector(vectors[i]),
  }));
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase.from("knowledge_chunks").insert(rows.slice(i, i + 200));
    if (error) throw error;
  }
  return chunks.length;
}

export async function extractFileText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".txt") || name.endsWith(".md") || file.type.startsWith("text/")) {
    return await file.text();
  }
  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  }
  throw new Error("僅支援 .txt 或 .pdf 檔案");
}
