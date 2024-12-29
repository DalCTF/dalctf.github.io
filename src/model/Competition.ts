import { z } from 'astro:content';

export class Competition {

    url: string;
    name: string;
    place: number;
    total: number;
    date_end: Date;
    date_start: Date;
    event_url: string;

    get id(): string {
        return this.event_url;
    }

    static schema() {
        return z.object({
            "id": z.string(),
            "url": z.string(),
            "name": z.string(),
            "place": z.number(),
            "total": z.number(),
            "date_end": z.date(),
            "date_start": z.date(),
            "event_url": z.string(),
        })
    }

    public raw() {
        return {
            "id": this.id,
            "url": this.url,
            "name": this.name,
            "place": this.place,
            "total": this.total,
            "date_end": this.date_end,
            "event_url": this.event_url,
            "date_start": this.date_start,
        }
    }

    constructor(
        url: string,
        name: string,
        place: number,
        total: number,
        date_end: Date,
        date_start: Date,
        event_url: string,
    ) {
        this.url = url;
        this.name = name;
        this.place = place;
        this.total = total;
        this.date_end = date_end;
        this.event_url = event_url;
        this.date_start = date_start;
    }
}