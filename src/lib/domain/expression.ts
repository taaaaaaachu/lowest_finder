/**
 * 価格・内容量の入力欄で使う簡易な計算式評価。
 *
 * 対応: 四則演算(`+` `-` `*` `/`)、小数、単項マイナス/プラス、丸括弧。
 * `eval` は使わず、再帰下降パーサで安全に評価する(任意コード実行を避ける)。
 *
 * 文法(EBNF):
 *   expr   = term   { ("+" | "-") term }
 *   term   = factor { ("*" | "/") factor }
 *   factor = ("+" | "-") factor | number | "(" expr ")"
 */

/**
 * 桁区切りのカンマ(半角 `,` ・全角 `，`)を取り除く。
 * 「1,380」のように入力された数字を評価前に正規化するために使う。
 */
export function stripCommas(input: string): string {
	return input.replace(/[,，]/g, '');
}

/** 式の評価結果。成功なら数値、失敗なら理由付きのエラー。 */
export type EvalResult =
	| { ok: true; value: number }
	| { ok: false; reason: 'empty' | 'invalid' };

type Token =
	| { type: 'num'; value: number }
	| { type: 'op'; value: '+' | '-' | '*' | '/' }
	| { type: 'lparen' }
	| { type: 'rparen' };

/** 文字列をトークン列に分解する。未知の文字があれば null。 */
function tokenize(input: string): Token[] | null {
	const tokens: Token[] = [];
	let i = 0;
	while (i < input.length) {
		const c = input[i];
		if (c === ' ' || c === '\t') {
			i++;
			continue;
		}
		if (c === '+' || c === '-' || c === '*' || c === '/') {
			tokens.push({ type: 'op', value: c });
			i++;
			continue;
		}
		if (c === '(') {
			tokens.push({ type: 'lparen' });
			i++;
			continue;
		}
		if (c === ')') {
			tokens.push({ type: 'rparen' });
			i++;
			continue;
		}
		// 数値(小数対応)。全角は扱わない。
		if ((c >= '0' && c <= '9') || c === '.') {
			let j = i;
			let dotSeen = false;
			while (j < input.length) {
				const d = input[j];
				if (d >= '0' && d <= '9') {
					j++;
				} else if (d === '.' && !dotSeen) {
					dotSeen = true;
					j++;
				} else {
					break;
				}
			}
			const slice = input.slice(i, j);
			// "." 単独や "1.2.3" のような不正はここでは弾かず Number に委ねる。
			const value = Number(slice);
			if (!Number.isFinite(value)) return null;
			tokens.push({ type: 'num', value });
			i = j;
			continue;
		}
		// 未知の文字。
		return null;
	}
	return tokens;
}

/**
 * 式を評価する。
 * - 空・空白のみは `empty`(未入力扱い)。
 * - 構文エラー / ゼロ除算 / 非有限な結果は `invalid`。
 */
export function evaluateExpression(input: string): EvalResult {
	if (input.trim() === '') return { ok: false, reason: 'empty' };

	const tokens = tokenize(input);
	if (tokens === null) return { ok: false, reason: 'invalid' };
	if (tokens.length === 0) return { ok: false, reason: 'empty' };

	let pos = 0;
	const peek = (): Token | undefined => tokens[pos];

	// 失敗は例外で脱出し、呼び出し側で invalid にまとめる。
	class ParseError extends Error {}

	function parseExpr(): number {
		let value = parseTerm();
		for (;;) {
			const t = peek();
			if (t?.type === 'op' && (t.value === '+' || t.value === '-')) {
				pos++;
				const rhs = parseTerm();
				value = t.value === '+' ? value + rhs : value - rhs;
			} else {
				break;
			}
		}
		return value;
	}

	function parseTerm(): number {
		let value = parseFactor();
		for (;;) {
			const t = peek();
			if (t?.type === 'op' && (t.value === '*' || t.value === '/')) {
				pos++;
				const rhs = parseFactor();
				if (t.value === '/') {
					if (rhs === 0) throw new ParseError('division by zero');
					value = value / rhs;
				} else {
					value = value * rhs;
				}
			} else {
				break;
			}
		}
		return value;
	}

	function parseFactor(): number {
		const t = peek();
		if (t === undefined) throw new ParseError('unexpected end');
		if (t.type === 'op' && (t.value === '+' || t.value === '-')) {
			pos++;
			const operand = parseFactor();
			return t.value === '-' ? -operand : operand;
		}
		if (t.type === 'num') {
			pos++;
			return t.value;
		}
		if (t.type === 'lparen') {
			pos++;
			const value = parseExpr();
			const close = peek();
			if (close?.type !== 'rparen') throw new ParseError('missing )');
			pos++;
			return value;
		}
		throw new ParseError('unexpected token');
	}

	try {
		const value = parseExpr();
		if (pos !== tokens.length) return { ok: false, reason: 'invalid' };
		if (!Number.isFinite(value)) return { ok: false, reason: 'invalid' };
		return { ok: true, value };
	} catch (e) {
		if (e instanceof ParseError) return { ok: false, reason: 'invalid' };
		throw e;
	}
}
