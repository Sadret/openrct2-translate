import $ from "jquery";
import { extractTranslationStringsFromIssue } from "./gh-utils";

type LanguageFile = {
    name: string;
    path: string;
    type: string;
    download_url: string;
};

const GITHUB_API_URL = "https://api.github.com/repos/OpenRCT2/Localisation/contents/data/language";

async function fetchLanguages(): Promise<string[]> {
    const res = await fetch(GITHUB_API_URL);

    if (!res.ok)
        throw new Error(`GitHub API error: ${res.status}`);

    const data: LanguageFile[] = await res.json();
    return data
        .filter((file) => file.name.endsWith(".txt"))
        .map((file) => file.name.replace(/\.txt$/, ""));
}

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
                                    missingLanguages.map(language => $("<a>")
                                        .addClass(language)
                                        .text(language)
                                        .attr("href", `edit.html?language=${language}&issue=${issue.number}`)
                                    ),
                                ),
                                $("<span>").text(`)`),
                            ),
                            extractTranslationStringsFromIssue(issue.body).map(str => $("<pre>").text(str.descNew || str.descOld || "")),
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