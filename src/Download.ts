import * as fs from "fs";
import { Writeups } from "./loaders/Writeups";

const downloaded = await Writeups.shared.load();
const updated = downloaded.length;

fs.writeFileSync("updated", `${updated}`);
console.log("Problems updated:", updated);