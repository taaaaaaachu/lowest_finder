import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { createInvite, listAllInvites } from '$lib/server/invites';
import { requireAdmin } from '$lib/server/apiGuard';
import type { RequestHandler } from './$types';

// 発行時に選べる有効期限(時間)。null は無期限。
const ALLOWED_HOURS = new Set([1, 24, 168, 720]);

/** 全招待のグローバル一覧(管理者以上)。 */
export const GET: RequestHandler = ({ locals }) => {
	requireAdmin(locals);
	return json(listAllInvites(db));
};

/** 招待コードの発行(管理者以上)。 */
export const POST: RequestHandler = async ({ locals, request }) => {
	const user = requireAdmin(locals);
	const body = await request.json().catch(() => null);

	let expiresAt: number | null = null;
	const h = body?.expiresInHours;
	if (h !== null && h !== undefined) {
		const hours = Number(h);
		if (!ALLOWED_HOURS.has(hours)) throw error(400, '有効期限の指定が不正です。');
		expiresAt = Date.now() + hours * 60 * 60 * 1000;
	}

	const invite = createInvite(db, user.id, expiresAt);
	return json({ code: invite.code, expiresAt: invite.expiresAt }, { status: 201 });
};
