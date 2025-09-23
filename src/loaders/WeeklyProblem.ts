import { Octokit, RequestError } from 'octokit';
import { parseDate } from '../util/date';
import { Cache } from './Cache';

interface Entry {
    name: string;
    path: string;
    dateUpdated: Date;
}

export interface Repo {
    name: string,
    path: string,
    dateUpdated: Date,
}

export interface Category {
    repo: Repo;
    name: string;
    path: string;
    sha: string;
    id: string;
}

export interface WeeklyProblem {
    category: Category;
    author?: string;
    path: string;
    id: Number | string;
    name: string;
    title: string;
    presentedBy?: string;
    datePresented?: string;
    tags?: string[];
    link: string;
    snippet?: string;
    flag: string;
    flagFormat: string;
    active: boolean;
}

export class WeeklyProblems {

    CATEGORY_CACHE: Cache<Category>;
    PROBLEM_CACHE: Cache<WeeklyProblem>;
    WEEKLY_PROBLEMS_CACHE: Cache<WeeklyProblem>;
    REPO_CACHE: Cache<Repo>;
    // REPO_CACHE: Cache<Repo>;
    LOADED: boolean = false;
    OCTOKIT: Octokit;
    ORG: string;

    private static instance: WeeklyProblems;
    public static get shared(): WeeklyProblems {
        if (!this.instance) {
            const org = "dalctf";
            const token = process.env.GITHUB_TOKEN;
            this.instance = new WeeklyProblems(token, org);
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
    private async loadWeeklyProblems(problem: WeeklyProblem): Promise<string[]> {
        let result = [];
        // const problemJsonResponse = await this.getContent(problem.category.repo.name, problem.path + "/PROBLEM.json", false);

        const problemJsonResponse = await this.getContent(problem.category.repo.name, problem.path + `/${problem.name}.json`, false);
        const p = `${problem.category.repo.name}/${problem.path}/${problem.name}.json`;
        if (!problemJsonResponse) {
            console.log(`\t\t\tWeekly Problem not found for problem '${problem.name}'`);
            return [];
        }

        if (!("sha" in problemJsonResponse.data)) {
            console.log(`\t\t\tWeekly Problem does not contain expected property 'sha'`);
            return [];
        }

        let id = problem.id.toString();
        let sha = problemJsonResponse.data.sha;
        if (this.WEEKLY_PROBLEMS_CACHE.hasWithHash(id, sha)) {
            return [];
        }

        let decoded = this.decode(problemJsonResponse);
        console.log("------------------Decoded JSON:------------------ ");
        console.log(decoded);
        // let id = problem.id;
        // let tags = [problem.category.name];
        // let link = `https://github.com/${problem.category.repo.path}/tree/main/${problem.path}`;

        // let imageBaseURL = `https://github.com/${problem.category.repo.path}/raw/main/${problem.path}/`;
        // let linkBaseURL = `https://github.com/${problem.category.repo.path}/blob/main/${problem.path}/`;

        // If writeup exists for weekly problem, load it. 

        let params = JSON.parse(decoded);
        let name = params.name;
        let tags = params.tags;
        // let link = params.link;
        let title = params.title;
        let presentedBy = params.presentedBy || "Status 418";
        // console.log("Parsed Date " + presentedBy);
        // let datePresented = paparams.datePresented);
        let datePresented = parseDate(params.datePresented).toLocaleString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric'
        });
        // let datePresented = datePresented.toDateString();
        let snippet = params.snippet || undefined;

        const weeklyProblem: WeeklyProblem = {
            id,
            path: problem.path,
            author: params.author,
            name,
            tags,
            // link,  
            title,
            presentedBy,
            datePresented,
            snippet,
            // category, 
            link: '',
            category: problem.category,
            flag: params.flag,
            flagFormat: params.flagFormat,
            active: params.active
        };

        // console.log("------Weekly Problem:---------");
        // console.log(weeklyProblem);

        this.WEEKLY_PROBLEMS_CACHE.putWithHash(id, weeklyProblem, sha);

        result.push(weeklyProblem);

        return [id];
    }

    private async loadProblems(category: Category): Promise<string[]> {
        let result = [];

        let problemFolders = await this.getContent(category.repo.name, category.path);
        if (!Array.isArray(problemFolders?.data)) {
            throw new Error(`Expected array, got ${problemFolders}`);
        }

        // TODO: Review which fields are needed. 
        const problems = problemFolders.data
            .filter(x => x.type == "dir")
            .filter(x => !x.name.startsWith("."))
            .map(x => ({
                id: category.id + "_" + x.name,
                category: category,
                path: x.path,
                name: x.name,
                sha: x.sha,
                title: x.name,
                link: x.path
            }));
        
        for (let problem of problems) {
            console.log("path: " + problem.path);
            if (this.WEEKLY_PROBLEMS_CACHE.hasWithHash(problem.id, problem.sha)) continue;
            console.log(`\t\tProblem '${problem.path}' is outdated or missing. Loading...`);

            result.push(...await this.loadWeeklyProblems(problem));
            // this.WEEKLY_PROBLEMS_CACHE.putWithHash(problem.id, problem, problem.sha);
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
    

    private async loadRepo(entry: Entry): Promise<string[]> {
        let loadedEntries = [];

        let name = entry.name;
        let path = entry.path;
        let dateUpdated = entry.dateUpdated;

        let repo: Repo = {
            path,
            name,
            dateUpdated,
        };

        loadedEntries.push(...await this.loadCategories(repo));
        this.REPO_CACHE.putWithDate(name, repo, dateUpdated);
        return loadedEntries;


    }

    async load(): Promise<string[]> {
        if (this.LOADED) return [];

        let response;

        // Get Weekly Probelms Repo
        try {
            response = await this.OCTOKIT.rest.repos.get({
                type: "public",
                owner: this.ORG,
                repo: "weekly-problems"
            });
        } catch (error) {
            throw new Error(`Failed to retrieve weekly problems repository for organization '${this.ORG}'`, { cause: error });
        }

        let entries = [{ name: response.data.name, path: response.data.full_name, dateUpdated: parseDate(response.data.updated_at) }];

        const weeklyProblem = await this.loadRepo(entries[0]);
        this.LOADED = true;
        
        return weeklyProblem;
    }

    // Retrieval 
    async list(): Promise<WeeklyProblem[]> {
        await this.load();
        return this.WEEKLY_PROBLEMS_CACHE.list();
    }

    async get(id: string): Promise<WeeklyProblem> {
        await this.load();
        return this.WEEKLY_PROBLEMS_CACHE.get(id)!;
    }

    constructor(token: string | undefined, org: string) {
        if (token == undefined || token == "") {
            throw new Error("[!] GitHub token must not be empty or undefined!");
        }

        this.CATEGORY_CACHE = new Cache("categories");
        this.PROBLEM_CACHE = new Cache("weekly_problem");
        this.WEEKLY_PROBLEMS_CACHE = new Cache("weekly_problems");
        this.REPO_CACHE = new Cache("repos");
        this.OCTOKIT = new Octokit({ auth: token });
        this.ORG = org;
    }

}