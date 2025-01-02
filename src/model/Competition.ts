import { z } from 'astro:content';

export interface Competition {
    id: string;
    url: string;
    name: string;
    total: number;
    dateEnd: Date;
    dateStart: Date;
    eventUrl: string;

    place?: number;
}

export const Schema = z.object({
    "id": z.string(),
    "url": z.string(),
    "name": z.string(),
    "total": z.number(),
    "dateEnd": z.date(),
    "dateStart": z.date(),
    "eventUrl": z.string(),

    "place": z.optional(z.number()),
});
