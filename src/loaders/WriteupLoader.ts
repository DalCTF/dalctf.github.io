import { type Loader, type LoaderContext } from 'astro/loaders';
import { Schema } from '../model/Writeup';
import { GitHub, Writeups } from '../util/writeups';

export interface WriteupLoaderOptions {
    development?: boolean;
    githubToken?: string;
    org: string;
}

export class WriteupLoader implements Loader {

    DEVELOPMENT: boolean;
    WRITEUPS: Writeups;
    GITHUB: GitHub;

    name: string = "Writeups From GitHub Loader";

    static getLoader(options: WriteupLoaderOptions): WriteupLoader {
        if (options.githubToken == undefined || options.githubToken == "") {
            throw new Error("[!] GitHub token must not be empty or undefined!");
        }

        if (options.development == undefined) {
            options.development = false;
        }

        return new WriteupLoader(options.githubToken, options.org, options.development);
    }

    async load(context: LoaderContext): Promise<void> {
        const writeups = await this.WRITEUPS.writeups();
        context.store.clear();

        for (var writeup of writeups) {
            context.store.set({ id: writeup.id, data: { ...writeup } });
        }
    }

    async schema() {
        return Schema;
    }

    constructor(githubToken: string, org: string, development: boolean = false) {
        this.DEVELOPMENT = development;
        this.GITHUB = new GitHub(githubToken, org);
        this.WRITEUPS = new Writeups(this.GITHUB, development);

        // Makes sure that the method knows about
        // the entire context of this class
        this.load = this.load.bind(this);
    }
}
