import type { TimelineEntry } from "../content/projects";

type GitHubRepository = {
	topics?: string[];
};

function getRepositoryPath(url: string) {
	const match = url.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/?$/);
	return match?.[1];
}

async function getTopics(repositoryPath: string) {
	const token = import.meta.env.GITHUB_TOKEN;
	try {
		const response = await fetch(`https://api.github.com/repos/${repositoryPath}`, {
			headers: {
				Accept: "application/vnd.github+json",
				"X-GitHub-Api-Version": "2022-11-28",
				...(token ? { Authorization: `Bearer ${token}` } : {}),
			},
		});

		if (!response.ok) return [];

		const repository = await response.json() as GitHubRepository;
		return repository.topics ?? [];
	} catch {
		return [];
	}
}

export async function resolveProjectTimeline(entries: TimelineEntry[]) {
	return Promise.all(entries.map(async (entry) => ({
		...entry,
		sections: await Promise.all(entry.sections.map(async (section) => ({
			...section,
			projects: await Promise.all(section.projects.map(async (project) => {
			const repositoryPath = getRepositoryPath(project.url);
			const tech = project.tech?.filter(Boolean);
			return {
				...project,
				tech: tech?.length || !repositoryPath ? tech ?? [] : await getTopics(repositoryPath),
			};
			})),
		}))),
	})));
}
