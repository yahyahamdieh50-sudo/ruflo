import type { ReactNode } from "react";

/** Safe, minimal Markdown renderer (headings, lists, tables, quotes, bold/italic, checkboxes). No raw HTML. */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\n]+\*)/g;
  let last = 0, m: RegExpExecArray | null, k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    out.push(tok.startsWith("**") ? <strong key={k++}>{tok.slice(2, -2)}</strong> : <em key={k++}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source, className = "" }: { source: string; className?: string }) {
  const lines = source.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0, key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const lvl = h[1].length;
      blocks.push(lvl === 1 ? <h2 key={key++}>{inline(h[2])}</h2> : lvl === 2 ? <h2 key={key++}>{inline(h[2])}</h2> : <h3 key={key++}>{inline(h[2])}</h3>);
      i++; continue;
    }
    if (line.startsWith(">")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) buf.push(lines[i++].replace(/^>\s?/, ""));
      blocks.push(<blockquote key={key++}>{inline(buf.join(" "))}</blockquote>); continue;
    }
    if (line.includes("|") && /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(lines[i + 1] ?? "")) {
      const cells = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const head = cells(line); i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|")) rows.push(cells(lines[i++]));
      blocks.push(
        <div key={key++} className="overflow-x-auto"><table><thead><tr>{head.map((c, j) => <th key={j}>{inline(c)}</th>)}</tr></thead>
          <tbody>{rows.map((r, j) => <tr key={j}>{r.map((c, n) => <td key={n}>{inline(c)}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, ""));
      blocks.push(<ul key={key++} className={items.some((x) => /^\[[ x]\]/.test(x)) ? "list-none ps-0" : undefined}>
        {items.map((x, j) => {
          const cb = /^\[([ x])\]\s*(.*)$/.exec(x);
          return <li key={j}>{cb ? <span><span aria-hidden className="me-2 inline-block h-4 w-4 translate-y-0.5 rounded-sm border border-steel-400 align-middle" />{inline(cb[2])}</span> : inline(x)}</li>;
        })}</ul>); continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+\.\s+/, ""));
      blocks.push(<ol key={key++}>{items.map((x, j) => <li key={j}>{inline(x)}</li>)}</ol>); continue;
    }
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|>|\s*[-*]\s|\s*\d+\.\s)/.test(lines[i])) buf.push(lines[i++]);
    blocks.push(<p key={key++}>{inline(buf.join(" "))}</p>);
  }
  return <div className={`prose-lesson ${className}`}>{blocks}</div>;
}
