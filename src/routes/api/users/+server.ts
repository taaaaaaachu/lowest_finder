import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { listUsers } from '$lib/server/admin';
import { requireAdmin } from '$lib/server/apiGuard';
import type { RequestHandler } from './$types';

/** 全ユーザー一覧(管理者以上)。 */
export const GET: RequestHandler = ({ locals }) => {
	requireAdmin(locals);
	return json(listUsers(db));
};
