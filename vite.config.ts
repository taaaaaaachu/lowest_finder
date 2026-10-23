import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			// 公開オリジン。本番(Cloudflare Tunnel 配下)は未指定で、Host ヘッダーと https から決まる。
			// http で直接アクセスするローカル compose だけ、ビルド時の ORIGIN で明示する(CSRF とパスキーの検証に使う)。
			paths: { origin: process.env.ORIGIN || undefined },
			serviceWorker: {
				// layoutからビルドversion付きURLを登録し、CDNの旧版を回避する。
				register: false
			}
		})
	],
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}']
	}
});
