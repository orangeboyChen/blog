import Giscus from "@giscus/react";
import * as React from "react";
import I18nKey from "@/i18n/i18nKey";
import { i18n } from "@/i18n/translation";

const id = "inject-comments";

function getGiscusTheme() {
	return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

const Comments = () => {
	const [mounted, setMounted] = React.useState(false);

	const [theme, setTheme] = React.useState("light");

	React.useEffect(() => {
		setTheme(getGiscusTheme());
		const observer = new MutationObserver(() => {
			setTheme(getGiscusTheme());
		});
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["class"],
		});

		// 取消监听
		return () => {
			observer.disconnect();
		};
	}, []);

	React.useEffect(() => {
		setMounted(true);
	}, []);

	return (
		<div id={id} className="card-base mb-4 w-full p-6 md:p-9">
			<div className="relative mb-4 text-lg text-neutral-900 font-bold transition before:absolute before:top-[5.5px] before:left-[-1.125rem] before:h-4 before:w-1 before:rounded-md before:bg-[var(--primary)] dark:text-neutral-100">
				{i18n(I18nKey.comments)}
			</div>
			{mounted ? (
				<Giscus
					id={id}
					repo="orangeboyChen/blog"
					repoId="R_kgDORMJ3yQ"
					category="Comments"
					categoryId="DIC_kwDORMJ3yc4C2GZo"
					mapping="title"
					reactionsEnabled="1"
					emitMetadata="0"
					inputPosition="top"
					lang="zh-CN"
					loading="lazy"
					theme={theme}
				/>
			) : null}
		</div>
	);
};

export default Comments;
