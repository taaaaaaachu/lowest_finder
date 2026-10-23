import { describe, it, expect } from 'vitest';
import {
	isAtLeast,
	canAccessAdmin,
	canManageInvites,
	canSetRole,
	canDeleteUser,
	canResetPassword
} from '#lib/rbac.js';

describe('isAtLeast / 管理アクセス', () => {
	it('階層比較', () => {
		expect(isAtLeast('super_admin', 'admin')).toBe(true);
		expect(isAtLeast('admin', 'admin')).toBe(true);
		expect(isAtLeast('user', 'admin')).toBe(false);
	});
	it('管理ページ・招待管理は admin 以上', () => {
		expect(canAccessAdmin('admin')).toBe(true);
		expect(canAccessAdmin('user')).toBe(false);
		expect(canManageInvites('super_admin')).toBe(true);
		expect(canManageInvites('user')).toBe(false);
	});
});

describe('canSetRole', () => {
	it('super_admin は任意のロールへ変更可', () => {
		expect(canSetRole('super_admin', 'user', 'admin')).toBe(true);
		expect(canSetRole('super_admin', 'admin', 'super_admin')).toBe(true);
		expect(canSetRole('super_admin', 'admin', 'user')).toBe(true); // 罷免
		expect(canSetRole('super_admin', 'super_admin', 'user')).toBe(true);
	});
	it('admin は user→admin の昇格のみ', () => {
		expect(canSetRole('admin', 'user', 'admin')).toBe(true);
		expect(canSetRole('admin', 'admin', 'user')).toBe(false); // 降格不可
		expect(canSetRole('admin', 'user', 'super_admin')).toBe(false);
		expect(canSetRole('admin', 'admin', 'admin')).toBe(false);
	});
	it('user は不可', () => {
		expect(canSetRole('user', 'user', 'admin')).toBe(false);
	});
});

describe('canDeleteUser', () => {
	it('super_admin は誰でも、admin は user のみ', () => {
		expect(canDeleteUser('super_admin', 'super_admin')).toBe(true);
		expect(canDeleteUser('super_admin', 'user')).toBe(true);
		expect(canDeleteUser('admin', 'user')).toBe(true);
		expect(canDeleteUser('admin', 'admin')).toBe(false);
		expect(canDeleteUser('admin', 'super_admin')).toBe(false);
		expect(canDeleteUser('user', 'user')).toBe(false);
	});
});

describe('canResetPassword', () => {
	it('super_admin は誰でも、admin は user のみ', () => {
		expect(canResetPassword('super_admin', 'admin')).toBe(true);
		expect(canResetPassword('admin', 'user')).toBe(true);
		expect(canResetPassword('admin', 'admin')).toBe(false);
		expect(canResetPassword('user', 'user')).toBe(false);
	});
});
