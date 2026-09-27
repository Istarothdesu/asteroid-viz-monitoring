"""事件专题所需的数据端口；当前本地实现与未来分系统共用这些边界。"""

from typing import Protocol

from .contracts import DataProduct


class EventProvider(Protocol):
    async def get_event(self, key: str, reference_jd: float) -> dict | None: ...


class OrbitProvider(Protocol):
    async def get_orbit(self, designation: str) -> DataProduct | None: ...


class RiskSnapshotProvider(Protocol):
    async def get_covariance(
        self, designation: str, preferred_version: str | None = None,
    ) -> DataProduct | None: ...

    async def get_sentry(self, designation: str) -> DataProduct | None: ...


class PropagationProvider(Protocol):
    async def propagate(
        self,
        designation: str,
        t0: float,
        t1: float,
        step_d: float,
        orbit_solution_id: str | None = None,
    ) -> dict | None: ...


class RiskComputationProvider(Protocol):
    async def nominal_bplane(
        self,
        designation: str,
        encounter_jd: float,
        orbit_solution_id: str | None = None,
    ) -> dict | None: ...

    async def bplane_uncertainty(
        self,
        designation: str,
        encounter_jd: float,
        sample_count: int = 4096,
        orbit_solution_id: str | None = None,
    ) -> dict | None: ...
