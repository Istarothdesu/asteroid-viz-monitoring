"""下载星历烘焙所需的 NAIF SPICE 内核 (数据工厂一次性准备)。

内核只在烘焙 (bake_ephemeris.py) 时使用, 运行时服务与内网部署均不需要;
文件较大且为第三方二进制, 不入 git (见 .gitignore)。

每个文件按候选 URL 顺序尝试 (NAIF 官方在部分网络环境不可达, ESA 镜像兜底):
- naif0012.tls: 闰秒内核, UTC -> ET (TDB) 换算;
- de440s.bsp (首选, 1849-2150, ~32MB) 或 de430.bsp (ESA 镜像, 1550-2650,
  ~97MB): 行星/月球星历。

用法:
    uv run python download_kernels.py
"""

import sys
from pathlib import Path

import httpx

KERNELS_DIR = Path(__file__).resolve().parent / "kernels"

# 文件名 -> 候选下载地址 (按优先级)
KERNELS: dict[str, list[str]] = {
    "naif0012.tls": [
        "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/lsk/naif0012.tls",
        "https://spiftp.esac.esa.int/data/SPICE/esa_generic/kernels/lsk/naif0012.tls",
    ],
    "de440s.bsp": [
        "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440s.bsp",
    ],
    # de440s 不可得时的备选; bake_ephemeris 会自动选用已存在的那个
    "de430.bsp": [
        "https://spiftp.esac.esa.int/data/SPICE/esa_generic/kernels/spk/planets/de430.bsp",
        "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de430.bsp",
    ],
}

# 下载顺序: 先必选的闰秒内核, 再星历 (de440s 失败则尝试 de430)
REQUIRED = ["naif0012.tls"]
SPK_CANDIDATES = ["de440s.bsp", "de430.bsp"]


def _download(client: httpx.Client, name: str, urls: list[str]) -> bool:
    dest = KERNELS_DIR / name
    if dest.is_file():
        print(f"已存在, 跳过: {dest}")
        return True
    for url in urls:
        try:
            print(f"下载 {url}")
            with client.stream("GET", url) as resp:
                resp.raise_for_status()
                with open(dest, "wb") as f:
                    for chunk in resp.iter_bytes(1 << 20):
                        f.write(chunk)
            print(f"  完成: {dest} ({dest.stat().st_size / 1e6:.1f} MB)")
            return True
        except (httpx.HTTPError, OSError) as exc:
            print(f"  失败: {exc}")
            dest.unlink(missing_ok=True)
    return False


def main() -> int:
    KERNELS_DIR.mkdir(exist_ok=True)
    ok = True
    with httpx.Client(follow_redirects=True, timeout=httpx.Timeout(30.0, read=300.0)) as client:
        for name in REQUIRED:
            ok &= _download(client, name, KERNELS[name])
        if not any((KERNELS_DIR / n).is_file() for n in SPK_CANDIDATES):
            for name in SPK_CANDIDATES:
                if _download(client, name, KERNELS[name]):
                    break
            else:
                ok = False
    if not ok:
        print("内核未就绪, 请检查网络后重试", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
