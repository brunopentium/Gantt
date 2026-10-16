/* A small, text-only Markdown renderer. Model text is never parsed as HTML. */
window.MyDayChatFormat = (() => {
  function inline(parent, text) {
    const pattern = /\*\*([^*\n]+)\*\*|`([^`\n]+)`/g;
    let offset = 0;
    for (const match of text.matchAll(pattern)) {
      parent.append(document.createTextNode(text.slice(offset, match.index)));
      const element = document.createElement(match[1] !== undefined ? 'strong' : 'code');
      element.textContent = match[1] ?? match[2]; parent.append(element);
      offset = match.index + match[0].length;
    }
    parent.append(document.createTextNode(text.slice(offset)));
  }
  function render(parent, text) {
    let paragraph = null, lists = [], lastItem = null;
    for (const line of String(text).replace(/\r\n?/g, '\n').split('\n')) {
      if (!line.trim()) { paragraph = null; lastItem = null; continue; }
      const bullet = /^(\s*)(?:([-*•])|\d+[.)])\s+(.+)$/.exec(line);
      if (bullet) {
        paragraph = null;
        const depth = bullet[1].replace(/\t/g, '  ').length, tag = bullet[2] ? 'ul' : 'ol';
        while (lists.length && lists.at(-1).depth > depth) lists.pop();
        if (!lists.length || lists.at(-1).depth < depth || lists.at(-1).tag !== tag) {
          const list = document.createElement(tag), previous = lists.at(-1);
          (previous && previous.depth < depth && previous.item ? previous.item : parent).append(list);
          if (previous?.depth === depth) lists.pop();
          lists.push({ depth, tag, list });
        }
        const item = document.createElement('li'); inline(item, bullet[3]);
        lists.at(-1).list.append(item); lists.at(-1).item = item; lastItem = item;
        continue;
      }
      const heading = /^\s*#{1,4}\s+(.+)$/.exec(line);
      if (heading) {
        paragraph = null; lists = []; lastItem = null;
        const title = document.createElement('p'); title.className = 'md-chat-group'; inline(title, heading[1]); parent.append(title);
      } else if (lastItem) { lastItem.append(document.createTextNode(' ')); inline(lastItem, line.trim()); }
      else {
        lists = [];
        if (!paragraph) { paragraph = document.createElement('p'); parent.append(paragraph); }
        else paragraph.append(document.createTextNode(' '));
        inline(paragraph, line.trim());
      }
    }
  }
  return { render };
})();
