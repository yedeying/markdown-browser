#!/bin/bash

# Docker 容器运行脚本
# 用法:
#   ./docker-run.sh <markdown_dir> [port]
#   ./docker-run.sh ~/docs 8888
#   ./docker-run.sh ~/docs          # 默认端口 8888

set -e

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 参数解析
if [[ $# -lt 1 ]]; then
  echo -e "${RED}用法: $0 <markdown_dir> [port]${NC}"
  echo ""
  echo "示例:"
  echo "  $0 ~/docs"
  echo "  $0 ~/docs 9000"
  exit 1
fi

MARKDOWN_DIR="$1"
PORT="${2:-8888}"

# 验证目录存在
if [[ ! -d "$MARKDOWN_DIR" ]]; then
  echo -e "${RED}错误: 目录不存在 '$MARKDOWN_DIR'${NC}"
  exit 1
fi

# 转换为绝对路径
MARKDOWN_DIR=$(cd "$MARKDOWN_DIR" && pwd)

echo -e "${YELLOW}📦 构建 Docker 镜像...${NC}"
docker build -t vmd:latest .

echo -e "${YELLOW}🚀 启动 vmd 容器...${NC}"
docker run --rm \
  -p "$PORT:8888" \
  -v "$MARKDOWN_DIR:/markdown:ro" \
  -e TZ=Asia/Shanghai \
  --name vmd-server \
  vmd:latest

echo -e "${GREEN}✓ vmd 服务已停止${NC}"
