/// <reference types="mdast" />
import { h } from "hastscript";

/**
 * Creates a GitHub Card component.
 *
 * @param {Object} properties - The properties of the component.
 * @param {string} properties.repo - The GitHub repository in the format "owner/repo".
 * @param {import('mdast').RootContent[]} children - The children elements of the component.
 * @returns {import('mdast').Parent} The created GitHub Card component.
 */
export function GithubCardComponent(properties, children) {
	if (Array.isArray(children) && children.length !== 0)
		return h("div", { class: "hidden" }, [
			'Invalid directive. ("github" directive must be leaf type "::github{repo="owner/repo"}")',
		]);

	if (!properties.repo || !properties.repo.includes("/"))
		return h(
			"div",
			{ class: "hidden" },
			'Invalid repository. ("repo" attributte must be in the format "owner/repo")',
		);

	const repo = properties.repo;
	const cardUuid = `GC${Math.random().toString(36).slice(-6)}`; // Collisions are not important

	const nAvatar = h(`div#${cardUuid}-avatar`, { class: "gc-avatar" });
	const nLanguage = h(
		`span#${cardUuid}-language`,
		{ class: "gc-language" },
		"Waiting...",
	);

	const nTitle = h("div", { class: "gc-titlebar" }, [
		h("div", { class: "gc-titlebar-left" }, [
			h("div", { class: "gc-owner" }, [
				nAvatar,
				h("div", { class: "gc-user" }, repo.split("/")[0]),
			]),
			h("div", { class: "gc-divider" }, "/"),
			h("div", { class: "gc-repo" }, repo.split("/")[1]),
		]),
		h("div", { class: "github-logo" }),
	]);

	const nDescription = h(
		`div#${cardUuid}-description`,
		{ class: "gc-description" },
		"Waiting for api.github.com...",
	);

	const nStars = h(`div#${cardUuid}-stars`, { class: "gc-stars" }, "00K");
	const nForks = h(`div#${cardUuid}-forks`, { class: "gc-forks" }, "0K");
	const nLicense = h(`div#${cardUuid}-license`, { class: "gc-license" }, "0K");

	const nScript = h(
		`script#${cardUuid}-script`,
		{ type: "text/javascript", defer: true },
		`
      fetch('https://api.github.com/repos/${repo}', { referrerPolicy: "no-referrer" }).then(response => response.json()).then(data => {
        document.getElementById('${cardUuid}-description').innerText = data.description?.replace(/:[a-zA-Z0-9_]+:/g, '') || "Description not set";
        document.getElementById('${cardUuid}-language').innerText = data.language;
        document.getElementById('${cardUuid}-forks').innerText = Intl.NumberFormat('en-us', { notation: "compact", maximumFractionDigits: 1 }).format(data.forks).replaceAll("\u202f", '');
        document.getElementById('${cardUuid}-stars').innerText = Intl.NumberFormat('en-us', { notation: "compact", maximumFractionDigits: 1 }).format(data.stargazers_count).replaceAll("\u202f", '');
        const avatarEl = document.getElementById('${cardUuid}-avatar');
        avatarEl.style.backgroundImage = 'url(' + data.owner.avatar_url + ')';
        avatarEl.style.backgroundColor = 'transparent';
        document.getElementById('${cardUuid}-license').innerText = data.license?.spdx_id || "no-license";
        document.getElementById('${cardUuid}-card').classList.remove("fetch-waiting");
        console.log("[GITHUB-CARD] Loaded card for ${repo} | ${cardUuid}.")
      }).catch(err => {
        const c = document.getElementById('${cardUuid}-card');
        c?.classList.add("fetch-error");
        console.warn("[GITHUB-CARD] (Error) Loading card for ${repo} | ${cardUuid}.")
      })
    `,
	);

	return h(
		`a#${cardUuid}-card`,
		{
			class: "card-github fetch-waiting no-styling",
			href: `https://github.com/${repo}`,
			target: "_blank",
			repo,
		},
		[
			nTitle,
			nDescription,
			h("div", { class: "gc-infobar" }, [nStars, nForks, nLicense, nLanguage]),
			nScript,
		],
	);
}

/**
 * Creates a GitHub Pull Request card component.
 *
 * @param {Object} properties - The properties of the component.
 * @param {string} properties.repo - The GitHub repository in the format "owner/repo".
 * @param {string|number} properties.number - The pull request number.
 * @param {import('mdast').RootContent[]} children - The children elements of the component.
 * @returns {import('mdast').Parent} The created GitHub PR card component.
 */
export function GithubPrCardComponent(properties, children) {
	if (Array.isArray(children) && children.length !== 0)
		return h("div", { class: "hidden" }, [
			'Invalid directive. ("github-pr" directive must be leaf type "::github-pr{repo="owner/repo" number="123"}")',
		]);

	if (!properties.repo || !properties.repo.includes("/"))
		return h(
			"div",
			{ class: "hidden" },
			'Invalid repository. ("repo" attributte must be in the format "owner/repo")',
		);

	const repo = properties.repo;
	const prNumber = String(properties.number || "").trim();
	if (!/^[0-9]+$/.test(prNumber))
		return h(
			"div",
			{ class: "hidden" },
			'Invalid pull request number. ("number" attributte must be numeric)',
		);

	const cardUuid = `GCPR${Math.random().toString(36).slice(-6)}`;

	const nAvatar = h(`div#${cardUuid}-avatar`, { class: "gc-avatar" });
	const nTitle = h(
		`div#${cardUuid}-title`,
		{ class: "gc-description" },
		"Waiting for api.github.com...",
	);
	const nState = h(`div#${cardUuid}-state`, { class: "gc-pr-state" }, "OPEN");
	const nAuthor = h(`div#${cardUuid}-author`, { class: "gc-pr-author" }, "author");
	const nUpdated = h(
		`div#${cardUuid}-updated`,
		{ class: "gc-pr-updated" },
		"updated",
	);

	const nTitlebar = h("div", { class: "gc-titlebar" }, [
		h("div", { class: "gc-titlebar-left" }, [
			h("div", { class: "gc-owner" }, [
				nAvatar,
				h("div", { class: "gc-user" }, repo.split("/")[0]),
			]),
			h("div", { class: "gc-divider" }, "/"),
			h("div", { class: "gc-repo" }, repo.split("/")[1]),
		]),
		h("div", { class: "gc-pr-number" }, `#${prNumber}`),
	]);

	const nScript = h(
		`script#${cardUuid}-script`,
		{ type: "text/javascript", defer: true },
		`
      fetch('https://api.github.com/repos/${repo}/pulls/${prNumber}', { referrerPolicy: "no-referrer" })
        .then(response => response.json())
        .then(data => {
          if (data && data.message) throw new Error(data.message);
          const state = data.merged_at ? "merged" : data.state;
          const stateLabel = state === "merged" ? "MERGED" : state.toUpperCase();
          document.getElementById('${cardUuid}-title').innerText = data.title || "Pull request";
          document.getElementById('${cardUuid}-author').innerText = data.user?.login ? ("@" + data.user.login) : "author";
          const updated = data.updated_at ? new Date(data.updated_at) : null;
          document.getElementById('${cardUuid}-updated').innerText = updated ? updated.toLocaleDateString() : "updated";
          document.getElementById('${cardUuid}-state').innerText = stateLabel;
          const cardEl = document.getElementById('${cardUuid}-card');
          if (cardEl) cardEl.setAttribute("data-state", state);
          const avatarEl = document.getElementById('${cardUuid}-avatar');
          avatarEl.style.backgroundImage = 'url(' + data.user?.avatar_url + ')';
          avatarEl.style.backgroundColor = 'transparent';
          document.getElementById('${cardUuid}-card').classList.remove("fetch-waiting");
          console.log("[GITHUB-PR-CARD] Loaded card for ${repo}#${prNumber} | ${cardUuid}.")
        }).catch(err => {
          const c = document.getElementById('${cardUuid}-card');
          c?.classList.add("fetch-error");
          console.warn("[GITHUB-PR-CARD] (Error) Loading card for ${repo}#${prNumber} | ${cardUuid}.")
        })
    `,
	);

	return h(
		`a#${cardUuid}-card`,
		{
			class: "card-github card-github-pr fetch-waiting no-styling",
			href: `https://github.com/${repo}/pull/${prNumber}`,
			target: "_blank",
			repo,
		},
		[
			nTitlebar,
			nTitle,
			h("div", { class: "gc-infobar gc-pr-infobar" }, [nState, nAuthor, nUpdated]),
			nScript,
		],
	);
}
