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

export class GitHub {

    OCTOKIT: Octokit;
    ORG: string;

    private decodeContent(response: NonNullable<Awaited<ReturnType<typeof this.OCTOKIT.rest.repos.getContent>>>) {
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
                console.log(`[,] Content not found for '${path}' in '${repo}'`);
                return undefined;
            }

            throw new Error(`Failed to retrieve content for '${path}' in '${repo}'`, { cause: error });;
        }

        return this.decodeContent(response);
    }

    async getMetadata(repo: string, failOnNotFound: boolean = true) {
        const text = await this.getContent(repo, "meta.yml", failOnNotFound);
        if (!text) return undefined;
        return parseYML(text);
    }

    async getDir(repo: string, path: string, failOnNotFound: boolean = true) {
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

        return response.data;
    }

    async listRepos() {
        let response;

        try {
            response = await this.OCTOKIT.rest.repos.listForOrg({
                org: this.ORG
            });
        } catch (error) {
            throw new Error(`Failed to retrieve repositories for organization '${this.ORG}'`, { cause: error });
        }

        return response.data;
    }

    constructor(token: string, org: string) {
        this.OCTOKIT = new Octokit({ auth: token });
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
            let competition = problem.category.repo.name;

            const writeup: Writeup = {
                id: `${competition}-${category}-${problem.name}`.toLowerCase(),
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
