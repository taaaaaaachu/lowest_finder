import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/** SSRF 検証で弾いた理由を持つエラー。 */
export class SsrfError extends Error {}

/**
 * プライベート/ループバック/リンクローカル等の到達してはいけない IP かを判定する。
 * IPv4 と IPv6(IPv4-mapped 含む)に対応。
 */
export function isPrivateIp(ip: string): boolean {
	const v = isIP(ip);
	if (v === 4) return isPrivateIpv4(ip);
	if (v === 6) return isPrivateIpv6(ip);
	return true; // 判定不能なものは安全側に倒して拒否。
}

function isPrivateIpv4(ip: string): boolean {
	const parts = ip.split('.').map(Number);
	if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
		return true;
	}
	const [a, b] = parts;
	if (a === 0) return true; // 0.0.0.0/8
	if (a === 10) return true; // 10.0.0.0/8
	if (a === 127) return true; // ループバック
	if (a === 169 && b === 254) return true; // リンクローカル 169.254/16
	if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
	if (a === 192 && b === 168) return true; // 192.168/16
	if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
	if (a >= 224) return true; // マルチキャスト/予約
	return false;
}

function isPrivateIpv6(ip: string): boolean {
	const addr = ip.toLowerCase().split('%')[0]; // ゾーンID を除去
	if (addr === '::1' || addr === '::') return true; // ループバック/未指定
	if (addr.startsWith('fe80')) return true; // リンクローカル
	if (addr.startsWith('fc') || addr.startsWith('fd')) return true; // ユニークローカル fc00::/7
	// IPv4-mapped (::ffff:a.b.c.d) は内包する IPv4 で判定。
	const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
	if (mapped) return isPrivateIpv4(mapped[1]);
	return false;
}

/**
 * スクレイピング先として許可できる URL かを検証する。
 * - https のみ
 * - ホスト名を DNS 解決し、解決先 IP が全て公開 IP であること(IP リテラルも検証)
 * 問題があれば SsrfError を投げる。
 */
export async function assertPublicUrl(urlString: string): Promise<URL> {
	let url: URL;
	try {
		url = new URL(urlString);
	} catch {
		throw new SsrfError('URL の形式が不正です。');
	}

	if (url.protocol !== 'https:') {
		throw new SsrfError('https の URL のみ取得できます。');
	}

	const host = url.hostname;

	// IP リテラル直指定は解決不要でそのまま判定。
	if (isIP(host)) {
		if (isPrivateIp(host)) throw new SsrfError('プライベート/内部アドレスへのアクセスは禁止です。');
		return url;
	}

	// ホスト名は全ての解決先 IP を検証(1つでも内部なら拒否)。
	let addresses: { address: string }[];
	try {
		addresses = await lookup(host, { all: true });
	} catch {
		throw new SsrfError('ホスト名を解決できませんでした。');
	}
	if (addresses.length === 0) {
		throw new SsrfError('ホスト名を解決できませんでした。');
	}
	for (const { address } of addresses) {
		if (isPrivateIp(address)) {
			throw new SsrfError('プライベート/内部アドレスへ解決されるホストは取得できません。');
		}
	}

	return url;
}
