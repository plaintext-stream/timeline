import type { Post } from './types';
import { schema } from './schema';

let migrated = false;

export async function migrate(db: D1Database): Promise<void> {
	if (migrated) return;
	await db.exec(schema);
	migrated = true;
}

export function generateId(): string {
	const bytes = new Uint8Array(8);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function createPost(
	db: D1Database,
	id: string,
	content: string,
	now: number,
): Promise<Post> {
	await db
		.prepare('INSERT INTO posts (id, content, created_at, updated_at) VALUES (?, ?, ?, ?)')
		.bind(id, content, now, now)
		.run();
	return { id, content, created_at: now, updated_at: now };
}

export async function getPost(db: D1Database, id: string): Promise<Post | null> {
	return (await db.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first<Post>()) ?? null;
}

export async function updatePost(
	db: D1Database,
	id: string,
	content: string,
	now: number,
): Promise<Post | null> {
	const res = await db
		.prepare('UPDATE posts SET content = ?, updated_at = ? WHERE id = ?')
		.bind(content, now, id)
		.run();
	if (res.meta.changes === 0) return null;
	return getPost(db, id);
}

export async function deletePost(db: D1Database, id: string): Promise<boolean> {
	const res = await db.prepare('DELETE FROM posts WHERE id = ?').bind(id).run();
	return res.meta.changes > 0;
}

export interface ListPage {
	posts: Post[];
	nextCursor: string | null;
}

export async function listPosts(
	db: D1Database,
	limit: number,
	cursor: string | null,
): Promise<ListPage> {
	if (!cursor) {
		const posts = await db
			.prepare('SELECT * FROM posts ORDER BY created_at DESC, id DESC LIMIT ?')
			.bind(limit + 1)
			.all<Post>()
			.then((r) => r.results);
		return paginate(posts, limit);
	}
	const [tsStr, idStr] = cursor.split('|');
	const ts = Number(tsStr);
	if (!Number.isFinite(ts) || !idStr) {
		return { posts: [], nextCursor: null };
	}
	const posts = await db
		.prepare(
			'SELECT * FROM posts WHERE (created_at = ? AND id < ?) OR created_at < ? ORDER BY created_at DESC, id DESC LIMIT ?',
		)
		.bind(ts, idStr, ts, limit + 1)
		.all<Post>()
		.then((r) => r.results);
	return paginate(posts, limit);
}

function paginate(posts: Post[], limit: number): ListPage {
	if (posts.length <= limit) {
		return { posts, nextCursor: null };
	}
	const trimmed = posts.slice(0, limit);
	const last = trimmed[trimmed.length - 1];
	return { posts: trimmed, nextCursor: `${last.created_at}|${last.id}` };
}
