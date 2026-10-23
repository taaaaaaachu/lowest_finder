// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			user: {
				id: string;
				username: string;
				role: import('#lib/server/db/schema.js').Role;
				/** 仮パスワードでログイン中なら、変更を済ませるまで他の操作はできない。 */
				passwordTemporary: boolean;
			} | null;
			/** 現在のセッション(id は Cookie トークンのハッシュ)。未ログインなら null。 */
			session: { id: string; verifiedAt: number | null } | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
