import { describe, it, expect, beforeEach } from 'vitest';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { createDb, type Db } from './db';
import { invites } from './db/schema';
import { eq } from 'drizzle-orm';
import { countUsers, createInvite, listInvites, registerUser } from './invites';

let db: Db;

beforeEach(() => {
	db = createDb(':memory:');
	migrate(db, { migrationsFolder: './drizzle' });
});

/** ブートストラップで最初のユーザーを作るヘルパー。 */
function bootstrapUser(username = 'owner') {
	const r = registerUser(db, {
		username,
		passwordHash: 'x',
		requireInvite: false
	});
	if (!r.ok) throw new Error('bootstrap failed');
	return r.user;
}

describe('countUsers / ブートストラップ', () => {
	it('最初はユーザー0人', () => {
		expect(countUsers(db)).toBe(0);
	});

	it('招待不要で最初のユーザーを作れる', () => {
		const r = registerUser(db, { username: 'owner', passwordHash: 'x', requireInvite: false });
		expect(r.ok).toBe(true);
		expect(countUsers(db)).toBe(1);
	});
});

describe('招待コードの発行と一覧', () => {
	it('発行できて一覧に active で出る', () => {
		const owner = bootstrapUser();
		const inv = createInvite(db, owner.id, Date.now() + 3600_000);
		expect(inv.code).toBeTruthy();
		const list = listInvites(db, owner.id);
		expect(list).toHaveLength(1);
		expect(list[0].status).toBe('active');
	});

	it('期限切れは expired、無期限は active', () => {
		const owner = bootstrapUser();
		createInvite(db, owner.id, Date.now() - 1000); // 過去
		createInvite(db, owner.id, null); // 無期限
		const statuses = listInvites(db, owner.id).map((i) => i.status).sort();
		expect(statuses).toEqual(['active', 'expired']);
	});
});

describe('招待コードによる登録', () => {
	it('有効なコードで登録でき、コードは使用済みになる', () => {
		const owner = bootstrapUser();
		const inv = createInvite(db, owner.id, null);

		const r = registerUser(db, {
			username: 'invitee',
			passwordHash: 'x',
			requireInvite: true,
			inviteCode: inv.code
		});
		expect(r.ok).toBe(true);

		const row = db.select().from(invites).where(eq(invites.code, inv.code)).get();
		expect(row?.usedBy).toBe(r.ok ? r.user.id : null); // 使用者を記録
		expect(row?.usedAt).toBeTypeOf('number');
	});

	it('存在しないコードは invite_invalid', () => {
		bootstrapUser();
		const r = registerUser(db, {
			username: 'x',
			passwordHash: 'x',
			requireInvite: true,
			inviteCode: 'nope'
		});
		expect(r).toEqual({ ok: false, error: 'invite_invalid' });
	});

	it('期限切れコードは invite_expired', () => {
		const owner = bootstrapUser();
		const inv = createInvite(db, owner.id, Date.now() - 1000);
		const r = registerUser(db, {
			username: 'x',
			passwordHash: 'x',
			requireInvite: true,
			inviteCode: inv.code
		});
		expect(r).toEqual({ ok: false, error: 'invite_expired' });
	});

	it('使用済みコードは再利用できない(invite_used)', () => {
		const owner = bootstrapUser();
		const inv = createInvite(db, owner.id, null);
		registerUser(db, { username: 'first', passwordHash: 'x', requireInvite: true, inviteCode: inv.code });
		const r = registerUser(db, {
			username: 'second',
			passwordHash: 'x',
			requireInvite: true,
			inviteCode: inv.code
		});
		expect(r).toEqual({ ok: false, error: 'invite_used' });
		expect(countUsers(db)).toBe(2); // owner + first のみ
	});

	it('ユーザー名重複は username_taken(コードは消費されない)', () => {
		const owner = bootstrapUser('dup');
		const inv = createInvite(db, owner.id, null);
		const r = registerUser(db, {
			username: 'dup',
			passwordHash: 'x',
			requireInvite: true,
			inviteCode: inv.code
		});
		expect(r).toEqual({ ok: false, error: 'username_taken' });
		// ロールバックされ、コードは未使用のまま。
		const row = db.select().from(invites).where(eq(invites.code, inv.code)).get();
		expect(row?.usedBy).toBeNull();
	});

	it('発行者(created_by)が記録される', () => {
		const owner = bootstrapUser();
		const inv = createInvite(db, owner.id, null);
		const row = db.select().from(invites).where(eq(invites.code, inv.code)).get();
		expect(row?.createdBy).toBe(owner.id);
	});
});
