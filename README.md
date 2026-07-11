# Lowest Finder — 容量単価くらべ

同じ商品の容量違い(詰替え用・大容量など)を、**容量あたりの単価**で比較して一番安いものを選ぶための PWA。

- **ゲストモード**: アカウント不要。データはブラウザ(IndexedDB)にのみ保存。完全クライアント完結・手入力のみ。
- **会員モード**: ユーザー名+パスワードで登録。データはサーバーの SQLite に永続化。URL からの価格取得(スクレイピング)が使える。閲覧はオフラインでも可能(L1)。

ドメインの用語は [CONTEXT.md](./CONTEXT.md)、主要な設計判断は [docs/adr/](./docs/adr/) を参照。

## 技術スタック

- **SvelteKit**(adapter-node)フルスタック 1 本 / **TypeScript**
- **SQLite** + **Drizzle ORM**(better-sqlite3)
- 認証: argon2 + サーバーセッション(httpOnly Cookie)
- スクレイピング: node-html-parser + サイト別アダプタ(Amazon / ヨドバシ / 汎用 JSON-LD)、SSRF 対策付き
- PWA: Web App Manifest + Service Worker

## 開発

```bash
npm install
npm run db:migrate   # SQLite に初期スキーマを適用(./data/app.sqlite)
npm run dev          # http://localhost:5173
```

- テスト: `npm test`
- 型チェック: `npm run check`
- スキーマ変更後: `npm run db:generate` でマイグレーション生成 → `npm run db:migrate`

## デプロイ(Synology NAS + Docker + Cloudflare Tunnel)

外部公開は **Cloudflare Tunnel** を使う(ポート開放不要・HTTPS 自動・NAS の IP を晒さない)。
前提: Cloudflare 管理下のドメイン(例 `example.com`)。

### 1. Cloudflare Tunnel を作成

1. Cloudflare **Zero Trust** ダッシュボード → **Networks > Tunnels** → **Create a tunnel** →
   タイプ **Cloudflared** を選び、名前を付ける。
2. 表示される **Tunnel token** を控える(`docker compose` の `TUNNEL_TOKEN` に使う)。
3. **Public Hostname** を追加:
   - Subdomain: `lowest`(任意) / Domain: `example.com`
   - Service: **HTTP** → `app:3000`(compose 内のサービス名:ポート)

### 2. .env を用意

```bash
cp .env.example .env
# ORIGIN を自分の公開 URL に、TUNNEL_TOKEN を上で控えたトークンに設定
```

`ORIGIN` は adapter-node が form action / CSRF 検証で使うため、**公開 URL と一致**させること。

### 3. 起動

```bash
docker compose up -d --build
```

- `app` コンテナ: 起動時にマイグレーションを適用してからサーバー起動。DB は名前付きボリューム `db-data`(`/data/app.sqlite`)に永続化。
- `cloudflared` コンテナ: トンネルを張り、`https://lowest.example.com` → `app:3000` を公開。

Synology では **Container Manager** でこのリポジトリの `docker-compose.yml` をプロジェクトとして読み込むか、SSH で `docker compose` を実行する。

### バックアップ

DB は単一ファイル。ボリューム `db-data` 内の `app.sqlite`(+ WAL)をコピーするだけでバックアップできる。

## スクレイピングについて

- **ベストエフォート**です。Amazon は bot 対策で価格を取得できないことが多く、ヨドバシや他サイトも HTML 構造の変更で壊れることがあります。取得できない場合は**価格を手入力**してください。
- 取得対象は**価格(取れれば商品名)のみ**。内容量は常に手入力です。
- 会員限定機能です(SSRF 等の悪用面を絞るため。詳細は [ADR 0002](./docs/adr/0002-guest-client-only-scraping-member-only.md))。
