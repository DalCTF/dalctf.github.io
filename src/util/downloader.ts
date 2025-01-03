import * as fs from 'fs';

export class Downloader {

    private static _shared?: Downloader;
    static get shared(): Downloader {
        if (!this._shared) this._shared = new Downloader();
        return this._shared;
    }

    private pathSafeUrl(url: string): string {
        const parsedUrl = new URL(url);
        const restOfUrl = `${parsedUrl.host}${parsedUrl.pathname}${parsedUrl.search}`;
        const safePath = restOfUrl.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
        return safePath.replace(/_+/g, '_');
    }

    private save(url: string, text: string) {
        const path = `_cache/${this.pathSafeUrl(url)}.json`;
        fs.mkdirSync("_cache", { recursive: true });
        fs.writeFileSync(path, text);
    }

    private get(url: string) {
        const path = `_cache/${this.pathSafeUrl(url)}.json`;
        if (fs.existsSync(path)) {
            return fs.readFileSync(path).toString();
        }
        return undefined;
    }

    public async downloadPage(url: string, cache: boolean = true): Promise<string> {

        // Only retrieve from cache if parameter allows so
        if (cache) {
            const cached = this.get(url);
            if (cached) return cached;
        }

        let response = await fetch(url);
        let status = response.status;

        if (status != 200) {
            console.log(response);
            throw new Error(`Failed to download page '${url}'. Status code: ${status}`);
        }

        const text = await response.text();
        this.save(url, text);
        return text;
    }
}