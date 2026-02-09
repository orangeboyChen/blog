import { h } from "hastscript";
import { visit } from "unist-util-visit";
import fs from "node:fs";
import path from "node:path";

const cache = new Map();
const cachePath = path.resolve(".cache", "url-card-cache.json");

function loadCacheFromDisk() {
	try {
		const raw = fs.readFileSync(cachePath, "utf-8");
		const data = JSON.parse(raw);
		for (const [k, v] of Object.entries(data)) {
			cache.set(k, v);
		}
	} catch {
		// ignore missing or invalid cache file
	}
}

function saveCacheToDisk() {
	try {
		fs.mkdirSync(path.dirname(cachePath), { recursive: true });
		const obj = Object.fromEntries(cache.entries());
		fs.writeFileSync(cachePath, JSON.stringify(obj, null, 2), "utf-8");
	} catch {
		// ignore write errors
	}
}

loadCacheFromDisk();

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

	const metaTagRe = /<meta\s+[^>]*>/gi;
	const attrRe = /([a-zA-Z:_-]+)\s*=\s*(\"[^\"]*\"|'[^']*'|[^\s\"'>]+)/g;

	const metaMap = {};
	let tag;
	while ((tag = metaTagRe.exec(html))) {
		const attrs = {};
		let m;
		while ((m = attrRe.exec(tag[0]))) {
			const key = m[1].toLowerCase();
			let value = m[2] || "";
			if (
				(value.startsWith("\"") && value.endsWith("\"")) ||
				(value.startsWith("'") && value.endsWith("'"))
			) {
				value = value.slice(1, -1);
			}
			attrs[key] = value;
		}
		const name = (attrs.name || attrs.property || "").toLowerCase();
		if (!name || !attrs.content) continue;
		metaMap[name] = decodeHtml(attrs.content.trim());
	}

	meta.ogTitle = metaMap["og:title"];
	meta.ogDescription = metaMap["og:description"];
	meta.ogImage = metaMap["og:image"];
	meta.twitterTitle = metaMap["twitter:title"];
	meta.twitterDescription = metaMap["twitter:description"];
	meta.description = metaMap["description"] || meta.description;

	return meta;
}

function stripTags(input) {
	return input
		.replace(new RegExp("<script[^>]*>[\\s\\S]*?</script>", "gi"), "")
		.replace(new RegExp("<style[^>]*>[\\s\\S]*?</style>", "gi"), "")
		.replace(/<[^>]+>/g, "")
		.replace(/\\s+/g, " ")
		.trim();
}

function extractWikipediaIntro(html) {
	const contentMatch = html.match(
		new RegExp(
			"<div[^>]+id=[\"']mw-content-text[\"'][^>]*>([\\s\\S]*?)</div>",
			"i",
		),
	);
	if (!contentMatch) return "";
	const content = contentMatch[1];
	const paraMatch = content.match(
		new RegExp(
			"<div[^>]*class=[\"'][^\"']*mw-parser-output[^\"']*[\"'][^>]*>[\\s\\S]*?<p[^>]*>([\\s\\S]*?)</p>",
			"i",
		),
	);
	if (!paraMatch) return "";
	let text = stripTags(paraMatch[1]);
	// remove citation markers like [1]
	text = text.replace(/\\s*\\[[0-9]+\\]/g, "");
	return text;
}

function normalizeMeta(url, meta) {
	const out = { ...meta };
	out.title = out.ogTitle || out.twitterTitle || out.title || "";
	out.description =
		out.ogDescription || out.twitterDescription || out.description || "";

	try {
		const u = new URL(url);
		const hostname = u.hostname.toLowerCase();
		if (hostname.endsWith("wikipedia.org")) {
			const m = u.pathname.match(/\/wiki\/(.+)$/);
			if (m) {
				const decoded = decodeURIComponent(m[1]).replace(/_/g, " ");
				if (decoded) out.title = decoded;
			}
		}
	} catch {
		// ignore url parse failure
	}

	return out;
}

async function fetchMeta(url) {
	if (cache.has(url)) {
		const normalized = normalizeMeta(url, cache.get(url));
		cache.set(url, normalized);
		saveCacheToDisk();
		return normalized;
	}
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
		const meta = normalizeMeta(url, extractMeta(html.slice(0, 250000)));
		try {
			const hostname = new URL(url).hostname.toLowerCase();
			if (hostname.endsWith("wikipedia.org")) {
				const intro = extractWikipediaIntro(html);
				if (intro) meta.description = intro;
			}
		} catch {
			// ignore url parse failure
		}
		cache.set(url, meta);
		saveCacheToDisk();
		return meta;
	} catch {
		const meta = {};
		cache.set(url, meta);
		saveCacheToDisk();
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

	const title = meta.title || meta.ogTitle || url;
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
