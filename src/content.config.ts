import { defineCollection } from 'astro:content';

import { CompetitionLoader } from './loaders/CompetitionLoader';
import { WriteupLoader } from './loaders/WriteupLoader';

const writeups = defineCollection({
    loader: WriteupLoader.getLoader({
        development: process.env.NODE_ENV === 'development',
        githubToken: process.env.GITHUB_TOKEN,
        org: 'dalctf',
    })
});

const competitions = defineCollection({
    loader: CompetitionLoader.getLoader({
        development: process.env.NODE_ENV === 'development',
        teamCode: "361970",
    })
});

export const collections = { writeups, competitions };