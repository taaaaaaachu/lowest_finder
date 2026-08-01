#!/bin/sh
set -e

# 起動バナー: 動いているイメージのバージョン(コミットSHA)を1行で出す。
# Watchtower による自動入れ替えが反映されたかをログで確認するための目印。
echo "lowest_finder 起動: version=${APP_VERSION:-dev}"

# 起動時に DB マイグレーションを適用してからサーバーを起動する。
echo "マイグレーションを適用します (DATABASE_PATH=$DATABASE_PATH)"
node scripts/migrate.js

echo "サーバーを起動します (PORT=$PORT)"
exec node build
