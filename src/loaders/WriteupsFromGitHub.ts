import { type Loader, type LoaderContext } from 'astro/loaders';
import { Octokit } from 'octokit';
import { Writeup } from '../model/Writeup';

export interface WriteupsFromGitHubLoaderOptions {
    githubToken: string;
    development: boolean;
}

export class WriteupsFromGitHubLoader implements Loader {

    DEVELOPMENT: boolean;
    OCTOKIT: Octokit;

    categories = ["crypto", "defence", "forensics", "pwn", "reverse engineering", "web", "misc", "pwn", "reverse"];
    name: string = "Writeups From GitHub Loader";
    org: string = "dalctf";


    static getLoader(options: WriteupsFromGitHubLoaderOptions): WriteupsFromGitHubLoader {
        return new WriteupsFromGitHubLoader(options.githubToken, options.development);
    }

    private async getRepos() {
        const response = await this.OCTOKIT.rest.repos.listForOrg({ org: this.org });
        if (response.status != 200) {
            console.error("[!] Failed to retrieve organization's repositories");
            return [];
        }

        const repos = response.data
            .map(repo => {
                return { name: repo.name };
            })
            .filter(repo => {
                return repo.name != "dalctf.github.io"
            });

        return repos;
    }

    private async getCategoryFolders(repo: string) {
        var response = await this.OCTOKIT.rest.repos.getContent({
            owner: this.org,
            repo: repo,
            path: "",
        });

        if (response.status != 200) {
            console.error("[!] Failed to retrieve organization's repositories");
            return [];
        }

        const content = Array.isArray(response.data)
            ? response.data
                .filter(item => {
                    return item.type == "dir" && this.categories.includes(item.name.toLowerCase())
                })
                .map(item => {
                    return { name: item.name };
                })
            : [];

        return content;
    }

    private async getCategoryProblems(repo: string, category: string) {
        var response = await this.OCTOKIT.rest.repos.getContent({
            owner: this.org,
            path: category,
            repo: repo,
        });

        if (response.status != 200) {
            console.error("[!] Failed to retrieve organization's repositories");
            return [];
        }

        const content = Array.isArray(response.data)
            ? response.data
                .filter(item => {
                    return item.type == "dir";
                })
                .map(item => {
                    return { name: item.name };
                })
            : [];

        return content;
    }

    private async getWriteup(repo: string, category: string, problem: string) {
        try {
            var content = await this.OCTOKIT.rest.repos.getContent({
                path: `${category}/${problem}/README.md`,
                owner: this.org,
                repo: repo,
            });

            if (!('content' in content.data)) {
                console.error('[!] Expected a file but received directory data');
                return undefined;
            }

        } catch (e) {
            return undefined;
        }

        return content.data;
    }

    private async getMarkdown(repo: string, text: string) {
        try {
            var content = await this.OCTOKIT.rest.markdown.render({
                context: `${this.org}/${repo}`,
                text,
            });
        } catch (e) {
            console.log(e);
            return undefined;
        }

        return content.data;
    }

    private async getAllWriteups() {
        const repos = await this.getRepos();
        var writeups = [];

        for (var repo of repos) {
            const categoryFolders = await this.getCategoryFolders(repo.name);

            for (var category of categoryFolders) {
                const categoryProblems = await this.getCategoryProblems(repo.name, category.name);

                for (var problem of categoryProblems) {
                    const content = await this.getWriteup(repo.name, category.name, problem.name);
                    if (!content) {
                        continue;
                    }

                    const text = atob(content.content);
                    const html = await this.getMarkdown(repo.name, text || "");

                    let writeup = new Writeup(problem.name, [category.name]);
                    writeup.category = category.name;
                    writeup.competition = repo.name;
                    writeup.rendered = html;
                    writeup.content = text;

                    writeups.push(writeup.raw());

                    // Return less items in case of development
                    if (this.DEVELOPMENT && writeups.length >= 4) {
                        return writeups;
                    }
                }
            }
        }

        return writeups;
    }

    async load(context: LoaderContext): Promise<void> {
        const writeups = await this.getAllWriteups();
        this.DEVELOPMENT && context.store.clear();

        for (var writeup of writeups) {
            context.store.set({ id: writeup.id, data: writeup });
        }
    }

    async schema() {
        return Writeup.schema();
    }

    constructor(githubToken: string, development: boolean = false) {
        this.DEVELOPMENT = development;
        this.OCTOKIT = new Octokit({
            auth: githubToken
        });

        // Makes sure that the method knows about
        // the entire context of this class
        this.load = this.load.bind(this);
    }
}
