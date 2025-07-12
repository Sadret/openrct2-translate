import $ from "jquery";
import { storeData } from "./data";
import { extractTranslationStrings, getStr } from "./gh-utils";
import { commit, ghFetch, type GitHubIssue } from "./github";

$(async () => {
    const params = new URLSearchParams(window.location.search);
    const language = params.get("language");
    const issueNumber = params.get("issue");

    if (!language || !issueNumber)
        return window.location.href = "/";

    $("#language").text(language);
    $("h1").text(`#${issueNumber}`);

    const res = await ghFetch(`https://api.github.com/repos/OpenRCT2/Localisation/issues/${issueNumber}`);
    if (!res)
        throw new Error(); // TODO: handle

    const issue = await res.json() as GitHubIssue;
    $("h1").text(`#${issue.number}: ${issue.title}`);

    const strings = extractTranslationStrings(issue.body);
    const languageFile = await fetch(`https://raw.githubusercontent.com/OpenRCT2/Localisation/master/data/language/${language}.txt`).then(res => res.text());

    strings.forEach(str => {
        if (str.descOld)
            $("<tr>").addClass("removed").addClass(str.descOld ? "no-border" : "").append(
                $("<td>").addClass("strId").text(str.strId).attr("rowspan", str.descNew ? 2 : 1),
                $("<td>").addClass("original content").text(str.descOld),
                $("<td>").addClass("translated content").text(getStr(languageFile, str.strId)),
            ).appendTo("#strings tbody");
        if (str.descNew)
            $("<tr>").addClass("added").append(
                $("<td>").addClass("strId").text(str.strId).css("display", str.descOld ? "none" : ""),
                $("<td>").addClass("original content").text(str.descNew),
                $("<td>").addClass("translated content").attr("contenteditable", "true").text(getStr(languageFile, str.strId)),
            ).appendTo("#strings tbody");
    });

    // TODO: remove removed strings
    $("#save-translation").on("click", () => {
        const strings = [...$("#strings tbody tr.added")].map(row => {
            const key = $(row).find(".strId").text();
            const original = $(row).find(".original").text();
            const translated = $(row).find(".translated").text();
            return { key, original, translated };
        });
        const data = { language, issueNumber, strings };
        storeData(data);
        commit(data, languageFile);
    });
});