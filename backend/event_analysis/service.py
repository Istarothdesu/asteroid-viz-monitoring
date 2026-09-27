"""事件专题分析上下文编排，不包含 HTTP 和三维渲染逻辑。"""

from __future__ import annotations

import asyncio
import hashlib
from typing import Any

from .contracts import DataProduct, ResolutionMode
from .providers import EventProvider, OrbitProvider, RiskSnapshotProvider


def _designation(event: dict[str, Any]) -> str | None:
    cad = event.get("cad")
    if cad:
        return cad.get("des")
    record = event.get("record") or {}
    return (record.get("el") or {}).get("des")


def _resolve(requested: str | None, product: DataProduct | None) -> ResolutionMode:
    if product is None:
        return ResolutionMode.UNAVAILABLE
    if requested is None:
        return ResolutionMode.CURRENT
    return (
        ResolutionMode.EXACT
        if product.meta.data_version == requested
        else ResolutionMode.LATEST_RECOMPUTE
    )


class EventAnalysisService:
    def __init__(
        self,
        events: EventProvider,
        orbits: OrbitProvider,
        risks: RiskSnapshotProvider,
    ) -> None:
        self._events = events
        self._orbits = orbits
        self._risks = risks

    async def build_context(self, key: str, reference_jd: float) -> dict[str, Any] | None:
        event = await self._events.get_event(key, reference_jd)
        if event is None:
            return None

        designation = _designation(event)
        requested = (event.get("cad") or {}).get("orbitId")
        orbit = covariance = sentry = None
        if designation:
            # 轨道 Provider 可在缓存缺失时原子补取根数+协方差；
            # 完成后再读风险快照，避免并发读抢在入库提交之前。
            orbit = await self._orbits.get_orbit(designation)
            covariance, sentry = await asyncio.gather(
                self._risks.get_covariance(designation, requested),
                self._risks.get_sentry(designation),
            )

        orbit_mode = _resolve(requested, orbit)
        covariance_mode = _resolve(requested, covariance)
        required = {"e", "q", "tp", "node", "peri", "i"}
        labels = set(covariance.payload.get("labels") or []) if covariance else set()
        elements = set((covariance.payload.get("elements") or {}).keys()) if covariance else set()
        usable_covariance = required <= labels and required <= elements

        identity = "|".join((
            key,
            requested or "-",
            orbit.product_id if orbit else "-",
            covariance.product_id if covariance else "-",
        ))
        context_id = hashlib.sha256(identity.encode()).hexdigest()[:24]
        return {
            "contextId": context_id,
            "event": event,
            "designation": designation,
            "requestedOrbitSolutionId": requested,
            "orbit": orbit.dto() if orbit else None,
            "covariance": covariance.dto() if covariance else None,
            "sentry": sentry.dto() if sentry else None,
            "resolution": {
                "orbit": orbit_mode.value,
                "covariance": covariance_mode.value,
            },
            "capabilities": {
                "orbitPreview": orbit is not None or event.get("record") is not None,
                "nBody": orbit is not None,
                "bPlane": orbit is not None,
                "uncertainty": usable_covariance,
            },
        }
