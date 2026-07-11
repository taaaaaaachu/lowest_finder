import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { env } from '$env/dynamic/private';
import * as schema from './schema';

/** SQLite ファイルのパス。Docker では永続ボリューム上のパスを環境変数で渡す。 */
const dbPath = env.DATABASE_PATH ?? './data/app.sqlite';

// 初回起動時にディレクトリが無いと better-sqlite3 が失敗するため用意する。
mkdirSync(dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
export { schema };
