#!/bin/sh
# sta-intra 容器入口: 数据卷播种 + 交给 uvicorn。
#
# 内网离线部署下数据不会自动更新, 所以镜像里带一份构建时已同步好的
# sta_intra.db 作为「种子」。规则是只在数据卷为空时播种一次:
#   - 卷里已有库文件 → 一律以卷为准, 不覆盖 (保住手工触发的同步结果);
#   - 卷为空 → 拷入种子库, 首启即有完整数据可查;
#   - 镜像没有种子库 → 新建空库 (离线模式下前端自动降级到内置静态数据)。
set -e

DATA_DIR="${DATA_DIR:-/app/data}"
DB_FILE="$DATA_DIR/sta_intra.db"
SEED_FILE="${SEED_DB:-/app/seed/sta_intra.db}"

if [ ! -f "$DB_FILE" ]; then
    mkdir -p "$DATA_DIR"
    if [ -f "$SEED_FILE" ]; then
        echo "[entrypoint] 数据卷为空, 播种镜像内置数据库: $SEED_FILE -> $DB_FILE"
        cp "$SEED_FILE" "$DB_FILE"
    else
        echo "[entrypoint] 数据卷为空且镜像无种子库, 将新建空库 (离线模式下前端降级静态数据)"
    fi
else
    echo "[entrypoint] 使用已有数据库: $DB_FILE"
fi

echo "[entrypoint] SYNC_ENABLED=${SYNC_ENABLED:-true} DATA_DIR=$DATA_DIR"
exec "$@"
