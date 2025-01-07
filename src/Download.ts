import * as fs from "fs";
import { Competitions } from "./loaders/Competitions";
import { Writeups } from "./loaders/Writeups";

const competitions = await Competitions.shared.load();
console.log("Competitions updated:", competitions.length);

const writeups = await Writeups.shared.load();
console.log("Writeups updated:", writeups.length);

const updated = writeups.length + competitions.length;
console.log("Total:", updated);

fs.writeFileSync("updated", `${updated}`);