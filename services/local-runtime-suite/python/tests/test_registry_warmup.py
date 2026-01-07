from __future__ import annotations

import logging
from copy import deepcopy
from types import SimpleNamespace

import pytest

from local_runtime.core.loader import LoadedModel
from local_runtime.core.registry import ModelRegistry
from local_runtime.models import model_template
from local_runtime.spec import ModelSpec


def _build_spec(warmup_on_start: bool, suffix: str) -> ModelSpec:
    spec_data = deepcopy(model_template.SPEC)
    spec_data["id"] = f"local//test/{suffix}"
    spec_data["execution"]["warmup_on_start"] = warmup_on_start
    return ModelSpec.model_validate(spec_data)


@pytest.mark.asyncio
async def test_registry_warmup_toggle() -> None:
    spec = _build_spec(True, "warmup-enabled")
    calls: dict[str, int] = {"load": 0, "warmup": 0}

    async def load(ctx):
        calls["load"] += 1
        return {"instance": "ok"}

    async def warmup(instance, ctx):
        calls["warmup"] += 1

    module = SimpleNamespace(load=load, warmup=warmup)
    loaded = LoadedModel(name="local_runtime.models.model_test", module=module, spec=spec)

    registry_disabled = ModelRegistry(
        [loaded],
        "test-platform",
        logging.getLogger("test-registry-warmup"),
        enable_warmup=False,
    )
    assert await registry_disabled.preload_model(spec.id, lambda rid: None)
    assert calls["load"] == 1
    assert calls["warmup"] == 0

    calls["warmup"] = 0
    registry_enabled = ModelRegistry(
        [loaded],
        "test-platform",
        logging.getLogger("test-registry-warmup"),
        enable_warmup=True,
    )
    assert await registry_enabled.preload_model(spec.id, lambda rid: None)
    assert calls["warmup"] == 1


@pytest.mark.asyncio
async def test_registry_warmup_respects_spec_flag() -> None:
    spec = _build_spec(False, "warmup-disabled")
    calls: dict[str, int] = {"warmup": 0}

    async def load(ctx):
        return {"instance": "ok"}

    async def warmup(instance, ctx):
        calls["warmup"] += 1

    module = SimpleNamespace(load=load, warmup=warmup)
    loaded = LoadedModel(name="local_runtime.models.model_test", module=module, spec=spec)
    registry = ModelRegistry(
        [loaded],
        "test-platform",
        logging.getLogger("test-registry-warmup"),
        enable_warmup=True,
    )
    assert await registry.preload_model(spec.id, lambda rid: None)
    assert calls["warmup"] == 0
