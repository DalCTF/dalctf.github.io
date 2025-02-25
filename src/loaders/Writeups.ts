import { Octokit, RequestError } from 'octokit';
import { parse as parseYML } from 'yaml';
import { Cache } from '../loaders/Cache';
import { parseDate } from '../util/date';
import { process as processMD } from '../util/markdown';


interface Entry {
    name: string;
    path: string;
    dateUpdated: Date;
}

export interface Repo {
    name: string,
    path: string,
    publish: boolean,
    dateUpdated: Date,
    ctftimeId?: string
}

export interface Category {
    repo: Repo;

    name: string;
    path: string;
    sha: string;
    id: string;
}

export interface Problem {
    category: Category;

    name: string;
    path: string;
    sha: string;
    id: string;
}

export interface Writeup {
    id: string;
    link: string;
    title: string;
    tags: string[];
    competition?: string;

    raw: string;
    rendered: string;
}

export class Writeups {

    CATEGORY_CACHE: Cache<Category>;
    PROBLEM_CACHE: Cache<Problem>;
    WRITEUP_CACHE: Cache<Writeup>;
    REPO_CACHE: Cache<Repo>;
    LOADED: boolean = false;
    OCTOKIT: Octokit;
    ORG: string;

    private static instance: Writeups;
    public static get shared(): Writeups {
        if (!this.instance) {
            const org = "dalctf";
            const token = process.env.GITHUB_TOKEN;
            this.instance = new Writeups(token, org);
        }

        return this.instance;
    }

    // GitHub-related
    decode(response: NonNullable<Awaited<ReturnType<Octokit["rest"]["repos"]["getContent"]>>>) {
        const data = response.data;
        if (!('type' in data)) {
            throw new Error(`Received data expected to have the property 'type'`);
        }

        if (data.type !== 'file') {
            throw new Error(`Received response of type '${data.type}'. Expecting 'file'`);
        }

        if (!('content' in data)) {
            throw new Error(`Received data expected to have the property 'content'`);
        }

        const buffer = Buffer.from(data.content, "base64");
        return buffer.toString("utf-8");
    }

    async getContent(repo: string, path: string, failOnNotFound: boolean = true) {
        let response;

        try {
            response = await this.OCTOKIT.rest.repos.getContent({
                repo: repo,
                path: path,
                owner: this.ORG,
            });
        } catch (error) {
            if (error instanceof RequestError && error.status == 404 && !failOnNotFound) {
                return undefined;
            }

            throw new Error(`Failed to retrieve content for '${path}' in '${repo}'`, { cause: error });;
        }

        return response;
    }

    // Loader methods
    private async loadWriteups(problem: Problem): Promise<string[]> {
        let result = [];

        const response = await this.getContent(problem.category.repo.name, problem.path + "/README.md", false);
        if (!response) {
            console.log(`\t\t\tWriteup not found for problem '${problem.name}'`);
            return [];
        }

        if (!("sha" in response.data)) {
            console.log(`\t\t\tWriteup does not contain expected property 'sha'`);
            return [];
        };

        let id = problem.id;
        let sha = response.data.sha;
        if (this.WRITEUP_CACHE.hasWithHash(id, sha)) {
            return [];
        }

        let decoded = this.decode(response);
        let tags = [problem.category.name];
        let competition = problem.category.repo.ctftimeId;
        let link = `https://github.com/${problem.category.repo.path}/tree/main/${problem.path}`;

        let imageBaseURL = `https://github.com/${problem.category.repo.path}/raw/main/${problem.path}/`;
        let linkBaseURL = `https://github.com/${problem.category.repo.path}/blob/main/${problem.path}/`;

        let { text, params } = processMD(decoded, imageBaseURL, linkBaseURL);
        let title = params.get('title') || problem.name;

        const writeup: Writeup = {
            id,
            tags,
            link,
            title,
            competition,

            raw: decoded,
            rendered: text,
        };

        this.WRITEUP_CACHE.putWithHash(id, writeup, sha);
        return [id];
    }

    private async loadProblems(category: Category): Promise<string[]> {
        let result = [];

        let problemFolders = await this.getContent(category.repo.name, category.path);
        if (!Array.isArray(problemFolders?.data)) {
            throw new Error(`Expected array, got ${problemFolders}`);
        }

        const problems = problemFolders.data
            .filter(x => x.type == "dir")
            .filter(x => !x.name.startsWith("."))
            .map(x => ({
                id: category.id + "_" + x.name,
                category: category,
                path: x.path,
                name: x.name,
                sha: x.sha
            }));

        for (let problem of problems) {
            if (this.PROBLEM_CACHE.hasWithHash(problem.id, problem.sha)) continue;
            console.log(`\t\tProblem '${problem.path}' is outdated or missing. Loading...`);

            result.push(...await this.loadWriteups(problem));
            this.PROBLEM_CACHE.putWithHash(problem.id, problem, problem.sha);
        }

        return result;
    }

    private async loadCategories(repo: Repo): Promise<string[]> {
        let result = [];

        let categoryFolders = await this.getContent(repo.name, "");
        if (!Array.isArray(categoryFolders?.data)) {
            throw new Error(`Expected array, got ${categoryFolders}`);
        }

        const categories = categoryFolders.data
            .filter(x => x.type == "dir")
            .filter(x => !x.name.startsWith("."))
            .map(x => ({
                id: repo.name + "_" + x.name,
                path: x.path,
                name: x.name,
                repo: repo,
                sha: x.sha
            }));

        for (let category of categories) {
            if (this.CATEGORY_CACHE.hasWithHash(category.id, category.sha)) continue;
            console.log(`\tCategory '${category.path}' is outdated or missing. Loading...`);

            result.push(...await this.loadProblems(category));
            this.CATEGORY_CACHE.putWithHash(category.id, category, category.sha);
        }

        return result;
    }

    private async loadRepos(entries: Entry[]): Promise<string[]> {
        let loadedEntries = [];

        for (let entry of entries) {
            if (this.REPO_CACHE.hasWithDate(entry.name, entry.dateUpdated)) continue;
            console.log(`Repository '${entry.name}' is outdated or missing. Loading...`);

            let meta: any;
            const response = await this.getContent(entry.name, "meta.yml", false);
            if (response) {
                const text = this.decode(response);
                meta = parseYML(text);
            }

            let name = entry.name;
            let path = entry.path;
            let dateUpdated = entry.dateUpdated;
            let publish = meta?.publish || false;
            let ctftimeId = meta?.ctf_time_id.toString() || undefined;

            let repo: Repo = {
                path,
                name,
                publish,
                ctftimeId,
                dateUpdated,
            };

            loadedEntries.push(...await this.loadCategories(repo));
            this.REPO_CACHE.putWithDate(entry.name, repo, dateUpdated);
        }

        return loadedEntries;
    }

    async load(): Promise<string[]> {
        if (this.LOADED) return [];

        let response;

        try {
            response = await this.OCTOKIT.rest.repos.listForOrg({
                type: "public",
                org: this.ORG
            });
        } catch (error) {
            throw new Error(`Failed to retrieve repositories for organization '${this.ORG}'`, { cause: error });
        }

        let entries = response.data.map(x => {
            return { name: x.name, path: x.full_name, dateUpdated: parseDate(x.updated_at) };
        });
        entries = entries.filter(x => x.name !== "dalctf.github.io");

        const loadedEntries = await this.loadRepos(entries);
        this.LOADED = true;

        return loadedEntries;
    }

    // Retrieval
    async list(): Promise<Writeup[]> {
        await this.load();
        return this.WRITEUP_CACHE.list();
    }

    async get(id: string): Promise<Writeup> {
        await this.load();
        return this.WRITEUP_CACHE.get(id)!;
    }

    constructor(token: string | undefined, org: string) {
        if (token == undefined || token == "") {
            throw new Error("[!] GitHub token must not be empty or undefined!");
        }

        this.CATEGORY_CACHE = new Cache("categories");
        this.PROBLEM_CACHE = new Cache("problems");
        this.WRITEUP_CACHE = new Cache("writeups");
        this.REPO_CACHE = new Cache("repos");

        this.OCTOKIT = new Octokit({ auth: token });
        this.ORG = org;
    }
}
