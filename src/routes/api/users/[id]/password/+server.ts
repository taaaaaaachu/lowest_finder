import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { resetUserPassword, type AdminError, type Actor } from '$lib/server/admin';
import { hashPassword, validatePassword } from '$lib/server/auth';
import { requireAdmin } from '$lib/server/apiGuard';
import type { RequestHandler } from './$types';

const STATUS: Record<AdminError, number> = { not_found: 404, forbidden: 403, last_super_admin: 409 };

/** 管理者による他人のパスワードリセット(現パスワード不要・対象の全セッション無効化)。 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const user = requireAdmin(locals);
	const body = await request.json().catch(() => null);
	const newPassword = String(body?.newPassword ?? '');
	const pErr = validatePassword(newPassword);
	if (pErr) throw error(400, pErr);

	const hash = await hashPassword(newPassword);
	const actor: Actor = { id: user.id, role: user.role };
	const result = resetUserPassword(db, actor, params.id, hash);
	if (!result.ok) throw error(STATUS[result.error], 'パスワードを変更できませんでした。');
	return json({ ok: true });
};
