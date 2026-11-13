import { error } from '@sveltejs/kit';
import { db } from '#lib/server/db/index.js';
import { previewInvite, unusableInviteMessage } from '#lib/server/invites.js';
import type { PageServerLoad } from './$types';

// 開いただけでは何も消費しない(LINE などのリンクプレビューも URL を開くため)。消費は会員登録の POST だけ。
export const load: PageServerLoad = ({ params, locals }) => {
	const invite = previewInvite(db, params.code);
	if (!invite) throw error(404, '招待コードが正しくありません。');
	return { invite, unusable: unusableInviteMessage(invite), code: params.code, loggedIn: locals.user !== null };
};
