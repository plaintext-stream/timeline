import { error } from './types';
import { migrate } from './db';
import {
	handleList,
	handleGet,
	handleQuote,
	handleCreate,
	handleUpdate,
	handleDelete,
} from './routes/posts';
import { handleUpload, handleServe } from './routes/images';
import { handleSitemap, handleRSS } from './routes/feeds';

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		await migrate(env.TIMELINE_DB);
		const url = new URL(request.url);
		const path = url.pathname;
		const method = request.method;

		if (path === '/api/posts') {
			if (method === 'GET') return handleList(request, env);
			if (method === 'POST') return handleCreate(request, env);
			return error(405, 'Method not allowed');
		}

		const postMatch = /^\/api\/posts\/([a-f0-9]{16})$/.exec(path);
		if (postMatch) {
			const id = postMatch[1];
			if (method === 'GET') return handleGet(id, env);
			if (method === 'PUT') return handleUpdate(id, request, env);
			if (method === 'DELETE') return handleDelete(id, request, env);
			return error(405, 'Method not allowed');
		}

		const quoteMatch = /^\/api\/quote\/([a-f0-9]{16})$/.exec(path);
		if (quoteMatch && method === 'GET') {
			return handleQuote(quoteMatch[1], env);
		}

		if (path === '/api/upload' && method === 'POST') {
			return handleUpload(request, env);
		}

		const imgMatch = /^\/i\/(.+)$/.exec(path);
		if (imgMatch && method === 'GET') {
			return handleServe(imgMatch[1], env, request);
		}

		if (path === '/sitemap.xml' && method === 'GET') {
			return handleSitemap(request, env);
		}

		if (path === '/rss.xml' && method === 'GET') {
			return handleRSS(request, env);
		}

		if (path.startsWith('/api/')) {
			return error(404, 'Not found');
		}

		return env.ASSETS.fetch(request);
	},
};
