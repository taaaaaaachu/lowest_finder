import { error } from '@sveltejs/kit';
import { db } from '#lib/server/db/index.js';
import { setUserRole, deleteUser, type AdminError, type Actor } from '#lib/server/admin.js';
import { requireAdmin } from '#lib/server/apiGuard.js';
import type { Role } from '#lib/server/db/schema.js';
import type { RequestHandler } from './$types';

const STATUS: Record<AdminError, number> = {
	not_found: 404,
	forbidden: 403,
	last_super_admin: 409
};
const MESSAGE: Record<AdminError, string> = {
	not_found: 'ユーザーが見つかりません。',
	forbidden: '権限がありません。',
	last_super_admin: '最後のスーパー管理者は変更・削除できません。'
};

const VALID_ROLES: Role[] = ['super_admin', 'admin', 'user'];

/** ロール変更(任命/罷免)。管理者以上。 */
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	const user = requireAdmin(locals);
	const body = await request.json().catch(() => null);
	const role = body?.role as Role;
	if (!VALID_ROLES.includes(role)) throw error(400, 'ロールの指定が不正です。');

	const actor: Actor = { id: user.id, role: user.role };
	const result = setUserRole(db, actor, params.id, role);
	if (!result.ok) throw error(STATUS[result.error], MESSAGE[result.error]);
	return Response.json({ ok: true });
};

/** ユーザー削除。管理者以上。 */
export const DELETE: RequestHandler = ({ locals, params }) => {
	const user = requireAdmin(locals);
	const actor: Actor = { id: user.id, role: user.role };
	const result = deleteUser(db, actor, params.id);
	if (!result.ok) throw error(STATUS[result.error], MESSAGE[result.error]);
	// 自分自身を削除した場合はクライアントにログアウト相当を促す。
	return Response.json({ ok: true, selfDeleted: params.id === user.id });
};
