import { json, error } from '../types';
import { authorize } from '../auth';
import { r2Key } from '../images';

const MAX_IMAGE = 12 * 1024 * 1024;

export async function handleUpload(request: Request, env: Env): Promise<Response> {
	if (!authorize(request, env)) return error(401, 'Unauthorized');
	const contentType = request.headers.get('Content-Type') ?? '';
	if (!contentType.startsWith('multipart/form-data')) {
		return error(400, 'Expected multipart/form-data');
	}
	const form = await request.formData();
	const file = form.get('file') as unknown as File | string | null;
	if (!file || typeof file === 'string') {
		return error(400, 'Missing "file" field');
	}
	if (file.size > MAX_IMAGE) {
		return error(413, 'Image too large (max 12MB)');
	}
	const name = `${crypto.randomUUID()}.webp`;
	await env.TIMELINE_OS.put(r2Key(name), await file.arrayBuffer(), {
		httpMetadata: { contentType: 'image/webp' },
	});
	return json({ url: `/i/${name}` });
}

export async function handleServe(name: string, env: Env, request: Request): Promise<Response> {
	if (!/^([a-f0-9-]+)\.webp$/i.test(name)) {
		return error(404, 'Not found');
	}
	const ifNoneMatch = request.headers.get('If-None-Match');
	const obj = await env.TIMELINE_OS.get(r2Key(name), {
		onlyIf: ifNoneMatch ? { etagDoesNotMatch: stripEtag(ifNoneMatch) } : undefined,
	});
	if (!obj) {
		return error(404, 'Not found');
	}
	const headers = new Headers({
		'Content-Type': 'image/webp',
		'Cache-Control': 'public, max-age=31536000, immutable',
		ETag: obj.httpEtag,
	});
	if (obj.body === undefined || obj.bodyUsed) {
		return new Response(null, { status: 304, headers });
	}
	obj.writeHttpMetadata(headers);
	headers.set('Content-Length', String(obj.size));
	return new Response(obj.body, { headers });
}

function stripEtag(e: string): string {
	return e.replace(/"/g, '').replace(/^W\//, '');
}
