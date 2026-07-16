import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

/** 会員ユーザー。ログインIDはユーザー名(メールは使わない)。 */
export const users = sqliteTable('users', {
	id: text('id').primaryKey(),
	username: text('username').notNull().unique(),
	passwordHash: text('password_hash').notNull(),
	createdAt: integer('created_at').notNull()
});

/**
 * セッション。id にはセッショントークンの SHA-256 ハッシュを格納する
 * (Cookie には生トークンを入れ、DB には平文トークンを残さない)。
 */
export const sessions = sqliteTable('sessions', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	expiresAt: integer('expires_at').notNull()
});

/** 会員のグループ。ゲストの Group と同じ概念を DB に永続化したもの。 */
export const groups = sqliteTable(
	'groups',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		unitLabel: text('unit_label').notNull().default('')
	},
	(t) => [index('groups_user_idx').on(t.userId)]
);

/** 会員の商品。 */
export const items = sqliteTable(
	'items',
	{
		id: text('id').primaryKey(),
		groupId: text('group_id')
			.notNull()
			.references(() => groups.id, { onDelete: 'cascade' }),
		name: text('name'),
		volume: real('volume').notNull(),
		price: real('price').notNull(),
		url: text('url'),
		lastFetchedAt: integer('last_fetched_at')
	},
	(t) => [index('items_group_idx').on(t.groupId)]
);

/**
 * 招待コード。会員登録に必要。ログイン中の会員が発行する。
 * 単回使用: used_by がセットされたら消費済み。expires_at が null なら無期限。
 */
export const invites = sqliteTable(
	'invites',
	{
		id: text('id').primaryKey(),
		code: text('code').notNull().unique(),
		/** 発行した会員。 */
		createdBy: text('created_by')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		createdAt: integer('created_at').notNull(),
		/** 有効期限(epoch ミリ秒)。null なら無期限。 */
		expiresAt: integer('expires_at'),
		/** このコードを使って登録した会員。未使用なら null。 */
		usedBy: text('used_by').references(() => users.id, { onDelete: 'set null' }),
		usedAt: integer('used_at')
	},
	(t) => [index('invites_creator_idx').on(t.createdBy)]
);

export type UserRow = typeof users.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type InviteRow = typeof invites.$inferSelect;
export type GroupRow = typeof groups.$inferSelect;
export type ItemRow = typeof items.$inferSelect;
