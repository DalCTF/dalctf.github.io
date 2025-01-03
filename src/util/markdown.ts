import MarkdownIt from 'markdown-it';
import highlightjs from 'markdown-it-highlightjs';
import type { Token } from 'markdown-it/index.js';

type Result = { text: string, params: Map<string, any> }
export type MarkdownProcessResult = Result;

class Chip {
    type: "text" | "separator" | "break" | "space";
    value: string;

    static separator(value: string): Chip {
        return new Chip("separator", value);
    }

    static text(value: string): Chip {
        return new Chip("text", value);
    }

    static break(): Chip {
        return new Chip("break", "\n");
    }

    static space(): Chip {
        return new Chip("space", " ");
    }

    private constructor(type: "text" | "separator" | "break" | "space", value: string) {
        this.value = value;
        this.type = type;
    }
}

class Partial {
    content: Chip[];
    params: Map<string, any>;

    get text(): string {
        return this.content.map(x => "" + x.value + "").join('');
    }

    get debug(): string {
        return this.content.map(x => "{" + x.value + "}").join('');
    }

    constructor(content: Chip[], params: Map<string, any>) {
        this.content = content;
        this.params = params;
    }
}

class State {
    private _head?: Token;
    private _tail: Token[];

    public separator: string = "\n";

    public content: Chip[];
    public params: Map<string, any>;

    // Content
    private needsSpace(chip: Chip): boolean {
        const starting_symbols = [" ", ". ", ",", ";", "! ", "? ", ")", "]", "}"];
        if (starting_symbols.some(x => chip.value.startsWith(x))) return false;

        const last = this.content.at(-1);
        if (!last || last.type != "text") return false;

        const ending_sybmols = ["(", "[", "{", "\"", "\'"];
        if (ending_sybmols.some(x => last.value.endsWith(x))) return false;

        return true;
    }

    private endsInBreak(): boolean {
        if (this.content.length == 0) return true;
        const last = this.content.at(-1)!;
        return last.type == "break";
    }

    private pushChip(chip: Chip) {
        if (this.needsSpace(chip)) {
            this.content.push(Chip.space());
        }

        this.content.push(chip);
    }

    pushBlock(...content: string[]) {
        if (!this.endsInBreak()) this.break();
        this.push(...content);
        this.separate();
        this.break();
    }

    push(...content: string[]) {
        for (let item of content) {
            if (!item || item == "") continue;
            item = item.trim();

            this.pushChip(Chip.text(item));
        }
    }

    separate() {
        this.content.push(Chip.separator(this.separator));
    }

    break() {
        this.content.push(Chip.break());
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
        this.mergeParams(other.params);

        for (let chip of other.content) {
            if (chip.type == "text") { this.pushChip(chip); }
            else { this.content.push(chip); }
        }
    }

    build(): Partial {
        return new Partial(this.content, this.params);
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
    options: MarkdownProcessOptions;

    // Special Cases
    private shouldClip(...tokenTypes: string[]): boolean {
        return tokenTypes.some(x => this.options.clip.includes(x));
    }

    private shouldCollapse(...tokenTypes: string[]): boolean {
        return tokenTypes.some(x => this.options.collapse.includes(x));
    }

    private handleSpecialCase(state: State, token: Token, identifiers: string[] = []): boolean {
        identifiers.push(token.type, token.tag);

        if (this.shouldClip(...identifiers)) {
            return true;
        }

        if (this.shouldCollapse(...identifiers)) {
            state.push("[...]");
            state.separate();
            return true;
        }

        return false;
    }

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
        if (this.handleSpecialCase(state, block.open)) return;

        let result = this.processTokens(block.content);
        state.merge(result);
        state.separate();

        if (!this.options.compress) state.break();
    }

    private processHeading(state: State) {
        let block = this.accumulateBlock(state, "heading_close");
        let result = this.processTokens(block.content);
        let text = result.text;

        if (this.options.extractTitle && !state.hasParam("title") && block.open.tag == "h1") {
            console.log(`> Extracted title '${text}'`);
            state.putParam("title", text);
        }

        if (this.handleSpecialCase(state, block.open, ["heading"])) return;
        const markup = `${block.open.markup} ${text}`;
        state.pushBlock(markup);
    }

    private processInline(state: State) {
        const token = state.top();
        if (!token.children) return;

        let result = this.processTokens(token.children);
        state.merge(result);
    }

    private processFence(state: State) {
        const token = state.top();
        if (this.handleSpecialCase(state, token)) return;
        state.pushBlock(`${token.markup}${token.info}\n${token.content.trim()}\n${token.markup}`);
    }

    private processCode(state: State) {
        const token = state.top();
        if (this.handleSpecialCase(state, token)) return;
        state.push(`${token.markup}${token.content.trim()}${token.markup}`);
    }

    private processLink(state: State) {
        let block = this.accumulateBlock(state, "link_close");
        if (this.handleSpecialCase(state, block.open)) return;

        let result = this.processTokens(block.content);
        let href = block.open.attrGet("href") || "";
        let text = result.text;

        if (this.options.stripLinks) {
            state.push(text);
        } else {
            state.push(`[${text}](${href})`);
        }
    }

    // General
    private processTokens(tokens: Token[]): Partial {
        let state = new State(tokens);

        if (this.options.compress) {
            state.separator = " ";
        }

        do {
            let token = state.pop();

            switch (token.type) {
                case "heading_open":
                    this.processHeading(state);
                    break;
                case "paragraph_open":
                    this.processParagraph(state);
                    break;
                case "inline":
                    this.processInline(state);
                    break;
                case "fence":
                    this.processFence(state);
                    break;
                case "code_inline":
                    this.processCode(state);
                    break;
                case "link_open":
                    this.processLink(state);
                    break;
                default:
                    if (this.handleSpecialCase(state, token)) break;
                    state.push(token.content);
            }
        } while (state.hasMore());

        return state.build();
    }

    process(input: string): Result {
        const mdit = new MarkdownIt().use(highlightjs);

        let tokens = mdit.parse(input, {});
        if (this.options.debug) console.log(tokens);

        let partial = this.processTokens(tokens);
        let params = partial.params;

        let text: string;
        if (this.options.debug) text = partial.debug;
        else text = partial.text;

        if (this.options.render) {
            text = mdit.render(text);
        }

        return { params, text };
    }

    constructor(options?: MarkdownProcessOptions) {
        this.options = options || new MarkdownProcessOptions();
    }
}

export class MarkdownProcessOptions {
    breakLineOnCollapse: boolean = true;
    extractTitle: boolean = true;
    stripLinks: boolean = false;
    compress: boolean = false;
    render: boolean = false;
    debug: boolean = false;

    collapse: string[] = [];
    clip: string[] = [];
}

export function summary(text: string, max: number = 140): MarkdownProcessResult {

    let options = new MarkdownProcessOptions();
    options.extractTitle = false;
    options.collapse = ["fence"];
    options.clip = ["h1", "h2"];
    options.stripLinks = true;
    options.compress = true;
    options.render = false;

    const processor = new MarkdownProcessor(options);
    let result = processor.process(text);
    text = result.text;

    text = text
        .trim()
        .slice(0, max)
        .replace(/\s\S*$/, ''); // Remove the trailing partial word if present

    if (!text.endsWith(".")) {
        text += "...";
    }

    return { text, params: new Map<string, any>() };
}

export function process(text: string): MarkdownProcessResult {

    let options = new MarkdownProcessOptions();
    options.extractTitle = true;
    options.compress = false;
    options.collapse = [];
    options.render = true;
    options.clip = ["h1"];

    const processor = new MarkdownProcessor(options);
    return processor.process(text);
}
