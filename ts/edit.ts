import $ from "jquery";
import { extractTranslationFromLanguageFile, extractTranslationStringsFromIssue, updateLanguageFile } from "./gh-utils";
import { branch, commit, fork, getIssue, getUserName, HTTPError, logIn } from "./github";
import { getTranslation, removeTranslation, setTranslation } from './storage';

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

    const extractTranslation = (strId: string) => {
        const stored = getTranslation(language, strId);
        const actual = extractTranslationFromLanguageFile(languageFile, strId);
        switch (stored) {
            case actual:
                removeTranslation(language, strId);
            case null:
                return actual;
            default:
                return stored;
        }
    }

    strings.forEach(str => {
        if (str.descOld)
            $("<tr>").addClass("removed").addClass(str.descOld ? "no-border" : "").append(
                $("<td>").addClass("strId").text(str.strId).attr("rowspan", str.descNew ? 2 : 1),
                $("<td>").addClass("original content").text(str.descOld),
                $("<td>").addClass("translation content").text(extractTranslationFromLanguageFile(languageFile, str.strId) || ""),
            ).appendTo("#strings tbody");
        if (str.descNew)
            $("<tr>").addClass("added").append(
                $("<td>").addClass("strId").text(str.strId).css("display", str.descOld ? "none" : ""),
                $("<td>").addClass("original content").text(str.descNew),
                $("<td>").addClass("translation content").attr("contenteditable", "true").text(extractTranslation(str.strId) || ""),
            ).appendTo("#strings tbody");
    });

    $("#save-translation").on("click", async () => {
        const translations = [...$("#strings tbody tr.added")].map<[string, string]>(row => {
            const strId = $(row).find(".strId").text();
            const translation = $(row).find(".translation").text();
            setTranslation(language, strId, translation);
            return [strId, translation];
        });

        try {
            const userName = await getUserName();
            const branchName = "translate-" + language + "-" + new Date().toISOString().replace(/[^\w]/g, "");
            const content = updateLanguageFile(languageFile, translations);
            const message = `${language}: Apply #${issueId}`;

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