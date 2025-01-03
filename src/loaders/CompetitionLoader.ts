import { type Loader, type LoaderContext } from 'astro/loaders';
import { Schema } from '../model/Competition';
import { Competitions } from '../util/competitions';


export interface CompetitionLoaderOptions {
    teamCode: string;
    development: boolean;
}

export class CompetitionLoader implements Loader {

    COMPETITIONS: Competitions;
    DEVELOPMENT: boolean;
    TEAM_CODE: string;

    name: string = "Competitions Loader";


    static getLoader(options: CompetitionLoaderOptions): CompetitionLoader {
        return new CompetitionLoader(options.teamCode, options.development);
    }

    async load(context: LoaderContext): Promise<void> {
        const competitions = await this.COMPETITIONS.list();

        for (var competition of competitions) {
            context.store.set({ id: competition.id, data: { ...competition } });
        }
    }

    async schema() {
        return Schema;
    }

    constructor(teamCode: string, development: boolean = false) {
        this.TEAM_CODE = teamCode;
        this.DEVELOPMENT = development;
        this.COMPETITIONS = new Competitions(this.TEAM_CODE, this.DEVELOPMENT);

        // Makes sure that the method knows about
        // the entire context of this class
        this.load = this.load.bind(this);
    }
}
