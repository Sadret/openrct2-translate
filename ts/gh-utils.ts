type TranslationString = {
    strId: string;
    descNew?: string;
    descOld?: string;
}

export function extractTranslationStrings(body: string): TranslationString[] {
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
    return [...strings.values()];
}

export function getStr(languageFile: string, strId: string): string {
    const regex = new RegExp(`${strId}\\s*:(.+)`);
    const match = languageFile.match(regex);
    return match ? match[1] : "";
}
