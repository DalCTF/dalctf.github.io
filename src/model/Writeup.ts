import { z } from 'astro:content';

export class Writeup {

    competition?: string;
    category?: string;
    folder: string;
    tags: string[];
    title: string;
    content?: string;
    rendered?: string;

    static schema() {
        return z.object({
            "competition": z.string(),
            "category": z.string(),
            "tags": z.array(z.string()),
            "title": z.string(),
            "folder": z.string(),
            "content": z.string(),
            "rendered": z.string(),
            "slug": z.string(),
            "id": z.string(),
        })
    }

    public get id(): string {
        return `${this.competition}-${this.category}-${this.folder}`
    }

    public get slug(): string {
        return this.id.toLowerCase();
    }

    public raw() {
        return {
            "id": this.id,
            "slug": this.slug,
            "competition": this.competition,
            "category": this.category,
            "tags": this.tags,
            "title": this.title,
            "content": this.content,
            "rendered": this.rendered,
            "folder": this.folder,
        }
    }

    constructor(title: string, folder: string, tags: string[] = []) {
        this.folder = folder;
        this.title = title;
        this.tags = tags;
    }
}