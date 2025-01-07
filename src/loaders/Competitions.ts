import { HTMLElement, parse as parseHTML } from 'node-html-parser';
import { Cache } from './Cache';
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
    dateEnd: number;
    eventUrl: string;
    dateStart: number;

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

    get dates(): number[] {
        try {
            let fullDateString = this.details.querySelector("p")?.firstChild?.rawText.trim();
            fullDateString = fullDateString?.replace("&nbsp;", "");

            if (!fullDateString) {
                throw new Error("Failed to find date text.");
            }

            let dateStrings = fullDateString.split("&mdash;");
            dateStrings = [...dateStrings.map(x => x.trim())];

            return [new Date(dateStrings[0]).getTime(), new Date(dateStrings[1]).getTime()];
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
            this.instance = new Competitions(teamCode);
        }

        return this.instance;
    }

    CTFTIME_URL: string = "https://ctftime.org";
    COMPETITION_CACHE: Cache<Competition>;
    TEAM_CODE: string;
    LOADED = false;

    private async loadCompetition(placement: Placement): Promise<string[]> {
        if (this.COMPETITION_CACHE.has(placement.id)) {
            return [];
        }

        console.log(`Competition '${placement.id}' is outdated or missing. Loading...`);
        await new Promise(r => setTimeout(r, 250));

        let url = `${this.CTFTIME_URL}/event/${placement.id}`;
        let response = await fetch(url);
        let status = response.status;

        if (status != 200) {
            throw new Error(`Failed to download page '${url}'. Status code: ${status}`);
        }

        const text = await response.text();
        let parser = new CompetitionParser(text);

        let competition: Competition = {
            dateStart: parser.dates[0],
            dateEnd: parser.dates[1],
            total: parser.total,
            name: parser.name,
            id: placement.id,
            url: parser.url,
            eventUrl: url,

            place: placement?.place || undefined,
        }

        this.COMPETITION_CACHE.put(placement.id, competition);
        return [placement.id];
    }

    private async loadPlacements(): Promise<string[]> {
        let url = `${this.CTFTIME_URL}/team/${this.TEAM_CODE}`;
        let response = await fetch(url);
        let status = response.status;

        if (status != 200) {
            throw new Error(`Failed to download page '${url}'. Status code: ${status}`);
        }

        let result = [];
        const text = await response.text();
        let parser = new PlacementParser(text);
        for (let placement of parser.placements) {
            result.push(...await this.loadCompetition(placement));
        }

        return result;
    }

    async load(): Promise<string[]> {
        if (this.LOADED) return [];
        const result = await this.loadPlacements();
        this.LOADED = true;
        return result;
    }

    // Retrieval
    async get(id: string) {
        await this.load();
        return this.COMPETITION_CACHE.get(id);
    }

    async list(): Promise<Competition[]> {
        await this.load();
        return this.COMPETITION_CACHE.list();
    }

    constructor(teamCode: string) {
        this.COMPETITION_CACHE = new Cache("competitions");
        this.TEAM_CODE = teamCode;
    }
}
