"""地球曲面地形使用的固定 ArcGIS 数据源；开发和部署均由同源 /api 提供瓦片。"""
import asyncio
import os
from pathlib import Path
from typing import Literal

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

router = APIRouter(prefix="/api/terrain", tags=["terrain"])
CACHE_DIR = Path(os.getenv("TERRAIN_CACHE_DIR", Path(__file__).parent / ".cache" / "terrain"))
UPSTREAM = {
    "img": "https://server.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile",
    "dem": "https://server.arcgisonline.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer/tile",
}


@router.get("/{kind}/{z}/{y}/{x}")
async def terrain_tile(kind: Literal["img", "dem"], z: int, y: int, x: int):
    if not 0 <= z <= 19 or not (0 <= x < 2 ** z and 0 <= y < 2 ** z):
        raise HTTPException(400, "瓦片坐标超出范围")
    path = CACHE_DIR / kind / str(z) / str(y) / f"{x}.bin"
    hit = path.is_file()
    if hit:
        data = await asyncio.to_thread(path.read_bytes)
    else:
        try:
            async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
                upstream = await client.get(f"{UPSTREAM[kind]}/{z}/{y}/{x}")
                upstream.raise_for_status()
                data = upstream.content
            # 上游有时以 HTTP 200 返回 JSON 错误，不将错误页作为瓦片缓存。
            if kind == "img" and not data.startswith((b"\xff\xd8", b"\x89PNG")):
                raise ValueError("影像服务未返回图片")
            if kind == "dem" and not data.startswith((b"CntZImage", b"Lerc2")):
                raise ValueError("高程服务未返回 LERC 数据")
        except (httpx.HTTPError, ValueError) as exc:
            raise HTTPException(502, "地形数据暂时不可用，请稍后重试") from exc
        await asyncio.to_thread(path.parent.mkdir, parents=True, exist_ok=True)
        await asyncio.to_thread(path.write_bytes, data)
    media_type = ("image/jpeg" if data.startswith(b"\xff\xd8") else "image/png") if kind == "img" else "application/octet-stream"
    return Response(data, media_type=media_type, headers={
        "Cache-Control": "public, max-age=86400",
        "X-Tile-Cache": "hit" if hit else "miss",
    })
