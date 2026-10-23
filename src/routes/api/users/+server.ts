import { db } from '#lib/server/db/index.js';
import { listUsers } from '#lib/server/admin.js';
import { requireAdmin } from '#lib/server/apiGuard.js';
import type { RequestHandler } from './$types';

/** 全ユーザー一覧(管理者以上)。 */
export const GET: RequestHandler = ({ locals }) => {
	requireAdmin(locals);
	return Response.json(listUsers(db));
};
