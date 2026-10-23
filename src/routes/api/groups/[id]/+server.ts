import { error } from '@sveltejs/kit';
import { db } from '#lib/server/db/index.js';
import * as data from '#lib/server/data.js';
import { requireUser } from '#lib/server/apiGuard.js';
import type { RequestHandler } from './$types';
import type { GroupInput } from '#lib/repo/types.js';

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	const user = requireUser(locals);
	const body = await request.json().catch(() => null);
	const patch: Partial<GroupInput> = {};
	if (typeof body?.title === 'string') patch.title = body.title.trim();
	if (typeof body?.unitLabel === 'string') patch.unitLabel = body.unitLabel.trim();
	const updated = data.updateGroup(db, user.id, params.id, patch);
	if (!updated) throw error(404, 'グループが見つかりません。');
	return Response.json(updated);
};

export const DELETE: RequestHandler = ({ locals, params }) => {
	const user = requireUser(locals);
	const ok = data.deleteGroup(db, user.id, params.id);
	if (!ok) throw error(404, 'グループが見つかりません。');
	return new Response(null, { status: 204 });
};
