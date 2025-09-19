import { hexFor } from "./colors";

export type TagType = "fill" | "border";

export interface Tag {
    color: string;
    type: TagType;
    text: string;
    url?: string;
}

const known_tags = new Map<string, Tag>();
known_tags.set("crypto", { text: "Crypto", color: hexFor("green"), type: "border" });
known_tags.set("linux", { text: "Linux", color: hexFor("yellow"), type: "border" });
known_tags.set("misc", { text: "Misc", color: hexFor("orange"), type: "border" });
known_tags.set("web", { text: "Web", color: hexFor("blue"), type: "border" });
known_tags.set("pwn", { text: "Pwn", color: hexFor("red"), type: "border" });
known_tags.set("forensics", { text: "Forensics", color: hexFor("purple"), type: "border" });
known_tags.set("Reverse Engineering", { text: "Reverse Engineering", color: hexFor("red"), type: "border" });

export function tagFor(name: string, type: TagType = "border", includeUrl: boolean = true): Tag {
    var known_tag = known_tags.get(name.toLowerCase());

    if (known_tag) {
        if (!includeUrl) {
            delete known_tag.url;
        }

        known_tag.type = type;
        return known_tag;
    }

    return {
        "text": name,
        "type": type,
        "color": "#FFFFFF"
    }
}