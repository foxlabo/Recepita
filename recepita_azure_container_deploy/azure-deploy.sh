#!/usr/bin/env bash
set -euo pipefail

# ===== 設定 =====
RG="rg-recepita-dev"               # リソースグループ
APP="app-recepita-dev-jw-v2"       # App Service 名
ACR="recepitaacr"                  # ACR 名 (ログインサーバは $ACR.azurecr.io)
IMAGE="recepita"                   # リポジトリ名
TAG="v2"                           # タグ

# ===== ログイン／存在確認 =====
az group show -n "$RG" >/dev/null
az acr show -n "$ACR" >/dev/null
az webapp show -g "$RG" -n "$APP" >/dev/null

REGISTRY="${ACR}.azurecr.io"
IMAGE_FQN="${REGISTRY}/${IMAGE}:${TAG}"

echo "Packing & building with ACR Tasks..."
az acr build \
  --registry "$ACR" \
  --image "$IMAGE:${TAG}" \
  --file recepita_azure_container_deploy/Dockerfile \
  .

echo "Updating App Service to use: ${IMAGE_FQN}"
# 新フラグ名（推奨）
az webapp config container set \
  --resource-group "$RG" \
  --name "$APP" \
  --container-image-name "$IMAGE_FQN" \
  --container-registry-url "https://${REGISTRY}"

# ACR 認証は、App Service の SystemAssigned MI に ACR Pull 権限付与済み想定
# 必要なら↓（例）:
# az role assignment create \
#   --assignee "$(az webapp identity show -g "$RG" -n "$APP" --query principalId -o tsv)" \
#   --role "AcrPull" \
#   --scope "$(az acr show -n "$ACR" --query id -o tsv)"

echo "Restarting App Service..."
az webapp restart -g "$RG" -n "$APP"

echo "Done. App URL: https://${APP}.azurewebsites.net"
