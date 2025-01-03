import { z } from 'astro:content';

export interface Writeup {
    id: string;
    title: string;
    folder: string;
    category: string;
    tags: string[];

    raw: string;
    rendered: string;

    competition?: string;
}

export const Schema = z.object({
    "id": z.string(),
    "title": z.string(),
    "folder": z.string(),
    "category": z.string(),
    "tags": z.array(z.string()),

    "raw": z.string(),
    "rendered": z.string(),

    "competition": z.optional(z.string()),
});