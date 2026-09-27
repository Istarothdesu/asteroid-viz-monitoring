"""一次性维护: 全精度重刷 asteroids 表全部轨道根数。

背景: 2026-09 前 fetch_sbdb 未加 full-prec, SBDB 返回展示级舍入值
(M 整数度 → 数百万 km 相位误差)。本脚本对库内全部天体 (命名列表 +
by-des 缓存的 CAD 天体) 原地刷新轨道字段, 保留 name_zh/diam_km/spin_h 等
本地覆盖列。仅在有外网的数据工厂执行。

实际逻辑在 sync._do_refresh (同步任务 "refresh"), 出包流程也可通过
POST /api/sync/refresh 触发 (需 SYNC_ENABLED=true)。

用法: uv run python refresh_fullprec.py
"""

import asyncio
import logging

from sync import run_sync

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    raise SystemExit(0 if asyncio.run(run_sync("refresh")) else 1)
