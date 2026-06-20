const IMG_PATTERN = /\/i\/([a-f0-9-]+\.webp)/gi;

export function extractImages(content: string): string[] {
	const set = new Set<string>();
	for (const m of content.matchAll(IMG_PATTERN)) {
		set.add(m[1]);
	}
	return [...set];
}

export function r2Key(name: string): string {
	return `img/${name}`;
}

export function imageUrl(name: string): string {
	return `/i/${name}`;
}

export function diffImages(oldContent: string, newContent: string): string[] {
	const oldSet = new Set(extractImages(oldContent));
	const newSet = new Set(extractImages(newContent));
	return [...oldSet].filter((n) => !newSet.has(n));
}
