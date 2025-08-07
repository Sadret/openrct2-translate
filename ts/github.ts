
// retrieve access token on page load
{
    const accessToken = new URLSearchParams(window.location.search).get("access_token");
    if (accessToken) {
        localStorage.setItem("github_token", accessToken);
        sessionStorage.setItem("github_token", accessToken);
        const url = new URL(window.location.href);
        url.searchParams.delete("access_token");
        window.history.replaceState(null, "", String(url));
    }
}

/* CLASSES AND TYPES */

type RateLimit = {
    limit: number;
    remaining: number;
    reset: number;
    resource: string;
    used: number;
}

export class GitHubError extends Error {
    constructor(public authenticated: boolean, public rateLimit: RateLimit) {
        super(`GitHub Error [authenticated: ${authenticated}, ${Object.entries(rateLimit).map(([key, value]) => `${key}: ${value}`).join(", ")}]`);
        this.name = "GitHubError";
    }
}

export class HTTPError extends Error {
    constructor(public status: number, public statusText: string, public headers: Headers) {
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
    created_at: string;
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
    name: string;
    sha: string;
    content: string;
};

type GitHubCommit = {
    commit: {
        html_url: string;
    };
};

type GitHubPR = {
    html_url: string;
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
    if (!response.ok)
        throw new HTTPError(response.status, response.statusText, response.headers);
    return response.json() as T;
}

async function fetchAPI<T>(url: string, method = "GET", body?: BodyInit): Promise<T> {
    const accessToken = localStorage.getItem("github_token") || sessionStorage.getItem("github_token");
    try {
        return await fetchURL("https://api.github.com/" + url, accessToken ? {
            method,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/vnd.github.v3+json",
            },
            body,
        } : undefined);
    } catch (error) {
        if (!(error instanceof HTTPError))
            // propagate as unknown Error
            throw error;
        switch (true) {
            case accessToken && error.status === 401:
                // access token is invalid: remove and retry without
                localStorage.removeItem("github_token");
                sessionStorage.removeItem("github_token");
                return await fetchAPI(url, method, body);
            case error.status === 401:
            case error.status === 403 && Number(error.headers.get("X-RateLimit-Remaining")) === 0:
                // propagate as GitHubError
                throw new GitHubError(Boolean(accessToken), {
                    limit: Number(error.headers.get("X-RateLimit-Limit")),
                    remaining: Number(error.headers.get("X-RateLimit-Remaining")),
                    reset: Number(error.headers.get("X-RateLimit-Reset")),
                    resource: String(error.headers.get("X-RateLimit-Resource")),
                    used: Number(error.headers.get("X-RateLimit-Used")),
                });
            default:
                // propagate as unknown HTTPError
                throw error;
        }
    }
}

/* GITHUB FUNCTIONS */

export function login(force = false): void {
    const clientId = "Ov23ct0fDobJn5hdYuQ1";
    const redirectUri = "https://gh-oauth-handler.sadret.workers.dev/callback";
    const scope = "public_repo";
    const state = encodeURIComponent(window.location.href);

    window.location.href =
        `https://github.com/login/oauth/authorize` +
        `?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&scope=${encodeURIComponent(scope)}` +
        `&state=${state}` +
        (force ? "&prompt=login" : "");
}

export async function getUserName(): Promise<string> {
    return (await fetchAPI<GitHubUser>("user")).login;
}

export async function getIssue(issueId: string): Promise<GitHubIssue> {
    return await fetchAPI(`repos/OpenRCT2/Localisation/issues/${issueId}`);
}

export async function* streamOpenIssues(): AsyncGenerator<GitHubIssue> {
    for (let page = 1; true; page++) {
        const issues = await fetchAPI<GitHubIssue[]>(`repos/OpenRCT2/Localisation/issues?state=open&per_page=100&page=${page}`);

        if (issues.length === 0) return;

        for (const issue of issues)
            if (!issue.pull_request)
                yield issue;
    }
}

export async function getLanguages(): Promise<string[]> {
    return (await fetchAPI<GitHubFile[]>("repos/OpenRCT2/Localisation/contents/data/language"))
        .filter((file) => file.name.endsWith(".txt"))
        .map((file) => file.name.replace(/\.txt$/, ""));
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

export async function createPR(userName: string, title: string, body: string, branchName: string, draft = false): Promise<GitHubPR> {
    return await fetchAPI<GitHubPR>(`repos/${userName}/Localisation/pulls`, "POST", JSON.stringify({
        title,
        body,
        head: `${userName}:${branchName}`,
        base: "master",
        draft,
    }));
}