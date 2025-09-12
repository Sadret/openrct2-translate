import $ from "jquery";
import { extractMissingLanguages, extractTranslationStringsFromIssue, getLanguageNames } from "./gh-utils";
import { getLanguages, streamOpenIssues } from "./github";
import { showOverlay } from "./overlay";

$(async () => {
    try {
        await init();
    } catch (error) {
        showOverlay(error, true);
    }
});

async function init() {
    const sheet = document.head.appendChild(document.createElement("style")).sheet as CSSStyleSheet;
    sheet.insertRule(".issue {display: none}", sheet.cssRules.length);
    sheet.insertRule("#issues.all-show .issue {display: inherit}", sheet.cssRules.length);

    const languages = await getLanguages();
    languages.forEach(language => {
        sheet.insertRule(`#issues.${language}-show .issue.${language} {display: inherit}`, sheet.cssRules.length);
        sheet.insertRule(`#issues.${language}-show .issue .languages .${language} {font-weight: bold}`, sheet.cssRules.length);
        $("#language-select").append(
            $("<option>")
                .addClass(language)
                .attr("value", language)
                .prop("selected", language === location.hash.slice(1))
                .append(
                    $("<span>").addClass("name").text(language),
                    ` (`,
                    $("<span>").addClass("count").text($("#issues").find(`.issue.${language}`).length),
                    `)`,
                ),
        );
    });
    $("#language-select").on("change", function () {
        $("#issues").removeClass().addClass(`${$(this).val()}-show`);
        location.hash = String($(this).val());
    }).trigger("change");
    fetch(`https://raw.githubusercontent.com/OpenRCT2/OpenRCT2/develop/src/openrct2/localisation/Language.cpp`)
        .then(res => res.text())
        .then(languageCpp => getLanguageNames(languageCpp).forEach(
            (langEnglish, langId) => $(`option.${langId} span.name`).text(langEnglish)
        )).then(() => {
            const options = $("#language-select").children().toArray().sort((a, b) => $(a).text().localeCompare($(b).text()));
            $("#language-select").empty().append(options);
        });

    for await (const issue of streamOpenIssues()) {
        const missingLanguages = extractMissingLanguages(issue.body);
        $("<div>")
            .addClass("issue")
            .addClass(Array.from(missingLanguages).join(" "))
            .appendTo("#issues")
            .append(
                $("<div>").addClass("header").append(
                    $("<span>").addClass("title").text(`#${issue.number} ${issue.title}`),
                    $("<a>")
                        .attr("href", issue.html_url)
                        .attr("target", "_blank")
                        .append(
                            "Open issue on GitHub ↗",
                            $("<img>").attr("src", "github-mark.png"),
                        ),
                ),
                $("<div>").append(
                    "Edit language: ",
                    $("<span>").addClass("languages").append(
                        languages.map(language => $("<a>")
                            .addClass(language)
                            .addClass(missingLanguages.has(language) ? "" : "done")
                            .text(language)
                            .attr("href", `edit.html?language=${language}&issue=${issue.number}`)
                        ),
                    ),
                ),
                (strings => strings.length ? $("<details>").append(
                    $("<summary>").text("Strings"),
                    strings.map(str => $("<pre>").text(`${str.strId}: ${str.descNew || str.descOld || ""}`)),
                ) : $("<div>").addClass("no-strings").text("no strings found")
                )(extractTranslationStringsFromIssue(issue.body)),
            );
        missingLanguages.forEach(language => (span => span.text(Number(span.text()) + 1))($(`option.${language} span.count`)));
    }
    $("#loading").remove();
}