import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { setOwnPassword } from '$lib/server/admin';
import {
	hashPassword,
	validatePassword,
	verifyCredentials,
	hashSessionToken,
	SESSION_COOKIE
} from '$lib/server/auth';
import { requireUser } from '$lib/server/apiGuard';
import type { RequestHandler } from './$types';

/** 本人によるパスワード変更(現パスワード要求・操作端末以外のセッションを無効化)。 */
export const POST: RequestHandler = async ({ locals, request, cookies }) => {
	const user = requireUser(locals);
	const body = await request.json().catch(() => null);
	const currentPassword = String(body?.currentPassword ?? '');
	const newPassword = String(body?.newPassword ?? '');

	const pErr = validatePassword(newPassword);
	if (pErr) throw error(400, pErr);

	// 現在のパスワードを検証(乗っ取られたセッションでの勝手な変更を防ぐ)。
	const verified = await verifyCredentials(user.username, currentPassword);
	if (!verified) throw error(400, '現在のパスワードが違います。');

	const token = cookies.get(SESSION_COOKIE);
	const keepSessionId = token ? hashSessionToken(token) : '';
	const hash = await hashPassword(newPassword);
	setOwnPassword(db, user.id, hash, keepSessionId);
	return json({ ok: true });
};
