import { Writeups } from "./loaders/Writeups";

const downloaded = await Writeups.shared.load();
console.log(downloaded.length);