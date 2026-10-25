const inlinePattern = /(\*\*|__)(.+?)\1|(\*|_)(.+?)\3|~~(.+?)~~|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

function appendInline(parent, text) {
	let cursor = 0;
	for (const match of text.matchAll(inlinePattern)) {
		const index = match.index;
		if (index > cursor) parent.append(document.createTextNode(text.slice(cursor, index)));
		let element;
		let content;
		if (match[1]) {
			element = document.createElement('strong');
			content = match[2];
		} else if (match[3]) {
			element = document.createElement('em');
			content = match[4];
		} else if (match[5]) {
			element = document.createElement('del');
			content = match[5];
		} else if (match[6]) {
			element = document.createElement('code');
			element.textContent = match[6];
		} else {
			element = document.createElement('a');
			content = match[7];
			element.href = match[8];
			element.target = '_blank';
			element.rel = 'noopener noreferrer';
		}
		if (content !== undefined) appendInline(element, content);
		parent.append(element);
		cursor = index + match[0].length;
	}
	if (cursor < text.length) parent.append(document.createTextNode(text.slice(cursor)));
}

function appendParagraph(container, lines) {
	if (!lines.length) return;
	const paragraph = document.createElement('p');
	lines.forEach((line, index) => {
		if (index) paragraph.append(document.createElement('br'));
		appendInline(paragraph, line);
	});
	container.append(paragraph);
}

export function renderMarkdown(container, value) {
	container.replaceChildren();
	const lines = String(value ?? '').replace(/\r\n?/g, '\n').split('\n');
	let paragraphLines = [];
	let list = null;

	const flushParagraph = () => {
		appendParagraph(container, paragraphLines);
		paragraphLines = [];
	};
	const closeList = () => { list = null; };

	for (const line of lines) {
		const heading = line.match(/^(#{1,3})\s+(.+)$/);
		const unorderedItem = line.match(/^\s*[-*+]\s+(.+)$/);
		const orderedItem = line.match(/^\s*\d+[.)]\s+(.+)$/);

		if (heading) {
			flushParagraph();
			closeList();
			const element = document.createElement(`h${heading[1].length + 1}`);
			appendInline(element, heading[2]);
			container.append(element);
		} else if (unorderedItem || orderedItem) {
			flushParagraph();
			const type = unorderedItem ? 'ul' : 'ol';
			if (!list || list.tagName.toLowerCase() !== type) {
				closeList();
				list = document.createElement(type);
				container.append(list);
			}
			const item = document.createElement('li');
			appendInline(item, (unorderedItem || orderedItem)[1]);
			list.append(item);
		} else if (/^\s*>\s?/.test(line)) {
			flushParagraph();
			closeList();
			const quote = document.createElement('blockquote');
			appendInline(quote, line.replace(/^\s*>\s?/, ''));
			container.append(quote);
		} else if (!line.trim()) {
			flushParagraph();
			closeList();
		} else {
			closeList();
			paragraphLines.push(line);
		}
	}
	flushParagraph();
}
