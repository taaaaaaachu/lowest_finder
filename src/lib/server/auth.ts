import { hash, verify } from '@node-rs/argon2';
import { randomBytes, createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { users, sessions, type UserRow } from './db/schema';

export const SESSION_COOKIE = 'session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30日
const SESSION_RENEW_THRESHOLD_MS = 1000 * 60 * 60 * 24 * 15; // 残り15日を切ったら延長
/** 認証情報の変更を許す、直近の本人確認(ログイン・再認証)からの猶予。 */
export const RECENT_AUTH_MS = 1000 * 60 * 5;

/** verifiedAt が直近の本人確認とみなせるか。 */
export function isRecentlyVerified(verifiedAt: number | null, now = Date.now()): boolean {
	return verifiedAt !== null && now - verifiedAt < RECENT_AUTH_MS;
}

// argon2 パラメータ(OWASP 推奨相当)。
const ARGON2_OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

/** セッショントークンからDB保存用の id(ハッシュ)を作る。平文トークンはDBに残さない。 */
export function hashSessionToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}
const hashToken = hashSessionToken;

export function validateUsername(username: string): string | null {
	const u = username.trim();
	if (u.length < 3 || u.length > 32) return 'ユーザー名は3〜32文字にしてください。';
	if (!/^[A-Za-z0-9_.-]+$/.test(u)) return 'ユーザー名は英数字と _ . - のみ使えます。';
	return null;
}

export function validatePassword(password: string): string | null {
	if (password.length < 8 || password.length > 256)
		return 'パスワードは8〜256文字にしてください。';
	return null;
}

/** パスワードを argon2 でハッシュ化する(登録トランザクションの外で使う)。 */
export function hashPassword(password: string): Promise<string> {
	return hash(password, ARGON2_OPTS);
}

/** ユーザー名+パスワードを検証し、一致すればユーザーを返す。 */
export async function verifyCredentials(
	username: string,
	password: string
): Promise<UserRow | null> {
	const user = db.select().from(users).where(eq(users.username, username.trim())).get();
	if (!user?.passwordHash) {
		// ユーザー不在・パスワードなし(パスキーのみ)でも一定のハッシュ計算を行い、
		// 存在有無やパスワードの有無をタイミングで漏らさない。
		await hash(password, ARGON2_OPTS).catch(() => undefined);
		return null;
	}
	const ok = await verify(user.passwordHash, password).catch(() => false);
	return ok ? user : null;
}

export interface SessionValidation {
	user: Pick<UserRow, 'id' | 'username' | 'role'>;
	session: { id: string; verifiedAt: number | null };
	/** Cookie の有効期限を更新すべき場合の新しい期限(延長時のみ)。 */
	renewedExpiresAt: number | null;
}

/** 新しいセッションを作成し、Cookie に入れる生トークンを返す。 */
export function createSession(userId: string): { token: string; expiresAt: number } {
	const token = randomBytes(32).toString('hex');
	const expiresAt = Date.now() + SESSION_TTL_MS;
	// ログイン直後は本人確認済みとして扱う(すぐパスキーを追加できるように)。
	db.insert(sessions).values({ id: hashToken(token), userId, expiresAt, verifiedAt: Date.now() }).run();
	return { token, expiresAt };
}

/** Cookie のトークンを検証する。期限切れは破棄、残り僅かなら延長する。 */
export function validateSessionToken(token: string): SessionValidation | null {
	const id = hashToken(token);
	const row = db.select().from(sessions).where(eq(sessions.id, id)).get();
	if (!row) return null;

	if (Date.now() >= row.expiresAt) {
		db.delete(sessions).where(eq(sessions.id, id)).run();
		return null;
	}

	const user = db
		.select({ id: users.id, username: users.username, role: users.role })
		.from(users)
		.where(eq(users.id, row.userId))
		.get();
	if (!user) {
		db.delete(sessions).where(eq(sessions.id, id)).run();
		return null;
	}

	let renewedExpiresAt: number | null = null;
	if (row.expiresAt - Date.now() < SESSION_RENEW_THRESHOLD_MS) {
		renewedExpiresAt = Date.now() + SESSION_TTL_MS;
		db.update(sessions).set({ expiresAt: renewedExpiresAt }).where(eq(sessions.id, id)).run();
	}

	return { user, session: { id, verifiedAt: row.verifiedAt }, renewedExpiresAt };
}

/** セッションを本人確認済みにする(再認証の成功時)。 */
export function markSessionVerified(sessionId: string): void {
	db.update(sessions).set({ verifiedAt: Date.now() }).where(eq(sessions.id, sessionId)).run();
}

/** セッションを無効化する(ログアウト)。 */
export function invalidateSession(token: string): void {
	db.delete(sessions).where(eq(sessions.id, hashToken(token))).run();
}
