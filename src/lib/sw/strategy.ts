/**
 * Service Worker が fetch をどう扱うかの判定。
 * - precache: ビルド成果物・静的ファイル。cache-first。
 * - page: 画面遷移の HTML と SvelteKit の __data.json。network-first、失敗時はキャッシュ。
 * - clear-user: 認証状態が変わる POST。ユーザー情報入りのキャッシュを消してから素通し。
 * - network: それ以外(API など)。SW は関与しない。
 */
export type Strategy = 'precache' | 'page' | 'clear-user' | 'network';

/** 認証状態を変える POST 先(フォームアクション)。 */
const AUTH_CHANGE_PATHS = new Set(['/login', '/register', '/logout']);

export function strategyFor(
	req: { method: string; mode: string; url: string },
	origin: string,
	precached: ReadonlySet<string>
): Strategy {
	const url = new URL(req.url);
	if (url.origin !== origin) return 'network';
	if (req.method === 'POST' && AUTH_CHANGE_PATHS.has(url.pathname)) return 'clear-user';
	if (req.method !== 'GET' || url.pathname.startsWith('/api/')) return 'network';
	if (precached.has(url.pathname)) return 'precache';
	// ルートレイアウトに load があるため、クライアント遷移でも __data.json を取りに行く。
	if (req.mode === 'navigate' || url.pathname.endsWith('/__data.json')) return 'page';
	return 'network';
}
