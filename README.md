# Lowest Finder

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

本番は **プル型 CI/CD** で運用する。`main` にマージすると GitHub Actions がイメージをビルドして
GHCR に push し、NAS 上の共用 Watchtower が自動 pull → 再作成する。外部公開は **Cloudflare Tunnel**
(ポート開放不要・HTTPS 自動・NAS の IP を晒さない)。

```
push/PR ─▶ GitHub Actions(check/test)
   main ─▶ Docker ビルド ─▶ GHCR(ghcr.io/taaaaaaachu/lowest_finder:latest, :sha-xxxx)
                                └─▶ NAS の Watchtower が自動 pull ─▶ 再作成(起動時にマイグレーション)
```

- **手順・トラブルシュートの正典は [docs/deploy.md](./docs/deploy.md)**(初回セットアップ、GHCR 認証、
  build 型からの移行、Watchtower、ロールバック、起動バナーでのバージョン確認)。
- 通常のリリースは **PR → `main` マージだけ**。5 分以内に NAS が自動反映する。NAS 上でのビルドは不要。
- `.env`(`ORIGIN`)と `data/`(SQLite)は温存する。`TUNNEL_TOKEN` は共用 Cloudflare Tunnel プロジェクトでのみ設定し、`docker compose down -v` は使わない。

補足: RBAC 導入のマイグレーション(`0002`)は、既存 DB の**最古参ユーザーを自動的に super_admin に昇格**させる。再デプロイ後、最初に登録したアカウントがスーパー管理者になっている。

## スクレイピングについて

- **ベストエフォート**です。Amazon は bot 対策で価格を取得できないことが多く、ヨドバシや他サイトも HTML 構造の変更で壊れることがあります。取得できない場合は**価格を手入力**してください。
- 取得対象は**価格(取れれば商品名)のみ**。内容量は常に手入力です。
- 会員限定機能です(SSRF 等の悪用面を絞るため。詳細は [ADR 0002](./docs/adr/0002-guest-client-only-scraping-member-only.md))。
