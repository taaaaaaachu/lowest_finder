import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import * as data from '$lib/server/data';
import { clientId, requireUser } from '$lib/server/apiGuard';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals, params }) => {
	const user = requireUser(locals);
	const items = data.listItems(db, user.id, params.id);
	if (items === null) throw error(404, 'グループが見つかりません。');
	return json(items);
};

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const user = requireUser(locals);
	const body = await request.json().catch(() => null);
	const volume = Number(body?.volume);
	const price = Number(body?.price);
	if (!Number.isFinite(volume) || volume <= 0) throw error(400, '内容量が不正です。');
	if (!Number.isFinite(price) || price < 0) throw error(400, '価格が不正です。');

	const item = data.createItem(
		db,
		user.id,
		{
			groupId: params.id,
			name: typeof body?.name === 'string' && body.name.trim() ? body.name.trim() : null,
			volume,
			price,
			url: typeof body?.url === 'string' && body.url.trim() ? body.url.trim() : null
		},
		clientId(body)
	);
	if (!item) throw error(404, 'グループが見つかりません。');
	return json(item, { status: 201 });
};
