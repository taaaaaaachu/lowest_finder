/**
 * Service Worker が fetch をどう扱うかの判定。
 * - precache: ビルド成果物・静的ファイル。cache-first。
 * - page: 画面遷移の HTML と SvelteKit の __data.json。network-first、失敗時はキャッシュ。
 * - clear-pages: ログイン・登録の POST。ユーザー情報入りのページキャッシュを消してから素通し。
 * - logout: ログアウトの POST。ページキャッシュに加えて会員のローカルDBも消す。
 * - network: それ以外(API など)。SW は関与しない。
 */
export type Strategy = 'precache' | 'page' | 'clear-pages' | 'logout' | 'network';

/** ログイン状態を変える POST 先(フォームアクション)。 */
const LOGIN_PATHS = new Set(['/login', '/register']);

export function strategyFor(
	req: { method: string; mode: string; url: string },
	origin: string,
	precached: ReadonlySet<string>
): Strategy {
	const url = new URL(req.url);
	if (url.origin !== origin) return 'network';
	if (req.method === 'POST' && url.pathname === '/logout') return 'logout';
	if (req.method === 'POST' && LOGIN_PATHS.has(url.pathname)) return 'clear-pages';
	if (req.method !== 'GET' || url.pathname.startsWith('/api/')) return 'network';
	if (precached.has(url.pathname)) return 'precache';
	// ルートレイアウトに load があるため、クライアント遷移でも __data.json を取りに行く。
	if (req.mode === 'navigate' || url.pathname.endsWith('/__data.json')) return 'page';
	return 'network';
}
