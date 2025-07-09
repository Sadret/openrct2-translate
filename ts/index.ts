import $ from "jquery";
import { getData, storeData } from "./data";
import { commit, getToken, ghFetch } from "./github";

type LanguageFile = {
    name: string;
    path: string;
    type: string;
    download_url: string;
};

// const GITHUB_API_URL = "https://api.github.com/repos/OpenRCT2/Localisation/contents/data/language";
const GITHUB_API_URL = "./res/languages.json"; // Local JSON for testing

async function fetchLanguages(): Promise<string[]> {
    const res = await fetch(GITHUB_API_URL);

    if (!res.ok)
        throw new Error(`GitHub API error: ${res.status}`);

    const data: LanguageFile[] = await res.json();
    return data
        .filter((file) => file.name.endsWith(".txt"))
        .map((file) => file.name.replace(/\.txt$/, ""));
}

// more fields are available
type GitHubIssue = {
    number: number;
    title: string;
    html_url: string;
    body: string;
    pull_request?: unknown;
};

const GITHUB_ISSUES_URL = "https://api.github.com/repos/OpenRCT2/Localisation/issues";

export async function* streamOpenIssues(): AsyncGenerator<GitHubIssue[], void, unknown> {
    const perPage = 10;
    let page = 1;

    while (true) {
        const url = `${GITHUB_ISSUES_URL}?state=open&per_page=${perPage}&page=${page}`;
        const res = await ghFetch(url);

        if (!res)
            throw new Error(`Failed to fetch issues (page ${page})`);

        if (!res.ok)
            throw new Error(`Failed to fetch issues (page ${page}): ${res.status}`);

        const issues: GitHubIssue[] = await res.json();

        if (issues.length === 0) break;

        yield issues;
        page++;
    }
}

function extractTranslationStrings(body: string): string[] {
    const codeBlockRegex = /(?<!-)(STR_\d{4}\s*:.+)/g; // not preceeded by -
    return [...body.matchAll(codeBlockRegex)].map(m => m[1]);
}

function extractLanguageChecklist(body: string):
    // Record<string, boolean> {
    string[] {
    const regex = /- \[( |x)\] ([a-z]{2}-[A-Z]{2})/g;
    // const map: Record<string, boolean> = {};
    const list: string[] = [];

    let match: RegExpExecArray | null;
    while ((match = regex.exec(body)) !== null) {
        const checked = match[1] === "x";
        const lang = match[2];
        if (!checked)
            list.push(lang);
        // map[lang] = checked;
    }

    // return map;
    return list;
}

function addLanguageCSSRules(languages: string[]) {
    const style = document.createElement("style");
    document.head.appendChild(style);

    const sheet = style.sheet as CSSStyleSheet;
    sheet.insertRule(".issue {display: none}", sheet.cssRules.length);
    sheet.insertRule("#issues.all-show .issue {display: inherit}", sheet.cssRules.length);

    for (const lang of languages)
        sheet.insertRule(`#issues.${lang}-show .issue.${lang} {display: inherit}`, sheet.cssRules.length);
}

$(() => {
    $("#issues").addClass(`all-show`);
    fetchLanguages().then(languages => {
        addLanguageCSSRules(languages);
        languages.forEach(language => {
            $("<div>")
                .addClass(`language ${language}`)
                .appendTo("#languages")
                .append($("<span>").text(language))
                .append($("<span>").addClass("count"))
                .on("click", function () {
                    $(this).parent().children().removeClass("active");
                    const off = $("#issues").hasClass(`${language}-show`);
                    if (!off) $(this).addClass("active");
                    $("#issues").removeClass();
                    $("#issues").addClass(off ? "all-show" : `${language}-show`);
                });
        });

        (async () => {
            for await (const issues of streamOpenIssues()) {
                issues.filter(issue => !issue.pull_request).forEach(issue => {
                    const missingLanguages = extractLanguageChecklist(issue.body);
                    $("<details>")
                        .addClass("issue")
                        .addClass(missingLanguages.join(" "))
                        .appendTo("#issues")
                        .append(
                            $("<summary>").append(
                                $("<a>")
                                    .attr("href", issue.html_url)
                                    .text(`#${issue.number}`),
                                $("<span>").text(` ${issue.title} (`),
                                $("<span>").css("display", "inline-flex").css("gap", "0.5em").append(
                                    missingLanguages.map(language => $("<span>").addClass(language).text(language).on("click", () => edit(issue, language))),
                                ),
                                $("<span>").text(`)`),
                            ),
                            extractTranslationStrings(issue.body).map(str => $("<pre>").text(str)),
                        );
                });
                languages.forEach(language => {
                    const count = $(`#issues .issue.${language}`).length;
                    if (count)
                        $(`#languages .${language} .count`).text(` (${count})`);
                });
            }
        })();
    });
});

async function edit(issue: GitHubIssue, language: string) {
    $("#language-list").hide();
    $("#issue-list").hide();

    const strings = extractTranslationStrings(issue.body);

    $("#th-lang").text(language);
    $("#issue-id").text(issue.number);

    const [enGB, lang] = await Promise.all([
        fetch(`https://raw.githubusercontent.com/OpenRCT2/OpenRCT2/refs/heads/develop/data/language/en-GB.txt`).then(res => res.text()),
        fetch(`https://raw.githubusercontent.com/OpenRCT2/Localisation/master/data/language/${language}.txt`).then(res => res.text()),
    ]);

    $("#translate-strings").show();
    strings.map(
        str => (str.match(`STR_\\d{4}`) as RegExpMatchArray)[0]
    ).forEach(strId =>
        $("<tr>").append(
            $("<td>").addClass("strId").text(strId),
            $("<td>").text(getStr(enGB, strId)),
            $("<td>").append($("<button>").text(">").on("click", function () { $(this).parent().next().text($(this).parent().prev().text()); })),
            $("<td>").addClass("translated").attr("contenteditable", "true").text(getStr(lang, strId)),
        ).appendTo("#translate-strings tbody")
    );
    $("#save-translation").off("click").on("click", () => saveTranslation(lang));
}

function getStr(data: string, str: string): string {
    const regex = new RegExp(`${str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\s*:([^\n\r]*)`);
    const match = data.match(regex);
    return match ? match[1] : "";
}

function saveTranslation(langFile: string) {
    const data = getData();
    storeData(data);

    const token = getToken();

    if (!token) return;

    commit(token, data, langFile);
}