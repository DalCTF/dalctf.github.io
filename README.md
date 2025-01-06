# Status 418 - Website

This repository stores the source code for the [Status 418 CTF Team website](https://dalctf.github.io/). It is created to include our placements in CTF competitions as well as writeups for solved problems.

## 🎖️ Competitions

Competitions that the team participated in and placements are taken from [CTF Time](https://ctftime.org/). Information taken includes the name of the competition, number of participants, and dates. Recent placements are placed on the main page and listed in reverse-chronological order on the [Competitions](https://dalctf.github.io/competitions) page.

Placements may include an icon to highlight a top 5% or top 10% placement in the competition.

## 📝 Writeups

Writeups are loaded directly from our GitHub. Repositories containing writeups must be public and contain a file `meta.yml` in the root. The meta file must contain the attribute `publish` set to true in order to be considered for the website. To create the link between the repository and the equivalent competition, the attribute `ctftimeId` must be set to the ID of the competition on CTF Time.

Each folder in the root of the repository (with the exception of hidden folders) is considered to be a problem category. Inside each category folder, each subfolder is considered to be a problem folder. If a problem folder contains a `README.md` file, that is rendered into an entry on the website. Problems that do not contain a `README.md` are not considered.

```bash
├── Web/
│   ├── Problem1/
│   |   └── README.md   # Included
|   ├── Problem2/
|   │   └── README.md   # Included
|   └── Problem3/
|       └── [...]       # Not included
|
├── Forensics/
│   ├── Problem1/
│   |   └── README.md   # Included
│   └── .hidden/
│       └── [...]       # Not included
|
├── .github/
│   └── [...]           # Not included
|
└── meta.yml            # Required with 'publish: true'
```

If the writeup contains a top-level header (`#` or `h1`), it will be extracted and used as the problem title. Otherwise, the name of the problem folder is used. Relative links to other files in the repository and images are changed to point to the full path on GitHub.

This repository is configured to rebuild the website whenever changes are pushed, once a day, or through a manual trigger. Content will be checked for changes on build and are cached for future builds. Changes are detected using the source repository's latest update date and its file's hash. This allows for speedy builds that can execute often.
