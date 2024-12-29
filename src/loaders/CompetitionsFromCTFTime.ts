import { type Loader, type LoaderContext } from 'astro/loaders';
import { HTMLElement, parse } from 'node-html-parser';
import { Competition } from '../model/Competition';

interface Placement {
    place: number;
    event_uri: string;
}

export interface CompetitionsFromCTFTimeOptions {
    teamCode: string;
    development: boolean;
}

export class CompetitionsFromCTFTimeLoader implements Loader {

    BASE_URL: string = "https://ctftime.org";
    DEVELOPMENT: boolean;
    TEAM_CODE: string;

    name: string = "Placements From CTFTime Loader";


    static getLoader(options: CompetitionsFromCTFTimeOptions): CompetitionsFromCTFTimeLoader {
        return new CompetitionsFromCTFTimeLoader(options.teamCode, options.development);
    }

    // Util
    private async downloadPage(uri: string): Promise<string> {
        let index_result = await fetch(this.BASE_URL + uri);
        return await index_result.text();
    }

    private findTagIncluding(content: HTMLElement, tag: string, text: string): HTMLElement | undefined {
        let tags = content.querySelectorAll(tag);

        let result: HTMLElement | undefined = undefined;

        for (let tag of tags) {
            for (let child of tag.childNodes) {
                if (child.rawText.includes(text)) {
                    result = tag;
                    break;
                }
            }
        }

        return result;
    }

    private findSiblingWithClass(content: HTMLElement, withClass: string): HTMLElement | undefined {
        let result: HTMLElement | undefined = undefined;

        let sibling = content.nextElementSibling;
        while (sibling) {
            if (sibling.classList.contains(withClass)) {
                result = sibling;
                break;
            }

            sibling = sibling.nextElementSibling;
        }

        return result;
    }

    private findSiblingWithTag(content: HTMLElement, withTag: string): HTMLElement | undefined {
        let result: HTMLElement | undefined = undefined;

        let sibling = content.nextElementSibling;
        while (sibling) {
            if (sibling.rawTagName == withTag) {
                result = sibling;
                break;
            }

            sibling = sibling.nextElementSibling;
        }

        return result;
    }

    // Competitions
    private getCompetitionName(content: HTMLElement): string {
        return content.querySelector("div.page-header")?.firstElementChild?.rawText || "";
    }

    private getTotalParticipants(content: HTMLElement): number {
        let h3 = this.findTagIncluding(content, "h3", "Scoreboard");
        if (!h3) {
            console.error("[!] Failed to find header 'Scoreboard'");
            console.log(content);
            return -1;
        }

        let table = this.findSiblingWithTag(h3, "p");
        if (!table) {
            console.error("[!] Failed to find sibling 'p'");
            return -1;
        }

        let re = /\d+/g;
        let matches = [...table.rawText.matchAll(re)];

        if (matches.length == 0) return -1;
        return parseInt(matches[0][0]);
    }

    private getCompetitionDates(details: HTMLElement): Date[] {
        let fullDateString = details.querySelector("p")?.firstChild?.rawText.trim();
        if (!fullDateString) return [new Date(), new Date()];

        fullDateString = fullDateString.replace("&nbsp;", "");

        let dateStrings = fullDateString.split("&mdash;");
        dateStrings = [...dateStrings.map(x => x.trim())];

        return [new Date(dateStrings[0]), new Date(dateStrings[1])];
    }

    private getCompetitionURL(details: HTMLElement): string {
        let tag = this.findTagIncluding(details, "p", "Official URL");
        let a = tag?.querySelector("a");
        return a?.getAttribute("href") || "";
    }

    private getCompetitionDetails(content: HTMLElement): HTMLElement | undefined {
        let pageHeader = content.querySelector("div.page-header");
        if (!pageHeader) return undefined;

        return this.findSiblingWithClass(pageHeader, "row");
    }

    private async getCompetition(placement: Placement): Promise<Competition | undefined> {
        let text = await this.downloadPage(placement.event_uri); ''

        let content = parse(text);
        let details = this.getCompetitionDetails(content);
        if (!details) {
            console.error("[!] Failed to get details for competition '%s'", placement.event_uri);
            return undefined;
        }

        let event_url = this.BASE_URL + placement.event_uri;
        let total = this.getTotalParticipants(content);
        let dates = this.getCompetitionDates(details);
        let name = this.getCompetitionName(content);
        let url = this.getCompetitionURL(details);
        let place = placement.place;

        return new Competition(
            url,
            name,
            place,
            total,
            dates[1],
            dates[0],
            event_url,
        )
    }

    private async getCompetitions(placements: Placement[]): Promise<Competition[]> {
        let competitions: Competition[] = [];

        for (let placement of placements) {
            let competition = await this.getCompetition(placement);
            if (!competition) continue;

            competitions.push(competition);
        }

        return competitions;
    }

    // Rankings
    private async getPlacementsFromTable(content: HTMLElement): Promise<Placement[]> {
        let rows = content.querySelectorAll("tr");
        let result: Placement[] = [];

        for (let row of rows) {
            let columns = row.querySelectorAll("td");
            if (columns.length < 3) continue;

            let place = parseInt(columns[1].rawText);
            let event_uri = columns[2].firstElementChild?.getAttribute("href") || "";

            result.push({ place, event_uri });
        }

        return result;
    }

    private async getPlacements(): Promise<Placement[]> {

        // Download the page for team
        let text = await this.downloadPage(`/team/${this.TEAM_CODE}`);
        let content = parse(text);

        // Find table with participated CTFs
        let h3 = this.findTagIncluding(content, "h3", "Participated");
        if (!h3) {
            console.error("[!] Failed to find header 'Participated'");
            return [];
        }

        // Find table next to header
        let ratingsTable = this.findSiblingWithClass(h3, "tab-content");
        if (!ratingsTable) {
            console.error("[!] Failed to find ratings table");
            return [];
        }

        // Get all values inside table rows
        return this.getPlacementsFromTable(ratingsTable);
    }

    async load(context: LoaderContext): Promise<void> {
        context.store.clear();

        const placements = await this.getPlacements();
        const competitions = await this.getCompetitions(placements);

        for (var competition of competitions) {
            context.store.set({ id: competition.event_url, data: competition.raw() });
        }
    }

    async schema() {
        return Competition.schema();
    }

    constructor(teamCode: string, development: boolean = false) {
        this.DEVELOPMENT = development;
        this.TEAM_CODE = teamCode;

        // Makes sure that the method knows about
        // the entire context of this class
        this.load = this.load.bind(this);
    }
}
