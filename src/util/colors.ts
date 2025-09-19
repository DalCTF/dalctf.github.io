export type Color = "red" | "green" | "blue" | "orange" | "yellow" | "purple";

export function hexFor(color: Color): string {
    switch (color) {
        case "red":
            return "#E01A00";
        case "blue":
            return "#0090FF";
        case "green":
            return "#058F00";
        case "orange":
            return "#FF9000";
        case "yellow":
            return "#D1B800";
        case "purple":
            return "#8000FF";
    }
}