export function toScanUrl(url: URL): string {
    return `${url.protocol}//${url.hostname}${url.pathname}${url.search}`;
}
