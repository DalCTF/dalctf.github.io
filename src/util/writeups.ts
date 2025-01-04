import * as fs from 'fs';
import { Octokit, RequestError } from 'octokit';
import { parse as parseYML } from 'yaml';
import type { Writeup } from '../model/Writeup';
import { process as processMD } from './markdown';

export interface Repo {
    name: string,
    path: string,
    updatedAt: Date,
    ctftimeId?: string
}

export interface Category {
    repo: Repo;
    name: string;
}

export interface Problem {
    category: Category;
    name: string;
    path: string;
}

type GetContentResponse = Awaited<ReturnType<Octokit["rest"]["repos"]["getContent"]>>;
type GetContentData = GetContentResponse["data"];

type ListReposResponse = Awaited<ReturnType<Octokit["rest"]["repos"]["listForOrg"]>>;
type ListReposData = ListReposResponse["data"];

export class GitHub {

    OCTOKIT: Octokit;
    CACHE: boolean;
    ORG: string;

    private pathSafeName(name: string): string {
        return name
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
            .replace(/_+/g, '_');
    }

    private getCache(name: string): string | undefined {
        const path = `cache/${this.pathSafeName(name)}.json`;
        if (fs.existsSync(path)) {
            return fs.readFileSync(path).toString();
        }

        return undefined;
    }

    private setCache(name: string, text: string) {
        const path = `cache/${this.pathSafeName(name)}.json`;
        fs.mkdirSync("cache", { recursive: true });
        fs.writeFileSync(path, text);
    }

    private decodeContent(response: NonNullable<GetContentResponse>) {
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

    async getContent(repo: string, path: string, failOnNotFound: boolean = true): Promise<string | undefined> {
        const cachePath = `${repo}-${path}`;
        if (this.CACHE) {
            const cached = this.getCache(cachePath);
            if (cached) return cached;
        }

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

        const decoded = this.decodeContent(response);
        this.setCache(cachePath, decoded);
        return decoded;
    }

    async getDir(repo: string, path: string, failOnNotFound: boolean = true) {
        const cachePath = `${repo}-${path}`;
        if (this.CACHE) {
            const cached = this.getCache(cachePath);
            if (cached) {
                const obj = JSON.parse(cached);
                return obj as GetContentData;
            }
        }

        let response;

        try {
            response = await this.OCTOKIT.rest.repos.getContent({
                repo: repo,
                path: path,
                owner: this.ORG,
            });
        } catch (error) {
            if (error instanceof RequestError && error.status == 404 && !failOnNotFound) {
                console.log(`[,] Directory not found for '${path}' in '${repo}'`);
                return undefined;
            }

            throw new Error(`Failed to retrieve directory for '${path}' in '${repo}'`, { cause: error });;
        }

        const data: GetContentData = response.data;
        this.setCache(cachePath, JSON.stringify(data));
        return response.data;
    }

    async getMetadata(repo: string, failOnNotFound: boolean = true) {
        const text = await this.getContent(repo, "meta.yml", failOnNotFound);
        if (!text) return undefined;
        return parseYML(text);
    }

    async listRepos() {
        const cachePath = `repos`;
        if (this.CACHE) {
            const cached = this.getCache(cachePath);
            if (cached) {
                const obj = JSON.parse(cached);
                return obj as ListReposData;
            }
        }

        let response;

        try {
            response = await this.OCTOKIT.rest.repos.listForOrg({
                org: this.ORG
            });
        } catch (error) {
            throw new Error(`Failed to retrieve repositories for organization '${this.ORG}'`, { cause: error });
        }

        const data: ListReposData = response.data;
        this.setCache(cachePath, JSON.stringify(data));
        return response.data;
    }

    constructor(token: string, org: string, cache: boolean = false) {
        this.OCTOKIT = new Octokit({ auth: token });
        this.CACHE = cache;
        this.ORG = org;
    }
}

export class Writeups {

    GITHUB: GitHub;
    CACHE: boolean;

    async repos(): Promise<Repo[]> {
        let repos = await this.GITHUB.listRepos();

        let repoMetadataPairs = [];
        for (let repo of repos) {
            const metadata = await this.GITHUB.getMetadata(repo.name, false);
            if (!metadata || !metadata.publish) continue;
            repoMetadataPairs.push([repo, metadata]);
        }

        let result = repoMetadataPairs.map(([e, m]) => {
            let name = e.name;
            let path = e.full_name;
            let updatedAt = e.updated_at ? new Date(Date.parse(e.updated_at)) : new Date();
            let ctftimeId = m.ctf_time_id || undefined;

            return { name, path, updatedAt, ctftimeId };
        });

        return result;
    }

    async categories(): Promise<Category[]> {
        const repos = await this.repos();
        if (repos.length == 0) return [];

        const result: any[] = [];

        for (const repo of repos) {
            let categoryFolders = await this.GITHUB.getDir(repo.name, "");
            if (!Array.isArray(categoryFolders)) {
                throw new Error(`Expected array, got ${categoryFolders}`);
            }

            categoryFolders
                .filter(x => x.type == "dir")
                .filter(x => !x.name.startsWith("."))
                .map(folder => { return { repo, name: folder.name } })
                .forEach(folder => result.push(folder));
        }

        return result;
    }

    async problems(): Promise<Problem[]> {
        let categories: any[] = await this.categories();
        if (categories.length == 0) return [];

        let result: Problem[] = [];

        for (let category of categories) {
            let problemDirs = await this.GITHUB.getDir(category.repo.name, category.name);
            if (!Array.isArray(problemDirs)) {
                throw new Error(`Expected array, got ${problemDirs}`);
            }

            problemDirs
                .filter(x => x.type == "dir")
                .map(problem => { return { category, name: problem.name, path: problem.path } })
                .forEach(problem => result.push(problem));
        }

        return result;
    }

    async writeups(): Promise<Writeup[]> {
        let problems: Problem[] = await this.problems();
        if (problems.length == 0) return [];

        let writeups: Writeup[] = [];
        for (let problem of problems) {
            const content = await this.GITHUB.getContent(problem.category.repo.name, problem.path + "/README.md", false);
            if (!content) continue;

            let { text, params } = processMD(content);
            let title = params.get('title') || problem.name;

            let tags = [problem.category.name];
            let category = problem.category.name;
            let repo = problem.category.repo.name;
            let competition = problem.category.repo.ctftimeId || "";

            const writeup: Writeup = {
                id: `${repo}-${category}-${problem.name}`.toLowerCase(),
                tags,
                title,
                category,
                competition,
                raw: content,
                rendered: text,
                folder: problem.path,
            };

            writeups.push(writeup);
        }

        return writeups;
    }

    constructor(github: GitHub, cache: boolean = true) {
        this.GITHUB = github;
        this.CACHE = cache;
    }
}
