import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import * as data from '$lib/server/data';
import { requireUser } from '$lib/server/apiGuard';
import type { RequestHandler } from './$types';
import type { Snapshot } from '$lib/repo/types';

/** ゲストデータ(スナップショット)を会員データへ取り込む。 */
export const POST: RequestHandler = async ({ locals, request }) => {
	const user = requireUser(locals);
	const body = (await request.json().catch(() => null)) as Snapshot | null;
	if (!body || !Array.isArray(body.groups) || !Array.isArray(body.items)) {
		throw error(400, '取り込みデータの形式が不正です。');
	}
	const result = data.importSnapshot(db, user.id, body);
	return json(result);
};
