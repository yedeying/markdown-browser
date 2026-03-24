#!/bin/bash
# vmd 一键构建+部署脚本
# 方案：本地构建 dist/，再用 Dockerfile.local 打包（跳过容器内编译，解决 Docker OOM）

set -e

BUN="${BUN_PATH:-$HOME/.bun/bin/bun}"

# 检查 bun 是否存在
if [ ! -f "$BUN" ]; then
  echo "[ERROR] bun not found at $BUN"
  echo "  请设置 BUN_PATH 环境变量，例如：BUN_PATH=/usr/local/bin/bun ./build.sh"
  exit 1
fi

echo ""
echo "════════════════════════════════════════"
echo "  vmd 一键构建+部署"
echo "════════════════════════════════════════"

# Step 1: 前端构建
echo ""
echo "[1/4] 构建前端 (vite)..."
"$BUN" x vite build
echo "  ✓ dist/client/ 已生成"

# Step 2: 后端构建
echo ""
echo "[2/4] 构建后端 (bun build)..."
"$BUN" build src/cli.ts --outdir dist --target bun
echo "  ✓ dist/cli.js 已生成"

# Step 3: Docker 镜像构建（使用 Dockerfile.local）
echo ""
echo "[3/4] 构建 Docker 镜像 (Dockerfile.local)..."

# 临时替换 .dockerignore
if [ -f ".dockerignore" ]; then
  cp .dockerignore .dockerignore.bak
fi
cp .dockerignore.local .dockerignore

# 构建镜像（trap 确保即使出错也还原 .dockerignore）
restore_dockerignore() {
  if [ -f ".dockerignore.bak" ]; then
    mv .dockerignore.bak .dockerignore
  fi
}
trap restore_dockerignore EXIT

docker build -f Dockerfile.local -t vmd:latest .

echo "  ✓ vmd:latest 镜像已构建"

# Step 4: 重启容器
echo ""
echo "[4/4] 重启 Docker 容器..."
docker-compose down --remove-orphans 2>/dev/null || true
docker-compose up -d

echo ""
echo "════════════════════════════════════════"
echo "  ✓ 部署完成！"
echo "  访问: http://localhost:8193"
echo "════════════════════════════════════════"
echo ""
