# Recepita on Azure Web App for Containers – Quick Start

このフォルダには、Recepita (Next.js 14 / Prisma) を **Azure Web App for Containers** にコンテナデプロイするための最小構成が入っています。

## 含まれるもの
- `Dockerfile`：Next.js + Prisma 向けマルチステージ。`prisma generate` と `next build` を実行します。
- `docker/startup.sh`：起動時に `prisma migrate deploy` を実行してから `next start`。
- `.dockerignore`：ビルド不要物の除外。
- `azure-deploy.sh`：ACR ビルド → App Service 反映 → App Settings 設定までを一気通貫。

## 前提
- **Azure PostgreSQL Flexible Server** を利用します。接続文字列は `DATABASE_URL` に設定してください。
- JWT は `JWT_SECRET`。フロントから使う URL は `NEXT_PUBLIC_APP_URL` です。
- メール送信は Azure Communication Services (ACS) か SMTP のどちらかを選べます。
- OCR は `OCR_PROVIDER=azure | gcv` などにし、必要なキーを設定してください。

## 使い方（初回）
```bash
# プロジェクトルートで
bash azure-deploy.sh
```

スクリプト内の `RG, LOC, ACR, PLAN, APP` などは適宜変更してください。

## よくあるハマりどころ
- **PORT**：App Service では `PORT` 環境変数が渡されます。`next start -p $PORT` を使用しています。
- **Prisma Engine**：alpine で Prisma のバイナリが見つからない場合があるため、`node_modules/.prisma` と `@prisma` を Runner にコピーしています。
- **ビルド失敗（sharp）**：`apk add python3 make g++` を入れて対処しています。
- **.next/standalone** を使う場合は `next.config.js` に `output: 'standalone'` を有効にするとイメージを小さくできます。現状はフルコピーでも動作するようにしています。

## 追加の App Settings 候補
- `WEBSITE_HOSTNAME`（自動付与）を `APP_URL` や `NEXT_PUBLIC_APP_URL` のデフォルトに利用する場合は、実行時にアプリ側で参照してください。
- `DEFAULT_USER_ID`：初期データ投入などで使う場合。
- `UPLOAD_DIR` / `STORAGE_LOCAL_DIR`：ローカルストレージ保存先（App Service の永続領域は `/home` 配下）。
```
