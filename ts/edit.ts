import $ from "jquery";
import { storeData } from "./data";
import { extractTranslationFromLanguageFile, extractTranslationStringsFromIssue, updateLanguageFile } from "./gh-utils";
import { branch, commit, fork, getIssue, getUserName, HTTPError, logIn } from "./github";

$(async () => {
    const params = new URLSearchParams(window.location.search);
    const language = params.get("language");
    const issueId = params.get("issue");

    if (!language || !issueId)
        return window.location.href = "/";

    $("#language").text(language);
    $("h1").text(`#${issueId}`);

    const issue = await getIssue(issueId).catch(e => console.log(e));
    if (!issue) return;

    $("h1").text(`#${issue.number}: ${issue.title}`);

    const strings = extractTranslationStringsFromIssue(issue.body);
    const languageFile = await fetch(`https://raw.githubusercontent.com/OpenRCT2/Localisation/master/data/language/${language}.txt`).then(res => res.text());

    strings.forEach(str => {
        if (str.descOld)
            $("<tr>").addClass("removed").addClass(str.descOld ? "no-border" : "").append(
                $("<td>").addClass("strId").text(str.strId).attr("rowspan", str.descNew ? 2 : 1),
                $("<td>").addClass("original content").text(str.descOld),
                $("<td>").addClass("translated content").text(extractTranslationFromLanguageFile(languageFile, str.strId)),
            ).appendTo("#strings tbody");
        if (str.descNew)
            $("<tr>").addClass("added").append(
                $("<td>").addClass("strId").text(str.strId).css("display", str.descOld ? "none" : ""),
                $("<td>").addClass("original content").text(str.descNew),
                $("<td>").addClass("translated content").attr("contenteditable", "true").text(extractTranslationFromLanguageFile(languageFile, str.strId)),
            ).appendTo("#strings tbody");
    });

    $("#save-translation").on("click", async () => {
        const strings = [...$("#strings tbody tr.added")].map(row => {
            const key = $(row).find(".strId").text();
            const original = $(row).find(".original").text();
            const translated = $(row).find(".translated").text();
            return { key, original, translated };
        });
        const data = { language, issueNumber: issueId, strings };
        storeData(data);

        try {
            const userName = await getUserName();
            const branchName = "translate-" + language + "-" + new Date().toISOString().replace(/[^\w]/g, "");
            const content = updateLanguageFile(languageFile, data);
            const message = `${data.language}: Apply #${data.issueNumber}`;

            const forkResult = await fork(userName);
            console.log(`created a new fork for user ${userName}`, forkResult.html_url);

            const branchResult = await branch(userName, branchName);
            console.log(`created a new branch ${branchName}`, branchResult.url);

            const commitResult = await commit(userName, branchName, language, content, message);
            console.log(`committed changes to ${language}.txt`, commitResult.commit.html_url);
        } catch (error) {
            if (error instanceof HTTPError)
                logIn();
        }
    });
});