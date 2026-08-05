# 移行手順: 名前付きボリューム → バインドマウント(SSH 不要)

既に **名前付きボリューム `db-data`** でデプロイ済みの DB を、**バインドマウント
(`./data:/data`)** へ移す手順です。以後は SQLite が `/docker/lowest-finder/data/app.sqlite`
という普通のファイルになり、**File Station だけでバックアップ**できます。

**SSH は使いません。** Container Manager の「端末(Terminal)」機能と File Station だけで行います。
所要時間は数分。作業中はサービスを一時停止します(利用者が少ない時間帯に推奨)。

> 前提: DSM 7.2 以降 / Container Manager / File Station。プロジェクトは
> `/docker/lowest-finder`(例)に配置済みで、名前付きボリューム版で稼働中。

---

## 全体の流れ

```
[A] 旧DBをホストの data/ へ取り出す(名前付きボリューム→ ./data)
        ↓
[B] compose をバインドマウント版に差し替えて再デプロイ
        ↓
[C] 旧ボリュームを削除(後片付け)
```

作業前に、可能なら現状のバックアップを取っておくと安心です(取れない場合も [A] でコピーします)。

---

## Phase A — 旧DBをホストの `data/` へ取り出す

名前付きボリュームは File Station から直接見えないため、**app コンテナに一時的な
コピー先(バインド)を足して、コンテナの端末でコピー**します。

1. **File Station** で、現在デプロイ中の `docker-compose.yml`
   (例 `/docker/lowest-finder/docker-compose.yml`)を開いて編集し、`app` サービスの
   `volumes` に**一時的なコピー先を 1 行追加**します(名前付きボリュームはそのまま残す):

   ```yaml
       volumes:
         - db-data:/data
         - ./data:/backup      # ← 一時的に追加(コピー先)
   ```

   ※ ファイル末尾の

   ```yaml
   volumes:
     db-data:
   ```

   は **この時点では消さない**でください。

2. **Container Manager → プロジェクト `lowest-finder` → ビルド/再起動**(up)。
   `app` が起動します。`cloudflared` は NAS 全体で共用する独立プロジェクトから起動します。

3. **外部からの書き込みを止める**ため、Container Manager で **`cloudflared` コンテナだけを停止**
   します(これで公開 URL からアクセスできなくなり、DB は書き込まれない状態になります。
   `app` コンテナは端末操作のため起動したまま)。

4. **Container Manager → コンテナ `app` → 端末(Terminal)** を開き、シェル(`sh` または
   `bash`)を起動して次を実行:

   ```sh
   cp -a /data/. /backup/
   ```

   これで `app.sqlite`(と `-wal` / `-shm` があればそれも)がホストの
   `/docker/lowest-finder/data/` にコピーされます。

5. **File Station** で `/docker/lowest-finder/data/app.sqlite` が出来ていることを確認します。

6. **Container Manager → プロジェクト `lowest-finder` を停止**します。

---

## Phase B — バインドマウント版へ切り替え

7. **Windows 側**で、更新後の `docker-compose.yml`(このリポジトリのバインドマウント版。
   `app` の volumes が `- ./data:/data` で、末尾の `volumes: db-data:` が無いもの)を用意します。

8. **File Station** で `/docker/lowest-finder/docker-compose.yml` を新しい内容に**上書き**
   アップロードします(`data/` フォルダはそのまま残す — ここに移行済み DB があります)。

9. **Container Manager → プロジェクト `lowest-finder` → ビルド/起動**。
   `app` は `./data:/data`(= 移行済み `data/app.sqlite`)を読んで起動します。

10. 公開 URL(例 `https://lowest.example.com`)を開き、**既存のアカウントでログインできる/
    データが残っている**ことを確認します。起動時にマイグレーションが再適用されますが冪等です。

---

## Phase C — 後片付け(任意)

11. 動作確認できたら、**古い名前付きボリューム**(`lowest-finder_db-data` のような名前)は
    不要です。Container Manager のボリューム管理から削除できます
    (見当たらなければ放置でも害はありません。ディスクを少し使うだけです)。

---

## うまくいかないとき

| 症状 | 対処 |
|---|---|
| ログイン後にデータが空 | `./data` へのコピー([A]-4)が失敗、または上書き時に `data/` を消してしまった可能性。Phase A からやり直す(元の名前付きボリュームは Phase C を実施するまで残っている)。 |
| 起動直後に 500/DB エラー | `data/` の中に `app.sqlite` があるか File Station で確認。`-wal`/`-shm` も一緒にコピーできているか。 |
| ログインが 403 | これはボリュームと無関係。`ORIGIN` が公開 URL と一致しているか(`.env`)。 |
| app コンテナに「端末」が無い | プロジェクトのコンテナ一覧から `app` を選び、詳細画面の「端末」タブ →「作成」で `sh` を起動。 |

> **元に戻したい場合**: Phase C を実施するまで元の名前付きボリュームは残っています。
> `docker-compose.yml` を元(`- db-data:/data` と末尾の `volumes: db-data:`)に戻して
> 再デプロイすれば従来どおり動きます。
