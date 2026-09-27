import asyncio

import event_analysis.local_computation as local


def test_local_propagation_provider_adds_traceable_metadata(monkeypatch):
    async def fake(*_args):
        return {"orbitSolutionId": "12", "points": []}

    monkeypatch.setattr(local, "propagate", fake)
    result = asyncio.run(local.LocalPropagationProvider().propagate(
        "TEST", 100.0, 110.0, 1.0, "12",
    ))
    assert result is not None
    assert result["meta"] == {
        "sourceSystem": "local-nbody",
        "algorithmVersion": "nbody-dop853-v1",
        "referenceFrame": "ECLIPJ2000",
        "timeScale": "TDB",
        "validRange": [100.0, 110.0],
    }


def test_local_risk_provider_adds_algorithm_and_input_provenance(monkeypatch):
    async def fake_nominal(*_args):
        return {"closestJd": 105.0}

    async def fake_uncertainty(*_args):
        return {
            "assessmentId": "cov:12",
            "nominalBPlane": {"closestJd": 105.0},
        }

    monkeypatch.setattr(local, "nominal_bplane", fake_nominal)
    monkeypatch.setattr(local, "local_bplane_uncertainty", fake_uncertainty)
    provider = local.LocalRiskComputationProvider()
    nominal = asyncio.run(provider.nominal_bplane("TEST", 105.0, "12"))
    uncertainty = asyncio.run(provider.bplane_uncertainty("TEST", 105.0, 4096, "12"))

    assert nominal is not None
    assert nominal["meta"]["algorithmVersion"] == "bplane-nbody-v1"
    assert nominal["meta"]["referenceFrame"] == "GEO_ECLIPTIC"
    assert uncertainty is not None
    assert uncertainty["meta"]["algorithmVersion"] == "bplane-covariance-v2"
    assert uncertainty["meta"]["inputProductIds"] == ["cov:12"]
    assert uncertainty["nominalBPlane"]["meta"]["algorithmVersion"] == "bplane-covariance-center-v2"
