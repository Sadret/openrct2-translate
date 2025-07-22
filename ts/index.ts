import $ from "jquery";
import { extractMissingLanguages, extractTranslationStringsFromIssue } from "./gh-utils";
import { getLanguages, streamOpenIssues } from "./github";

$(async () => {
    $("#issues").addClass(`all-show`);

    const sheet = document.head.appendChild(document.createElement("style")).sheet as CSSStyleSheet;
    sheet.insertRule(".issue {display: none}", sheet.cssRules.length);
    sheet.insertRule("#issues.all-show .issue {display: inherit}", sheet.cssRules.length);

    $("#language-select").on("change", function () { $("#issues").removeClass().addClass(`${$(this).val()}-show`); });

    const languages = await getLanguages();
    languages.forEach(language => {
        sheet.insertRule(`#issues.${language}-show .issue.${language} {display: inherit}`, sheet.cssRules.length);
        sheet.insertRule(`#issues.${language}-show .issue .languages .${language} {font-weight: bold}`, sheet.cssRules.length);
        $("#language-select").append(
            $("<option>")
                .attr("value", language)
                .append(
                    `${language} (`,
                    $("<span>")
                        .addClass(language)
                        .addClass("count")
                        .text($("#issues").find(`.issue.${language}`).length),
                    `)`,
                ),
        );
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
        missingLanguages.forEach(language => (span => span.text(Number(span.text()) + 1))($(`option .${language}.count`)));
    }
    $("#loading").remove();
});