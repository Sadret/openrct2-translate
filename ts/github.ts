import type { Data } from "./data";

export async function ghFetch(url: string): Promise<Response | null> {
    const token = getToken();
    return token ? fetch(url, {
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github.v3+json",
        }
    }) : null;
}

export function getToken(): string | null {
    const accessToken = new URLSearchParams(window.location.search).get("access_token");
    if (accessToken) return accessToken;

    const clientId = "Ov23ct0fDobJn5hdYuQ1";
    const redirectUri = "https://gh-oauth-handler.sadret.workers.dev/callback";
    const scope = "public_repo";

    window.location.href =
        `https://github.com/login/oauth/authorize` +
        `?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&scope=${encodeURIComponent(scope)}`;

    return null;
}

export async function commit(token: string, data: Data, langFile: string): Promise<void> {
    // Fork OpenRCT2/Localisation into the user’s account
    await fetch("https://api.github.com/repos/OpenRCT2/Localisation/forks", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
        }
    });

    const username = await getUsername(token); // fetches /user

    // Wait until the fork is visible
    let forkRepo;
    for (let i = 0; i < 10; i++) {
        const res = await fetch(`https://api.github.com/repos/${username}/Localisation`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
            forkRepo = await res.json();
            break;
        }
        await new Promise(r => setTimeout(r, 10 << i));
    }

    // Get SHA of master in upstream repo
    const baseRef = await fetch(
        "https://api.github.com/repos/OpenRCT2/Localisation/git/ref/heads/master",
        { headers: { Authorization: `Bearer ${token}` } }
    ).then(r => r.json());

    const baseSha = baseRef.object.sha;

    // Create new branch in user's fork
    const newBranch = "translate-" + data.language + "-" + new Date().toISOString().replace(/[^\w]/g, "");

    await fetch(`https://api.github.com/repos/${username}/Localisation/git/refs`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
        },
        body: JSON.stringify({
            ref: `refs/heads/${newBranch}`,
            sha: baseSha,
        })
    });

    // Get existing file's SHA (only if updating)
    let sha = undefined;
    const filePath = `data/language/${data.language}.txt`;
    const fileRes = await fetch(
        `https://api.github.com/repos/${username}/Localisation/contents/${filePath}?ref=${newBranch}`,
        { headers: { Authorization: `Bearer ${token}` } }
    );

    if (fileRes.ok) {
        const fileData = await fileRes.json();
        sha = fileData.sha;
    }

    // Commit the updated file
    const fileContent = getNewFileContent(data, langFile);
    const contentBase64 = utf8ToBase64Safe(fileContent);

    await fetch(`https://api.github.com/repos/${username}/Localisation/contents/${filePath}`, {
        method: "PUT",
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
        },
        body: JSON.stringify({
            message: `${data.language}: Apply #${data.issue}`,
            content: contentBase64,
            branch: newBranch,
            sha // include only if it exists
        })
    });

    console.log(`Committed changes to ${filePath} in branch ${newBranch}`);
}

async function getUsername(token: string): Promise<string> {
    const res = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    return data.login;
}

function getNewFileContent(data: Data, langFile: string): string {
    const lines = langFile.trim().split("\n");
    const out: string[] = [];

    let lineIdx = 0;

    data.strings.sort((a, b) => a.key.localeCompare(b.key)).forEach(entry => {
        for (; lineIdx < lines.length; lineIdx++) {
            switch (true) {
                case lines[lineIdx].trim() === "":
                case lines[lineIdx].startsWith("#"):
                case entry.key.localeCompare(lines[lineIdx]) > 0:
                    // line should be before this entry
                    out.push(lines[lineIdx]);
                    break;
                case lines[lineIdx].startsWith(entry.key):
                    // entry already exists, skip line
                    lineIdx++;
                default:
                    out.push(`${entry.key}    :${entry.translated}`);
                    return;
            }
        }
        out.push(`${entry.key}    :${entry.translated}`);
    });
    for (; lineIdx < lines.length; lineIdx++)
        out.push(lines[lineIdx]);

    out.push(""); // new line at the end of the file

    return out.join("\n");
}

function utf8ToBase64Safe(str: string): string {
    const utf8Bytes = new TextEncoder().encode(str);
    let binary = "";
    const chunkSize = 0x8000; // 32K

    for (let i = 0; i < utf8Bytes.length; i += chunkSize) {
        const chunk = utf8Bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode(...chunk);
    }

    return btoa(binary);
}