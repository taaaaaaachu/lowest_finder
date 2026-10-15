import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { getCredentialSummary } from '$lib/server/credentials';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(303, '/login');
	return { user: locals.user, credentials: getCredentialSummary(db, locals.user.id) };
};
