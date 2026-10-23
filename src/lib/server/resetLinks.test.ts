import { describe, it, expect, beforeEach } from 'vitest';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import { createDb, type Db } from './db';
import { users, sessions, passkeys, resetLinks, type Role } from './db/schema';
import { listUsers, resetUserPassword, type Actor } from './admin';
import {
	issueResetLink,
	revokeResetLink,
	findResetLink,
	consumeResetLink,
	RESET_LINK_TTL_MS
} from './resetLinks';

let db: Db;

beforeEach(() => {
	db = createDb(':memory:');
	migrate(db, { migrationsFolder: './drizzle' });
});

function addUser(username: string, role: Role): string {
	const id = `id-${username}`;
	db.insert(users).values({ id, username, passwordHash: 'old', role, createdAt: 0 }).run();
	db.insert(sessions).values({ id: `s-${username}`, userId: id, expiresAt: 9e15 }).run();
	db.insert(passkeys)
		.values({ id: `pk-${username}`, userId: id, publicKey: Buffer.from([1]), counter: 0, name: 'p', createdAt: 0 })
		.run();
	return id;
}
const sa = (): Actor => ({ id: 'id-sa', role: 'super_admin' });
const newPasskey = { id: 'pk-new', publicKey: Buffer.from([2]), counter: 0, transports: null, name: 'n', createdAt: 0 };
function issue(target: string, now = 0): string {
	const r = issueResetLink(db, sa(), target, now);
	if (!r.ok) throw new Error(r.error);
	return r.token;
}

beforeEach(() => {
	addUser('sa', 'super_admin');
});

describe('issueResetLink', () => {
	it('発行しただけでは認証情報は変わらない', () => {
		const u = addUser('u', 'user');
		const r = issueResetLink(db, sa(), u, 1000);
		expect(r).toMatchObject({ ok: true, expiresAt: 1000 + RESET_LINK_TTL_MS });
		const row = db.select().from(users).where(eq(users.id, u)).get();
		expect(row?.passwordHash).toBe('old');
		expect(db.select().from(sessions).where(eq(sessions.userId, u)).all()).toHaveLength(1);
		expect(db.select().from(passkeys).where(eq(passkeys.userId, u)).all()).toHaveLength(1);
	});

	it('再発行すると古いリンクは使えなくなる', () => {
		const u = addUser('u', 'user');
		const old = issue(u);
		const fresh = issue(u);
		expect(findResetLink(db, old, 0)).toBeNull();
		expect(findResetLink(db, fresh, 0)).toEqual({ userId: u, username: 'u' });
	});

	it('自分自身や権限外の会員には発行できない', () => {
		const ad = addUser('ad', 'admin');
		const ad2 = addUser('ad2', 'admin');
		expect(issueResetLink(db, sa(), 'id-sa')).toEqual({ ok: false, error: 'forbidden' });
		expect(issueResetLink(db, { id: ad, role: 'admin' }, ad2)).toEqual({ ok: false, error: 'forbidden' });
		expect(issueResetLink(db, sa(), 'nobody')).toEqual({ ok: false, error: 'not_found' });
	});
});

describe('findResetLink', () => {
	it('期限切れ・不明なトークンは null', () => {
		const u = addUser('u', 'user');
		const token = issue(u, 0);
		expect(findResetLink(db, token, RESET_LINK_TTL_MS - 1)).not.toBeNull();
		expect(findResetLink(db, token, RESET_LINK_TTL_MS)).toBeNull();
		expect(findResetLink(db, 'x', 0)).toBeNull();
	});

	it('取り消し・パスワード指定のリセットで使えなくなる', () => {
		const u = addUser('u', 'user');
		const t1 = issue(u);
		expect(revokeResetLink(db, sa(), u)).toEqual({ ok: true });
		expect(findResetLink(db, t1, 0)).toBeNull();

		const t2 = issue(u);
		resetUserPassword(db, sa(), u, 'temp');
		expect(findResetLink(db, t2, 0)).toBeNull();
	});

	it('発行者が削除・対象者が昇格しても有効、対象者が削除されたら消える', () => {
		const ad = addUser('ad', 'admin');
		const u = addUser('u', 'user');
		const r = issueResetLink(db, { id: ad, role: 'admin' }, u, 0);
		if (!r.ok) throw new Error(r.error);
		db.update(users).set({ role: 'admin' }).where(eq(users.id, u)).run();
		db.delete(users).where(eq(users.id, ad)).run();
		expect(findResetLink(db, r.token, 0)).toEqual({ userId: u, username: 'u' });

		db.delete(users).where(eq(users.id, u)).run();
		expect(db.select().from(resetLinks).all()).toHaveLength(0);
	});
});

describe('consumeResetLink', () => {
	it('パスワードで使うと全初期化し、通常のパスワードを設定してリンクを消費する', () => {
		const u = addUser('u', 'user');
		db.update(users).set({ passwordTemporary: true }).where(eq(users.id, u)).run();
		const token = issue(u);
		expect(consumeResetLink(db, token, { passwordHash: 'mine' }, 0)).toBe(u);

		const row = db.select().from(users).where(eq(users.id, u)).get();
		expect(row?.passwordHash).toBe('mine');
		expect(row?.passwordTemporary).toBe(false);
		expect(db.select().from(passkeys).where(eq(passkeys.userId, u)).all()).toHaveLength(0);
		expect(db.select().from(sessions).where(eq(sessions.userId, u)).all()).toHaveLength(0);
		expect(consumeResetLink(db, token, { passwordHash: 'again' }, 0)).toBeNull();
	});

	it('パスキーで使うとパスワードを消し、そのパスキーだけを持つ', () => {
		const u = addUser('u', 'user');
		expect(consumeResetLink(db, issue(u), { passkey: newPasskey }, 0)).toBe(u);
		expect(db.select().from(users).where(eq(users.id, u)).get()?.passwordHash).toBeNull();
		expect(db.select().from(passkeys).where(eq(passkeys.userId, u)).all().map((p) => p.id)).toEqual(['pk-new']);
	});

	it('他の会員の認証情報には触れない', () => {
		const u = addUser('u', 'user');
		consumeResetLink(db, issue(u), { passwordHash: 'mine' }, 0);
		expect(db.select().from(passkeys).where(eq(passkeys.userId, 'id-sa')).all()).toHaveLength(1);
		expect(db.select().from(sessions).where(eq(sessions.userId, 'id-sa')).all()).toHaveLength(1);
	});
});

describe('listUsers のリンク表示', () => {
	it('期限内の未使用リンクだけ期限を返す', () => {
		const u = addUser('u', 'user');
		issue(u, 0);
		const linkOf = (now: number) => listUsers(db, now).find((x) => x.id === u)?.resetLinkExpiresAt;
		expect(linkOf(0)).toBe(RESET_LINK_TTL_MS);
		expect(linkOf(RESET_LINK_TTL_MS)).toBeNull();
		expect(listUsers(db, 0).find((x) => x.id === 'id-sa')?.resetLinkExpiresAt).toBeNull();
	});
});
