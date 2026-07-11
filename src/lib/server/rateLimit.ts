/**
 * ごく簡易な固定ウィンドウのレート制限(プロセス内メモリ)。
 * 個人〜家族規模の想定。厳密さより「暴走・連打の抑制」が目的。
 */
const windows = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitResult {
	allowed: boolean;
	retryAfterSec: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
	const now = Date.now();
	const entry = windows.get(key);
	if (!entry || now >= entry.resetAt) {
		windows.set(key, { count: 1, resetAt: now + windowMs });
		return { allowed: true, retryAfterSec: 0 };
	}
	if (entry.count < limit) {
		entry.count++;
		return { allowed: true, retryAfterSec: 0 };
	}
	return { allowed: false, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
}
