import { defineCollection } from 'astro:content';
import { WriteupsFromGitHubLoader } from './loaders/WriteupsFromGitHub';

const writeups = defineCollection({
    loader: WriteupsFromGitHubLoader.getLoader({
        githubToken: process.env.GITHUB_TOKEN || "",
        development: process.env.NODE_ENV === 'development'
    })
});

export const collections = { writeups };