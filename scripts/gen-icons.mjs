// アプリアイコン(PNG)を SVG から生成する。開発時に一度だけ実行する補助スクリプト。
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

mkdirSync('./static/icons', { recursive: true });

// 角丸の青地に「¥」。maskable 用に中央へ十分な余白を取る。
const svg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#2563eb"/>
  <text x="256" y="342" font-family="system-ui, sans-serif" font-size="300" font-weight="800"
        text-anchor="middle" fill="#ffffff">¥</text>
</svg>`;

for (const size of [192, 512]) {
	await sharp(Buffer.from(svg(size))).resize(size, size).png().toFile(`./static/icons/icon-${size}.png`);
	// maskable(同デザインを流用)
	await sharp(Buffer.from(svg(size))).resize(size, size).png().toFile(`./static/icons/maskable-${size}.png`);
}
// iOS 用 apple-touch-icon(180px)
await sharp(Buffer.from(svg(180))).resize(180, 180).png().toFile('./static/icons/apple-touch-icon.png');

console.log('アイコンを生成しました: static/icons/');
