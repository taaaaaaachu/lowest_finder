import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { revokeInvite, deleteInvite } from '$lib/server/invites';
import { requireAdmin } from '$lib/server/apiGuard';
import type { RequestHandler } from './$types';

/** 招待の無効化(行は残す)。管理者以上。 */
export const PATCH: RequestHandler = ({ locals, params }) => {
	requireAdmin(locals);
	const ok = revokeInvite(db, params.id);
	if (!ok) throw error(409, '無効化できません(既に使用済み・無効化済みか、存在しません)。');
	return json({ ok: true });
};

/** 招待の削除(行を消す)。管理者以上。 */
export const DELETE: RequestHandler = ({ locals, params }) => {
	requireAdmin(locals);
	const ok = deleteInvite(db, params.id);
	if (!ok) throw error(404, '招待が見つかりません。');
	return new Response(null, { status: 204 });
};
