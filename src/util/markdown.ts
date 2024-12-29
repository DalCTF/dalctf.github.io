import MarkdownIt from 'markdown-it';

export function summary(content: string, max: number = 140): string {

    const md = new MarkdownIt();
    const tokens = md.parse(content, {});

    let accumulatedText = '';
    let is_header = false;
    let is_link = false;

    for (const token of tokens) {
        if (token.type === 'heading_open') {
            is_header = true;
        } else if (token.type === 'heading_close') {
            is_header = false;
        } else if (token.type === 'inline' && !is_header) {
            if (!token.children) {
                accumulatedText += token.content + ' ';
            } else {
                for (let child of token.children) {
                    if (child.type === 'link_open') {
                        is_link = true;
                    } else if (child.type === 'link_close') {
                        is_link = false;
                    } else if (is_link) {
                        accumulatedText += "<span>" + child.content + '</span>';
                    } else {
                        accumulatedText += child.content;
                    }
                }
            }
        }

        if (accumulatedText.length >= max) break;
    }

    accumulatedText = accumulatedText
        .trim()
        .slice(0, max)
        .replace(/\s\S*$/, ''); // Remove the trailing partial word if present

    if (!accumulatedText.endsWith(".")) {
        accumulatedText += "...";
    }

    return accumulatedText;
}
