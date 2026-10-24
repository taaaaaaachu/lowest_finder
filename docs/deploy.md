# デプロイ / CI・CD 手順

lowest_finder は **プル型 CI/CD** で本番(Synology NAS / x86_64)へ反映する。

```
push/PR ──▶ GitHub Actions (check / test)
   main ──▶ Docker ビルド ──▶ GHCR に push (ghcr.io/taaaaaaachu/lowest_finder:latest, :sha-xxxx)
                                   │
                          (NAS から外向きに pull)
                                   ▼
              Synology NAS: Watchtower(独立プロジェクト・NAS全体で1台)が 5 分毎に GHCR を監視
                          └─ enable ラベル付き app の新しい :latest を検知 ─▶ 自動 pull ─▶ 再作成
                                   └─ 起動時に scripts/migrate.js で DB マイグレーション
```

- NAS は宅内にあり外部から到達できないので、GitHub からは **push しない**。NAS が **pull で取りに行く**。
- ポート開放・VPN は不要(必要な外向き通信は GHCR への HTTPS のみ)。
- ビルドはランタイム env 非依存(`DATABASE_PATH` 等は実行時に compose の `environment:` で注入)。公開オリジンは設定せず、cloudflared が転送する Host ヘッダーから決まる。
- **Watchtower は lowest_finder の compose には含めない**。`/var/run/docker.sock` 経由で Docker ホスト
  全体を監視できるため、NAS 全体で **1 台だけ独立プロジェクト**として動かし、enable ラベルの付いた
  全プロジェクトの app(stockify / lowest_finder 等)をまとめて自動更新する。lowest_finder を作り直しても
  自動更新が止まらないようにする分離。→ 後述「Watchtower(独立プロジェクト)」。

## 構成ファイル

| ファイル | 役割 |
| --- | --- |
| `.github/workflows/ci.yml` | CI(check/test)+ main のイメージを GHCR に配布 |
| `docker-compose.yml` | NAS 本番。`app`(GHCR pull)。共用ネットワークに参加し、Cloudflare Tunnel は含まない |
| `docker-compose.local.yml` | ローカル動作確認用(こちらは従来どおり `build:`。ポート直公開) |
| `Dockerfile` / `docker-entrypoint.sh` | イメージ定義と起動時マイグレーション・起動バナー |

> CI は lint スクリプトが無いため **型チェック(svelte-check)+ テスト(vitest)** の 2 本を回す。

Cloudflare Tunnel と Watchtower は本リポジトリ外の**独立した Container Manager プロジェクト**(NAS 上
`/volume1/docker/watchtower`)として1台だけ動かす。compose 定義は後述の
「Watchtower(独立プロジェクト)」を正典とする。

## 初回セットアップ(一度だけ)

### 1. GitHub 側(GHCR)

- `main` への push で `ci.yml` の `build-push` ジョブが走り、初回に GHCR パッケージ
  `ghcr.io/taaaaaaachu/lowest_finder` が自動作成される。追加の secret は不要
  (ワークフローの `GITHUB_TOKEN` に `packages: write` を付与済み)。

### 2. NAS 側の GHCR 認証(**パッケージが private の場合のみ**)

GHCR パッケージは既定で private。Watchtower が pull できるよう認証情報を用意する。
**classic PAT(スコープ `read:packages`)を使うこと**。

> ⚠️ **Fine-grained PAT は使わない**。リポジトリ限定 + `Contents: Read` に絞った
> Fine-grained PAT でも、Synology から private GHCR を pull すると
> `Error response from daemon: denied` になる(認証は通るが pull 認可が伝播しない、
> GHCR + Fine-grained の既知の弱点)。classic `read:packages` なら安定して pull できる。
> スコープを絞りたい動機はあるが、確実性を優先して classic を使う。

> **stockify を先に動かしている場合、追加ログインは不要**。classic `read:packages` は
> アカウント内の全 private パッケージを読めるため、NAS で `docker login ghcr.io` 済みなら
> lowest_finder のイメージも同じ 1 トークンで pull できる(`config.json` は `ghcr.io` 1 エントリ)。

まだ NAS で GHCR にログインしていない場合のみ:

1. GitHub で **classic PAT** を発行: Settings → Developer settings →
   Personal access tokens → **Tokens (classic)** → Generate new token (classic)。
   - スコープは **`read:packages` のみ**(他は不要)。
   - Expiration は任意(無人の NAS が期限切れで黙って止まるのを防ぐなら No expiration)。

2. NAS に SSH で入り、docker にログイン(`/root/.docker/config.json` に保存される):

   ```bash
   echo 'ghp_発行したトークン全文字列' | sudo docker login ghcr.io -u taaaaaaachu --password-stdin
   ```

   > - Synology では docker デーモンへのアクセスに `sudo`(root)が必要。root で入れることで、
   >   compose の watchtower がマウントする `/root/.docker/config.json` と保存先が一致する。
   > - `--password-stdin` にするとシェル履歴にトークンが残らず、`--password` 警告も出ない。
   > - 「パスワードが暗号化されず保存される」警告は想定どおり(Watchtower がこの平文をマウントして使う)。
   > - `Login Succeeded` を確認。

**認証を省きたい場合**: GitHub の Packages ページで当該パッケージを **public** に変更すれば、
PAT の発行・上記ログイン・compose の `config.json` マウント行はすべて不要になる
(イメージには秘密も公開ドメインも焼き込まれていないため)。

### 3. NAS で共用ネットワークと Cloudflare Tunnel を起動

`stockify` と同じ NAS で運用する場合、Cloudflare Tunnel は NAS 全体で 1 コンテナだけ起動する。

1. 初回だけ共用ネットワークを作成する:

   ```bash
   sudo docker network create cloudflare-proxy
   ```

2. 親フォルダの `cloudFlarred/docker-compose.yml` を NAS の独立プロジェクト
   `/volume1/docker/cloudflared/docker-compose.yml` に配置し、`.env` に共用 Tunnel の
   `TUNNEL_TOKEN` を設定して起動する:

   ```bash
   cd /volume1/docker/cloudflared
   sudo docker compose up -d
   ```

   Cloudflare Zero Trust の Public Hostname は次のように設定する:

   - `stock.example.com` → `http://stockify-app:3000`
   - `lowest.example.com` → `http://lowest-finder-app:3000`

### 4. NAS で lowest_finder 本番を起動(build 型からの移行)

lowest_finder は既に NAS(`/volume1/docker/lowest_finder`)で **build 型**で稼働中。
これを pull 型へ差し替える。**`data/`(SQLite)と `.env` は温存する**。

1. NAS 上のプロジェクトフォルダに、新しい `docker-compose.yml`(pull 型・enable ラベル付き)を
   配置する(`.env` と `data/` は上書きしない)。
2. コンテナを再作成する:

   ```bash
   cd /volume1/docker/lowest_finder
   sudo docker compose pull app        # GHCR から :latest を取得
   sudo docker compose up -d           # app を新イメージで再作成
   sudo docker compose logs -f app     # 「lowest_finder 起動: version=...」→「マイグレーション適用完了」を確認
   ```

   Container Manager(GUI)の場合は、プロジェクトのソース(`docker-compose.yml`)を新版に差し替え、
   **ビルドし直さずに**(pull 型なのでビルド不要)プロジェクトを再作成する。

以後 NAS でのビルドは不要。`main` に変更が入るたび、5 分以内に Watchtower が自動反映する。

### 4. Watchtower(独立プロジェクト・NAS 全体で 1 台だけ)

イメージ自動更新の Watchtower は、各アプリの compose には入れず**単独のプロジェクト**として
1 台だけ動かす(`/var/run/docker.sock` 経由で Docker ホスト全体を監視できるため)。これにより
lowest_finder を作り直しても自動更新が止まらず、stockify など他プロジェクトも同じ 1 台が面倒を見る。

**stockify のセットアップ時に既に稼働しているはず**。その場合 lowest_finder 側で新たにやることは無い
(app に enable ラベルを付けてあるので、既存 Watchtower が自動で拾う)。まだ無い場合のみ、NAS に
`/volume1/docker/watchtower/docker-compose.yml` を作り、Container Manager で新規プロジェクト化する:

```yaml
# NAS 全体のイメージ自動更新。enable ラベルの付いたコンテナだけを監視し、
# GHCR の :latest 更新を検知したら自動 pull → 再作成する。各アプリの compose には入れない。
services:
  watchtower:
    image: containrrr/watchtower:latest
    restart: unless-stopped
    environment:
      - TZ=Asia/Tokyo
      - WATCHTOWER_LABEL_ENABLE=true    # enable ラベル付きコンテナだけ監視
      - WATCHTOWER_CLEANUP=true         # 入れ替え後に古いイメージを削除
      - WATCHTOWER_POLL_INTERVAL=300    # 5分ごとに GHCR をチェック
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      # private GHCR pull 用の認証(NAS で `docker login ghcr.io` 済みの config.json)。
      # 対象パッケージをすべて public 化する場合はこの行を削除してよい。
      - /root/.docker/config.json:/config.json:ro
```

- 監視対象にしたいアプリは、その compose の当該サービスに
  `labels: [com.centurylinklabs.watchtower.enable=true]` を付ける(lowest_finder の `app` は付与済み)。
- Watchtower は**このプロジェクト自身も含む**すべてのラベル付きコンテナを見るが、enable ラベルを
  付けなければ対象外。cloudflared は対象外のまま。
- **単一障害点**である点に注意: この Watchtower を止めると全プロジェクトの自動更新が止まる。

Cloudflare Tunnel も NAS 全体で 1 コンテナだけを起動する。lowest_finder 側の compose に
`cloudflared` を追加したり、lowest_finder 側の `.env` に `TUNNEL_TOKEN` を設定したりしない。

## 日常運用

- **通常のリリース**: PR → `main` にマージするだけ。CI が緑なら GHCR に `:latest` が上がり、
  NAS が自動で入れ替える。
- **手動で即時反映したい**: NAS で `sudo docker compose pull app && sudo docker compose up -d app`。
- **ロールバック**: GHCR には各コミットの `:sha-xxxxxxx` タグも残る。NAS で
  `docker-compose.yml` の `app.image` を戻したい版の `:sha-xxxxxxx` に固定し、
  `sudo docker compose up -d app`(Watchtower に再度上書きされないよう、安定するまでは
  一時的に app の `com.centurylinklabs.watchtower.enable` ラベルを外すか watchtower を停止)。

## トラブルシュート

- **`manifest unknown`**: そのタグがまだ GHCR に無い。`main` にマージして `build-push` が
  成功しているか確認(PR 段階では配布されない)。認証エラーではない。
- **`denied` / `unauthorized`**: 認証・認可の問題。
  - Fine-grained PAT を使っていないか確認(→ classic `read:packages` に切り替える。上記「2. GHCR 認証」参照)。
  - `sudo docker pull ghcr.io/taaaaaaachu/lowest_finder:latest` で切り分け。ここで通れば Container Manager が
    資格情報を使えていないだけ。まず SSH で pull しておけばローカルイメージで起動できる。
  - 最終手段はパッケージの **public 化**(認証不要になる)。
- **Container Manager の UI では denied だが SSH の `sudo docker pull` は通る**: CM のプロジェクト
  が `/root/.docker/config.json` を使っていない。先に SSH で pull しておくか、
  CM の「レジストリ」設定に GHCR 認証を登録する。
- **CI の test が落ちる**: `better-sqlite3` を使うサーバーテストがある。ローカル再現は
  `pnpm install --frozen-lockfile && pnpm test`。
- **build-push が `Cache export is not supported for the docker driver`**: ワークフローに
  `docker/setup-buildx-action` があるか確認(gha キャッシュには docker-container ドライバが必要)。
- **どのイメージが動いているか確認したい**: app コンテナのログ先頭
  (`sudo docker compose logs app | head`)で「lowest_finder 起動: version=<コミットSHA>」を確認。
- **マイグレーションが当たっていない**: app コンテナのログで
  「マイグレーション適用完了」の出力を確認。
