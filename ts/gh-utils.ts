import type { Data } from "./data";

type TranslationString = {
    strId: string;
    descNew?: string;
    descOld?: string;
}

export function extractTranslationStringsFromIssue(issue: string): TranslationString[] {
    const strings = new Map<string, TranslationString>();
    issue.matchAll(/([+-]?)(STR_\d{4})\s*:(.+)/g).forEach(match => {
        const [_, sign, strId, desc] = match;
        if (!strings.has(strId))
            strings.set(strId, { strId });
        const entry = strings.get(strId) as TranslationString;
        if (sign === "-")
            entry.descOld = desc;
        else
            entry.descNew = desc;
    });
    return [...strings.values()].sort((a, b) => a.strId.localeCompare(b.strId));
}

export function extractTranslationFromLanguageFile(languageFile: string, strId: string): string {
    const regex = new RegExp(`${strId}\\s*:(.+)`);
    const match = languageFile.match(regex);
    return match ? match[1] : "";
}

export function updateLanguageFile(languageFile: string, data: Data): string {
    const lines = languageFile.trim().split("\n");
    const out: string[] = [];

    let lineIdx = 0;

    data.strings.sort((a, b) => a.key.localeCompare(b.key)).forEach(entry => {
        for (; lineIdx < lines.length; lineIdx++) {
            switch (true) {
                case lines[lineIdx].trim() === "":
                case lines[lineIdx].startsWith("#"):
                case entry.key.localeCompare(lines[lineIdx]) > 0:
                    // line should be before this entry
                    out.push(lines[lineIdx]);
                    break;
                case lines[lineIdx].startsWith(entry.key):
                    // entry already exists, skip line
                    lineIdx++;
                default:
                    out.push(`${entry.key}    :${entry.translated}`);
                    return;
            }
        }
        out.push(`${entry.key}    :${entry.translated}`);
    });
    for (; lineIdx < lines.length; lineIdx++)
        out.push(lines[lineIdx]);

    out.push(""); // new line at the end of the file

    return out.join("\n");
}

