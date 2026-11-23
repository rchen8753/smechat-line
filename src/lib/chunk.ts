// 以字元數切塊（適合中文，無空白斷詞）。先依段落切，再合併到目標大小，並保留少量重疊。
const TARGET = 500;
const OVERLAP = 80;

export function chunkText(input: string): string[] {
  const text = input.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) return [];

  // 先依段落；過長的段落再依句子切
  const pieces: string[] = [];
  for (const para of text.split(/\n\s*\n/)) {
    const p = para.trim();
    if (!p) continue;
    if (p.length <= TARGET) {
      pieces.push(p);
      continue;
    }
    const sentences = p.split(/(?<=[。！？!?；;\n])/);
    let buf = "";
    for (const s of sentences) {
      if (buf.length + s.length > TARGET && buf) {
        pieces.push(buf);
        buf = "";
      }
      // 單一句子仍過長：硬切
      if (s.length > TARGET) {
        for (let i = 0; i < s.length; i += TARGET) pieces.push(s.slice(i, i + TARGET));
      } else {
        buf += s;
      }
    }
    if (buf) pieces.push(buf);
  }

  // 合併小段落
  const chunks: string[] = [];
  let current = "";
  for (const piece of pieces) {
    if (current && current.length + piece.length + 2 > TARGET) {
      chunks.push(current);
      current = current.slice(-OVERLAP) + "\n" + piece;
    } else {
      current = current ? `${current}\n\n${piece}` : piece;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
