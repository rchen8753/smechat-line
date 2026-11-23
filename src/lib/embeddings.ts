import "server-only";
import OpenAI from "openai";

// 向量嵌入使用 OpenAI text-embedding-3-small（1536 維，需與 SQL 的 vector(1536) 一致）。
// 對話生成使用 Claude（見 lib/rag.ts）。
const MODEL = "text-embedding-3-small";
let client: OpenAI | null = null;

function openai() {
  client ??= new OpenAI(); // 讀取 OPENAI_API_KEY
  return client;
}

export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 100) {
    const res = await openai().embeddings.create({ model: MODEL, input: texts.slice(i, i + 100) });
    out.push(...res.data.sort((a, b) => a.index - b.index).map((d) => d.embedding));
  }
  return out;
}

export async function embedOne(text: string): Promise<number[]> {
  return (await embed([text]))[0];
}

// pgvector 接受 '[0.1,0.2,...]' 字串格式
export const toPgVector = (v: number[]) => `[${v.join(",")}]`;
