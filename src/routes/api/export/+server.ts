import { db } from '#lib/server/db/index.js';
import * as data from '#lib/server/data.js';
import { requireUser } from '#lib/server/apiGuard.js';
import type { RequestHandler } from './$types';

/** 会員データの全件。端末のローカルDBを置き換える同期に使う。 */
export const GET: RequestHandler = ({ locals }) => {
	const user = requireUser(locals);
	return Response.json(data.exportAll(db, user.id));
};
