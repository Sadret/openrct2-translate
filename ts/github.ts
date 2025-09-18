/*
 * CLASSES AND TYPES
 */

type RateLimit = {
    limit: number;
    remaining: number;
    reset: number;
    resource: string;
    used: number;
}

/**
 * Error thrown for GitHub API rate limits or authentication issues.
 */
export class GitHubError extends Error {
    constructor(public authenticated: boolean, public rateLimit: RateLimit) {
        super(`GitHub Error [authenticated: ${authenticated}, ${Object.entries(rateLimit).map(([key, value]) => `${key}: ${value}`).join(", ")}]`);
        this.name = "GitHubError";
    }
}

/**
 * Error thrown for HTTP errors.
 */
export class HTTPError extends Error {
    constructor(public status: number, public statusText: string, public headers: Headers) {
        super(`HTTP Error ${status}: ${statusText}`);
        this.name = "HTTPError";
    }
}

/**
 * Describes a GitHub repository.
 */
export type RepoDesc = {
    owner: string;
    repository: string;
};

/**
 * Describes a branch in a repository.
 */
export type BranchDesc = RepoDesc & {
    branch: string;
};

/**
 * Describes a file path in a branch of a repository.
 */
export type PathDesc = BranchDesc & {
    path: string;
};

export type GitHubUser = {
    login: string;
};

export type GitHubIssue = {
    number: number;
    title: string;
    html_url: string;
    body: string;
    pull_request?: unknown;
};

export type GitHubRepository = {
    html_url: string;
    created_at: string;
    default_branch: string;
};

export type GitHubBranch = {
    url: string;
};

export type GitHubRef = {
    ref: string;
    node_id: string;
    url: string;
    object: {
        sha: string;
        type: string;
        url: string;
    };
};

export type GitHubFile = {
    name: string;
    sha: string;
    content: string;
};

export type GitHubCommit = {
    commit: {
        html_url: string;
    };
};

export type GitHubPR = {
    html_url: string;
};

/*
 * HELPER FUNCTIONS
 */

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

export class GitHubClient {
    constructor(private readonly accessToken?: string) { }

    /*
     * FETCH WRAPPERS
     */

    private async fetchURL<T>(url: string, init?: RequestInit): Promise<T> {
        const response = await fetch(url, init);
        if (!response.ok)
            throw new HTTPError(response.status, response.statusText, response.headers);
        return response.json() as T;
    }

    private async fetchAPI<T>(url: string, method = "GET", body?: BodyInit, authorised = true): Promise<T> {
        try {
            return this.fetchURL("https://api.github.com/" + url, {
                method,
                headers: {
                    Accept: "application/vnd.github.v3+json",
                    "User-Agent": "https://github.com/Sadret/openrct2-translate",
                    ...(body && { "Content-Type": "application/json" }),
                    ...(authorised && this.accessToken && { Authorization: `Bearer ${this.accessToken}` }),
                },
                body,
            });
        } catch (error) {
            if (!(error instanceof HTTPError))
                // propagate as unknown Error
                throw error;
            switch (true) {
                case this.accessToken && error.status === 401:
                    // access token is invalid: retry without (most likely fails with 403)
                    return await this.fetchAPI(url, method, body, false);
                case error.status === 401:
                case error.status === 403 && Number(error.headers.get("X-RateLimit-Remaining")) === 0:
                    // propagate as GitHubError
                    throw new GitHubError(Boolean(this.accessToken), {
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

    /*
     * READER FUNCTIONS
     */

    /**
     * Gets the login name of the authenticated user.
     * @returns {Promise<string>} The user's login.
     */
    public async getUser(): Promise<string> {
        return (await this.fetchAPI<GitHubUser>("user")).login;
    }

    /**
     * Gets repository metadata.
     * @param {RepoDesc} repoDesc - Repository.
     */
    public async getRepository({ owner, repository }: RepoDesc): Promise<GitHubRepository> {
        return this.fetchAPI(`repos/${owner}/${repository}`);
    }

    /**
     * Asynchronously iterates over issues in a repository.
     * @param {RepoDesc} repoDesc - Repository to fetch issues from.
     * @param {"open"|"closed"|"all"} state - Issue state filter.
     */
    public async * getIssues({ owner, repository }: RepoDesc, state: "open" | "closed" | "all" = "open"): AsyncGenerator<GitHubIssue> {
        for (let page = 1; true; page++) {
            const issues = await this.fetchAPI<GitHubIssue[]>(`repos/${owner}/${repository}/issues?state=${state}&per_page=100&page=${page}`);
            if (issues.length === 0) return;
            for (const issue of issues) yield issue;
        }
    }

    /**
     * Gets a single issue by number.
     * @param {RepoDesc} repoDesc - Repository.
     * @param {string} issueId - Issue number.
     */
    public async getIssue({ owner, repository }: RepoDesc, issueId: string): Promise<GitHubIssue> {
        return this.fetchAPI(`repos/${owner}/${repository}/issues/${issueId}`);
    }

    /**
     * Gets a reference (ref) for a branch.
     * @param {BranchDesc} branchDesc - Branch.
     */
    public async getRef({ owner, repository, branch }: BranchDesc): Promise<GitHubRef> {
        return this.fetchAPI(`repos/${owner}/${repository}/git/refs/heads/${branch}`);
    }

    /**
     * Gets a file from a repository branch.
     * @param {PathDesc} pathDesc - File location.
     */
    public async getFile(pathDesc: PathDesc): Promise<GitHubFile> {
        return this.getContent(pathDesc);
    }

    /**
     * Gets a folder (list of files) from a repository branch.
     * @param {PathDesc} pathDesc - Folder location.
     */
    public async getFolder(pathDesc: PathDesc): Promise<GitHubFile[]> {
        return this.getContent(pathDesc);
    }

    private async getContent<T extends GitHubFile | GitHubFile[]>({ owner, repository, branch, path }: PathDesc): Promise<T> {
        return this.fetchAPI<T>(`repos/${owner}/${repository}/contents/${path}?ref=${branch}`);
    }

    /*
     * WRITER FUNCTIONS
     */

    /**
     * Forks the given repository into the authenticated user's account.
     * @param {RepoDesc} repoDesc - Repository to fork.
     */
    public async fork({ owner, repository }: RepoDesc): Promise<void> {
        return this.fetchAPI(`repos/${owner}/${repository}/forks`, "POST");
    }

    /**
     * Creates a new branch from the given commit SHA.
     * If sha is not provided, it will be retrieved from the repository's default branch.
     * @param {BranchDesc} branchDesc - Branch to create.
     * @param {string} [sha] - Commit SHA to branch from (optional).
     */
    public async branch({ owner, repository, branch }: BranchDesc, sha?: string): Promise<GitHubBranch> {
        return this.fetchAPI<GitHubBranch>(`repos/${owner}/${repository}/git/refs`, "POST", JSON.stringify({
            ref: `refs/heads/${branch}`,
            sha: sha || (await this.getRef({ owner, repository, branch: (await this.getRepository({ owner, repository })).default_branch })).object.sha,
        }));
    }

    /**
     * Commits changes to a file in the specified branch and path.
     * If sha is not provided, it will be retrieved from the current file.
     * @param {PathDesc} pathDesc - File location.
     * @param {string} content - New file content.
     * @param {string} message - Commit message.
     * @param {string} [sha] - File's previous SHA (optional).
     */
    public async commit({ owner, repository, branch, path }: PathDesc, content: string, message: string, sha?: string): Promise<GitHubCommit> {
        return this.fetchAPI<GitHubCommit>(`repos/${owner}/${repository}/contents/${path}`, "PUT", JSON.stringify({
            branch,
            content: utf8ToBase64Safe(content),
            message,
            sha: sha || (await this.getFile({ owner, repository, branch, path })).sha,
        }));
    }

    /**
     * Creates a pull request from the head branch to the base branch.
     * Requires that head.repository is a fork of base.repository.
     * @param {BranchDesc} head - Head branch to merge from.
     * @param {BranchDesc} base - Base branch to merge into.
     * @param {string} title - PR title.
     * @param {string} body - PR body/description.
     * @param {boolean} draft - Whether to create the PR as a draft.
     */
    public async createPR(head: BranchDesc, base: BranchDesc, title: string, body: string, draft: boolean = false): Promise<GitHubPR> {
        return this.fetchAPI<GitHubPR>(`repos/${base.owner}/${base.repository}/pulls`, "POST", JSON.stringify({
            title,
            body,
            head: `${head.owner}:${head.branch}`,
            base: base.branch,
            draft,
        }));
    }
}
