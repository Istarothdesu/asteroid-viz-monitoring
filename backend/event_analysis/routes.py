from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

import events_service
from settings import SYNC_ENABLED

from .local_providers import LocalEventProvider, LocalOrbitProvider, LocalRiskSnapshotProvider
from .local_computation import LocalPropagationProvider, LocalRiskComputationProvider
from .service import EventAnalysisService

router = APIRouter(tags=["event-analysis"])
service = EventAnalysisService(
    LocalEventProvider(),
    LocalOrbitProvider(allow_network=SYNC_ENABLED),
    LocalRiskSnapshotProvider(),
)
propagation = LocalPropagationProvider()
risk_computation = LocalRiskComputationProvider()


class PropagateIn(BaseModel):
    designation: str = Field(min_length=1, max_length=32)
    t0: float
    t1: float
    stepD: float = Field(default=0.25, gt=0, le=30)
    orbitSolutionId: str | None = Field(default=None, max_length=32)


class BPlaneIn(BaseModel):
    designation: str = Field(min_length=1, max_length=32)
    encounterJd: float
    orbitSolutionId: str | None = Field(default=None, max_length=32)


class BPlaneUncertaintyIn(BPlaneIn):
    sampleCount: int = Field(default=4096, ge=256, le=16384)


@router.get("/api/analysis/events/{key}")
async def get_event_analysis_context(
    key: str,
    reference_jd: float | None = Query(default=None),
):
    context = await service.build_context(
        key,
        events_service.now_jd_utc() if reference_jd is None else reference_jd,
    )
    if context is None:
        raise HTTPException(status_code=404, detail=f"未找到事件: {key}")
    return context


@router.post("/api/propagate")
async def propagate_arc(payload: PropagateIn):
    try:
        result = await propagation.propagate(
            payload.designation, payload.t0, payload.t1,
            payload.stepD, payload.orbitSolutionId,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if result is None:
        raise HTTPException(status_code=404, detail=f"库中无此天体: {payload.designation}")
    return result


@router.post("/api/risk/bplane")
async def calculate_nominal_bplane(payload: BPlaneIn):
    try:
        result = await risk_computation.nominal_bplane(
            payload.designation, payload.encounterJd, payload.orbitSolutionId,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if result is None:
        raise HTTPException(status_code=404, detail=f"库中无此天体: {payload.designation}")
    return result


@router.post("/api/risk/bplane-uncertainty")
async def calculate_local_bplane_uncertainty(payload: BPlaneUncertaintyIn):
    try:
        result = await risk_computation.bplane_uncertainty(
            payload.designation, payload.encounterJd, payload.sampleCount,
            payload.orbitSolutionId,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if result is None:
        raise HTTPException(
            status_code=404,
            detail=f"无该目标的协方差快照: {payload.designation}",
        )
    return result
