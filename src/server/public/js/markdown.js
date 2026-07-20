import { escHtml } from "./format.js";

export function renderMarkdown(text, imageBase = "") {
  const blocks = [];
  let source = String(text || "").replace(/\r\n/g, "\n");
  source = source.replace(/```([\s\S]*?)```/g, (_, code) => {
    const key = `\u0000CODE${blocks.length}\u0000`;
    blocks.push(`<pre><code>${escHtml(code.replace(/^\n|\n$/g, ""))}</code></pre>`);
    return key;
  });

  const lines = source.split("\n");
  const html = [];
  let paragraph = [];
  let list = null;
  let quote = [];

  const renderInline = (value) => {
    const codes = [];
    let result = escHtml(value);
    result = result.replace(/`([^`]+)`/g, (_, code) => {
      const key = `\u0000INLINE${codes.length}\u0000`;
      codes.push(`<code>${code}</code>`);
      return key;
    });
    result = result
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/&lt;br\s*\/?&gt;/gi, "<br>")
      .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, url) => {
        if (/^https?:\/\//.test(url)) return `<img src="${url}" alt="${alt}" loading="lazy">`;
        const resolved = !url.startsWith("/") && imageBase ? imageBase + url : url;
        return `<img src="/api/image?path=${encodeURIComponent(resolved)}" alt="${alt}" loading="lazy">`;
      })
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    return result.replace(/\u0000INLINE(\d+)\u0000/g, (_, index) => codes[Number(index)] || "");
  };
  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    const startAttr = list.type === "ol" && Number.isInteger(list.start) ? ` start="${list.start}"` : "";
    html.push(`<${list.type}${startAttr}>${list.items.map((item) => `<li>${renderInline(item)}</li>`).join("")}</${list.type}>`);
    list = null;
  };
  const flushQuote = () => {
    if (!quote.length) return;
    html.push(`<blockquote>${quote.map((item) => `<p>${renderInline(item)}</p>`).join("")}</blockquote>`);
    quote = [];
  };
  const flushAll = () => {
    flushParagraph();
    flushList();
    flushQuote();
  };

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      flushAll();
      continue;
    }
    if (/^\|(.+)\|$/.test(trimmed) && i + 1 < lines.length && /^\|[\s:|-]+\|$/.test(lines[i + 1].trim())) {
      flushAll();
      const headers = trimmed.slice(1, -1).split("|").map((cell) => cell.trim());
      i += 1;
      const rows = [];
      while (i + 1 < lines.length && /^\|(.+)\|$/.test(lines[i + 1].trim())) {
        i += 1;
        rows.push(lines[i].trim().slice(1, -1).split("|").map((cell) => cell.trim()));
      }
      html.push(`<table><thead><tr>${headers.map((cell) => `<th>${renderInline(cell)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
      continue;
    }
    const heading = /^(#{1,4})\s+(.+)$/.exec(trimmed);
    if (heading) {
      flushAll();
      html.push(`<h${heading[1].length}>${renderInline(heading[2])}</h${heading[1].length}>`);
      continue;
    }
    if (/^---+$/.test(trimmed)) {
      flushAll();
      html.push("<hr>");
      continue;
    }
    const quoteMatch = /^>\s?(.*)$/.exec(trimmed);
    if (quoteMatch) {
      flushParagraph();
      flushList();
      quote.push(quoteMatch[1]);
      continue;
    }
    const unordered = /^[-*]\s+(.+)$/.exec(trimmed);
    const ordered = /^(\d+)\.\s+(.+)$/.exec(trimmed);
    if (unordered || ordered) {
      flushParagraph();
      flushQuote();
      const type = unordered ? "ul" : "ol";
      if (!list || list.type !== type) flushList();
      if (!list) list = { type, items: [], start: ordered ? Number(ordered[1]) : undefined };
      list.items.push(unordered ? unordered[1] : ordered[2]);
      continue;
    }
    flushList();
    flushQuote();
    paragraph.push(trimmed);
  }
  flushAll();
  return html.join("").replace(/\u0000CODE(\d+)\u0000/g, (_, index) => blocks[Number(index)] || "");
}

export function renderContent(element, text, imageBase = "") {
  element.innerHTML = renderMarkdown(String(text || ""), imageBase);
  if (typeof globalThis.renderMathInElement === "function") {
    globalThis.renderMathInElement(element, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "$", right: "$", display: false },
      ],
    });
  }
}
