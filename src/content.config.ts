import { defineCollection } from 'astro:content';

import { CompetitionsFromCTFTimeLoader } from './loaders/CompetitionsFromCTFTime';
import { WriteupsFromGitHubLoader } from './loaders/WriteupsFromGitHub';

const writeups = defineCollection({
    loader: WriteupsFromGitHubLoader.getLoader({
        githubToken: process.env.GITHUB_TOKEN,
        development: process.env.NODE_ENV === 'development'
    })
});

const competitions = defineCollection({
    loader: CompetitionsFromCTFTimeLoader.getLoader({
        development: process.env.NODE_ENV === 'development',
        teamCode: "361970",
    })
});

export const collections = { writeups, competitions };