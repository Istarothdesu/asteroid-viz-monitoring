import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import terrain_routes as terrain


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(terrain, "CACHE_DIR", tmp_path)
    app = FastAPI()
    app.include_router(terrain.router)
    with TestClient(app) as client:
        yield client


def test_cached_tile_is_same_origin_and_keeps_binary(client):
    data = b"\xff\xd8cached-jpeg"
    path = terrain.CACHE_DIR / "img/2/1/1.bin"
    path.parent.mkdir(parents=True)
    path.write_bytes(data)
    response = client.get("/api/terrain/img/2/1/1")
    assert response.status_code == 200
    assert response.content == data
    assert response.headers["content-type"] == "image/jpeg"
    assert response.headers["x-tile-cache"] == "hit"


def test_tile_miss_fetches_fixed_upstream_and_is_cached(client, monkeypatch):
    requested = []

    class Upstream:
        def __init__(self, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def get(self, url):
            requested.append(url)
            return httpx.Response(200, content=b"Lerc2 mock", request=httpx.Request("GET", url))

    monkeypatch.setattr(terrain.httpx, "AsyncClient", Upstream)
    first = client.get("/api/terrain/dem/3/4/5")
    second = client.get("/api/terrain/dem/3/4/5")
    assert first.status_code == second.status_code == 200
    assert first.headers["x-tile-cache"] == "miss"
    assert second.headers["x-tile-cache"] == "hit"
    assert first.content == second.content == b"Lerc2 mock"
    assert requested == [terrain.UPSTREAM["dem"] + "/3/4/5"]


@pytest.mark.parametrize("path", ["img/20/0/0", "img/2/4/1", "dem/2/1/-1"])
def test_out_of_bounds_is_rejected_before_upstream(client, path):
    assert client.get("/api/terrain/" + path).status_code == 400
