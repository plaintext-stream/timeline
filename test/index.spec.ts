import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';

const TOKEN = 'test-token';
const BASE = 'http://test.local';
const auth = (extra: Record<string, string> = {}) => ({
	Authorization: `Bearer ${TOKEN}`,
	...extra,
});

async function req(path: string, init: RequestInit = {}): Promise<Response> {
	return SELF.fetch(`${BASE}${path}`, init);
}

async function status(path: string, init: RequestInit = {}): Promise<number> {
	const res = await req(path, init);
	await res.arrayBuffer();
	return res.status;
}

async function createPost(content: string): Promise<{ id: string }> {
	const res = await req('/api/posts', {
		method: 'POST',
		headers: { ...auth(), 'Content-Type': 'application/json' },
		body: JSON.stringify({ content }),
	});
	expect(res.status).toBe(201);
	return res.json();
}

async function uploadImage(): Promise<string> {
	const res = await req('/api/upload', {
		method: 'POST',
		headers: auth(),
		body: imageFormData(),
	});
	expect(res.status).toBe(200);
	const data = await res.json();
	return data.url;
}

function imageFormData(): FormData {
	const fd = new FormData();
	fd.append('file', new File([new Uint8Array([0, 1, 2, 3])], 'x.webp', { type: 'image/webp' }));
	return fd;
}

describe('auth', () => {
	it('rejects create without token', async () => {
		const res = await req('/api/posts', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ content: 'x' }),
		});
		expect(res.status).toBe(401);
		await res.arrayBuffer();
	});

	it('rejects create with wrong token', async () => {
		const res = await req('/api/posts', {
			method: 'POST',
			headers: { Authorization: 'Bearer wrong', 'Content-Type': 'application/json' },
			body: JSON.stringify({ content: 'x' }),
		});
		expect(res.status).toBe(401);
		await res.arrayBuffer();
	});

	it('rejects update without token', async () => {
		const post = await createPost('hi');
		const res = await req(`/api/posts/${post.id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ content: 'hi2' }),
		});
		expect(res.status).toBe(401);
		await res.arrayBuffer();
	});

	it('rejects delete without token', async () => {
		const post = await createPost('hi');
		const res = await req(`/api/posts/${post.id}`, { method: 'DELETE' });
		expect(res.status).toBe(401);
		await res.arrayBuffer();
	});

	it('rejects upload without token', async () => {
		const res = await req('/api/upload', { method: 'POST', body: imageFormData() });
		expect(res.status).toBe(401);
		await res.arrayBuffer();
	});
});

describe('posts CRUD', () => {
	it('creates and fetches a post', async () => {
		const post = await createPost('Hello **world**');
		expect(post.id).toMatch(/^[a-f0-9]{16}$/);
		expect(post.content).toBe('Hello **world**');

		const got = await req(`/api/posts/${post.id}`);
		expect(got.status).toBe(200);
		const body = await got.json();
		expect(body.content).toBe('Hello **world**');
	});

	it('returns 404 for unknown post', async () => {
		expect(await status('/api/posts/0000000000000000')).toBe(404);
	});

	it('lists posts newest-first', async () => {
		const a = await createPost('first');
		await sleep(5);
		const b = await createPost('second');
		const res = await req('/api/posts');
		const page = await res.json();
		expect(page.posts[0].id).toBe(b.id);
		expect(page.posts[1].id).toBe(a.id);
	});

	it('paginates with cursor', async () => {
		for (let i = 0; i < 5; i++) {
			await createPost(`p${i}`);
			await sleep(2);
		}
		const first = await req('/api/posts?limit=2').then((r) => r.json());
		expect(first.posts.length).toBe(2);
		expect(first.nextCursor).not.toBeNull();
		const second = await req(`/api/posts?limit=2&cursor=${first.nextCursor}`).then((r) =>
			r.json(),
		);
		expect(second.posts.length).toBe(2);
		expect(second.posts[0].id).not.toBe(first.posts[0].id);
	});

	it('updates a post', async () => {
		const post = await createPost('original');
		const res = await req(`/api/posts/${post.id}`, {
			method: 'PUT',
			headers: { ...auth(), 'Content-Type': 'application/json' },
			body: JSON.stringify({ content: 'edited' }),
		});
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.content).toBe('edited');
		expect(body.updated_at).toBeGreaterThanOrEqual(body.created_at);
	});

	it('deletes a post', async () => {
		const post = await createPost('bye');
		const res = await req(`/api/posts/${post.id}`, { method: 'DELETE', headers: auth() });
		expect(res.status).toBe(200);
		await res.arrayBuffer();
		expect(await status(`/api/posts/${post.id}`)).toBe(404);
	});

	it('rejects invalid body', async () => {
		const res = await req('/api/posts', {
			method: 'POST',
			headers: { ...auth(), 'Content-Type': 'application/json' },
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(400);
		await res.arrayBuffer();
	});
});

describe('quote', () => {
	it('returns a preview of a post', async () => {
		const post = await createPost('This is a **long** post about things and stuff and more.');
		const res = await req(`/api/quote/${post.id}`);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.id).toBe(post.id);
		expect(typeof body.preview).toBe('string');
	});

	it('returns 404 for unknown', async () => {
		expect(await status('/api/quote/0000000000000000')).toBe(404);
	});
});

describe('images', () => {
	it('uploads and serves an image', async () => {
		const url = await uploadImage();
		expect(url).toMatch(/^\/i\/[a-f0-9-]+\.webp$/);
		const res = await req(url);
		expect(res.status).toBe(200);
		expect(res.headers.get('Content-Type')).toBe('image/webp');
		expect(res.headers.get('Cache-Control')).toContain('immutable');
		await res.arrayBuffer();
	});

	it('returns 404 for missing image', async () => {
		expect(await status('/i/nonexistent.webp')).toBe(404);
	});

	it('deletes orphaned images on edit', async () => {
		const url = await uploadImage();
		const post = await createPost(`![img](${url})`);
		expect(await status(url)).toBe(200);

		await req(`/api/posts/${post.id}`, {
			method: 'PUT',
			headers: { ...auth(), 'Content-Type': 'application/json' },
			body: JSON.stringify({ content: 'no image now' }),
		});

		expect(await status(url)).toBe(404);
	});

	it('deletes images on post delete', async () => {
		const url = await uploadImage();
		const post = await createPost(`![img](${url})`);
		expect(await status(url)).toBe(200);

		await req(`/api/posts/${post.id}`, { method: 'DELETE', headers: auth() });

		expect(await status(url)).toBe(404);
	});
});

describe('routing', () => {
	it('serves the SPA for /manage', async () => {
		const res = await req('/manage');
		expect(res.status).toBe(200);
		const html = await res.text();
		expect(html).toContain('<!doctype html>');
	});

	it('serves the SPA for /p/<id>', async () => {
		expect(await status('/p/0000000000000000')).toBe(200);
	});

	it('returns 404 for unknown /api routes', async () => {
		expect(await status('/api/unknown')).toBe(404);
	});
});

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}
