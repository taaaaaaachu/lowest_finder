import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyMigrations } from '../../../../scripts/migrate.js';

/** 先頭 n 本だけのマイグレーションフォルダを作る(古い版の DB を再現する)。 */
function firstMigrations(n: number): string {
	const dir = mkdtempSync(join(tmpdir(), 'mig-'));
	mkdirSync(join(dir, 'meta'));
	const journal = JSON.parse(readFileSync('./drizzle/meta/_journal.json', 'utf-8'));
	journal.entries = journal.entries.slice(0, n);
	writeFileSync(join(dir, 'meta/_journal.json'), JSON.stringify(journal));
	for (const e of journal.entries) cpSync(`./drizzle/${e.tag}.sql`, join(dir, `${e.tag}.sql`));
	return dir;
}

describe('applyMigrations', () => {
	it('users を作り直す 0003 を適用しても、FK でぶら下がるデータが消えない', () => {
		const sqlite = new Database(':memory:');
		applyMigrations(sqlite, firstMigrations(3));
		sqlite.exec(`
			insert into users(id, username, password_hash, role, created_at) values ('u', 'a', 'h', 'user', 0);
			insert into sessions(id, user_id, expires_at) values ('s', 'u', 9);
			insert into groups(id, user_id, title) values ('g', 'u', 't');
		`);

		applyMigrations(sqlite);

		const count = (t: string) => (sqlite.prepare(`select count(*) c from ${t}`).get() as { c: number }).c;
		expect(count('sessions')).toBe(1);
		expect(count('groups')).toBe(1);
		expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
	});
});
