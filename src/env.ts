import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	// SQLite ファイルの場所。未指定ならリポジトリ直下の data/。
	DATABASE_PATH: { schema: (input) => input || './data/app.sqlite' }
});
