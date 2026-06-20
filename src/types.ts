export interface Post {
	id: string;
	content: string;
	created_at: number;
	updated_at: number;
}

export interface PostSummary {
	id: string;
	created_at: number;
	updated_at: number;
}

export const PAGE_SIZE = 20;

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json', ...headers },
	});
}

export function error(status: number, message: string): Response {
	return json({ error: message }, status);
}
