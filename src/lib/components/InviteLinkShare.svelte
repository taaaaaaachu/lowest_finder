<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { inviteLinkUrl, qrPath } from '#lib/inviteLink.js';

	let { code }: { code: string } = $props();

	const url = $derived(inviteLinkUrl(page.url.origin, code));
	const qr = $derived(qrPath(url));
	// 中央のアイコンは QR の幅の約 2 割(誤り訂正 H で読める範囲に収める)。
	const logo = $derived(qr.size * 0.22);
	let showQr = $state(false);
	let copied = $state(false);
	// 共有シートの有無はブラウザでしかわからない(SSR との食い違いを避けて描画後に判定する)。
	let canShare = $state(false);
	onMount(() => {
		canShare = typeof navigator.share === 'function';
	});

	async function copy() {
		try {
			await navigator.clipboard.writeText(url);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			// クリップボードが使えない環境でも、画面上のリンクは選択してコピーできる。
		}
	}

	async function share() {
		try {
			await navigator.share({ title: 'Lowest Finder への招待', url });
		} catch {
			// 共有シートを閉じた場合など。
		}
	}
</script>

<div class="share">
	<code class="url">{url}</code>
	<span class="ops">
		<button type="button" onclick={copy}>{copied ? 'コピー済' : 'リンクをコピー'}</button>
		{#if canShare}<button type="button" onclick={share}>共有</button>{/if}
		<button type="button" onclick={() => (showQr = !showQr)}>{showQr ? 'QRを隠す' : 'QRを表示'}</button>
	</span>
	{#if showQr}
		<!-- 読み取りやすいよう、テーマに関係なく白地に黒で描く。 -->
		<svg viewBox={`0 0 ${qr.size} ${qr.size}`} width="200" height="200" role="img" aria-label="招待リンクのQRコード">
			<path d={qr.d} fill="#000" />
			{#each qr.finders as f (`${f.x},${f.y}`)}
				<rect x={f.x + 0.5} y={f.y + 0.5} width="6" height="6" rx="1.6" fill="none" stroke="#000" />
				<rect x={f.x + 2} y={f.y + 2} width="3" height="3" rx="0.9" fill="#000" />
			{/each}
			<rect
				x={(qr.size - logo) / 2 - 0.5}
				y={(qr.size - logo) / 2 - 0.5}
				width={logo + 1}
				height={logo + 1}
				rx="1"
				fill="#fff"
			/>
			<image href="/icons/icon-192.png" x={(qr.size - logo) / 2} y={(qr.size - logo) / 2} width={logo} height={logo} />
		</svg>
	{/if}
</div>

<style>
	.share {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		font-size: 0.85rem;
	}
	.url {
		overflow-wrap: anywhere;
		user-select: all;
		white-space: normal;
	}
	.ops {
		display: flex;
		gap: 0.35rem;
		flex-wrap: wrap;
	}
	.ops button {
		font-size: 0.78rem;
		padding: 0.2rem 0.5rem;
	}
	svg {
		background: #fff;
	}
</style>
