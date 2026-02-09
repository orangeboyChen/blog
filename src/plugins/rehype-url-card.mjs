import { h } from "hastscript";
import { visit } from "unist-util-visit";

const cache = new Map();

function decodeHtml(input) {
	return input
		.replaceAll("&amp;", "&")
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&quot;", '"')
		.replaceAll("&#39;", "'");
}

function extractMeta(html) {
	const meta = {};
	const titleMatch = html.match(
		new RegExp("<title[^>]*>([^<]*)</title>", "i"),
	);
	if (titleMatch) meta.title = decodeHtml(titleMatch[1].trim());

	const ogTitle = html.match(
		/<meta[^>]+property=[\"']og:title[\"'][^>]+content=[\"']([^\"']+)[\"'][^>]*>/i,
	);
	if (ogTitle) meta.title = decodeHtml(ogTitle[1].trim());

	const descMatch = html.match(
		/<meta[^>]+name=[\"']description[\"'][^>]+content=[\"']([^\"']+)[\"'][^>]*>/i,
	);
	if (descMatch) meta.description = decodeHtml(descMatch[1].trim());

	const ogDesc = html.match(
		/<meta[^>]+property=[\"']og:description[\"'][^>]+content=[\"']([^\"']+)[\"'][^>]*>/i,
	);
	if (ogDesc) meta.description = decodeHtml(ogDesc[1].trim());

	const ogImage = html.match(
		/<meta[^>]+property=[\"']og:image[\"'][^>]+content=[\"']([^\"']+)[\"'][^>]*>/i,
	);
	if (ogImage) meta.image = ogImage[1].trim();

	return meta;
}

async function fetchMeta(url) {
	if (cache.has(url)) return cache.get(url);
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), 5000);
	try {
		const res = await fetch(url, {
			redirect: "follow",
			headers: {
				"user-agent": "Mozilla/5.0 (compatible; URLCardBot/1.0)",
			},
			signal: controller.signal,
		});
		const html = await res.text();
		const meta = extractMeta(html.slice(0, 250000));
		cache.set(url, meta);
		return meta;
	} catch {
		const meta = {};
		cache.set(url, meta);
		return meta;
	} finally {
		clearTimeout(timeoutId);
	}
}

function buildCard(url, meta) {
	let hostname = url;
	try {
		hostname = new URL(url).hostname;
	} catch {
		// keep fallback hostname
	}

	const title = meta.title || url;
	const description = meta.description || "";
	const favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(
		hostname,
	)}&sz=64`;

	return h(
		"a",
		{
			class: "card-url no-styling",
			href: url,
			target: "_blank",
			rel: "noreferrer",
		},
		[
			h("div", { class: "url-title" }, title),
			description ? h("div", { class: "url-desc" }, description) : null,
			h("div", { class: "url-meta" }, [
				h("img", {
					class: "url-favicon",
					src: favicon,
					alt: "",
					loading: "lazy",
				}),
				h("span", { class: "url-domain" }, hostname),
			]),
		].filter(Boolean),
	);
}

export function rehypeUrlCard() {
	return async (tree) => {
		const targets = [];
		visit(tree, "element", (node, index, parent) => {
			if (!parent || typeof index !== "number") return;
			if (node.tagName !== "url-card") return;
			targets.push({ node, index, parent });
		});

		for (const { node, index, parent } of targets) {
			const props = node.properties || {};
			const url = props.url || props.href;
			if (typeof url !== "string" || url.length === 0) {
				parent.children[index] = h(
					"div",
					{ class: "hidden" },
					'Invalid url. ("url" attributte is required for ::url-card)',
				);
				continue;
			}
			const meta = await fetchMeta(url);
			parent.children[index] = buildCard(url, meta);
		}
	};
}
