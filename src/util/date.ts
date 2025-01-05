export function parseDate(date: string | null | undefined): Date {
    if (date) return new Date(Date.parse(date));
    return new Date();
}