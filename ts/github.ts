
// retrieve access token on page load
{
    const accessToken = new URLSearchParams(window.location.search).get("access_token");
    if (accessToken) {
        sessionStorage.setItem("github_token", accessToken);
        const url = new URL(window.location.href);
        url.searchParams.delete("access_token");
        window.history.replaceState(null, "", String(url));
    }
}

/* CLASSES AND TYPES */

class HTTPError extends Error {
    constructor(public status: number, public statusText: string) {
        super(`HTTP Error ${status}: ${statusText}`);
        this.name = "HTTPError";
    }
}

type GitHubUser = {
    login: string;
};

type GitHubIssue = {
    number: number;
    title: string;
    html_url: string;
    body: string;
    pull_request?: unknown;
};

type GitHubRepository = {
    html_url: string;
};

type GitHubBranch = {
    url: string;
};

type GitHubRef = {
    ref: string;
    node_id: string;
    url: string;
    object: {
        sha: string;
        type: string;
        url: string;
    };
};

type GitHubFile = {
    sha: string;
    content: string;
};

type GitHubCommit = {
    commit: {
        html_url: string;
    };
};

/* HELPER FUNCTIONS */

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

/* FETCH WRAPPERS */

async function fetchURL<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    if (!response.ok) throw new HTTPError(response.status, response.statusText);
    return response.json() as T;
}

async function fetchAPI<T>(url: string, method = "GET", body?: BodyInit): Promise<T> {
    const accessToken = sessionStorage.getItem("github_token");
    return await fetchURL("https://api.github.com/" + url, accessToken ? {
        method,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github.v3+json",
        },
        body,
    } : undefined);
}

/* GITHUB FUNCTIONS */

export function logIn(): void {
    const clientId = "Ov23ct0fDobJn5hdYuQ1";
    const redirectUri = "https://gh-oauth-handler.sadret.workers.dev/callback";
    const scope = "public_repo";
    const state = encodeURIComponent(window.location.href);

    window.location.href =
        `https://github.com/login/oauth/authorize` +
        `?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&scope=${encodeURIComponent(scope)}` +
        `&state=${state}`;
}

export async function getUserName(): Promise<string> {
    return (await fetchAPI<GitHubUser>("user")).login;
}

export async function getIssue(issueId: string): Promise<GitHubIssue> {
    return await fetchAPI(`repos/OpenRCT2/Localisation/issues/${issueId}`);
}

export async function fork(username: string): Promise<GitHubRepository> {
    await fetchAPI("repos/OpenRCT2/Localisation/forks", "POST");

    // Wait until the fork is visible
    for (let i = 0; i < 10; i++)
        try {
            return await fetchAPI(`repos/${username}/Localisation`);
        } catch {
            await new Promise(r => setTimeout(r, 10 << i));
        }

    throw new Error(); // unknown error: cannot create or retrieve fork
}

export async function branch(userName: string, branchName: string): Promise<GitHubBranch> {
    const baseSHA = (await fetchAPI<GitHubRef>("repos/OpenRCT2/Localisation/git/ref/heads/master")).object.sha;
    return await fetchAPI<GitHubBranch>(`repos/${userName}/Localisation/git/refs`, "POST", JSON.stringify({
        ref: `refs/heads/${branchName}`,
        sha: baseSHA,
    }));
}

export async function commit(userName: string, branchName: string, language: string, content: string, message: string): Promise<GitHubCommit> {
    const filePath = `repos/${userName}/Localisation/contents/data/language/${language}.txt`;
    const sha = (await fetchAPI<GitHubFile>(`${filePath}?ref=${branchName}`)).sha;
    return await fetchAPI<GitHubCommit>(filePath, "PUT", JSON.stringify({
        content: utf8ToBase64Safe(content),
        message,
        branch: branchName,
        sha,
    }));
}