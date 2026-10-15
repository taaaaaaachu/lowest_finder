import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { setOwnPassword } from '$lib/server/admin';
import { removePassword } from '$lib/server/credentials';
import {
	hashPassword,
	validatePassword,
	verifyCredentials,
	hashSessionToken,
	SESSION_COOKIE
} from '$lib/server/auth';
import { requireRecentAuth, requireUser } from '$lib/server/apiGuard';
import type { RequestHandler } from './$types';

/**
 * 本人によるパスワードの変更・設定。操作端末以外のセッションを無効化する。
 * currentPassword があればそれで本人確認し、無ければ(パスキーのみの会員など)直近の本人確認を求める。
 */
export const POST: RequestHandler = async ({ locals, request, cookies }) => {
	const user = requireUser(locals);
	const body = await request.json().catch(() => null);
	const currentPassword = String(body?.currentPassword ?? '');
	const newPassword = String(body?.newPassword ?? '');

	const pErr = validatePassword(newPassword);
	if (pErr) throw error(400, pErr);

	if (currentPassword) {
		// 乗っ取られたセッションでの勝手な変更を防ぐ。
		const verified = await verifyCredentials(user.username, currentPassword);
		if (!verified) throw error(400, '現在のパスワードが違います。');
	} else {
		requireRecentAuth(locals);
	}

	const token = cookies.get(SESSION_COOKIE);
	const keepSessionId = token ? hashSessionToken(token) : '';
	const hash = await hashPassword(newPassword);
	setOwnPassword(db, user.id, hash, keepSessionId);
	return json({ ok: true });
};

/** パスワードの削除(パスキーのみの会員にする)。パスキーが無ければ 409。 */
export const DELETE: RequestHandler = async ({ locals }) => {
	const user = requireRecentAuth(locals);
	const result = removePassword(db, user.id, user.sessionId);
	if (!result.ok) {
		if (result.error === 'last_credential') {
			throw error(409, 'パスキーを登録してから削除してください。');
		}
		throw error(404, 'パスワードは設定されていません。');
	}
	return json({ ok: true });
};
