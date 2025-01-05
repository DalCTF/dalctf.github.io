import { HTMLElement, parse as parseHTML } from 'node-html-parser';
import { Downloader } from '../util/downloader';

/*
--- Model
*/
export interface Placement {
    id: string;
    place: number;
}

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

/*
--- Parsers
*/
class HTMLParser {

    protected content: HTMLElement;

    protected findTagIncluding(element: HTMLElement, tag: string, text: string): HTMLElement {
        let result: HTMLElement | undefined = undefined;

        let tags = element.querySelectorAll(tag);
        for (let tag of tags) {
            for (let child of tag.childNodes) {
                if (child.rawText.includes(text)) {
                    result = tag;
                    break;
                }
            }
        }

        if (!result) {
            throw new Error(`Failed to find tag '${tag}' containing '${text}'`);
        }

        return result;
    }

    protected findSiblingWithClass(element: HTMLElement, withClass: string): HTMLElement {
        let result: HTMLElement | undefined = undefined;

        let sibling = element.nextElementSibling;
        while (sibling) {
            if (sibling.classList.contains(withClass)) {
                result = sibling;
                break;
            }

            sibling = sibling.nextElementSibling;
        }

        if (!result) {
            throw new Error(`Failed to find sibling to '${element.tagName}' with class '${withClass}'`);
        }

        return result;
    }

    protected findSiblingWithTag(element: HTMLElement, withTag: string): HTMLElement {
        let result: HTMLElement | undefined = undefined;

        let sibling = element.nextElementSibling;
        while (sibling) {
            if (sibling.rawTagName == withTag) {
                result = sibling;
                break;
            }

            sibling = sibling.nextElementSibling;
        }

        if (!result) {
            throw new Error(`Failed to find sibling to '${element.tagName}' with tag '${withTag}'`);
        }

        return result;
    }

    constructor(text: string) {
        this.content = parseHTML(text);
    }
}

class PlacementParser extends HTMLParser {

    get placements(): Placement[] {
        try {
            let h3 = this.findTagIncluding(this.content, "h3", "Participated");
            let ratingsTable = this.findSiblingWithClass(h3, "tab-content");
            let rows = ratingsTable.querySelectorAll("tr");

            return rows
                .map(row => {
                    let columns = row.querySelectorAll("td");
                    if (columns.length < 3) return undefined;

                    let event_uri = columns[2].firstElementChild?.getAttribute("href") || "";
                    let id = event_uri.split("/").pop() || "";
                    let place = parseInt(columns[1].rawText);

                    return { id, place };
                })
                .filter(row => !!row);
        } catch (error) {
            throw new Error("Failed to parse placements", { cause: error });
        }
    }
}

class CompetitionParser extends HTMLParser {

    get url(): string {
        try {
            let tag = this.findTagIncluding(this.details, "p", "Official URL");

            let href = tag?.querySelector("a")?.getAttribute("href");
            if (!href) throw new Error("Failed to find link");

            return href;
        } catch (error) {
            throw new Error("Failed to parse competition url");
        }
    }

    get name(): string {
        try {
            const header = this.content.querySelector("div.page-header")?.firstElementChild?.rawText;
            if (!header) {
                throw new Error("Failed to find header text");
            }

            return header;
        } catch (error) {
            throw new Error("Failed to parse competition name", { cause: error });
        }
    }

    get total(): number {
        try {
            let h3 = this.findTagIncluding(this.content, "h3", "Scoreboard");
            let table = this.findSiblingWithTag(h3, "p");

            let matches = [...table.rawText.matchAll(/\d+/g)];
            return parseInt(matches[0][0]);
        } catch (error) {
            throw new Error("Failed to parse competition total", { cause: error });
        }
    }

    get dates(): Date[] {
        try {
            let fullDateString = this.details.querySelector("p")?.firstChild?.rawText.trim();
            fullDateString = fullDateString?.replace("&nbsp;", "");

            if (!fullDateString) {
                throw new Error("Failed to find date text.");
            }

            let dateStrings = fullDateString.split("&mdash;");
            dateStrings = [...dateStrings.map(x => x.trim())];

            return [new Date(dateStrings[0]), new Date(dateStrings[1])];
        } catch (error) {
            throw new Error("Failed to parse competition dates", { cause: error });
        }
    }

    get details(): HTMLElement {
        try {
            let header = this.content.querySelector("div.page-header");
            if (!header) throw new Error("Failed to find header");
            return this.findSiblingWithClass(header, "row");
        } catch (error) {
            throw new Error("Failed to parse competition details", { cause: error });
        }
    }
}

/*
--- Loader
*/
export class Competitions {

    private static instance: Competitions;
    public static get shared(): Competitions {
        if (!this.instance) {
            const teamCode = "361970";
            const cache = process.env.NODE_ENV === 'development';
            this.instance = new Competitions(teamCode, cache);
        }

        return this.instance;
    }

    protected CTFTIME_URL: string = "https://ctftime.org";

    protected competitions: Map<string, Competition>;
    protected placements: Map<string, Placement>;
    protected teamCode: string;
    protected loaded = false;
    protected cache = true;

    private async loadPlacements() {
        if (this.loaded) return;

        try {
            let text = await Downloader.shared.downloadPage(`${this.CTFTIME_URL}/team/${this.teamCode}`, this.cache);
            let parser = new PlacementParser(text);
            parser.placements.forEach(p => this.placements.set(p.id, p));
            this.loaded = true;
        } catch (error) {
            throw new Error("Failed to get placements", { cause: error });
        }
    }

    private async listPlacements(): Promise<Placement[]> {
        await this.loadPlacements();
        return Array.from(this.placements.entries().map(([_, v]) => v));
    }

    private async getPlacement(id: string): Promise<Placement | undefined> {
        await this.loadPlacements();

        if (!this.placements.has(id)) return undefined;
        console.debug(`Hit placement cache for '${id}'`)
        return this.placements.get(id);
    }

    private async _get(id: string, placement: Placement | undefined): Promise<Competition> {
        if (this.cache) {
            if (this.competitions.has(id)) {
                console.debug(`Hit competition cache for '${id}'`);
                return this.competitions.get(id)!;
            }
        }

        try {
            let url = `${this.CTFTIME_URL}/event/${id}`;
            let text = await Downloader.shared.downloadPage(url, this.cache);

            let parser = new CompetitionParser(text);

            let competition: Competition = {
                dateStart: parser.dates[0],
                dateEnd: parser.dates[1],
                total: parser.total,
                name: parser.name,
                url: parser.url,
                eventUrl: url,
                id,

                place: placement?.place || undefined,
            }

            this.competitions.set(id, competition);
            return competition;
        } catch (error) {
            throw new Error(`Failed to get competition '${id}'`, { cause: error });
        }
    }
    async get(id: string): Promise<Competition> {
        let placement = await this.getPlacement(id);
        return this._get(id, placement);
    }

    async list(): Promise<Competition[]> {
        const placements = await this.listPlacements();

        let competitions = [];
        for (let placement of placements) {
            const competition = await this._get(placement.id, placement);
            this.competitions.set(competition.id, competition);
            competitions.push(competition);

            // Sleeps for half a second
            await new Promise(r => setTimeout(r, 500));
        }

        return competitions;
    }

    constructor(teamCode: string, cache: boolean = true) {
        this.competitions = new Map();
        this.placements = new Map();
        this.teamCode = teamCode;
        this.cache = cache;
    }
}
