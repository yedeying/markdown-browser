# Docker 部署指南

## 快速开始

### 1. 使用 docker-run.sh（推荐）

最简单的方式，一键构建并运行：

```bash
# 浏览 ~/docs 目录（默认端口 8888）
./docker-run.sh ~/docs

# 指定端口
./docker-run.sh ~/docs 9000
```

### 2. 使用 docker-compose

```bash
# 编辑 docker-compose.yml，修改 volumes 中的路径
# volumes:
#   - ./docs:/markdown:ro

# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f vmd

# 停止服务
docker-compose down
```

### 3. 手动 Docker 构建和运行

```bash
# 构建镜像
docker build -t vmd:latest .

# 运行容器（浏览 /home/user/docs 目录）
docker run -d \
  --name vmd-server \
  -p 8888:8888 \
  -v /home/user/docs:/markdown:ro \
  vmd:latest

# 访问服务
open http://localhost:8888

# 查看日志
docker logs -f vmd-server

# 停止容器
docker stop vmd-server
docker rm vmd-server
```

## 镜像特性

### 镜像大小
- 构建镜像：包含 Node 依赖 (~500MB)
- 运行镜像：`oven/bun:slim` 基础，仅包含 dist/ + node_modules (~400-500MB)

### 多阶段构建
- **Stage 1**（builder）：完整构建环境，编译前端 + 后端
- **Stage 2**（slim）：仅包含运行时必需文件，减少最终镜像体积

### 健康检查
容器包含内置健康检查：
```bash
docker inspect --format='{{json .State.Health}}' vmd-server
```

## 常见用法

### 编辑模式（可写入修改）

移除 `:ro`（只读）标志，允许在容器内编辑文件：

```bash
docker run -d \
  --name vmd-server \
  -p 8888:8888 \
  -v /home/user/docs:/markdown \
  vmd:latest
```

### 多个端口

若需要同时运行多个 vmd 实例，指定不同端口和容器名：

```bash
docker run -d --name vmd-1 -p 8888:8888 -v /path1:/markdown:ro vmd:latest
docker run -d --name vmd-2 -p 8889:8888 -v /path2:/markdown:ro vmd:latest
```

### 资源限制

限制容器的 CPU 和内存使用：

```bash
docker run -d \
  --cpus 2 \
  --memory 512m \
  -p 8888:8888 \
  -v /home/user/docs:/markdown:ro \
  vmd:latest
```

### 自定义日志

docker-compose.yml 已配置日志驱动：
- 最大文件大小：10MB
- 保留文件数：3

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| TZ | UTC | 时区（如 Asia/Shanghai） |

示例：
```bash
docker run -d -e TZ=Asia/Shanghai -p 8888:8888 -v ~/docs:/markdown:ro vmd:latest
```

## 挂载点说明

| 容器路径 | 说明 | 模式 |
|---------|------|------|
| `/markdown` | Markdown 文档目录 | ro（只读）或无标志（可写） |

### 目录权限

- **只读** (`:ro`)：安全，不会修改源文件，适合生产
- **可写**：允许在 web 界面编辑，需要确保容器有写权限

## 故障排查

### 1. 镜像构建失败

```bash
# 查看完整构建日志
docker build --progress=plain -t vmd:latest .

# 清理之前的构建缓存
docker build --no-cache -t vmd:latest .
```

### 2. 容器启动但无法访问

```bash
# 检查容器状态
docker ps -a | grep vmd

# 查看容器日志
docker logs vmd-server

# 测试容器内网络
docker exec vmd-server curl http://localhost:8888
```

### 3. 文件权限问题

如果宿主机文件权限限制，可添加 `--user` 或调整文件权限：

```bash
# 使用特定 UID/GID
docker run -d --user 1000:1000 -p 8888:8888 -v ~/docs:/markdown:ro vmd:latest

# 或修改宿主机文件权限
chmod 644 ~/docs/*.md
```

### 4. 端口已被占用

```bash
# 查看占用 8888 端口的进程
lsof -i :8888

# 使用其他端口
docker run -d -p 9000:8888 -v ~/docs:/markdown:ro vmd:latest
```

## 性能优化

### 1. 使用本地镜像缓存

构建镜像后不再需要重复构建（仅当源码变更时重建）：

```bash
# 第一次
docker build -t vmd:latest .  # ~2-3 分钟

# 之后直接运行（秒级启动）
docker run -d -p 8888:8888 -v ~/docs:/markdown:ro vmd:latest
```

### 2. 减少挂载路径

仅挂载必要的 Markdown 目录，避免挂载整个项目：

```bash
# ✓ 好
docker run -d -v ~/docs:/markdown:ro vmd:latest

# ✗ 避免
docker run -d -v ~/my-large-project:/markdown:ro vmd:latest
```

### 3. 使用 tmpfs 缓存（可选）

对于频繁访问的文件，可使用 tmpfs 提高性能：

```bash
docker run -d \
  --tmpfs /tmp \
  -p 8888:8888 \
  -v ~/docs:/markdown:ro \
  vmd:latest
```

## 部署到云平台

### Docker Hub

推送镜像到 Docker Hub：

```bash
# 标记镜像
docker tag vmd:latest yourname/vmd:latest

# 登录 Docker Hub
docker login

# 推送
docker push yourname/vmd:latest

# 其他人拉取并运行
docker pull yourname/vmd:latest
docker run -p 8888:8888 -v ~/docs:/markdown:ro yourname/vmd:latest
```

### Kubernetes

基本的 Kubernetes 部署清单（可选）：

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: vmd
spec:
  replicas: 1
  selector:
    matchLabels:
      app: vmd
  template:
    metadata:
      labels:
        app: vmd
    spec:
      containers:
      - name: vmd
        image: vmd:latest
        ports:
        - containerPort: 8888
        volumeMounts:
        - name: markdown
          mountPath: /markdown
          readOnly: true
      volumes:
      - name: markdown
        hostPath:
          path: /home/user/docs
---
apiVersion: v1
kind: Service
metadata:
  name: vmd-service
spec:
  selector:
    app: vmd
  ports:
  - port: 8888
    targetPort: 8888
  type: LoadBalancer
```

## 常见问题

**Q: Docker 镜像大小？**  
A: 约 400-500MB（包含 bun 运行时 + node_modules）

**Q: 能否在 ARM 架构上运行？**  
A: 是，oven/bun 官方镜像支持 linux/amd64 和 linux/arm64

**Q: 可以持久化编辑吗？**  
A: 可以，移除 `:ro` 标志并确保宿主机目录有写权限

**Q: 如何更新 vmd 版本？**  
A: 修改源码后重新构建镜像（docker build -t vmd:latest .）

**Q: 能否在 Docker Desktop 中使用？**  
A: 可以，完全兼容 Docker Desktop（macOS/Windows/Linux）
