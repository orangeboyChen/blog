import { h } from "hastscript";

/**
 * Creates an Email Card component.
 *
 * @param {Object} properties - The properties of the component.
 * @param {string} properties.address - Email address.
 * @param {string} [properties.name] - Display name.
 * @param {string} [properties.avatar] - Avatar image URL.
 * @param {import('mdast').RootContent[]} children - The children elements of the component.
 * @returns {import('mdast').Parent} The created Email Card component.
 */
export function EmailCardComponent(properties, children) {
	if (Array.isArray(children) && children.length !== 0)
		return h("div", { class: "hidden" }, [
			'Invalid directive. ("email" directive must be leaf type "::email{address=\\"name@example.com\\"}")',
		]);

	const address = String(properties.address || "").trim();
	if (!address || !address.includes("@"))
		return h(
			"div",
			{ class: "hidden" },
			'Invalid email. ("address" attribute is required and must be valid)',
		);

	const name = String(properties.name || address).trim();
	const avatar = String(properties.avatar || "").trim();

	return h(
		"a",
		{
			class: "card-email no-styling",
			href: `mailto:${address}`,
		},
		[
			h("div", { class: "email-left" }, [
				avatar
					? h("img", {
							class: "email-avatar",
							src: avatar,
							alt: "",
							loading: "lazy",
						})
					: h("div", { class: "email-avatar placeholder" }),
			]),
			h("div", { class: "email-body" }, [
				h("div", { class: "email-name" }, name),
				h("div", { class: "email-address" }, address),
			]),
			h("div", { class: "email-icon", "aria-hidden": "true" }, [
				h("i", { class: "fa-solid fa-envelope" }),
			]),
		],
	);
}
