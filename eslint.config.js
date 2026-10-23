import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';

/**
 * ESLint flat config。Svelte 5(runesモード) + TypeScript。
 * svelte.config.js を持たない構成(SvelteKit設定は vite.config.ts にインライン)のため、
 * eslint-plugin-svelte には svelteConfig を渡していない。兄弟プロジェクト(equipay 等)と同じ構成。
 */
export default ts.config(
	{
		// 生成物・外部ファイルは対象外。
		ignores: ['.svelte-kit/', 'build/', 'node_modules/', 'drizzle/', 'static/', 'data/', 'package-lock.json']
	},
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node }
		}
	},
	{
		rules: {
			'@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }]
		}
	},
	{
		// .svelte 内の <script lang="ts"> を TypeScript として解釈させる。
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				parser: ts.parser,
				extraFileExtensions: ['.svelte']
			}
		}
	}
);
