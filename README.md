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

## ローカルでの Docker 動作確認(NAS デプロイ前)

NAS に上げる前に、手元の Docker で本番同等のコンテナを動かして確認する。
cloudflared は使わず、ポートを直接公開する専用の compose ファイル（`docker-compose.local.yml`）を使う。

```bash
# ビルドして起動(初回は better-sqlite3 のビルドで数分かかることがある)
docker compose -f docker-compose.local.yml up --build

# ブラウザで http://localhost:3000 を開く
```

確認する流れ:

1. **ゲストモード**: グループ・商品を追加し、単価順ソート・最安ハイライトを確認。
2. **会員モード**: 「会員登録」→ 登録できるか（＝フォーム POST が通るか）を確認。
   - ここが 403 になる場合は `ORIGIN` の設定ミス。ローカルは `http://localhost:3000` に一致していること。
3. ゲストで作ってから登録すると **取り込みバナー** が出るか。
4. 会員で URL 付き商品の **価格取得** ボタン（`https://example.com/` で「取得不可」フォールバック等）。

運用コマンド:

```bash
docker compose -f docker-compose.local.yml logs -f app   # ログ確認
docker compose -f docker-compose.local.yml down           # 停止
docker compose -f docker-compose.local.yml down -v        # DB ボリュームごと破棄(データ初期化)
```

- DB は名前付きボリューム `db-data-local` に永続化される。`down`（`-v` なし）ではデータは残る。
- ARM/x86 どちらのマシンでも、`docker build` はそのマシンのアーキテクチャ向けに better-sqlite3 を解決する。NAS 上でビルドすれば NAS 用バイナリになる。

## デプロイ(Synology NAS + Docker + Cloudflare Tunnel)

外部公開は **Cloudflare Tunnel** を使う(ポート開放不要・HTTPS 自動・NAS の IP を晒さない)。
前提: Cloudflare 管理下のドメイン(例 `example.com`)。

### 0. NAS 側の前提

- DSM 7.2 以降で **Container Manager**(旧「Docker」パッケージ)をインストール済みであること。
  Docker に対応した機種が必要(x86 系のほとんど、および Docker 対応の一部モデル)。
- 低スペック/低メモリ機だと、NAS 上での `npm ci`＋`vite build`＋better-sqlite3 のビルドが重いことがある。
  厳しい場合は「別 PC でイメージを作って持ち込む」下記の補足を参照。

### 1. Cloudflare Tunnel を作成

1. Cloudflare **Zero Trust** ダッシュボード → **Networks > Tunnels** → **Create a tunnel** →
   タイプ **Cloudflared** を選び、名前を付ける。
2. 表示される **Tunnel token** を控える(`docker compose` の `TUNNEL_TOKEN` に使う)。
3. **Public Hostname** を追加:
   - Subdomain: `lowest`(任意) / Domain: `example.com`
   - Service: **HTTP** → `app:3000`(compose 内のサービス名:ポート)

### 2. コードを NAS に置く

共有フォルダ(例 `/volume1/docker/lowest-finder`)にプロジェクト一式を配置する。方法はどちらでも:

- **git**: NAS に SSH して `git clone <このリポジトリ>`
- **File Station / SMB**: 手元のフォルダをコピー(`node_modules` や `.svelte-kit` は不要)

### 3. .env を用意

プロジェクト直下に `.env` を作る:

```bash
cp .env.example .env
# ORIGIN=https://lowest.example.com  (自分の公開 URL に一致させる)
# TUNNEL_TOKEN=（手順1で控えたトークン）
```

`ORIGIN` は adapter-node が form action / CSRF 検証で使うため、**公開 URL と完全一致**させること。

### 4a. 起動(SSH — 推奨・確実)

DSM の **コントロールパネル → 端末と SNMP → SSH を有効化** し、NAS に SSH:

```bash
cd /volume1/docker/lowest-finder
sudo docker compose up -d --build      # 初回はビルドで数分〜
sudo docker compose logs -f            # 起動確認(app に Listening on ...:3000)
```

- `app`: 起動時にマイグレーション適用 → サーバー起動。DB は名前付きボリューム `db-data`(`/data/app.sqlite`)に永続化。
- `cloudflared`: トンネルを張り `https://lowest.example.com` → `app:3000` を公開。
- `restart: unless-stopped` なので NAS 再起動後も自動で立ち上がる。

ブラウザで `https://lowest.example.com` を開いて確認。

### 4b. 起動(Container Manager GUI)

SSH を使わない場合:

1. **Container Manager → プロジェクト → 作成**
2. パスに手順2で置いたフォルダ(`docker-compose.yml` のある場所)を指定
3. ソースは既存の `docker-compose.yml` を使用。環境変数(`ORIGIN` / `TUNNEL_TOKEN`)は `.env` を置いておけば読まれる
4. ビルドして起動

### バックアップ

DB は単一ファイル。名前付きボリューム `db-data` 内の `app.sqlite`(+ WAL)をコピーするだけでよい。
**Hyper Backup 等で扱いやすくしたい**なら、`docker-compose.yml` の `app.volumes` を共有フォルダへの
バインドマウントに変えると、DSM のバックアップ対象に含めやすい:

```yaml
    volumes:
      - /volume1/docker/lowest-finder/data:/data
```

### 補足: NAS が非力でビルドが厳しい場合

手元の PC(NAS と同じ CPU アーキテクチャ)でイメージを作り、NAS に持ち込む:

```bash
# PC 側(NAS が arm64 なら --platform linux/arm64 を付ける)
docker build -t lowest-finder:latest .
docker save lowest-finder:latest | gzip > lowest-finder.tar.gz
# NAS に転送後、NAS 側で
gunzip -c lowest-finder.tar.gz | sudo docker load
# docker-compose.yml の app.build 行を消し image: lowest-finder:latest だけにして起動
```

## スクレイピングについて

- **ベストエフォート**です。Amazon は bot 対策で価格を取得できないことが多く、ヨドバシや他サイトも HTML 構造の変更で壊れることがあります。取得できない場合は**価格を手入力**してください。
- 取得対象は**価格(取れれば商品名)のみ**。内容量は常に手入力です。
- 会員限定機能です(SSRF 等の悪用面を絞るため。詳細は [ADR 0002](./docs/adr/0002-guest-client-only-scraping-member-only.md))。
