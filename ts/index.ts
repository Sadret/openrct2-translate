import $ from "jquery";
import { BASE, extractMissingLanguagesFromIssue, extractTranslationStringsFromIssue, getAccessToken } from "./gh-utils";
import { GitHubClient } from "./github";
import { showOverlay } from "./overlay";

$(async () => {
    try {
        await init();
    } catch (error) {
        showOverlay(error, true);
    }
});

async function getLanguages(client: GitHubClient): Promise<string[]> {
    return (await client.getFolder({
        ...BASE,
        path: "data/language"
    })).filter(
        file => file.name.endsWith(".txt")
    ).map(
        file => file.name.replace(/\.txt$/, "")
    );
}

async function getLanguageNames(): Promise<Map<string, string>> {
    return new Map(
        (await (
            await fetch(`https://raw.githubusercontent.com/OpenRCT2/OpenRCT2/develop/src/openrct2/localisation/Language.cpp`)
        ).text())
            .matchAll(/(\w\w-\w\w)", "([^"]+)", *(u8)?"([^"]+)/g)
            .map(([_, langId, langEnglish, _langNative]) => ([langId, langEnglish]))
    );
}

async function init() {
    // STYLESHEET SETUP
    const sheet = document.head.appendChild(document.createElement("style")).sheet as CSSStyleSheet;
    sheet.insertRule("body:not(:has(option[value=\"none\"]:checked)) .issue {display: none}", sheet.cssRules.length);

    // GitHub SETUP
    const client = new GitHubClient(getAccessToken() || undefined);

    // FETCH LANGUAGES
    const fetchLanguages = Promise.all([getLanguages(client), getLanguageNames()]).then(([languages, names]) => {
        languages.map(id => [id, names.get(id) || id]).sort((a, b) => a[1].localeCompare(b[1])).forEach(([id, name]) => {
            sheet.insertRule(`body:has(option[value="${id}"]:checked) .issue.${id} {display: inherit}`, sheet.cssRules.length);
            $("#languages").append(
                $("<option>")
                    .addClass(id)
                    .attr("value", id)
                    .prop("selected", id === location.hash.slice(1))
                    .text(`${name} [${id}]`)
            );
        });
        $("#languages").on("change", () => location.hash = String($("#languages").val()));
    });

    // FETCH ISSUES
    const fetchIssues = (async () => {
        let buffer = Promise.resolve();
        for await (const issue of client.getIssues(BASE))
            buffer = buffer.then(() => {
                const missingLanguages = extractMissingLanguagesFromIssue(issue.body);
                $("<div>")
                    .addClass("issue")
                    .addClass(Array.from(missingLanguages).join(" "))
                    .appendTo("#issues")
                    .append(
                        $("<div>").addClass("header").append(
                            $("<span>").addClass("title").text(`#${issue.number} ${issue.title}`),
                            $("<span>").append(
                                $("<button>")
                                    .addClass("actual")
                                    .text("Start translating")
                                    .on("click", () =>
                                        window.open(`edit.html?language=${$("#languages").val()}&issue=${issue.number}`, "_blank")
                                    ),
                                $("<button>")
                                    .addClass("dummy")
                                    .attr("disabled", "true")
                                    .text("Select a language first"),
                                $("<a>")
                                    .attr("href", issue.html_url)
                                    .attr("target", "_blank")
                                    .append(
                                        "Show issue on GitHub ↗",
                                        $("<img>").attr("src", "github-mark.png"),
                                    ),
                            ),
                        ),
                        (strings => strings.length ? $("<details>").append(
                            $("<summary>").text("Strings"),
                            strings.map(str => $("<pre>").text(`${str.strId}: ${str.descNew || str.descOld || ""}`)),
                        ) : $("<div>").addClass("no-strings").text("No strings found")
                        )(extractTranslationStringsFromIssue(issue.body)),
                    );
            });
        await buffer;
        $("#loading").remove();
    })();

    // COLLECT RESULTS / ERRORS
    await Promise.all([fetchLanguages, fetchIssues]);
}