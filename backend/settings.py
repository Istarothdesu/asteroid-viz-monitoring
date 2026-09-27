"""服务端运行配置。"""

import os


def _truthy(raw: str | None, default: bool) -> bool:
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


# 离线内网部署关闭所有外部数据补取与定时同步。
SYNC_ENABLED = _truthy(os.getenv("SYNC_ENABLED"), True)
