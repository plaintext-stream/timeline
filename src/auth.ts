export function authorize(request: Request, env: Env): boolean {
	const header = request.headers.get('Authorization') ?? '';
	const match = /^Bearer\s+(.+)$/i.exec(header);
	if (!match) return false;
	return timingSafeEqual(match[1], env.TIMELINE_ROOT_TOKEN);
}

function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let result = 0;
	for (let i = 0; i < a.length; i++) {
		result |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return result === 0;
}
