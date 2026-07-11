import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { env } from '$env/dynamic/private';
import * as schema from './schema';

export type Db = BetterSQLite3Database<typeof schema>;

/** 指定パスの SQLite に接続した drizzle インスタンスを作る(テストからも利用)。 */
export function createDb(dbPath: string): Db {
	if (dbPath !== ':memory:') {
		mkdirSync(dirname(dbPath), { recursive: true });
	}
	const sqlite = new Database(dbPath);
	sqlite.pragma('journal_mode = WAL');
	sqlite.pragma('foreign_keys = ON');
	return drizzle(sqlite, { schema });
}

/** SQLite ファイルのパス。Docker では永続ボリューム上のパスを環境変数で渡す。 */
const dbPath = env.DATABASE_PATH ?? './data/app.sqlite';

export const db = createDb(dbPath);
export { schema };
