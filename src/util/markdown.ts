import MarkdownIt from 'markdown-it';
import type { Token } from 'markdown-it/index.js';

type Partial = { content: string[], params: Map<string, any> }
type Result = { content: string, params: Map<string, any> }

class State {
    private _head?: Token;
    private _tail: Token[];

    public content: string[];
    public params: Map<string, any>;

    // Content
    pushContent(...content: string[]) {
        this.content.push(...content);
    }

    // Parameters
    mergeParams(params: Map<string, any>) {
        for (let [key, value] of params.entries()) {
            this.putParam(key, value);
        }
    }

    putParam(param: string, value: any) {
        this.params.set(param, value);
    }

    hasParam(param: string): boolean {
        return this.params.has(param);
    }

    // Tokens
    hasMore(): boolean {
        return this._tail.length != 0;
    }

    isEmpty(): boolean {
        return !this._head && !this.hasMore();
    }

    pop(): Token {
        if (!this.hasMore()) throw new Error("[!] Attempting to pop off of a State with no more tokens");
        this._head = this._tail.pop()!;
        return this._head;
    }

    top(): Token {
        if (this.isEmpty()) throw new Error("[!] Attempting to access value of an empty State");
        if (!this._head) throw new Error("[!] State must first be 'popped'");
        return this._head;
    }

    // General
    merge(other: Partial) {
        this.pushContent(...other.content);
        this.mergeParams(other.params);
    }

    build(): Partial {
        return { content: this.content, params: this.params }
    }

    constructor(tokens: Token[]) {
        if (tokens.length == 0) throw new Error("[!] Tokens for state cannot be empty");
        this.params = new Map<string, any>();
        this._tail = tokens.toReversed();
        this.content = [];
    }
}

class Block {
    tokens: Token[];

    get content(): Token[] {
        let result = this.tokens.slice(1, -1);
        return result;
    }

    get open(): Token {
        return this.tokens.at(0)!;
    }

    get close(): Token {
        return this.tokens.at(-1)!;
    }

    constructor(tokens: Token[]) {
        this.tokens = tokens;
    }
}

class MarkdownProcessor {
    // Block Parsing
    private accumulateBlock(state: State, until: string): Block {
        let token: Token | undefined;
        let block: Token[] = [];
        let subblocks = 0;

        let open = state.top();
        block.push(open);

        do {
            token = state.pop();
            block.push(token);

            if (token.type == open.type) {
                subblocks += 1;
            }

            if (token.type == until) {
                if (subblocks == 0) break;
                else subblocks -= 1;
            }
        } while (state.hasMore());

        return new Block(block);
    }

    // Token types
    private processParagraph(state: State) {
        let block = this.accumulateBlock(state, "paragraph_close");
        let content = block.content;

        if (content.length == 0) {
            console.log("[,] Paragraph block is empty. Skipping.");
            return;
        }

        let result = this.processTokens(content);
        state.merge(result);

        state.pushContent("");
    }

    private processHeading(state: State) {
        let block = this.accumulateBlock(state, "heading_close");
        let result = this.processTokens(block.content);

        const text = result.content.join().trim();

        if (!state.hasParam("title") && block.open.tag == "h1") {
            console.log(`> Extracted title '${text}'`);
            state.putParam("title", text);
        } else {
            const markup = `${block.open.markup} ${text}\n`;
            state.pushContent(markup);
        }
    }

    private processFence(state: State) {
        const token = state.top();
        state.pushContent(`${token.markup}${token.info}\n${token.content.trim()}\n${token.markup}\n`);
    }

    // General
    private processTokens(tokens: Token[]): Partial {
        let state = new State(tokens);

        do {
            let token = state.pop();

            switch (token.type) {
                case "heading_open":
                    this.processHeading(state);
                    break;
                case "paragraph_open":
                    this.processParagraph(state);
                    break;
                case "fence":
                    this.processFence(state);
                    break;
                default:
                    state.pushContent(token.content);
            }
        } while (state.hasMore());

        return state.build();
    }

    process(text: string): Result {
        let tokens = (new MarkdownIt()).parse(text, {});
        let partial = this.processTokens(tokens);

        return {
            content: partial.content.join("\n"),
            params: partial.params
        }
    }
}

// ---

export type MarkdownProcessResult = Result;

export function process(text: string): MarkdownProcessResult {
    const processor = new MarkdownProcessor();
    return processor.process(text);
}

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
