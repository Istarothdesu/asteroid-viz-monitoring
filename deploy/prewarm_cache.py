#!/usr/bin/env python3
"""离线部署前的 SBDB 风险数据缓存预热。

背景: 事件专题页打开 CAD 事件时要调 /api/asteroids/by-des/{des} 取轨道根数,
该接口「库里有就直出, 没有才现查 SBDB」。内网无外网出口时 (SYNC_ENABLED=false)
未命中会直接 404, 专题页拿不到根数就没法预览轨道/复盘。

所以要在**有外网的机器上**先把关心的天体查一遍，再显式刷新协方差。
后者不能依赖 ``by-des``：该接口命中已有根数缓存时会直接返回，不会更新协方差。
之后把这份库当作镜像种子 (backend/sta_intra.db) 或数据卷内容带进内网。

用法:
    python3 deploy/prewarm_cache.py                      # 默认 http://127.0.0.1:8000
    python3 deploy/prewarm_cache.py --base http://host:8000 --limit 50
"""

import argparse
import json
import time
import urllib.error
import urllib.parse
import urllib.request


def _post_json(url: str, payload: dict[str, str], timeout: float) -> None:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    urllib.request.urlopen(request, timeout=timeout).read()


def _refresh_source(base: str, source: str, timeout: float) -> str:
    """后台同步完成后才继续，避免预热或复制到一半更新的 SQLite。"""
    with urllib.request.urlopen(f"{base}/api/sync/status", timeout=timeout) as response:
        previous = json.load(response).get(source, {}).get("lastSyncAt")
    _post_json(f"{base}/api/sync/{source}", {}, timeout)
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        with urllib.request.urlopen(f"{base}/api/sync/status", timeout=timeout) as response:
            status = json.load(response).get(source, {})
        refreshed = status.get("lastSyncAt") != previous
        if refreshed and status.get("status") == "ok":
            return f"完成（{status.get('recordCount', 0)} 条）"
        if refreshed and status.get("status") == "error":
            return f"失败 {status.get('message', '未知错误')}"
        time.sleep(0.5)
    return "等待超时"


def main() -> int:
    ap = argparse.ArgumentParser(description="预热 CAD 事件的 SBDB 根数、协方差与 Sentry 缓存")
    ap.add_argument("--base", default="http://127.0.0.1:8000", help="后端地址")
    ap.add_argument("--limit", type=int, default=0, help="只预热前 N 个 (0 = 全部)")
    ap.add_argument("--timeout", type=float, default=30.0, help="单请求超时秒")
    args = ap.parse_args()

    cad = _refresh_source(args.base, "cad", args.timeout)
    print(f"CAD 刷新: {cad}")
    with urllib.request.urlopen(f"{args.base}/api/events/close-approaches", timeout=args.timeout) as r:
        events = json.load(r)["data"]
    designations = sorted({e["des"] for e in events})
    if args.limit:
        designations = designations[: args.limit]

    print(f"CAD 事件 {len(events)} 条, 待预热天体 {len(designations)} 个 -> {args.base}")
    orbit_ok = orbit_fail = covariance_ok = covariance_missing = covariance_fail = 0
    for i, des in enumerate(designations, 1):
        url = f"{args.base}/api/asteroids/by-des/{urllib.parse.quote(des)}"
        try:
            urllib.request.urlopen(url, timeout=args.timeout).read()
            orbit_ok += 1
        except Exception as exc:  # noqa: BLE001 — 单个失败不应中断整批预热
            orbit_fail += 1
            print(f"[{i}/{len(designations)}] {des}: 根数失败 {exc}")
            continue

        try:
            _post_json(f"{args.base}/api/risk/assess", {"designation": des}, args.timeout)
            covariance_ok += 1
            print(f"[{i}/{len(designations)}] {des}: 根数、协方差已缓存")
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                covariance_missing += 1
                print(f"[{i}/{len(designations)}] {des}: 根数已缓存，SBDB 无协方差")
            else:
                covariance_fail += 1
                print(f"[{i}/{len(designations)}] {des}: 协方差失败 HTTP {exc.code}")
        except Exception as exc:  # noqa: BLE001 — 单个失败不应中断整批预热
            covariance_fail += 1
            print(f"[{i}/{len(designations)}] {des}: 协方差失败 {exc}")

    try:
        sentry = _refresh_source(args.base, "sentry", args.timeout)
    except Exception as exc:  # noqa: BLE001 — 不影响 SBDB 预热结果
        sentry = f"刷新失败 {exc}"

    print(
        "完成: "
        f"根数成功 {orbit_ok}、根数失败 {orbit_fail}；"
        f"协方差成功 {covariance_ok}、SBDB 未提供 {covariance_missing}、协方差失败 {covariance_fail}；"
        f"Sentry {sentry}"
    )
    print("下一步: 把预热后的 SQLite 取出作为内网种子库, 例如")
    print("  docker cp <容器名>:/app/data/sta_intra.db backend/sta_intra.db && docker build ...")
    return 0 if orbit_fail == 0 and covariance_fail == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
