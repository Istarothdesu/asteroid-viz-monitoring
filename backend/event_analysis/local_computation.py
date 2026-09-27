"""现有本地科学计算能力的 Provider 适配器。"""

from propagate_service import propagate
from risk_service import local_bplane_uncertainty, nominal_bplane


class LocalPropagationProvider:
    async def propagate(
        self,
        designation: str,
        t0: float,
        t1: float,
        step_d: float,
        orbit_solution_id: str | None = None,
    ) -> dict | None:
        result = await propagate(
            designation, t0, t1, step_d, orbit_solution_id,
        )
        if result is not None:
            result["meta"] = {
                "sourceSystem": "local-nbody",
                "algorithmVersion": "nbody-dop853-v1",
                "referenceFrame": "ECLIPJ2000",
                "timeScale": "TDB",
                "validRange": [t0, t1],
            }
        return result


class LocalRiskComputationProvider:
    async def nominal_bplane(
        self,
        designation: str,
        encounter_jd: float,
        orbit_solution_id: str | None = None,
    ) -> dict | None:
        result = await nominal_bplane(
            designation, encounter_jd, orbit_solution_id,
        )
        if result is not None:
            result["meta"] = {
                "sourceSystem": "local-bplane",
                "algorithmVersion": "bplane-nbody-v1",
                "referenceFrame": "GEO_ECLIPTIC",
                "timeScale": "TDB",
                "anchorJd": result["closestJd"],
            }
        return result

    async def bplane_uncertainty(
        self,
        designation: str,
        encounter_jd: float,
        sample_count: int = 4096,
        orbit_solution_id: str | None = None,
    ) -> dict | None:
        result = await local_bplane_uncertainty(
            designation, encounter_jd, sample_count, orbit_solution_id,
        )
        if result is not None:
            result["nominalBPlane"]["meta"] = {
                "sourceSystem": "local-covariance-nbody",
                "algorithmVersion": "bplane-covariance-center-v2",
                "referenceFrame": "GEO_ECLIPTIC",
                "timeScale": "TDB",
                "anchorJd": result["nominalBPlane"]["closestJd"],
                "inputProductIds": [result["assessmentId"]],
            }
            result["meta"] = {
                "sourceSystem": "local-linear-nbody-sobol",
                "algorithmVersion": "bplane-covariance-v2",
                "referenceFrame": "ECLIPJ2000",
                "timeScale": "TDB",
                "anchorJd": result["nominalBPlane"]["closestJd"],
                "inputProductIds": [result["assessmentId"]],
            }
        return result
