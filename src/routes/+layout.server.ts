import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, depends }) => {
	// ロール変更をヘッダーへ反映するため、invalidate('app:user') で読み直せるようにする。
	depends('app:user');
	return { user: locals.user };
};
