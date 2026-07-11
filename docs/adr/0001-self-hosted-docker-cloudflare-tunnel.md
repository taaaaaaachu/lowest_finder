# 自前ホスティング: Synology NAS + Docker + Cloudflare Tunnel + SvelteKit/SQLite

## 決定

本サービスはクラウドPaaSではなく、**Synology NAS 上の Docker** で稼働させる。外部公開は **Cloudflare Tunnel** で行い(ポート開放不要・HTTPS自動・NASのグローバルIPを晒さない)、`example.com` のサブドメインに割り当てる。アプリは **SvelteKit(adapter-node)フルスタック1本**、DBは **SQLite(Dockerボリューム上のファイル)+ Drizzle ORM**。実行構成は `app` + `cloudflared` の2コンテナを基本とする。

## 背景・理由

- 開発者の「Dockerでデプロイしてみたい」という技術的興味と、既に手元にある Synology NAS を活用する目的が主動機。クラウドの運用費も不要。
- PWA は Service Worker のため実質 HTTPS 必須。Cloudflare Tunnel が証明書と外部到達性を自動で満たし、自宅ルーターのポート開放(=グローバルIP露出)を避けられる。
- 個人〜家族規模で同時アクセスは僅少。SQLite で十分で、別DBコンテナの運用を持たない方が軽い(バックアップ=ファイルコピー)。
- SvelteKit の adapter-node は素の Node HTTP サーバを吐くため Docker と相性が良く、フロント/APIを1フレームワークに集約できる。

## 帰結

- Cloudflare 管理下のドメイン(`example.com`)が前提。Tunnel/DNS 設定は公開段階で実施。
- スケールや可用性はクラウドPaaSに劣る(NASの電源・回線に依存)。個人利用のため許容。
- 取得エンジンは素のHTTP取得のみ(ヘッドレスブラウザは同梱しない)。NASのリソースを重くしない判断とセット。
