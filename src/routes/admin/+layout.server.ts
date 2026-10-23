import { error, redirect } from '@sveltejs/kit';
import { canAccessAdmin } from '#lib/rbac.js';
import type { LayoutServerLoad } from './$types';

/** /admin/* 全体を管理者以上に限定する。 */
export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(303, '/login');
	if (!canAccessAdmin(locals.user.role)) throw error(403, '管理者権限が必要です。');
	return { user: locals.user };
};
