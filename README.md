# Lowest Finder

同じ商品の容量違い(詰替え用・大容量など)を**容量あたりの単価**で比較し、一番安いものを選ぶための PWA。
アカウントなしで端末内だけで使える「ゲストモード」と、サーバーにデータを保存してオフラインでも記録できる「会員モード」を持ち、家族や小規模グループでのセルフホスト運用を想定している。

ドメインの用語は [CONTEXT.md](./CONTEXT.md)、主要な設計判断は [docs/adr/](./docs/adr/) にまとめている。

## 主な機能

- **単価比較**: グループ(例「食器用洗剤」)ごとに商品の内容量と価格を登録すると、単価(価格 ÷ 内容量)の安い順に並べ、最安を強調表示する。単位ラベル(`ml`・`g` など)は表示専用で、単位変換はしない。
- **入力補助**: 価格・内容量の欄で計算式(例 `100*3`)が使える。全角数字の半角化とカンマの除去を自動で行う。
- **ゲストモード**: アカウント不要。データはブラウザの IndexedDB にだけ保存し、サーバーとは一切通信しない。
- **会員モード**: データをサーバーの SQLite に保存する。ユーザー名+パスワード、またはパスキーで登録・ログインする。
- **取り込み**: ゲストモードで作ったデータを、ログイン後に確認のうえ会員データへ追記する。
- **価格取得(スクレイピング)**: 会員限定。商品の URL から価格(取れれば商品名)をサーバー側で取得する。Amazon・ヨドバシ用のアダプタと、汎用の JSON-LD 解析を持つ。
- **オフラインでの起動・記録と同期**: アプリ本体を Service Worker でプリキャッシュし、オフラインでも起動できる。会員モードではオフライン中の書き込みを端末内の送信待ち(outbox)に積み、通信が戻ると自動で同期する。
- **パスキー認証**: パスキーの登録・ログイン(ユーザー名の入力不要)・名前の変更・削除。パスキーを持つ会員は自分のパスワードを削除し、パスキーだけでログインする状態にもできる。
- **ロールと招待制**: 会員は `super_admin` / `admin` / `user` のいずれか1つのロールを持つ。会員登録には管理者以上が発行した招待コード(有効期限つき・1回限り)が必要。管理画面でユーザーのロール変更・削除・パスワードリセット(仮パスワードの設定か、リセットリンクの発行)、招待コードの発行・無効化・削除ができる。仮パスワードでログインした会員は、自分のパスワードかパスキーを設定するまで他の操作ができない。
- **PWA**: Web App Manifest を持ち、ホーム画面にインストールできる(Android の WebAPK 要件をテストで確認している)。

## 技術スタック

| 分類 | 採用技術 |
| --- | --- |
| フロントエンド | Svelte 5 / SvelteKit 2 / TypeScript 6 / Vite 8 |
| サーバー | SvelteKit(`@sveltejs/adapter-node`)。フロントと API を 1 つのアプリにまとめている |
| DB | SQLite(better-sqlite3)+ Drizzle ORM(マイグレーションは drizzle-kit で生成) |
| クライアント保存 | IndexedDB(`idb`) |
| 認証 | サーバーセッション(httpOnly Cookie)、パスワードは Argon2(`@node-rs/argon2`)、パスキーは SimpleWebAuthn 14 |
| スクレイピング | Node.js の `fetch` + `node-html-parser` |
| PWA | Web App Manifest + 自前の Service Worker |
| インフラ | Docker(Node.js 22)、Cloudflare Tunnel による公開 |
| CI/CD | GitHub Actions(型チェック・テスト → GHCR へイメージ配布)、Watchtower によるプル型デプロイ |
| テスト | Vitest 4、fake-indexeddb |

## アーキテクチャと設計判断

```
 ブラウザ(PWA)
 ├─ ゲストモード ── IndexedDB(サーバーと通信しない)
 └─ 会員モード ──── 会員ごとのローカル DB + outbox ──同期──┐
                                                          ▼
 Cloudflare Tunnel ──▶ Docker コンテナ: SvelteKit(adapter-node)
                         ├─ 画面 + REST API(/api/...)
                         ├─ 認証(セッション / Argon2 / WebAuthn)
                         ├─ スクレイピング(SSRF 対策つき)
                         └─ SQLite(Drizzle ORM、起動時にマイグレーション適用)
```

- データ層は `Repository` の差し替えで切り替える。ゲストは IndexedDB の実装([src/lib/repo/indexeddb.ts](./src/lib/repo/indexeddb.ts))、会員はローカル DB と outbox を持つ実装([src/lib/repo/member.ts](./src/lib/repo/member.ts))を使い、画面側は同じインターフェースで扱う。
- 権限の判定は純粋関数([src/lib/rbac.ts](./src/lib/rbac.ts))にまとめ、API 側で必ず使う。UI でボタンを隠すだけでは防御にならないため。

### ADR(Architecture Decision Records)

設計上のトレードオフは ADR に記録している。

| ADR | 判断の要約 |
| --- | --- |
| [0001](./docs/adr/0001-self-hosted-docker-cloudflare-tunnel.md) | クラウド PaaS ではなくセルフホストの Docker で動かし、Cloudflare Tunnel で公開する。ポート開放をせず HTTPS を得る代わりに、可用性はホストに依存する。利用規模が小さいので DB は別コンテナを持たず SQLite にした |
| [0002](./docs/adr/0002-guest-client-only-scraping-member-only.md) | ゲストはサーバーと通信しない完全クライアント完結にし、スクレイピングは会員限定にする。未認証でサーバー側の取得を叩けると SSRF やオープンプロキシの攻撃面になるため、ゲストの手入力という体験上の制約を受け入れた |
| [0003](./docs/adr/0003-invite-only-registration.md) | 会員登録は招待コード制にする。「最初の会員を誰が招くか」は、ユーザーが 0 人のときだけ招待なしで登録できるようにして解決し、環境変数の合言葉などの設定物を増やさなかった |
| [0004](./docs/adr/0004-rbac-roles-and-permissions.md) | ロールは 3 段の厳格な階層にする。admin は昇格だけができ、降格は super_admin に限る。super_admin が 0 人になる操作は削除と降格の両方で拒否する。ユーザーを削除しても招待の記録は監査用に残す |
| [0005](./docs/adr/0005-member-offline-writes.md) | 会員モードでもオフラインで記録できるようにする。outbox を既存 API へ順に再送し、空になったら全件を取得してローカルを置き換える。作成 API はクライアント採番の id で再送を冪等にし、競合はサーバーに届いた順の後勝ちとした(差分同期はデータが増えてから検討) |
| [0006](./docs/adr/0006-passkey-only-members.md) | パスキーだけの会員を認める。パスワードの「無効化フラグ」ではなく削除にして、漏れたかもしれない旧パスワードが復活しないようにした。メールでの復旧は持たず、管理者のリセットで認証情報をすべて初期化する(盗まれた端末のパスキーも消すため) |
| [0007](./docs/adr/0007-temporary-password-and-reset-link.md) | 管理者が指定したパスワードは仮パスワードにし、本人が変えるまで他の操作をさせない。パスワードを決めないリセットリンク(24 時間・単回)も用意し、認証情報の初期化は発行時でなく使った時点で行う。自分自身はどちらの対象にもできない |

## セキュリティ上の工夫

- **パスワードの保存**: Argon2 でハッシュ化する(`memoryCost: 19456, timeCost: 2`)。ユーザーが存在しない場合やパスキーのみの会員でも同じハッシュ計算を行い、応答時間から存在を推測されにくくしている。
- **セッション**: ランダムなトークンを httpOnly / SameSite=Lax / Secure の Cookie に入れ、DB には SHA-256 ハッシュだけを保存する。有効期限は 30 日で、残りが短くなると延長する。ロールは毎リクエスト DB から読むので、降格はすぐに反映される。
- **パスキー(WebAuthn)**: discoverable credential と本人確認(user verification)を必須にしている。チャレンジは 1 回限り・5 分で失効し、httpOnly Cookie のキーでブラウザと紐づける。
- **認証情報を守る制約**: パスワードとパスキーのどちらか 1 つ以上を常に持つことをサーバー側で強制し、最後の 1 つを消す操作は拒否する。
- **直近の本人確認**: 認証情報の追加・削除には、5 分以内のログインか再認証(パスワードまたはパスキー)を求める(未確認なら HTTP 428)。パスワードを持つ会員がパスワードを変更するときは、常に現在のパスワードを求める。認証情報を減らす操作をすると、操作した端末以外のセッションを無効にする。
- **スクレイピングの SSRF 対策**: https のみ許可し、ホスト名を DNS 解決したすべての IP がプライベート・ループバック・リンクローカルなどでないことを確かめる(IPv4-mapped IPv6 も対象)。リダイレクトは自前で追い、ホップごとに同じ検証をする。タイムアウト 8 秒・サイズ上限 2MB・リダイレクト 3 回まで。会員ごとにレート制限(1 分 10 回)もかけている。
- **招待制と RBAC**: 登録には招待コードが必要で、権限の判定はすべてサーバー側で行う。
- **オフラインデータの後始末**: ユーザー情報を含むページのキャッシュは、ログイン・登録・ログアウトの際に Service Worker が消す。ログアウト時には会員のローカル DB も削除する。

## テスト

`npm test`(Vitest)で **20 ファイル・177 件**のテストが通ることを確認している。主な対象は次のとおり。

- **ドメインロジック**: 単価計算とソート、計算式の評価、数値入力の正規化、表示フォーマット。
- **認証・認可**: パスワードの検証とハッシュ、直近の本人確認の判定、認証情報の操作(最後の 1 つを消せないこと)、ロールごとの権限判定、管理操作(super_admin を 0 人にできないことなど)、招待コードの発行・無効化・登録。
- **WebAuthn の往復テスト**: テスト内に ES256 のソフトウェア認証器を実装し、パスキーの登録からログインまでを実際の検証ライブラリに通している([webauthn.roundtrip.test.ts](./src/lib/server/webauthn.roundtrip.test.ts))。
- **マイグレーションのデータ保全**: 古い版の DB を再現してから最新までマイグレーションを当て、テーブルを作り直す変更でも外部キーでつながるデータが消えないことを確かめている([migrations.test.ts](./src/lib/server/db/migrations.test.ts))。
- **オフライン同期**: fake-indexeddb を使い、outbox の再送・応答ごとの扱い・全件取得による置き換えを確かめている。サーバー側はクライアント採番 id での再送が冪等であることを確かめている。
- **スクレイピング**: 各サイトのアダプタ、価格の解析、SSRF 判定。
- **Service Worker と PWA**: リクエストごとのキャッシュ戦略の判定、manifest の内容。

CI([.github/workflows/ci.yml](./.github/workflows/ci.yml))では、`main` への push とすべての PR で `npm run check`(svelte-check による型チェック)と `npm test` を実行する。

## ローカルでの起動方法

Node.js 22 を想定している(CI と Docker イメージが Node.js 22)。

```bash
npm ci
npm run db:migrate   # ./data/app.sqlite にスキーマを適用(DATABASE_PATH で変更可)
npm run dev          # http://localhost:5173
```

最初に登録した 1 人目は招待コードなしで登録でき、`super_admin` になる。2 人目からは、管理画面で招待コードを発行して登録する。

| コマンド | 内容 |
| --- | --- |
| `npm test` | テストを実行 |
| `npm run check` | 型チェック |
| `npm run build` / `npm start` | 本番ビルドと起動 |
| `npm run db:generate` | スキーマ変更後にマイグレーションを生成(続けて `npm run db:migrate`) |

### Docker での動作確認

本番と同じイメージを、ポートを直接公開する compose ファイルで動かせる。コンテナは起動時にマイグレーションを適用する。

```bash
docker compose -f docker-compose.local.yml up --build   # http://localhost:3000
docker compose -f docker-compose.local.yml down          # 停止
```

- DB は `./data` に保存される。
- 本番の compose には公開オリジンを `ORIGIN` で渡す([.env.example](./.env.example) を `.env` にコピーして設定)。ローカル用 compose は `http://localhost:3000` を指定済み。`ORIGIN` が実際のアクセス先と違うと、フォームの POST が CSRF 対策で 403 になる。

## デプロイ

本番は**プル型 CI/CD** で運用している。`main` にマージすると GitHub Actions がテスト後に Docker イメージをビルドして GHCR に push し、ホスト側の Watchtower が新しいイメージを検知して pull し、コンテナを作り直す(起動時にマイグレーションを適用)。ホストは外から到達できない場所にあるため、GitHub からは push せずホストが取りに行く構成にした。外部公開は Cloudflare Tunnel で行う。

初回セットアップ・日常運用・トラブルシュートは [docs/deploy.md](./docs/deploy.md)、DB を名前付きボリュームからバインドマウントへ移す手順は [MIGRATE-VOLUME.md](./MIGRATE-VOLUME.md) を参照。

## スクレイピングについて

- **ベストエフォート**。Amazon は bot 対策で価格を取得できないことが多く、ヨドバシや他のサイトも HTML 構造の変更で取得できなくなることがある。取得できない場合は価格を手入力する。
- 取得するのは**価格(取れれば商品名)だけ**。内容量は常に手入力。
- ヘッドレスブラウザは使わず、素の HTTP 取得だけで行う([ADR 0001](./docs/adr/0001-self-hosted-docker-cloudflare-tunnel.md))。
- 会員限定機能(悪用される面を絞るため。[ADR 0002](./docs/adr/0002-guest-client-only-scraping-member-only.md))。

## ライセンス

[MIT](./LICENSE)
