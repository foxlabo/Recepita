# Recepita on Azure Web App for Containers – Quick Start

このフォルダには、Recepita (Next.js 16 / Prisma 7 / PostgreSQL) を **Azure Web App for Containers** にコンテナデプロイするための構成が入っています。ビルドコンテキストは **リポジトリのルート** です。

## 含まれるもの
- `Dockerfile`：マルチステージ構成。
  - `runner`（既定のターゲット）：Next.js の `output: 'standalone'` 出力を `node server.js` で起動する最小イメージ。`.next/static` と `public` を同梱し、**非 root ユーザー（`nextjs`, uid 1001）** で実行します。
  - `migrate`：`prisma migrate deploy` を 1 回実行するためのジョブ用イメージ（Prisma CLI 入り）。
- `docker/startup.sh`：起動スクリプト。イメージに Prisma CLI がある場合のみ `prisma migrate deploy` を実行し、その後 `node server.js` を起動します（既定の `runner` イメージには CLI が無いため、マイグレーションはスキップされます）。
- `azure-deploy.sh`：ACR ビルド → App Service のイメージ更新 → 再起動。
- `.dockerignore` は **リポジトリのルート** にあります（`.env*`、`node_modules`、`.next`、`.git`、`*.log`、`.storage`、`uploads` などを除外）。

## ビルドと実行（ローカル確認）
```bash
# リポジトリのルートで
docker build -f recepita_azure_container_deploy/Dockerfile -t recepita .
docker run --rm -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e JWT_SECRET="(32文字以上のランダム文字列)" \
  -e APP_URL="http://localhost:3000" \
  recepita
```

## マイグレーション（デプロイごとに、アプリ更新の前に実行）
アプリのイメージには Prisma CLI を含めていないため、マイグレーションは別ステップで適用します。

```bash
# 方法 1: migrate ターゲットのイメージを使う
docker build -f recepita_azure_container_deploy/Dockerfile --target migrate -t recepita-migrate .
docker run --rm -e DATABASE_URL="postgresql://..." recepita-migrate

# 方法 2: 開発環境・CI から直接実行する
DATABASE_URL="postgresql://..." npx prisma migrate deploy
```

## 使い方（Azure、初回）
```bash
# リポジトリのルートで
bash recepita_azure_container_deploy/azure-deploy.sh
```
スクリプト内の `RG, APP, ACR, IMAGE, TAG` は適宜変更してください。スクリプトの実行前に上記のマイグレーションを適用してください。

## 必須の App Settings（環境変数）
- `DATABASE_URL`：Azure Database for PostgreSQL Flexible Server の接続文字列（`sslmode=require` 推奨）。
- `JWT_SECRET`：セッション JWT の署名鍵（HS256）。32 文字以上のランダム値。変更すると全セッションが無効になります。
- `APP_URL`：公開 URL（例 `https://app-recepita.azurewebsites.net`）。メール内リンクの生成に使います。**本番で未設定の場合、確認メールの送信はエラーになります。**
- `AZURE_COMMUNICATION_CONNECTION_STRING` / `AZURE_COMMUNICATION_SENDER`：Azure Communication Services のメール送信設定（新規登録・メールアドレス変更の確認メール）。

## 任意の App Settings
- `OCR_PROVIDER=azure`、`AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT`、`AZURE_DOCUMENT_INTELLIGENCE_KEY`（`AZURE_DOCUMENT_INTELLIGENCE_API_VERSION`）：レシート / 請求書 OCR。
- `OPENAI_API_KEY`、`OPENAI_OCR_CATEGORY_MODEL`：OCR 結果からの経費区分推定。

## 注意点
- **PORT**：App Service が `PORT` / `WEBSITES_PORT` を渡す場合はそのポートで待ち受けます（既定 3000）。`HOSTNAME=0.0.0.0` で全インターフェースにバインドします。
- **HTTPS**：本番ビルドは `Strict-Transport-Security` を返します。App Service の「HTTPS のみ」を有効にしてください。セッション Cookie は本番では `Secure` 属性付きです。
- **クライアント IP**：レート制限は `X-Forwarded-For` の先頭の値（App Service のフロントエンドが付与）を使います。App Service の前段に別のプロキシを置く場合は、そのプロキシがこのヘッダーを正しく上書きするよう設定してください。
- **ヘルスチェック**：`/api/ping` が 200 を返します（Dockerfile の `HEALTHCHECK` でも使用）。
