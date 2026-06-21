import type { Post } from '../types';

const BASE_URL = 'https://timeline.plaintext.stream';
const SITEMAP_LIMIT = 50000;
const RSS_LIMIT = 20;

function escapeXml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

function toRFC822(ts: number): string {
	return new Date(ts).toUTCString();
}

function toISODate(ts: number): string {
	return new Date(ts).toISOString().split('T')[0];
}

function extractTitle(content: string, fallbackDate: string): string {
	const heading = /^#\s+(.+)/m.exec(content);
	if (heading) return heading[1].trim();
	return fallbackDate;
}

function stripForDescription(content: string): string {
	const text = content
		.replace(/\{\{.*?\}\}/g, '')
		.replace(/!\[.*?\]\(.*?\)/g, '')
		.replace(/\[([^\]]*)\]\(.*?\)/g, '$1')
		.replace(/[#*_~>`]/g, '')
		.replace(/\n+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	return text.length > 100 ? text.slice(0, 97) + '...' : text;
}

export async function handleSitemap(request: Request, env: Env): Promise<Response> {
	const posts = await env.TIMELINE_DB
		.prepare('SELECT id, updated_at FROM posts ORDER BY created_at DESC LIMIT ?')
		.bind(SITEMAP_LIMIT)
		.all<Pick<Post, 'id' | 'updated_at'>>()
		.then((r) => r.results);

	const urls = [
		`  <url><loc>${escapeXml(BASE_URL + '/')}</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
	];

	for (const post of posts) {
		const lastmod = toISODate(post.updated_at);
		urls.push(
			`  <url><loc>${escapeXml(BASE_URL + '/p/' + post.id)}</loc><lastmod>${lastmod}</lastmod></url>`,
		);
	}

	const xml =
		'<?xml version="1.0" encoding="UTF-8"?>\n' +
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
		urls.join('\n') +
		'\n</urlset>';

	return new Response(xml, {
		status: 200,
		headers: { 'Content-Type': 'application/xml; charset=utf-8' },
	});
}

export async function handleRSS(request: Request, env: Env): Promise<Response> {
	const posts = await env.TIMELINE_DB
		.prepare('SELECT * FROM posts ORDER BY created_at DESC LIMIT ?')
		.bind(RSS_LIMIT)
		.all<Post>()
		.then((r) => r.results);

	const lastBuildDate = posts.length > 0 ? toRFC822(posts[0].created_at) : toRFC822(Date.now());

	const items: string[] = [];
	for (const post of posts) {
		const title = escapeXml(extractTitle(post.content, toRFC822(post.created_at)));
		const link = escapeXml(BASE_URL + '/p/' + post.id);
		const pubDate = toRFC822(post.created_at);
		const description = escapeXml(stripForDescription(post.content));
		items.push(
			`    <item>
      <title>${title}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${description}</description>
    </item>`,
		);
	}

	const xml =
		'<?xml version="1.0" encoding="UTF-8"?>\n' +
		'<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n' +
		'  <channel>\n' +
		`    <title>词元鹦鹉窝</title>\n` +
		`    <link>${escapeXml(BASE_URL)}/</link>\n` +
		`    <description>词元和他的鹦鹉，反复说着没有人听的话</description>\n` +
		`    <atom:link href="${escapeXml(BASE_URL)}/rss.xml" rel="self" type="application/rss+xml"/>\n` +
		`    <lastBuildDate>${lastBuildDate}</lastBuildDate>\n` +
		(items.length > 0 ? items.join('\n') + '\n' : '') +
		'  </channel>\n' +
		'</rss>';

	return new Response(xml, {
		status: 200,
		headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
	});
}
