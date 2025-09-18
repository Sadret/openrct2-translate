/*
 * TYPES
 */

export type LanguageFile = {
    name: string;
    path: string;
    type: string;
    download_url: string;
};

export type TranslationString = {
    strId: string;
    descNew?: string;
    descOld?: string;
}

/*
 * REPOSITORY
 */

export const BASE = {
    owner: "OpenRCT2",
    repository: "Localisation",
    branch: "master",
};

/*
 * ACCESS TOKEN MANAGEMENT
 */

{
    const accessToken = new URLSearchParams(window.location.search).get("access_token");
    if (accessToken) {
        localStorage.setItem("github_token", accessToken);
        sessionStorage.setItem("github_token", accessToken);
        const url = new URL(window.location.href);
        url.searchParams.delete("access_token");
        window.history.replaceState(null, "", String(url));
    }
}

export function getAccessToken(): string | null {
    return localStorage.getItem("github_token") || sessionStorage.getItem("github_token");
}

export function removeAccessToken(): void {
    localStorage.removeItem("github_token");
    sessionStorage.removeItem("github_token");
}

export function login(force = false): void {
    const clientId = "Ov23ct0fDobJn5hdYuQ1";
    const redirectUri = "https://gh-oauth-handler.sadret.workers.dev/callback";
    const scope = "public_repo";
    const state = encodeURIComponent(window.location.href);

    window.location.href =
        `https://github.com/login/oauth/authorize` +
        `?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&scope=${encodeURIComponent(scope)}` +
        `&state=${state}` +
        (force ? "&prompt=login" : "");
}

/*
 * UTILITY FUNCTIONS
 */

export async function waitForSuccess<T>(fn: () => Promise<T>): Promise<T> {
    // waits for a maximum of ~10s, with exponential backoff
    for (let i = 0; i < 10; i++)
        try {
            return await fn();
        } catch {
            await new Promise(r => setTimeout(r, 10 << i));
        }
    throw new Error();
}

/*
 * ISSUE
 */

export function extractMissingLanguagesFromIssue(body: string): Set<string> {
    return new Set(body.matchAll(/- \[( |x)\] ([a-z]{2}-[A-Z]{2})/g).filter(
        match => match[1] !== "x"
    ).map(
        match => match[2]
    ));
}

export function extractTranslationStringsFromIssue(body: string): TranslationString[] {
    const strings = new Map<string, TranslationString>();
    body.matchAll(/([+-]?)(STR_\d{4})\s*:(.+)/g).forEach(match => {
        const [_, sign, strId, desc] = match;
        if (!strings.has(strId))
            strings.set(strId, { strId });
        const entry = strings.get(strId) as TranslationString;
        if (sign === "-")
            entry.descOld = desc;
        else
            entry.descNew = desc;
    });
    return strings.values().toArray().sort((a, b) => a.strId.localeCompare(b.strId));
}

/*
 * LANGUAGE FILE
 */

export function extractTranslationStringsFromLanguageFile(languageFile: string): TranslationString[] {
    return languageFile.matchAll(/(STR_\d{4})\s*:(.+)/g).toArray().map(match => ({
        strId: match[1],
        descNew: match[2],
    }));
}

export function extractTranslationFromLanguageFile(languageFile: string, strId: string): string | null {
    const regex = new RegExp(`${strId}\\s*:(.+)`);
    const match = languageFile.match(regex);
    return match && match[1];
}

export function updateLanguageFile(languageFile: string, translations: [string, string][]): string {
    const lines = languageFile.trim().split("\n");
    const out: string[] = [];

    let lineIdx = 0;

    translations.sort(([a], [b]) => a.localeCompare(b)).forEach(([strId, translation]) => {
        while (lineIdx < lines.length) {
            switch (true) {
                case lines[lineIdx].trim() === "":
                case lines[lineIdx].startsWith("#"):
                case strId.localeCompare(lines[lineIdx]) > 0:
                    // line should be before this entry
                    out.push(lines[lineIdx++]);
                    continue; // consider next line
                case lines[lineIdx].startsWith(strId):
                    // entry already exists, skip line
                    lineIdx++;
            }
            // insert entry here
            break;
        }
        out.push(`${strId}    :${translation}`);
    });
    while (lineIdx < lines.length)
        out.push(lines[lineIdx++]);

    out.push(""); // new line at the end of the file

    return out.join("\n");
}