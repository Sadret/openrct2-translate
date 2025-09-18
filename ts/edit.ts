import $ from "jquery";
import { BASE, extractTranslationFromLanguageFile, extractTranslationStringsFromIssue, extractTranslationStringsFromLanguageFile, getAccessToken, updateLanguageFile, waitForSuccess, type TranslationString } from './gh-utils';
import { GitHubClient } from "./github";
import { showOverlay } from "./overlay";
import { getTranslation, removeTranslation, setTranslation } from './storage';

$(async () => {
    const params = new URLSearchParams(window.location.search);
    const language = params.get("language");
    const issueId = params.get("issue");

    if (!language) return window.location.href = "/";

    try {
        await init(language, issueId);
    } catch (error) {
        showOverlay(error, true);
    }
});

async function init(language: string, issueId: string | null) {
    $("#language").text(language);
    const languageFilePromise = fetch(`https://raw.githubusercontent.com/OpenRCT2/Localisation/master/data/language/${language}.txt`).then(res => res.text());

    // GitHub SETUP
    const client = new GitHubClient(getAccessToken() || undefined);

    const strings: TranslationString[] = await (issueId ? async () => {
        $("h1").text(`#${issueId}`);
        const issue = await client.getIssue(BASE, issueId);
        if (!issue) return [];
        $("h1")
            .text(`#${issue.number}: ${issue.title}`)
            .after(
                $("<p>").append($("<details>").append(
                    $("<summary>").append(
                        "Issue Description",
                        $("<a>")
                            .attr("href", issue.html_url)
                            .attr("target", "_blank")
                            .append("Open issue on GitHub ↗", $("<img>").attr("src", "github-mark.png")),
                    ),
                    $("<pre>").text(issue.body),
                )),
            );
        return extractTranslationStringsFromIssue(issue.body);
    } : async () => {
        $("h1").text("All Strings");
        const originalLanguageFile = await fetch(`https://raw.githubusercontent.com/OpenRCT2/OpenRCT2/develop/data/language/en-GB.txt`).then(res => res.text());
        return extractTranslationStringsFromLanguageFile(originalLanguageFile);
    })();

    const languageFile = await languageFilePromise;

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

    const enum Actions { SAVE, COMMIT, DRAFT_PR, CREATE_PR };

    async function trigger(actions: Actions) {
        const translations = $("#strings tbody tr.added").toArray().map<[string, string]>(row => {
            const strId = $(row).find(".strId").text();
            const translation = $(row).find(".translation").text();
            setTranslation(language, strId, translation);
            return [strId, translation];
        });
        addToLog(`saved changes locally`);

        if (actions === Actions.SAVE) return;

        try {
            const now = new Date().toISOString();
            const userName = await client.getUser();
            const content = updateLanguageFile(languageFile, translations);
            const message = `${language}: Apply #${issueId}`;

            const userInfo = {
                owner: userName,
                repository: BASE.repository,
                branch: "translate-" + language + "-" + now.replace(/[^\w]/g, ""),
                path: `data/language/${language}.txt`,
            };

            const forkResult = await waitForSuccess(() => client.getRepository(userInfo));
            if (now <= forkResult.created_at)
                addToLog(`created a new fork for user ${userName}`, forkResult.html_url);
            else
                addToLog(`fork already exists for user ${userName}`, forkResult.html_url);

            const branchResult = await client.branch(userInfo);
            addToLog(`created a new branch ${userInfo.branch}`, `https://github.com/${userInfo.owner}/Localisation/tree/${userInfo.branch}`);

            const commitResult = await client.commit(userInfo, content, message);
            addToLog(`committed changes to ${language}.txt`, commitResult.commit.html_url);

            if (actions === Actions.COMMIT) return;

            const title = message;
            const body = `Applying for issue:\n- #${issueId}`;
            const draft = actions === Actions.DRAFT_PR;
            const prResult = await client.createPR(userInfo, { ...BASE, owner: "Sadret" }, title, body, draft); // Sadret for testing
            addToLog(`${draft ? "drafted" : "created"} pull request against OpenRCT2/Localisation`, prResult.html_url);
        } catch (error) {
            showOverlay(error, false);
        }
    }

    $("#btn-save").on("click", () => {
        addToLog("user triggered action: save locally");
        trigger(Actions.SAVE);
    });
    $("#btn-commit").on("click", () => {
        addToLog("user triggered action: save locally & commit changes");
        trigger(Actions.COMMIT);
    });
    $("#btn-draft-pr").on("click", () => {
        addToLog("user triggered action: save locally & commit changes & draft pull request");
        trigger(Actions.DRAFT_PR);
    });
    $("#btn-create-pr").on("click", () => {
        addToLog("user triggered action: save locally & commit changes & create pull request");
        trigger(Actions.CREATE_PR);
    });
};

function addToLog(message: string, url?: string) {
    const line = $("<div>").text(`${new Date().toLocaleString()} ${message}`);
    if (url) line.append($("<a>").attr("href", url).attr("target", "_blank").append("(open on GitHub ↗", $("<img>").attr("src", "github-mark.png"), ")"));
    $("#log").append(line).scrollTop($("#log")[0].scrollHeight);
}