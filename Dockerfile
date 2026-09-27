# sta-intra 单镜像: 前端静态资源 + FastAPI 同源部署 (内网离线口径)
#
# 为什么单镜像: 前端走同源相对路径 /api, 镜像不需要在构建期知道后端地址,
# 内网换 IP/端口/域名都不用重新构建; 交付物只有一个 tar, docker load 即起。
#
# 构建 (必须在能访问 Docker Hub / npm / PyPI 的机器上执行):
#   docker build --platform linux/amd64 -t sta-intra:0.2.0 .
#   (--platform 按目标服务器架构填; Apple Silicon 上构建 x86 服务器镜像必须显式指定)
# 导出交付:
#   docker save sta-intra:0.2.0 | gzip > sta-intra-0.2.0.tar.gz

# ---------- Stage 1: 前端构建 ----------
# 固定在构建机原生架构: 跨架构构建时 node/pnpm 走 qemu 模拟会慢一个数量级,
# 而前端产物与 CPU 架构无关, 没必要跟着目标平台跑。
FROM --platform=$BUILDPLATFORM node:22-alpine AS web

# 国内/内网构建机常常访问不了 npm / PyPI 官方源, 这里留出注入点,
# 默认值仍是官方源 (不改变交付口径, 不传 --build-arg 行为与以前一致):
#   docker build --build-arg NPM_REGISTRY=https://registry.npmmirror.com \
#                --build-arg PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple .
ARG NPM_REGISTRY=https://registry.npmjs.org

WORKDIR /web

# 先只拷依赖清单: 改业务源码时这一层缓存仍然命中, 免重装 400MB 依赖
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN npm install -g pnpm@9 --registry="$NPM_REGISTRY" \
    && pnpm install --frozen-lockfile --registry="$NPM_REGISTRY"

COPY frontend/ ./
# 同源部署: 不注入 VITE_API_BASE, 前端一律请求相对路径 /api
RUN pnpm build


# ---------- Stage 2: 运行时 ----------
FROM python:3.12-slim AS runtime

# 同上: pip 与 uv 共用一个源地址 (ARG 作用域仅限本 stage, 所以需再声明一次)
ARG PIP_INDEX_URL=https://pypi.org/simple

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    UV_PYTHON_DOWNLOADS=0

# uv 用 pip 装 (而非 COPY --from=ghcr.io/astral-sh/uv): 依赖 wheel 本来就要走 PyPI,
# 少一个镜像仓库依赖, 内网代理环境更容易放行。
RUN pip install --no-cache-dir --index-url "$PIP_INDEX_URL" "uv==0.5.11"

WORKDIR /app

# 依赖层与源码层分离: 改后端代码不会触发重装依赖
COPY backend/pyproject.toml backend/uv.lock ./
# uv 读 UV_INDEX_URL; 内联传入而不是写进 ENV, 避免把构建机用的镜像源地址固化到运行时镜像里
RUN UV_INDEX_URL="$PIP_INDEX_URL" uv sync --frozen --no-dev

COPY backend/*.py ./
COPY backend/l1/ ./l1/
COPY backend/event_analysis/ ./event_analysis/
# 构建时已同步好的数据库作为「种子」: 首次启动 (数据卷为空) 时由 entrypoint 拷入 DATA_DIR
COPY backend/sta_intra.db /app/seed/sta_intra.db
COPY deploy/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
COPY --from=web /web/dist /app/static

# 非 root 运行: 数据卷目录预建并交给应用账号 (bind mount 时宿主机目录需 chown 10001)
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
    && groupadd --gid 10001 sta \
    && useradd --uid 10001 --gid 10001 --create-home --shell /usr/sbin/nologin sta \
    && mkdir -p /app/data \
    && chown -R sta:sta /app/data /app/seed

# 运行期口径 (均可被 compose / docker run -e 覆盖):
# - SYNC_ENABLED=false: 内网无外网出口, 默认关掉全部联网同步 (定时任务 / 首启
#   补数 / SBDB 现查); 有出口的部署显式设 true 即可恢复。
# - DATA_DIR: SQLite 落盘目录, 指向挂载的数据卷, 升级镜像不丢数据。
ENV PATH="/app/.venv/bin:$PATH" \
    DATA_DIR=/app/data \
    FRONTEND_DIST=/app/static \
    SYNC_ENABLED=false \
    TZ=UTC

USER sta
EXPOSE 8000

# 健康检查: slim 镜像没有 curl, 用标准库探 /health
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4).status==200 else 1)"

ENTRYPOINT ["docker-entrypoint.sh"]
# 单 worker: APScheduler 在进程内, 多 worker 会重复注册同步任务;
# SQLite 单文件也不适合多进程并发写。要扩容请拆后端 + 换 Postgres。
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
