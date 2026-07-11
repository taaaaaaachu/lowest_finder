import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import * as data from '$lib/server/data';
import { requireUser } from '$lib/server/apiGuard';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals }) => {
	const user = requireUser(locals);
	return json(data.listGroups(db, user.id));
};

export const POST: RequestHandler = async ({ locals, request }) => {
	const user = requireUser(locals);
	const body = await request.json().catch(() => null);
	const title = typeof body?.title === 'string' ? body.title.trim() : '';
	const unitLabel = typeof body?.unitLabel === 'string' ? body.unitLabel.trim() : '';
	if (!title) throw error(400, 'タイトルは必須です。');
	return json(data.createGroup(db, user.id, { title, unitLabel }), { status: 201 });
};
