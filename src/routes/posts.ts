import type { Post } from '../types';
import { json, error, PAGE_SIZE } from '../types';
import { authorize } from '../auth';
import { migrate, generateId, createPost, getPost, updatePost, deletePost, listPosts } from '../db';
import { diffImages, extractImages, r2Key } from '../images';

export async function handleList(request: Request, env: Env): Promise<Response> {
	await migrate(env.TIMELINE_DB);
	const url = new URL(request.url);
	const limit = clampInt(url.searchParams.get('limit'), PAGE_SIZE, 1, 50);
	const cursor = url.searchParams.get('cursor');
	const page = await listPosts(env.TIMELINE_DB, limit, cursor);
	return json(page);
}

export async function handleGet(id: string, env: Env): Promise<Response> {
	await migrate(env.TIMELINE_DB);
	const post = await getPost(env.TIMELINE_DB, id);
	if (!post) return error(404, 'Post not found');
	return json(post);
}

export async function handleQuote(id: string, env: Env): Promise<Response> {
	await migrate(env.TIMELINE_DB);
	const post = await getPost(env.TIMELINE_DB, id);
	if (!post) return error(404, 'Post not found');
	return json({ id: post.id, preview: plainPreview(post.content, 100) });
}

export async function handleCreate(request: Request, env: Env): Promise<Response> {
	if (!authorize(request, env)) return error(401, 'Unauthorized');
	await migrate(env.TIMELINE_DB);
	const body = await parseBody(request);
	if (!body) return error(400, 'Invalid body');
	const now = Date.now();
	const id = generateId();
	const post = await createPost(env.TIMELINE_DB, id, body.content, now);
	return json(post, 201);
}

export async function handleUpdate(id: string, request: Request, env: Env): Promise<Response> {
	if (!authorize(request, env)) return error(401, 'Unauthorized');
	await migrate(env.TIMELINE_DB);
	const body = await parseBody(request);
	if (!body) return error(400, 'Invalid body');
	const existing = await getPost(env.TIMELINE_DB, id);
	if (!existing) return error(404, 'Post not found');
	const now = Date.now();
	const updated = await updatePost(env.TIMELINE_DB, id, body.content, now);
	if (!updated) return error(404, 'Post not found');
	await deleteOrphans(env, existing.content, body.content);
	return json(updated);
}

export async function handleDelete(id: string, request: Request, env: Env): Promise<Response> {
	if (!authorize(request, env)) return error(401, 'Unauthorized');
	await migrate(env.TIMELINE_DB);
	const existing = await getPost(env.TIMELINE_DB, id);
	if (!existing) return error(404, 'Post not found');
	await deletePost(env.TIMELINE_DB, id);
	await Promise.all(extractImages(existing.content).map((n) => env.TIMELINE_OS.delete(r2Key(n))));
	return json({ ok: true });
}

async function deleteOrphans(env: Env, oldContent: string, newContent: string): Promise<void> {
	const removed = diffImages(oldContent, newContent);
	await Promise.all(removed.map((n) => env.TIMELINE_OS.delete(r2Key(n))));
}

async function parseBody(request: Request): Promise<{ content: string } | null> {
	let data: unknown;
	try {
		data = await request.json();
	} catch {
		return null;
	}
	if (typeof data !== 'object' || data === null) return null;
	const content = (data as { content?: unknown }).content;
	if (typeof content !== 'string' || content.length === 0) return null;
	return { content };
}

function clampInt(raw: string | null, def: number, min: number, max: number): number {
	if (raw === null) return def;
	const n = Number.parseInt(raw, 10);
	if (!Number.isFinite(n)) return def;
	return Math.max(min, Math.min(max, n));
}

function plainPreview(content: string, max: number): string {
	const stripped = content
		.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
		.replace(/\[\[([^\]]*)\]\]\([^)]*\)/g, '$1')
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/[#>*_~`-]/g, ' ')
		.replace(/{{[^}]*}}/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	return stripped.length > max ? stripped.slice(0, max) + '…' : stripped;
}

export type { Post };
