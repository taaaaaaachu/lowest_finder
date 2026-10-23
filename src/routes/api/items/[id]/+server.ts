import { error } from '@sveltejs/kit';
import { db } from '#lib/server/db/index.js';
import * as data from '#lib/server/data.js';
import { requireUser } from '#lib/server/apiGuard.js';
import type { RequestHandler } from './$types';
import type { Item } from '#lib/types.js';

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	const user = requireUser(locals);
	const body = await request.json().catch(() => null);
	const patch: Partial<Omit<Item, 'id' | 'groupId'>> = {};

	if ('name' in (body ?? {})) {
		patch.name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : null;
	}
	if ('url' in (body ?? {})) {
		patch.url = typeof body.url === 'string' && body.url.trim() ? body.url.trim() : null;
	}
	if (body?.volume !== undefined) {
		const v = Number(body.volume);
		if (!Number.isFinite(v) || v <= 0) throw error(400, '内容量が不正です。');
		patch.volume = v;
	}
	if (body?.price !== undefined) {
		const p = Number(body.price);
		if (!Number.isFinite(p) || p < 0) throw error(400, '価格が不正です。');
		patch.price = p;
	}
	if (body?.lastFetchedAt !== undefined) {
		patch.lastFetchedAt = body.lastFetchedAt === null ? null : Number(body.lastFetchedAt);
	}

	const updated = data.updateItem(db, user.id, params.id, patch);
	if (!updated) throw error(404, '商品が見つかりません。');
	return Response.json(updated);
};

export const DELETE: RequestHandler = ({ locals, params }) => {
	const user = requireUser(locals);
	const ok = data.deleteItem(db, user.id, params.id);
	if (!ok) throw error(404, '商品が見つかりません。');
	return new Response(null, { status: 204 });
};
