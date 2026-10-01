import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import * as data from '$lib/server/data';
import { requireUser } from '$lib/server/apiGuard';
import type { RequestHandler } from './$types';

/** 会員データの全件。端末のローカルDBを置き換える同期に使う。 */
export const GET: RequestHandler = ({ locals }) => {
	const user = requireUser(locals);
	return json(data.exportAll(db, user.id));
};
