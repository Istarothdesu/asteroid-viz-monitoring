"""与数据来源无关的事件分析产品契约。"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Any


class ResolutionMode(StrEnum):
    """事件引用的数据版本如何被解析。"""

    EXACT = "exact"
    CURRENT = "current"
    LATEST_RECOMPUTE = "latest-recompute"
    UNAVAILABLE = "unavailable"


@dataclass(frozen=True, slots=True)
class ProductMeta:
    source_system: str
    authority: str
    data_version: str
    generated_at: str
    time_scale: str | None = None
    reference_frame: str | None = None
    quality_status: str = "valid"
    quality_message: str | None = None

    def dto(self) -> dict[str, Any]:
        return {
            "sourceSystem": self.source_system,
            "authority": self.authority,
            "dataVersion": self.data_version,
            "generatedAt": self.generated_at,
            "timeScale": self.time_scale,
            "referenceFrame": self.reference_frame,
            "quality": {
                "status": self.quality_status,
                "message": self.quality_message,
            },
        }


@dataclass(frozen=True, slots=True)
class DataProduct:
    """载荷与来源元数据同行，避免上层靠约定猜测版本和坐标口径。"""

    product_id: str
    meta: ProductMeta
    payload: dict[str, Any]

    def dto(self) -> dict[str, Any]:
        return {
            "productId": self.product_id,
            "meta": self.meta.dto(),
            "payload": self.payload,
        }

