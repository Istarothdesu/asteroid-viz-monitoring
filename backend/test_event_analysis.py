import asyncio

from event_analysis.contracts import DataProduct, ProductMeta
from event_analysis.service import EventAnalysisService


def product(kind: str, version: str, payload: dict) -> DataProduct:
    return DataProduct(
        product_id=f"{kind}:{version}",
        meta=ProductMeta(
            source_system="test",
            authority="simulated",
            data_version=version,
            generated_at="2026-09-20T00:00:00+00:00",
        ),
        payload=payload,
    )


class Events:
    async def get_event(self, key: str, reference_jd: float):
        if key == "missing":
            return None
        return {
            "key": key,
            "source": "cad",
            "cad": {"des": "2026 TEST", "orbitId": "7"},
            "record": None,
        }


class Orbits:
    def __init__(self, version: str | None):
        self.version = version

    async def get_orbit(self, designation: str):
        return product("orbit", self.version, {"designation": designation}) if self.version else None


class Risks:
    def __init__(self, version: str | None):
        self.version = version
        self.preferred_version = None

    async def get_covariance(self, designation: str, preferred_version: str | None = None):
        self.preferred_version = preferred_version
        if not self.version:
            return None
        labels = ["e", "q", "tp", "node", "peri", "i"]
        return product("covariance", self.version, {
            "labels": labels,
            "elements": {label: 0.0 for label in labels},
        })

    async def get_sentry(self, designation: str):
        return None


def test_exact_context_exposes_capabilities():
    risks = Risks("7")
    service = EventAnalysisService(Events(), Orbits("7"), risks)
    context = asyncio.run(service.build_context("c-test", 2460000.5))
    assert context is not None
    assert context["resolution"] == {"orbit": "exact", "covariance": "exact"}
    assert context["capabilities"] == {
        "orbitPreview": True,
        "nBody": True,
        "bPlane": True,
        "uncertainty": True,
    }
    assert risks.preferred_version == "7"


def test_newer_local_solution_is_degraded_not_missing():
    service = EventAnalysisService(Events(), Orbits("9"), Risks("9"))
    context = asyncio.run(service.build_context("c-test", 2460000.5))
    assert context is not None
    assert context["resolution"]["orbit"] == "latest-recompute"
    assert context["resolution"]["covariance"] == "latest-recompute"
    assert context["capabilities"]["bPlane"] is True


def test_missing_products_keep_event_context_available():
    service = EventAnalysisService(Events(), Orbits(None), Risks(None))
    context = asyncio.run(service.build_context("c-test", 2460000.5))
    assert context is not None
    assert context["resolution"] == {"orbit": "unavailable", "covariance": "unavailable"}
    assert context["capabilities"]["orbitPreview"] is False
    assert asyncio.run(service.build_context("missing", 2460000.5)) is None
