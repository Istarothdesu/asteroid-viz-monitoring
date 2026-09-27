"""基于现有 SQLite/JPL 缓存的 Provider 实现。"""

from __future__ import annotations

import httpx

from db import Asteroid, SessionLocal, SentryRisk, utcnow
import events_service
from fetchers import fetch_orbit_bundle
from named_asteroids import NAMED
from risk_service import assessment_dto, resolve_assessment, sentry_dto
from risk_service import upsert_assessment

from .contracts import DataProduct, ProductMeta


def _iso(value) -> str:
    return value.isoformat() if value is not None else ""


class LocalEventProvider:
    async def get_event(self, key: str, reference_jd: float) -> dict | None:
        async with SessionLocal() as session:
            row = await events_service.find_event(session, key, reference_jd)
        return events_service.event_dto(row, include_record=True) if row is not None else None


class LocalOrbitProvider:
    def __init__(self, allow_network: bool = False) -> None:
        self._allow_network = allow_network

    async def get_orbit(self, designation: str) -> DataProduct | None:
        async with SessionLocal() as session:
            row = await session.get(Asteroid, designation)
        if row is None and self._allow_network:
            row = await self._fetch_and_cache(designation)
        if row is None:
            return None
        version = row.orbit_solution_id or "unknown"
        return DataProduct(
            product_id=f"orbit:{designation}:{version}:{row.epoch_jd:.6f}",
            meta=ProductMeta(
                source_system="NASA/JPL SBDB cache",
                authority="official-cache",
                data_version=version,
                generated_at=_iso(row.updated_at),
                time_scale="TDB",
                reference_frame="ECLIPJ2000",
            ),
            payload={
                "designation": row.designation,
                "orbitSolutionId": row.orbit_solution_id,
                "a": row.a,
                "e": row.e,
                "i": row.i,
                "O": row.om,
                "w": row.w,
                "M0": row.m0,
                "epochJd": row.epoch_jd,
            },
        )

    @staticmethod
    async def _fetch_and_cache(designation: str) -> Asteroid | None:
        timeout = httpx.Timeout(connect=30.0, read=60.0, write=30.0, pool=30.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            orbit, covariance = await fetch_orbit_bundle(client, designation)
        if orbit is None:
            return None

        async with SessionLocal() as session:
            row = await session.get(Asteroid, orbit["designation"])
            if row is None:
                row = Asteroid(designation=orbit["designation"])
                session.add(row)
            for key, value in orbit.items():
                setattr(row, key, value)
            zh, diameter, spin_h, orbit_class = NAMED.get(
                orbit["designation"], (None, None, None, None),
            )
            row.name_zh = row.name_zh or zh
            row.diam_km = row.diam_km if row.diam_km is not None else diameter
            row.spin_h = row.spin_h if row.spin_h is not None else spin_h
            row.orbit_class = row.orbit_class or orbit_class
            row.updated_at = utcnow()
            if covariance is not None:
                await upsert_assessment(session, covariance)
            await session.commit()
            return row


class LocalRiskSnapshotProvider:
    async def get_covariance(
        self, designation: str, preferred_version: str | None = None,
    ) -> DataProduct | None:
        async with SessionLocal() as session:
            row = await resolve_assessment(session, designation, preferred_version)
        if row is None:
            return None
        payload = assessment_dto(row)
        assert payload is not None
        version = row.orbit_solution_id or "unknown"
        return DataProduct(
            product_id=row.assessment_id,
            meta=ProductMeta(
                source_system="NASA/JPL SBDB covariance cache",
                authority="official-cache",
                data_version=version,
                generated_at=_iso(row.updated_at),
                time_scale="TDB",
                reference_frame="ECLIPJ2000",
            ),
            payload=payload,
        )

    async def get_sentry(self, designation: str) -> DataProduct | None:
        async with SessionLocal() as session:
            row = await session.get(SentryRisk, designation)
        if row is None:
            return None
        payload = sentry_dto(row)
        assert payload is not None
        version = row.source_version or "unknown"
        return DataProduct(
            product_id=f"sentry:{designation}:{version}",
            meta=ProductMeta(
                source_system="NASA/JPL Sentry cache",
                authority="official-cache",
                data_version=version,
                generated_at=_iso(row.updated_at),
                time_scale="UTC",
            ),
            payload=payload,
        )
