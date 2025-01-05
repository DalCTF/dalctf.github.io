import * as fs from 'fs';

interface CacheEntry<T> {
    id: string;
    content: T;
    date?: number;
    hash?: string;
}

export class Cache<T> {

    private path: string;
    private loaded: boolean = false;
    private entries: Map<string, CacheEntry<T>>;

    private load() {
        if (this.loaded) return;
        fs.mkdirSync(this.path, { recursive: true });

        let files = fs.readdirSync(this.path, { withFileTypes: true })
            .filter(f => f.isFile())
            .map(f => this.filename(f.name));

        let entries = files
            .map(f => fs.readFileSync(f).toString())
            .map(f => JSON.parse(f))
            .map(f => f as CacheEntry<T>);

        entries.forEach(e => this.entries.set(e.id, e));
        this.loaded = true;
    }

    private filename(name: string): string {
        return this.path + "/" + name.toLowerCase()
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
            .replace(/_+/g, '_');
    }

    putWithHash(id: string, content: T, hash: string) {
        this.load();

        const entry = { id, content, hash };
        this.entries.set(id, entry);

        fs.writeFileSync(this.filename(id), JSON.stringify(entry));
    }

    putWithDate(id: string, content: T, date: Date) {
        this.load();

        const entry = { id, content, date: date.getTime() };
        this.entries.set(id, entry);

        fs.writeFileSync(this.filename(id), JSON.stringify(entry));
    }

    put(id: string, content: T) {
        this.load();

        const entry = { id, content };
        this.entries.set(id, entry);

        fs.writeFileSync(this.filename(id), JSON.stringify(entry));
    }

    getWithHash(id: string, hash: string): T | undefined {
        this.load();
        const entry = this.entries.get(id);

        if (!entry) return undefined;
        if (!entry.hash) return undefined;
        if (entry.hash != hash) return undefined;

        return entry.content;
    }

    getWithDate(id: string, date: Date): T | undefined {
        this.load();
        const entry = this.entries.get(id);

        if (!entry) return undefined;
        if (!entry.date) return undefined;
        if (date.getTime() > entry.date) return undefined;

        return entry.content;
    }

    get(id: string) {
        this.load();
        return this.entries.get(id)?.content;
    }

    hasWithHash(id: string, hash: string): boolean {
        return !!this.getWithHash(id, hash);
    }

    hasWithDate(id: string, date: Date): boolean {
        return !!this.getWithDate(id, date);
    }

    has(id: string) {
        this.load();
        return this.entries.has(id);
    }

    list(): T[] {
        this.load();
        return Array.from(this.entries.entries().map(([_, entry]) => entry.content));
    }

    constructor(path: string) {
        this.path = "cache/" + path;
        this.entries = new Map();
    }
}