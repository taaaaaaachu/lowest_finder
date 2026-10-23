import { describe, it, expect, beforeEach } from 'vitest';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import { createDb, type Db } from './db';
import { users, sessions, passkeys, type Role } from './db/schema';
import {
	countSuperAdmins,
	listUsers,
	setUserRole,
	deleteUser,
	resetUserPassword,
	setOwnPassword,
	type Actor
} from './admin';

let db: Db;

beforeEach(() => {
	db = createDb(':memory:');
	migrate(db, { migrationsFolder: './drizzle' });
});

let seq = 0;
function addUser(username: string, role: Role): string {
	const id = `id-${username}`;
	db.insert(users).values({ id, username, passwordHash: 'x', role, createdAt: seq++ }).run();
	return id;
}
function actor(id: string, role: Role): Actor {
	return { id, role };
}

describe('countSuperAdmins / listUsers', () => {
	it('super_admin をカウントし、全員を作成順に返す', () => {
		addUser('sa', 'super_admin');
		addUser('ad', 'admin');
		addUser('u', 'user');
		expect(countSuperAdmins(db)).toBe(1);
		expect(listUsers(db).map((u) => u.username)).toEqual(['sa', 'ad', 'u']);
	});
});

describe('setUserRole', () => {
	it('super_admin は user を admin に昇格できる', () => {
		const sa = addUser('sa', 'super_admin');
		const u = addUser('u', 'user');
		expect(setUserRole(db, actor(sa, 'super_admin'), u, 'admin')).toEqual({ ok: true });
		expect(db.select().from(users).where(eq(users.id, u)).get()?.role).toBe('admin');
	});

	it('admin は user→admin のみ、admin→user 降格は forbidden', () => {
		const ad = addUser('ad', 'admin');
		const u = addUser('u', 'user');
		const other = addUser('ad2', 'admin');
		expect(setUserRole(db, actor(ad, 'admin'), u, 'admin')).toEqual({ ok: true });
		expect(setUserRole(db, actor(ad, 'admin'), other, 'user')).toEqual({
			ok: false,
			error: 'forbidden'
		});
	});

	it('最後の super_admin は降格できない(last_super_admin)', () => {
		const sa = addUser('sa', 'super_admin');
		expect(setUserRole(db, actor(sa, 'super_admin'), sa, 'user')).toEqual({
			ok: false,
			error: 'last_super_admin'
		});
	});

	it('super_admin が2人いれば降格できる', () => {
		const sa1 = addUser('sa1', 'super_admin');
		const sa2 = addUser('sa2', 'super_admin');
		expect(setUserRole(db, actor(sa1, 'super_admin'), sa2, 'user')).toEqual({ ok: true });
	});
});

describe('deleteUser', () => {
	it('admin は一般ユーザーを削除でき、admin は削除できない', () => {
		const ad = addUser('ad', 'admin');
		const u = addUser('u', 'user');
		const ad2 = addUser('ad2', 'admin');
		expect(deleteUser(db, actor(ad, 'admin'), u)).toEqual({ ok: true });
		expect(deleteUser(db, actor(ad, 'admin'), ad2)).toEqual({ ok: false, error: 'forbidden' });
	});

	it('最後の super_admin は削除できない', () => {
		const sa = addUser('sa', 'super_admin');
		expect(deleteUser(db, actor(sa, 'super_admin'), sa)).toEqual({
			ok: false,
			error: 'last_super_admin'
		});
	});

	it('super_admin が2人なら自分を削除できる', () => {
		const sa1 = addUser('sa1', 'super_admin');
		addUser('sa2', 'super_admin');
		expect(deleteUser(db, actor(sa1, 'super_admin'), sa1)).toEqual({ ok: true });
		expect(db.select().from(users).where(eq(users.id, sa1)).get()).toBeUndefined();
	});
});

describe('resetUserPassword', () => {
	it('管理者リセットで対象の全セッションが消える', () => {
		const sa = addUser('sa', 'super_admin');
		const u = addUser('u', 'user');
		db.insert(sessions).values({ id: 's1', userId: u, expiresAt: Date.now() + 1e9 }).run();
		db.insert(sessions).values({ id: 's2', userId: u, expiresAt: Date.now() + 1e9 }).run();

		expect(resetUserPassword(db, actor(sa, 'super_admin'), u, 'newhash')).toEqual({ ok: true });
		expect(db.select().from(users).where(eq(users.id, u)).get()?.passwordHash).toBe('newhash');
		expect(db.select().from(sessions).where(eq(sessions.userId, u)).all()).toHaveLength(0);
	});

	it('管理者リセットで対象の全パスキーも消える(認証情報の全初期化)', () => {
		const sa = addUser('sa', 'super_admin');
		const u = addUser('u', 'user');
		const pk = { publicKey: Buffer.from([1]), counter: 0, name: 'p', createdAt: 0 };
		db.insert(passkeys).values({ ...pk, id: 'pk-u', userId: u }).run();
		db.insert(passkeys).values({ ...pk, id: 'pk-sa', userId: sa }).run();

		expect(resetUserPassword(db, actor(sa, 'super_admin'), u, 'newhash')).toEqual({ ok: true });
		expect(db.select().from(passkeys).all().map((p) => p.id)).toEqual(['pk-sa']);
	});

	it('設定したパスワードは仮パスワードになる', () => {
		const sa = addUser('sa', 'super_admin');
		const u = addUser('u', 'user');
		resetUserPassword(db, actor(sa, 'super_admin'), u, 'newhash');
		expect(db.select().from(users).where(eq(users.id, u)).get()?.passwordTemporary).toBe(true);
	});

	it('super_admin でも自分自身はリセットできない', () => {
		const sa = addUser('sa', 'super_admin');
		expect(resetUserPassword(db, actor(sa, 'super_admin'), sa, 'x')).toEqual({
			ok: false,
			error: 'forbidden'
		});
	});

	it('admin は他の admin のパスワードをリセットできない', () => {
		const ad = addUser('ad', 'admin');
		const ad2 = addUser('ad2', 'admin');
		expect(resetUserPassword(db, actor(ad, 'admin'), ad2, 'x')).toEqual({
			ok: false,
			error: 'forbidden'
		});
	});
});

describe('setOwnPassword', () => {
	it('本人が変更すると仮パスワードではなくなる', () => {
		const u = addUser('u', 'user');
		db.update(users).set({ passwordTemporary: true }).where(eq(users.id, u)).run();
		setOwnPassword(db, u, 'mine', 'keep');
		expect(db.select().from(users).where(eq(users.id, u)).get()?.passwordTemporary).toBe(false);
	});

	it('操作中の端末セッションだけ残し、他は消える', () => {
		const u = addUser('u', 'user');
		db.insert(sessions).values({ id: 'keep', userId: u, expiresAt: Date.now() + 1e9 }).run();
		db.insert(sessions).values({ id: 'other', userId: u, expiresAt: Date.now() + 1e9 }).run();

		setOwnPassword(db, u, 'newhash', 'keep');
		const remaining = db.select().from(sessions).where(eq(sessions.userId, u)).all();
		expect(remaining.map((s) => s.id)).toEqual(['keep']);
		expect(db.select().from(users).where(eq(users.id, u)).get()?.passwordHash).toBe('newhash');
	});
});
