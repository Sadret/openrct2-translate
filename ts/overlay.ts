import $ from "jquery";
import { login } from "./gh-utils";
import { GitHubError, HTTPError } from "./github";

function getDurationString(seconds: number): string {
    const minutes = Math.round(seconds / 60);
    const hours = Math.round(minutes / 60);
    const days = Math.round(hours / 24);

    if (seconds < 2)
        return "now";
    if (minutes < 2)
        return `in ${seconds} seconds`;
    if (hours < 2)
        return `in ${minutes} minutes`;
    if (days < 2)
        return `in ${hours} hours`;
    return `in ${days} days`;
}

function getDateString(reset: number): string {
    return `${new Date(reset * 1000).toLocaleString()} (${getDurationString(reset - Math.floor(Date.now() / 1000))})`;
}

export function showOverlay(error: unknown, onPageLoad: boolean): void {
    const overlay = $("<div>").addClass("overlay").appendTo("body");
    const border = $("<div>").addClass("border").appendTo(overlay);
    const content = $("<div>").addClass("content").appendTo(border);

    const rateLimitExceeded = error instanceof GitHubError && error.rateLimit.remaining === 0;
    const authenticationRequired = error instanceof GitHubError && !rateLimitExceeded;

    // Title and Description
    switch (true) {
        case rateLimitExceeded:
            content.append(
                $("<h1>").text(`GitHub API Rate Limit Exceeded`),
                $("<p>").text(`This ${onPageLoad ? "page" : "action"} uses the GitHub API, which has a rate limit. You have exceeded this limit.`),
            ); break;
        case authenticationRequired:
            content.append(
                $("<h1>").text(`GitHub Authentication Required`),
                $("<p>").text(`This ${onPageLoad ? "page" : "action"} requires authentication at GitHub. You need to log in to continue.`),
            ); break;
        default:
            content.append(
                $("<h1>").text(`Unknown ${error instanceof HTTPError ? "HTTP" : ""} Error`),
                $("<p>").text(`An error occurred while ${onPageLoad ? "loading this page" : "processing your request"}. Unfortunately this app does not know how to handle it.`),
            ); break;
    }

    if (!authenticationRequired) {
        // Details
        content.append($("<h2>").text(`Details`));
        switch (true) {
            case rateLimitExceeded:
                content.append(
                    $("<ul>").append(
                        $("<li>").text(`You are ${error.authenticated ? "" : "not "} authenticated.`),
                        $("<li>").text(`Limit: ${error.rateLimit.limit}`),
                        $("<li>").text(`Used: ${error.rateLimit.used}`),
                        $("<li>").text(`Remaining: ${error.rateLimit.remaining}`),
                        $("<li>").text(`Resource: ${error.rateLimit.resource}`),
                        $("<li>").text(`Resets: ${getDateString(error.rateLimit.reset)}`),
                    ),
                ); break;
            case error instanceof HTTPError:
                content.append(
                    $("<ul>").append(
                        $("<li>").text(`Status: ${error.status} ${error.statusText}`),
                        $("<li>").text(`Headers: ${JSON.stringify(Object.fromEntries(error.headers))}`),
                    ),
                ); break;
            default:
                content.append(
                    $("<p>").text(String(error))
                ); break;
        }

        // Solutions
        content.append($("<h2>").text(`Solutions`));
        switch (true) {
            case rateLimitExceeded:
                content.append(
                    $("<ul>").append(
                        $("<li>").text(`You can log in with a ${error.authenticated ? "different" : ""} GitHub account to ${error.authenticated ? "reset" : "increase"} the limit.`),
                        $("<li>").text(`You can wait for the rate limit to reset and ${onPageLoad ? "reload the page" : "retry the action"}.`),
                    ),
                ); break;
            default:
                content.append(
                    $("<ul>").append(
                        $("<li>").text(`You can ${onPageLoad ? "" : "retry the action or "} reload the page and hope that the error resolves by itself.`),
                    ),
                ); break;
        }
    }

    // Actions
    content.append(
        $("<h2>").text(`Actions`),
        $("<div>").addClass("buttons").append(
            // if this is a GitHubError, then show the login button
            error instanceof GitHubError ? $("<button>").addClass("action").text(`Log In to GitHub`).on("click", () => login(error.authenticated)) : [],
            // if this happened on page load or if this is an unknown error, then show the reload button
            (onPageLoad || !(error instanceof GitHubError)) ? $("<button>").addClass("action").text(`Reload the page`).on("click", () => location.reload()) : [],
            // always show the close button
            $("<button>").addClass("action").text(`Close this window`).on("click", () => overlay.remove()),
        ),
    );
}