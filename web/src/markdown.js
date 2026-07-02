(function () {
  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function renderInline(value, assetMap) {
    let output = escapeHtml(value);

    output = output.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => {
      const safeAlt = escapeHtml(alt);
      const resolvedSrc = src.startsWith("asset:")
        ? assetMap.get(src.slice(6)) || ""
        : src;

      if (!resolvedSrc) {
        return `<span class="missing-asset">${safeAlt || "图片缺失"}</span>`;
      }

      return `<img src="${escapeHtml(resolvedSrc)}" alt="${safeAlt}" loading="lazy">`;
    });

    output = output.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
    output = output.replace(/`([^`]+)`/g, "<code>$1</code>");
    output = output.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    output = output.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    output = output.replace(/~~([^~]+)~~/g, "<del>$1</del>");

    return output;
  }

  function flushParagraph(lines, html, assetMap) {
    if (lines.length === 0) {
      return;
    }

    html.push(`<p>${renderInline(lines.join(" "), assetMap)}</p>`);
    lines.length = 0;
  }

  function flushList(list, html, assetMap) {
    if (!list.type) {
      return;
    }

    const tag = list.type === "ordered" ? "ol" : "ul";
    const items = list.items.map((item) => {
      const task = /^\[([ xX])]\s+(.+)$/.exec(item);

      if (!task) {
        return `<li>${renderInline(item, assetMap)}</li>`;
      }

      const checked = task[1].toLowerCase() === "x" ? " checked" : "";
      return `<li class="task-item"><input type="checkbox" disabled${checked}>${renderInline(task[2], assetMap)}</li>`;
    }).join("");
    html.push(`<${tag}>${items}</${tag}>`);
    list.type = null;
    list.items = [];
  }

  function isTableDivider(line) {
    return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
  }

  function isTableRow(line) {
    return line.includes("|") && !isTableDivider(line);
  }

  function parseTableRow(line) {
    return line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());
  }

  function renderTable(headerLine, rows, html, assetMap) {
    const headerCells = parseTableRow(headerLine)
      .map((cell) => `<th>${renderInline(cell, assetMap)}</th>`)
      .join("");
    const bodyRows = rows.map((row) => {
      const cells = parseTableRow(row)
        .map((cell) => `<td>${renderInline(cell, assetMap)}</td>`)
        .join("");
      return `<tr>${cells}</tr>`;
    }).join("");

    html.push(`<table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>`);
  }

  function renderMarkdown(markdown, assets) {
    const assetMap = new Map((assets || []).map((asset) => [asset.id, asset.dataUrl]));
    const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
    const html = [];
    const paragraph = [];
    const list = { type: null, items: [] };
    let inCode = false;
    let codeLines = [];
    let blockquoteLines = [];

    function flushBlockquote() {
      if (blockquoteLines.length === 0) {
        return;
      }

      html.push(`<blockquote>${blockquoteLines.map((line) => renderInline(line, assetMap)).join("<br>")}</blockquote>`);
      blockquoteLines = [];
    }

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const trimmed = line.trim();

      if (trimmed.startsWith("```")) {
        flushParagraph(paragraph, html, assetMap);
        flushList(list, html, assetMap);
        flushBlockquote();

        if (inCode) {
          html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
          codeLines = [];
          inCode = false;
        } else {
          inCode = true;
        }
        continue;
      }

      if (inCode) {
        codeLines.push(line);
        continue;
      }

      if (!trimmed) {
        flushParagraph(paragraph, html, assetMap);
        flushList(list, html, assetMap);
        flushBlockquote();
        continue;
      }

      const heading = /^(#{1,6})\s+(.+)$/.exec(trimmed);
      if (heading) {
        flushParagraph(paragraph, html, assetMap);
        flushList(list, html, assetMap);
        flushBlockquote();
        const level = heading[1].length;
        html.push(`<h${level}>${renderInline(heading[2], assetMap)}</h${level}>`);
        continue;
      }

      if (/^---+$/.test(trimmed)) {
        flushParagraph(paragraph, html, assetMap);
        flushList(list, html, assetMap);
        flushBlockquote();
        html.push("<hr>");
        continue;
      }

      if (trimmed.startsWith("> ")) {
        flushParagraph(paragraph, html, assetMap);
        flushList(list, html, assetMap);
        blockquoteLines.push(trimmed.slice(2));
        continue;
      }

      if (isTableRow(trimmed) && isTableDivider(lines[index + 1] || "")) {
        flushParagraph(paragraph, html, assetMap);
        flushList(list, html, assetMap);
        flushBlockquote();

        const rows = [];
        index += 2;

        while (index < lines.length && isTableRow(lines[index].trim())) {
          rows.push(lines[index].trim());
          index += 1;
        }

        index -= 1;
        renderTable(trimmed, rows, html, assetMap);
        continue;
      }

      const unordered = /^[-*]\s+(.+)$/.exec(trimmed);
      if (unordered) {
        flushParagraph(paragraph, html, assetMap);
        flushBlockquote();
        if (list.type && list.type !== "unordered") {
          flushList(list, html, assetMap);
        }
        list.type = "unordered";
        list.items.push(unordered[1]);
        continue;
      }

      const ordered = /^\d+\.\s+(.+)$/.exec(trimmed);
      if (ordered) {
        flushParagraph(paragraph, html, assetMap);
        flushBlockquote();
        if (list.type && list.type !== "ordered") {
          flushList(list, html, assetMap);
        }
        list.type = "ordered";
        list.items.push(ordered[1]);
        continue;
      }

      paragraph.push(trimmed);
    }

    if (inCode) {
      html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
    }

    flushParagraph(paragraph, html, assetMap);
    flushList(list, html, assetMap);
    flushBlockquote();

    return html.join("\n");
  }

  function toPlainText(markdown) {
    return String(markdown || "")
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
      .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
      .replace(/[#>*_`~\-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  window.MyNoteMarkdown = {
    renderMarkdown,
    toPlainText
  };
})();
