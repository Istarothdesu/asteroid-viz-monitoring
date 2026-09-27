# 内网部署说明（单镜像）

面向**无外网出口的内网环境**：前后端打进一个 Docker 镜像，由 FastAPI 同进程提供
API 与前端静态资源，单端口 `8000` 对外，数据落在 SQLite 单文件。

> 本文的命令均在仓库根目录执行。构建镜像需要能访问 Docker Hub / npm registry / PyPI，
> **必须在有外网的机器上构建**，再以 tar 包带进内网。

---

## 一、为什么是单镜像

| 关注点 | 单镜像（本方案） | 前后端分镜像 |
| --- | --- | --- |
| 后端地址 | 前端走同源相对路径 `/api`，镜像**构建期不需要知道后端地址**，内网换 IP/端口/域名不用重新构建 | 前端必须在 build 时注入 `VITE_API_BASE`，换地址即重新构建发布 |
| 交付物 | 1 个 tar，`docker load` 即起 | 2 个镜像 + compose 编排 + 版本对齐 + CORS |
| 扩缩容 | 后端是只读 API + 进程内 APScheduler + 单文件 SQLite，前端是纯静态，双方都没有独立伸缩诉求 | 拆开的收益目前用不上 |

**什么时候应该拆开**：内网已有统一 nginx/网关；后端要接 PostgreSQL 并独立发布/多副本；
安全域要求前后端隔离；出现多套前端共用一套 API。届时把 `frontend/` 单独打成 nginx 镜像、
构建时注入 `VITE_API_BASE` 即可，后端侧不需要改动（`/api` 路由与 CORS 都还在）。

---

## 二、镜像内容

| 项 | 值 |
| --- | --- |
| 构建阶段 | `node:22-alpine` 构建前端 → `python:3.12-slim` 运行 |
| 前端产物 | `/app/static`（vite `dist`，约 164MB，其中 `image/` 贴图占 146MB） |
| 后端代码 | `/app/*.py`，依赖装在 `/app/.venv`（`uv sync --frozen --no-dev`） |
| 种子数据库 | `/app/seed/sta_intra.db`（构建时仓库里那份已同步好的库） |
| 运行数据目录 | `/app/data`（挂数据卷，SQLite 实际落盘处） |
| 入口脚本 | `/usr/local/bin/docker-entrypoint.sh`（数据卷为空时播种，然后 `exec` CMD） |
| 运行用户 | `sta`（uid/gid 10001，非 root） |
| 启动命令 | `uvicorn main:app --host 0.0.0.0 --port 8000 --workers 1` |

`--workers 1` 是硬约束：APScheduler 在进程内，多 worker 会重复注册同步任务；
SQLite 单文件也不适合多进程并发写。

## 三、环境变量

| 变量 | 镜像默认 | 说明 |
| --- | --- | --- |
| `SYNC_ENABLED` | `false` | **内网口径**：关闭定时同步、首启补数、`by-des` 现查 SBDB（未命中直接 404，不再白等 20s），`POST /api/sync/*` 返回 409。有外网出口的部署设为 `true` |
| `DATA_DIR` | `/app/data` | SQLite 目录，必须与数据卷挂载点一致 |
| `FRONTEND_DIST` | `/app/static` | 前端产物目录；目录内无 `index.html` 时自动只提供 API（纯后端开发场景） |
| `SEED_DB` | `/app/seed/sta_intra.db` | 种子库路径，仅供 entrypoint 播种使用 |
| `DATABASE_URL` | 空 | 设置后覆盖 SQLite，例如 `postgresql+asyncpg://user:pass@host:5432/sta_intra`（`asyncpg` 已在依赖里） |
| `TZ` | `UTC` | 全系统时间口径为 UTC，界面显示的"北京时间"由前端换算，不建议改 |
| `VITE_API_BASE` | 不设 | **构建期**变量。同源部署留空即走相对路径；只有分开部署才需要注入绝对地址 |

---

## 四、构建与交付

```bash
# 1) 构建（目标服务器是 x86_64 就必须带 --platform，Apple Silicon 上尤其容易漏）
docker build --platform linux/amd64 -t sta-intra:0.2.0 .

# 2) 导出
docker save sta-intra:0.2.0 | gzip > sta-intra-0.2.0.tar.gz

# 3) 带进内网后，在每台 Swarm 节点（或单机）导入
gunzip -c sta-intra-0.2.0.tar.gz | docker load
```

前置条件与注意点：

- **BuildKit**：Dockerfile 用了 `FROM --platform=$BUILDPLATFORM` 让前端构建跑在构建机原生架构
  （跨架构构建时避免 node/pnpm 走 qemu 模拟，快一个数量级）。Docker ≥ 23 默认启用；
  更老的版本先 `export DOCKER_BUILDKIT=1`。
- **网络**：构建机需可达 Docker Hub（node/python 基础镜像）、npm registry（`pnpm install`）、
  PyPI（`pip install uv` + `uv sync` 拉 wheel）。有内网代理时给 docker/pip/npm 各自配好源。
- **架构**：`exec format error` 基本都是架构不匹配，用 `docker image inspect sta-intra:0.2.0 | grep Architecture` 核对。
- **体积**：镜像约 500MB（前端产物 164MB + Python 运行时与依赖）。`dist/image` 里 `.jpg` 与
  `.ktx2` 两套贴图都在被使用（ktx2 给三维场景、jpg 给态势面板缩略图），不能简单删。

### 构建前强烈建议：出包四步（根数刷新 → 星历烘焙 → 校验 → 构建）

**1) 全量根数刷新**：`named` 定时任务只刷命名清单 30 颗，by-des 缓存的 CAD 天体
（数百颗）不刷会历元老化。每次出包前对全表重刷（约 10 分钟，幂等可重入）：

```bash
cd backend
uv run python refresh_fullprec.py     # 或对有外网的运行实例 POST /api/sync/refresh
```

**2) 星历烘焙**：行星/月球位置来自 SPICE 烘焙的 `planet_ephemeris` 表
（一次性，种子库已含则跳过）；重点小行星（PHA + 命名清单 ~71 颗）位置来自
Horizons 烘焙的 `asteroid_ephemeris` 表（随根数刷新重烘，约 25 分钟，
已烘焙行按窗口参数匹配自动跳过，中断后重跑即断点续烘）：

```bash
cd backend
uv sync --extra bake                 # 安装 spiceypy (仅行星烘焙需要, 运行时镜像不含)
uv run python download_kernels.py    # 一次性: 下载 SPICE 内核 (NAIF 不可达时自动走 ESA 镜像)
uv run python bake_ephemeris.py      # 行星: 烘焙进当前种子库, 约 10 秒, +25MB
uv run python bake_asteroid_ephemeris.py   # 小行星: 1980-2060 窗口, +36MB; 亦可 POST /api/sync/ephem_ast
```

内核仅烘焙期使用，不入镜像、不入 git；运行时与内网部署只消费表数据。

**3) 出包门禁（每次改库后必跑）**：轨道相关代码或数据更新后，用校验管线出精度报告，
任一 FAIL 不应出包：

```bash
cd backend
uv run python validate.py    # 产出 validation_report.md; 退出码非零 = 有 FAIL 项
```

**4) 构建镜像**（见上方命令）。

> **存量库注意**：2026-09 之前同步的 `asteroids` 表是 SBDB 展示级舍入值
> （M 精确到整数度，相位误差可达数百万 km）。`fetch_sbdb` 已加 `full-prec`，
> 存量库需执行一次 `uv run python refresh_fullprec.py` 全量重刷（约 10 分钟）。

**SBDB 缓存预热**：`/api/asteroids/by-des/{des}` 是「库里命中就直出，否则现查 SBDB」。内网 `SYNC_ENABLED=false`
时未命中直接 404，**事件专题页就拿不到轨道根数**（无法预览轨道、无法复盘）。
CAD 事件有数百条，逐个手点不现实，用脚本批量预热：

```bash
# 在有外网的机器上：临时开同步跑一个容器
docker run --rm -d --name sta-warm -p 8000:8000 \
  -e SYNC_ENABLED=true -v sta-warm:/app/data sta-intra:0.2.0

# 等首启补数跑完（docker logs -f sta-warm 出现「同步 cad 完成」「同步 mpcorb 完成」）
python3 deploy/prewarm_cache.py --base http://127.0.0.1:8000

# 取出预热好的库，覆盖仓库里的种子库，然后重新 build 镜像
docker cp sta-warm:/app/data/sta_intra.db backend/sta_intra.db
docker build --platform linux/amd64 -t sta-intra:0.2.0 .
```

### 构建机没装 docker 时：直接跑后端预热

预热只依赖「一个开着同步的后端」，不依赖 docker。在仓库根目录：

```bash
# 1) 拷一份到临时目录，避免预热中途失败污染仓库里那份种子库
mkdir -p .prewarm && cp backend/sta_intra.db .prewarm/

# 2) 起后端（必须 SYNC_ENABLED=true，否则 by-des 未命中直接 404 不会写缓存）
cd backend
DATA_DIR="$PWD/../.prewarm" SYNC_ENABLED=true FRONTEND_DIST=/nonexistent \
  uv run uvicorn main:app --host 127.0.0.1 --port 8002
# 定时任务是 cron/interval，不会启动即跑；bootstrap 只对空库生效，所以这一步不会误触 MPCORB 大文件下载

# 3) 另开一个终端批量预热（638 个天体约 13 分钟；脚本串行，对 JPL 接口更友好）
python3 deploy/prewarm_cache.py --base http://127.0.0.1:8002

# 4) 停服后先合并 WAL 再拷回 —— .dockerignore 排除了 *.db-wal，
#    数据若留在 WAL 里没并进主库文件，拷进镜像就会丢
python3 -c "import sqlite3;c=sqlite3.connect('.prewarm/sta_intra.db');print(c.execute('PRAGMA wal_checkpoint(TRUNCATE)').fetchone(), c.execute('PRAGMA integrity_check').fetchone())"
cp .prewarm/sta_intra.db backend/sta_intra.db
rm -rf .prewarm
```

预热完成的判据（本次实测值，可作为基准对比）：

```bash
python3 - <<'EOF'
import sqlite3
c = sqlite3.connect('backend/sta_intra.db')
tot = c.execute('select count(distinct designation) from close_approaches').fetchone()[0]
have = c.execute('select count(distinct ca.designation) from close_approaches ca '
                 'join asteroids a on a.designation=ca.designation').fetchone()[0]
print(f'CAD 天体 {tot}, 已缓存 {have}, 缺口 {tot-have}  <- 缺口必须为 0')
print('asteroids 总数:', c.execute('select count(*) from asteroids').fetchone()[0])
EOF
```

缺口为 0 时，离线部署下**全部** CAD 事件专题页都能直接拿到根数（实测单次 `by-des` 约 0.003s，
638 个全量校验 0.7s 跑完）；有缺口则对应事件打开时会 404，无法预览轨道与复盘。

---

## 五、单机 Docker 运行

```bash
docker compose up -d --build      # 或已 load 镜像时: docker compose up -d
docker compose logs -f sta-intra
```

访问 `http://<宿主机IP>:8000/`。数据保存在命名卷 `sta-intra_sta-data`。

## 六、Swarm 集群运行

```bash
docker stack deploy -c docker-compose.yml sta-intra
docker stack services sta-intra
docker stack ps sta-intra
docker service logs -f sta-intra_sta-intra
```

Swarm 专属注意点（都已在 `docker-compose.yml` 里固化，改动前请先读懂原因）：

1. **`stack deploy` 不执行 `build:`**，只认 `image:`。必须先把镜像分发到**每个可能承载任务的节点**
   （逐台 `docker load`，或推到内网 registry 后 `docker pull`）。
2. **副本数必须是 1**。SQLite 单文件 + 进程内调度器，多副本会各写各的库、数据直接分裂。
   需要横向扩容时请先拆后端 + 换 PostgreSQL。
3. **命名卷是节点本地的**。所以 compose 里用 `placement.constraints` 把任务钉在固定节点
   （默认 `node.role == manager`；多 manager 集群建议改成 `node.hostname == <你的节点名>`）。
   否则任务漂移到别的节点等于换了一份空库 —— entrypoint 会重新播种，数据回退到镜像版本。
4. **端口模式**：`mode: ingress`（默认）在集群任意节点 IP:8000 都能访问；
   只想在承载节点开放就改 `mode: host`。
5. `restart:` 字段 Swarm 会忽略，只认 `deploy.restart_policy`（两者都已写，兼容单机与集群）。

升级与回滚：

```bash
# 升级：各节点 load 新镜像后
docker service update --image sta-intra:0.2.1 sta-intra_sta-intra
# 或直接改 compose 里的 image 标签再 stack deploy 一次
docker stack deploy -c docker-compose.yml sta-intra

# 回滚
docker service rollback sta-intra_sta-intra
```

---

## 七、数据持久化与更新

- 落盘位置：容器内 `/app/data/sta_intra.db`（命名卷 `sta-intra_sta-data`，
  宿主机路径 `docker volume inspect sta-intra_sta-data`）。
- 播种规则（`deploy/docker-entrypoint.sh`）：**只在数据卷为空时**拷入种子库；
  卷里已有库文件一律以卷为准，不覆盖。所以升级镜像不会冲掉现场数据。
- 备份：

  ```bash
  docker run --rm -v sta-intra_sta-data:/data -v "$PWD":/backup alpine \
    tar czf /backup/sta_intra-$(date +%F).tar.gz -C /data sta_intra.db
  ```

- **内网数据更新**（无外网，只能离线换库）：在有外网的机器上按第四节预热出新库，
  然后停服务 → 覆盖卷里的 `sta_intra.db` → 起服务。
  也可以在有出口的时段临时 `docker service update --env-add SYNC_ENABLED=true` 让它自己同步。

---

## 八、部署后验证清单

```bash
B=http://<宿主机IP>:8000
curl -s  $B/health                                   # {"status":"ok"}
curl -s  $B/api/asteroids        | head -c 120       # {"data":[...],"source":"db"}
curl -s  $B/api/events/close-approaches | head -c 80 # CAD 事件（预热过的库应有数百条）
curl -s -o /dev/null -w '%{size_download}\n' $B/api/ephemeris  # 星历（行星+重点小行星均已烘焙的库应 ~61MB；~25MB=仅行星；404=未烘焙，前端回退开普勒/简化根数表）
curl -sI $B/                                          # 200 text/html
curl -sI $B/events                                    # 200 text/html（SPA 深链回落 index.html）
curl -sI $B/image/8k_moon.jpg                         # 200 image/jpeg，accept-ranges: bytes
curl -s  $B/api/not-exist                             # 404 JSON（不是 HTML）
curl -s -X POST $B/api/sync/cad                       # 离线口径下 409
```

浏览器侧：打开首页 → F12 Network 里 `/api/*` 与 `/image/*`、`/basis/*`、`/assets/*`
应当**全部指向同一个 host:port**（这就是同源部署生效的标志）；
直接刷新 `/events/<某个事件key>` 深链接不应 404。

## 九、常见问题

| 现象 | 原因与处理 |
| --- | --- |
| 刷新 `/events/xxx` 报 404 | 前面挂了自己的 nginx 但没配 `try_files $uri /index.html;`。用本镜像直出不会有这个问题 |
| 前端请求打到 `localhost:8000` | 用了改造前的旧构建产物。现在 `client.ts` 默认相对路径，重新 build 镜像即可 |
| 事件专题页提示根数获取失败 / 无法复盘 | `by-des` 未预热，见第四节 |
| 日志周期性出现同步失败、启动卡住 | `SYNC_ENABLED` 被设成了 `true`（镜像默认 `false`） |
| 多副本后数据不一致 | SQLite 单文件，`replicas` 必须为 1 |
| 容器 `exec format error` | 架构不匹配，`--platform` 重建 |
| bind mount 后写库失败 | 镜像以 uid 10001 运行，宿主机目录需 `chown -R 10001:10001 <目录>` |
| `uv sync` 失败 | 构建机不可达 PyPI，或需要指定内网源（`UV_INDEX_URL` / `--index-url`） |

## 十、与旧编排的差异

仓库原来的 `docker-compose.yml`（PostgreSQL + `build: ./backend`）已失效：
仓库里没有 `backend/Dockerfile`，且 `backend/db.py` 默认走 SQLite。
现已重写为本文的单镜像方案。若要回到 PostgreSQL：设 `DATABASE_URL`，
并把数据卷/密码等相应补进 compose（`asyncpg` 依赖已就绪）。
