export function normalizeBaseUrl(value: string): string {
    return value.trim().replace(/\/+$/, "");
}