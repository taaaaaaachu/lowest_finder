import { error } from '@sveltejs/kit';
import { db } from '#lib/server/db/index.js';
import * as data from '#lib/server/data.js';
import { clientId, requireUser } from '#lib/server/apiGuard.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals }) => {
	const user = requireUser(locals);
	return Response.json(data.listGroups(db, user.id));
};

export const POST: RequestHandler = async ({ locals, request }) => {
	const user = requireUser(locals);
	const body = await request.json().catch(() => null);
	const title = typeof body?.title === 'string' ? body.title.trim() : '';
	const unitLabel = typeof body?.unitLabel === 'string' ? body.unitLabel.trim() : '';
	if (!title) throw error(400, 'タイトルは必須です。');
	const group = data.createGroup(db, user.id, { title, unitLabel }, clientId(body));
	if (!group) throw error(404, 'グループが見つかりません。');
	return Response.json(group, { status: 201 });
};
