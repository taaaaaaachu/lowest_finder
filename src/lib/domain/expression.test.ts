import { describe, it, expect } from 'vitest';
import { evaluateExpression, stripCommas } from './expression';

/** ok を前提に値を取り出すヘルパ。 */
function val(input: string): number {
	const r = evaluateExpression(input);
	if (!r.ok) throw new Error(`expected ok for "${input}" but got ${r.reason}`);
	return r.value;
}

describe('evaluateExpression', () => {
	it('単なる数値をそのまま返す', () => {
		expect(val('300')).toBe(300);
		expect(val('1380')).toBe(1380);
	});

	it('小数を扱える', () => {
		expect(val('1.5')).toBe(1.5);
		expect(val('0.22')).toBeCloseTo(0.22);
	});

	it('掛け算(要望の例)', () => {
		expect(val('100 * 3')).toBe(300);
	});

	it('空白の有無に依らない', () => {
		expect(val('100*3')).toBe(300);
		expect(val('  100   *   3  ')).toBe(300);
	});

	it('四則演算', () => {
		expect(val('690*2')).toBe(1380);
		expect(val('1500/3')).toBe(500);
		expect(val('100+50')).toBe(150);
		expect(val('200-50')).toBe(150);
	});

	it('税込計算(小数の掛け算)', () => {
		expect(val('1000*1.1')).toBeCloseTo(1100);
	});

	it('演算子の優先順位を守る', () => {
		expect(val('2+3*4')).toBe(14);
		expect(val('10-2*3')).toBe(4);
	});

	it('括弧で優先順位を変えられる', () => {
		expect(val('(2+3)*4')).toBe(20);
		expect(val('100/(2+3)')).toBe(20);
	});

	it('入れ子の括弧', () => {
		expect(val('((1+2)*(3+4))')).toBe(21);
	});

	it('単項マイナス/プラス', () => {
		expect(val('-5')).toBe(-5);
		expect(val('+5')).toBe(5);
		expect(val('3*-2')).toBe(-6);
		expect(val('-(2+3)')).toBe(-5);
	});

	it('空文字・空白のみは empty', () => {
		expect(evaluateExpression('')).toEqual({ ok: false, reason: 'empty' });
		expect(evaluateExpression('   ')).toEqual({ ok: false, reason: 'empty' });
	});

	it('打ちかけの式は invalid', () => {
		expect(evaluateExpression('100 *')).toEqual({ ok: false, reason: 'invalid' });
		expect(evaluateExpression('100 +')).toEqual({ ok: false, reason: 'invalid' });
		expect(evaluateExpression('*3')).toEqual({ ok: false, reason: 'invalid' });
	});

	it('文字混入は invalid', () => {
		expect(evaluateExpression('100 * abc')).toEqual({ ok: false, reason: 'invalid' });
		expect(evaluateExpression('1,000')).toEqual({ ok: false, reason: 'invalid' });
		expect(evaluateExpression('１００')).toEqual({ ok: false, reason: 'invalid' }); // 全角は非対応
	});

	it('括弧の不整合は invalid', () => {
		expect(evaluateExpression('(2+3')).toEqual({ ok: false, reason: 'invalid' });
		expect(evaluateExpression('2+3)')).toEqual({ ok: false, reason: 'invalid' });
		expect(evaluateExpression('()')).toEqual({ ok: false, reason: 'invalid' });
	});

	it('ゼロ除算は invalid', () => {
		expect(evaluateExpression('100/0')).toEqual({ ok: false, reason: 'invalid' });
		expect(evaluateExpression('100/(2-2)')).toEqual({ ok: false, reason: 'invalid' });
	});

	it('不正な数値リテラルは invalid', () => {
		expect(evaluateExpression('1.2.3')).toEqual({ ok: false, reason: 'invalid' });
		expect(evaluateExpression('.')).toEqual({ ok: false, reason: 'invalid' });
	});

	it('連続演算子は invalid', () => {
		expect(evaluateExpression('3**2')).toEqual({ ok: false, reason: 'invalid' });
		expect(evaluateExpression('3 2')).toEqual({ ok: false, reason: 'invalid' });
	});
});

describe('stripCommas', () => {
	it('半角カンマを除去する', () => {
		expect(stripCommas('1,380')).toBe('1380');
		expect(stripCommas('1,000,000')).toBe('1000000');
	});

	it('全角カンマを除去する', () => {
		expect(stripCommas('1，380')).toBe('1380');
	});

	it('カンマを含まない文字列はそのまま', () => {
		expect(stripCommas('1380')).toBe('1380');
		expect(stripCommas('690*2')).toBe('690*2');
		expect(stripCommas('')).toBe('');
	});

	it('カンマ除去後は計算式として評価できる', () => {
		expect(evaluateExpression(stripCommas('1,000*1.1'))).toEqual({ ok: true, value: 1100 });
	});
});
