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

