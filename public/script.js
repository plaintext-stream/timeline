(() => {
	'use strict';

	const API = '/api';
	let token = '';

	/* ---------- router ---------- */

	const app = document.getElementById('app');

	async function route() {
		const path = location.pathname;
		app.innerHTML = '';
		try {
			if (path === '/' || path === '') {
				await renderHome();
			} else {
				const postMatch = /^\/p\/([a-f0-9]{16})$/.exec(path);
				if (postMatch) {
					await renderPost(postMatch[1]);
				} else if (path === '/manage') {
					await renderManage();
				} else {
					app.innerHTML = '<div class="empty">Not found.</div>';
				}
			}
		} catch (e) {
			console.error(e);
			app.innerHTML = '<div class="error-msg">Something went wrong.</div>';
		}
	}

	window.addEventListener('popstate', route);
	document.addEventListener('click', (e) => {
		const a = e.target.closest('a');
		if (!a) return;
		const href = a.getAttribute('href');
		if (!href || href.startsWith('http') || a.target) return;
		e.preventDefault();
		history.pushState(null, '', href);
		route();
	});

	/* ---------- api ---------- */

	async function api(path, opts = {}) {
		const headers = opts.headers ?? {};
		if (token) headers.Authorization = `Bearer ${token}`;
		const res = await fetch(`${API}${path}`, { ...opts, headers });
		if (!res.ok) {
			const msg = await res.json().catch(() => ({}));
			throw new Error(msg.error || `HTTP ${res.status}`);
		}
		return res.json();
	}

	/* ---------- markdown + shortcodes ---------- */

	const SHORTCODES = {
		sensitive: /\{\{\s*sensitive\s*\}\}/i,
		post: /\{\{\s*post:\s*([a-f0-9]{16})\s*\}\}/gi,
		yt: /\{\{\s*yt:\s*([\w-]{6,})\s*\}\}/gi,
		bl: /\{\{\s*bl:\s*(BV[\w]{6,})\s*\}\}/gi,
		x: /\{\{\s*x:\s*(\d+)\s*\}\}/gi,
	};

	function processShortcodes(content) {
		let sensitive = false;
		let body = content;
		if (SHORTCODES.sensitive.test(body)) {
			sensitive = true;
			body = body.replace(SHORTCODES.sensitive, '');
		}
		body = body
			.replace(SHORTCODES.yt, (_, id) =>
				embed(`https://www.youtube.com/embed/${id}`, 'video'),
			)
			.replace(SHORTCODES.bl, (_, id) =>
				embed(
					`https://player.bilibili.com/player.html?bvid=${id}&autoplay=0&high_quality=1&danmaku=0`,
					'video',
				),
			)
			.replace(SHORTCODES.x, (_, id) => `<div class="x-slot" data-tweet="${id}"></div>`)
			.replace(
				SHORTCODES.post,
				(_, id) => `<div class="quote-slot" data-quote="${id}"></div>`,
			);
		return { body, sensitive };
	}

	function embed(src, type) {
		return `\n\n<iframe class="embed embed-${type}" src="${src}" allowfullscreen frameborder="0" loading="lazy"></iframe>\n\n`;
	}

	const PURIFY_CONFIG = {
		ADD_TAGS: ['iframe'],
		ADD_ATTR: [
			'src',
			'allowfullscreen',
			'frameborder',
			'loading',
			'data-quote',
			'data-tweet',
			'class',
		],
		ALLOW_DATA_ATTR: true,
	};

	function renderMarkdown(content) {
		const { body, sensitive } = processShortcodes(content);
		const raw = marked.parse(body, { breaks: true });
		const clean = DOMPurify.sanitize(raw, PURIFY_CONFIG);
		return { html: clean, sensitive };
	}

	async function fillQuotes(container) {
		const slots = container.querySelectorAll('[data-quote]');
		await Promise.all(
			[...slots].map(async (slot) => {
				const id = slot.getAttribute('data-quote');
				try {
					const q = await api(`/quote/${id}`);
					const a = document.createElement('a');
					a.className = 'quote';
					a.href = `/p/${id}`;
					a.innerHTML = `<div class="quote-id">post / ${id}</div><div class="quote-preview"></div>`;
					a.querySelector('.quote-preview').textContent = q.preview;
					slot.replaceWith(a);
				} catch {
					slot.textContent = `[post ${id} not found]`;
				}
			}),
		);
	}

	/* ---------- X (Twitter) widgets ---------- */

	let twttrPromise = null;
	function loadTwttr() {
		if (twttrPromise) return twttrPromise;
		twttrPromise = new Promise((resolve, reject) => {
			if (window.twttr && window.twttr.widgets) return resolve(window.twttr);
			const s = document.createElement('script');
			s.src = 'https://platform.twitter.com/widgets.js';
			s.async = true;
			s.charset = 'utf-8';
			s.onload = () => {
				if (window.twttr && window.twttr.ready) {
					window.twttr.ready(() => resolve(window.twttr));
				} else {
					reject(new Error('twttr unavailable'));
				}
			};
			s.onerror = () => reject(new Error('failed to load widgets.js'));
			document.head.appendChild(s);
		});
		return twttrPromise;
	}

	function isDark() {
		return window.matchMedia('(prefers-color-scheme: dark)').matches;
	}

	function tweetFallback(slot, id, label) {
		const a = document.createElement('a');
		a.className = 'x-fallback';
		a.href = `https://x.com/i/web/status/${id}`;
		a.target = '_blank';
		a.rel = 'noopener';
		a.textContent = label;
		slot.replaceWith(a);
	}

	async function fillTweets(container) {
		const slots = container.querySelectorAll('[data-tweet]');
		if (slots.length === 0) return;
		let twttr;
		try {
			twttr = await loadTwttr();
		} catch {
			slots.forEach((slot) =>
				tweetFallback(
					slot,
					slot.getAttribute('data-tweet'),
					`x.com / ${slot.getAttribute('data-tweet')}`,
				),
			);
			return;
		}
		for (const slot of [...slots]) {
			if (!slot.isConnected) continue;
			const id = slot.getAttribute('data-tweet');
			try {
				const node = await twttr.widgets.createTweet(id, slot, {
					theme: isDark() ? 'dark' : 'light',
					dnt: true,
				});
				if (!node) tweetFallback(slot, id, `[tweet ${id} unavailable]`);
			} catch {
				tweetFallback(slot, id, `[tweet ${id} failed]`);
			}
		}
	}

	/* ---------- post element ---------- */

	function timeLabel(ts) {
		const d = new Date(ts);
		const pad = (n) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
			d.getHours(),
		)}:${pad(d.getMinutes())}`;
	}

	function buildPost(post, { single = false } = {}) {
		const el = document.createElement('article');
		el.className = 'post' + (single ? ' single' : '');

		const meta = document.createElement('div');
		meta.className = 'post-meta';
		if (single) {
			meta.innerHTML = `<a href="/">&lt; back</a>`;
			meta.innerHTML += post.updated_at !== post.created_at
				? `<span>${timeLabel(post.created_at)} (edited ${timeLabel(post.updated_at)})</span>`
				: `<span>${timeLabel(post.created_at)}</span>`;
		} else {
			if (post.updated_at !== post.created_at) {
				meta.innerHTML = `<a href="/p/${post.id}">${timeLabel(post.created_at)} (edited ${timeLabel(post.updated_at)})</a>`;
			} else {
				meta.innerHTML = `<a href="/p/${post.id}">${timeLabel(post.created_at)}</a>`;
			}
		}
		// const link = single
		// 	? `<a href="/">← back</a>`
		// 	: `<a href="/p/${post.id}">${timeLabel(post.created_at)}</a>`;
		// meta.innerHTML = link;
		// if (post.updated_at !== post.created_at) {
		// 	meta.innerHTML += ` <span>(edited ${timeLabel(post.updated_at)})</span>`;
		// }
		el.appendChild(meta);

		const { html, sensitive } = renderMarkdown(post.content);
		const content = document.createElement('div');
		content.className = 'content';
		const inner = document.createElement('div');
		inner.className = 'content-inner';
		inner.innerHTML = html;
		if (sensitive) {
			content.classList.add('sensitive');
			content.addEventListener('click', () => content.classList.add('revealed'));
		}
		content.appendChild(inner);
		el.appendChild(content);

		fillQuotes(content);
		fillTweets(content);
		return el;
	}

	/* ---------- home ---------- */

	async function renderHome() {
		app.innerHTML = '<div class="loading" id="sentinel">加载中……</div>';
		const list = document.createElement('div');
		app.innerHTML = '';
		app.appendChild(list);
		const sentinel = document.createElement('div');
		sentinel.className = 'loading';
		app.appendChild(sentinel);

		let cursor = null;
		let done = false;
		let loading = false;

		async function load() {
			if (done || loading) return;
			loading = true;
			sentinel.textContent = '加载中……';
			try {
				const page = await api(`/posts?limit=20${cursor ? `&cursor=${cursor}` : ''}`);
				for (const p of page.posts) list.appendChild(buildPost(p));
				cursor = page.nextCursor;
				if (!cursor) {
					done = true;
					sentinel.textContent = page.posts.length ? '' : 'No posts yet.';
				} else {
					sentinel.textContent = '';
				}
			} catch (e) {
				sentinel.textContent = `Error: ${e.message}`;
			}
			loading = false;
		}

		await load();
		const io = new IntersectionObserver((entries) => {
			if (entries.some((e) => e.isIntersecting)) load();
		});
		io.observe(sentinel);
	}

	/* ---------- single post ---------- */

	async function renderPost(id) {
		app.innerHTML = '<div class="loading">加载中……</div>';
		try {
			const post = await api(`/posts/${id}`);
			app.innerHTML = '';
			app.appendChild(buildPost(post, { single: true }));
		} catch (e) {
			app.innerHTML = `<div class="error-msg">${e.message}</div>`;
		}
	}

	/* ---------- manage ---------- */

	function toast(msg) {
		let t = document.querySelector('.toast');
		if (!t) {
			t = document.createElement('div');
			t.className = 'toast';
			document.body.appendChild(t);
		}
		t.textContent = msg;
		t.classList.add('show');
		setTimeout(() => t.classList.remove('show'), 2000);
	}

	async function renderManage() {
		app.innerHTML = '';
		const form = document.createElement('div');
		form.className = 'manage-form';
		form.innerHTML = `
			<div class="field">
				<label>密钥</label>
				<input type="password" id="tok" autocomplete="off" />
			</div>
			<div class="mode-tabs">
				<button data-mode="add" class="active">发布</button>
				<button data-mode="edit">编辑</button>
				<button data-mode="delete">删除</button>
			</div>
			<div class="field" id="id-field" hidden>
				<label>帖子 ID</label>
				<div class="edit-id-bar">
					<input type="text" id="pid" autocomplete="off" />
					<button id="load-btn" hidden>加载</button>
				</div>
			</div>
			<div id="editor">
				<div class="field">
					<label>内容</label>
					<textarea id="content"></textarea>
				</div>
				<div class="row">
					<input type="file" id="img" accept="image/*" multiple hidden />
					<button id="pick">上传图片</button>
				</div>
			</div>
			<div class="row" style="margin-top:16px">
				<button class="primary" id="submit">发布</button>
			</div>
		`;
		app.appendChild(form);

		let mode = 'add';
		const tok = form.querySelector('#tok');
		const pid = form.querySelector('#pid');
		const idField = form.querySelector('#id-field');
		const editor = form.querySelector('#editor');
		const submit = form.querySelector('#submit');
		const loadBtn = form.querySelector('#load-btn');
		const content = form.querySelector('#content');
		tok.addEventListener('input', () => (token = tok.value));

		function setMode(m) {
			mode = m;
			form.querySelectorAll('.mode-tabs button').forEach((b) =>
				b.classList.toggle('active', b.dataset.mode === m),
			);
			const needId = m !== 'add';
			idField.hidden = !needId;
			editor.hidden = m === 'delete';
			loadBtn.hidden = m !== 'edit';
			if (m === 'add') {
				submit.textContent = '发布';
			} else if (m === 'edit') {
				submit.textContent = '保存';
			} else {
				submit.textContent = '删除';
			}
		}
		form.querySelectorAll('.mode-tabs button').forEach((b) =>
			b.addEventListener('click', () => setMode(b.dataset.mode)),
		);

		// image upload (two-step)
		const fileInput = form.querySelector('#img');
		form.querySelector('#pick').addEventListener('click', () => fileInput.click());
		fileInput.addEventListener('change', async () => {
			for (const file of fileInput.files) {
				try {
					const blob = await toWebP(file);
					const fd = new FormData();
					fd.append('file', blob, `${file.name}.webp`);
					const res = await fetch(`${API}/upload`, {
						method: 'POST',
						headers: { Authorization: `Bearer ${token}` },
						body: fd,
					});
					if (!res.ok) {
						const m = await res.json().catch(() => ({}));
						throw new Error(m.error || 'upload failed');
					}
					const { url } = await res.json();
					insertAtCursor(content, `![](${url})\n`);
				} catch (e) {
					toast(`Image failed: ${e.message}`);
				}
			}
			fileInput.value = '';
		});

		loadBtn.addEventListener('click', async () => {
			if (!pid.value) return toast('请输入帖子 ID');
			try {
				const post = await api(`/posts/${pid.value}`);
				content.value = post.content;
				toast('加载成功');
			} catch (e) {
				toast(e.message);
			}
		});

		submit.addEventListener('click', async () => {
			if (!token) return toast('需要密钥');
			try {
				if (mode === 'add') {
					if (!content.value.trim()) return toast('内容不能为空');
					const post = await api('/posts', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ content: content.value }),
					});
					toast('Created');
					history.pushState(null, '', `/p/${post.id}`);
					route();
				} else if (mode === 'edit') {
					if (!pid.value) return toast('需要帖子 ID');
					if (!content.value.trim()) return toast('内容不能为空');
					const post = await api(`/posts/${pid.value}`, {
						method: 'PUT',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ content: content.value }),
					});
					toast('Saved');
					history.pushState(null, '', `/p/${post.id}`);
					route();
				} else {
					if (!pid.value) return toast('需要帖子 ID');
					if (!confirm('确认删除？')) return;
					await api(`/posts/${pid.value}`, { method: 'DELETE' });
					toast('已删除');
					history.pushState(null, '', '/');
					route();
				}
			} catch (e) {
				toast(e.message);
			}
		});

		setMode('add');
	}

	function insertAtCursor(field, text) {
		const start = field.selectionStart ?? field.value.length;
		const end = field.selectionEnd ?? field.value.length;
		field.value = field.value.slice(0, start) + text + field.value.slice(end);
		field.selectionStart = field.selectionEnd = start + text.length;
		field.dispatchEvent(new Event('input'));
	}

	async function toWebP(file) {
		const bitmap = await createImageBitmap(file);
		const canvas = document.createElement('canvas');
		canvas.width = bitmap.width;
		canvas.height = bitmap.height;
		const ctx = canvas.getContext('2d');
		ctx.drawImage(bitmap, 0, 0);
		return await new Promise((resolve, reject) =>
			canvas.toBlob(
				(b) => (b ? resolve(b) : reject(new Error('webp encode failed'))),
				'image/webp',
				0.85,
			),
		);
	}

	/* ---------- boot ---------- */

	route();
})();
