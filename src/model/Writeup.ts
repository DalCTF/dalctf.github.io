import { z } from 'astro:content';

export interface Writeup {
    id: string;
    title: string;
    folder: string;
    category: string;
    competition: string;
    tags: string[];

    raw: string;
    rendered: string;

}

export const Schema = z.object({
    "id": z.string(),
    "title": z.string(),
    "folder": z.string(),
    "category": z.string(),
    "competition": z.string(),
    "tags": z.array(z.string()),

    "raw": z.string(),
    "rendered": z.string(),

});