# 多阶段构建：stage 1 - 构建阶段
FROM oven/bun:latest as builder

WORKDIR /app

# 复制项目文件
COPY package.json bun.lock tsconfig.json vite.config.ts index.html ./
COPY src ./src

# 安装依赖（分开 install 避免后续步骤 OOM）
RUN bun install --frozen-lockfile

# 前端构建（单独 RUN 层，减少峰值内存）
RUN bun x vite build

# 后端构建
RUN bun build src/cli.ts --outdir dist --target bun

# 多阶段构建：stage 2 - 运行阶段（slim 基础镜像）
FROM oven/bun:slim

WORKDIR /app

# 仅复制必需的运行时文件
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# 创建默认 markdown 目录（挂载点）
RUN mkdir -p /markdown

# 标记 Docker 环境，禁用浏览器自启
ENV DOCKER_CONTAINER=true

# 暴露端口
EXPOSE 8197

# 默认启动命令：浏览 /markdown 目录
# 注意：容器内绑定 0.0.0.0 以允许 Docker 端口转发，实际访问限制由 Docker 端口映射控制
ENTRYPOINT ["bun", "dist/cli.js"]
CMD ["/markdown", "--port", "8888", "--host", "::"]
