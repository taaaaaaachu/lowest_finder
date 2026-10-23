import { error } from '@sveltejs/kit';
import { db } from '#lib/server/db/index.js';
import type { AdminError, Actor } from '#lib/server/admin.js';
import { issueResetLink, revokeResetLink } from '#lib/server/resetLinks.js';
import { requireAdmin } from '#lib/server/apiGuard.js';
import type { RequestHandler } from './$types';

const STATUS: Record<AdminError, number> = { not_found: 404, forbidden: 403, last_super_admin: 409 };

/** リセットリンクの発行。URL は発行時の応答でしか返さない(DB にはハッシュだけ残す)。 */
export const POST: RequestHandler = async ({ locals, params, url }) => {
	const user = requireAdmin(locals);
	const actor: Actor = { id: user.id, role: user.role };
	const result = issueResetLink(db, actor, params.id);
	if (!result.ok) throw error(STATUS[result.error], 'リセットリンクを発行できませんでした。');
	return Response.json({ url: `${url.origin}/reset/${result.token}`, expiresAt: result.expiresAt });
};

/** 未使用のリセットリンクの取り消し。 */
export const DELETE: RequestHandler = async ({ locals, params }) => {
	const user = requireAdmin(locals);
	const actor: Actor = { id: user.id, role: user.role };
	const result = revokeResetLink(db, actor, params.id);
	if (!result.ok) throw error(STATUS[result.error], 'リセットリンクを取り消せませんでした。');
	return Response.json({ ok: true });
};
