from __future__ import annotations

import asyncio
import io
import json
import os
import time
from pathlib import Path
from typing import Any, AsyncIterator, List

import numpy as np
import soundfile as sf

from local_runtime.runtime_types import RunContext, RunRequest


def _ensure_autoconfig_available() -> None:
    """
    mlx-audio expects transformers.AutoConfig to exist.
    Some lightweight installs omit it, so we create a minimal shim if needed.
    """
    try:
        import transformers  # type: ignore
    except ImportError as exc:  # pragma: no cover - runtime dependency
        raise RuntimeError(
            "Kokoro TTS requires the 'transformers' package. Install it with `pip install transformers>=4.52`."
        ) from exc

    if hasattr(transformers, "AutoConfig"):
        return

    class _PatchedConfig:
        def __init__(self, payload: dict):
            self._payload = payload

        def to_dict(self) -> dict:
            return dict(self._payload)

    class _PatchedAutoConfig:
        @classmethod
        def from_pretrained(cls, model_path: str | Path, **kwargs):
            cfg_path = Path(model_path) / "config.json"
            data = json.loads(cfg_path.read_text(encoding="utf-8"))
            return _PatchedConfig(data)

    transformers.AutoConfig = _PatchedAutoConfig  # type: ignore[attr-defined]

SPEC = {
    "id": "local//tts/kokoro-local",
    "kind": "tts",
    "display": {
        "title": "Kokoro Local TTS",
        "description": "Offline Kokoro TTS for quick voice playback.",
        "tags": ["tts", "kokoro", "local"],
        "icon": "waveform",
    },
    "compat": {
        "platforms": ["darwin-arm64", "darwin-x64", "windows-x64", "linux-x64"],
        "acceleration": ["cpu", "cuda", "metal"],
        "priority": 110,
        "requires_ram_gb": 4,
        "requires_vram_gb": 0,
        "disk_gb": 2,
    },
    "api": {
        "endpoint": "audio.speech",
        "advertised_model_name": "kokoro-local",
        "supports_stream": True,
    },
    "limits": {
        "timeout_sec": 300,
        "concurrency": 2,
        "max_input_mb": 10,
        "max_output_tokens_default": 2048,
    },
    "backend": {
        "provider": "kokoro",
        "model_ref": "mlx-community/Kokoro-82M-bf16",
        "revision": None,
        "device_hint": "auto",
        "extra": {},
    },
    "execution": {
        "mode": "subprocess",
        "warmup_on_start": False,
    },
    "launch": {
        "enabled": False,
        "type": "command",
        "explain": "Runs via worker subprocess.",
        "env": {},
        "cmd": ["python", "-m", "local_runtime"],
        "ready": {
            "kind": "http",
            "timeout_sec": 60,
            "http_url": "http://127.0.0.1:{port}/health",
            "log_regex": "READY",
        },
    },
    "ui_params": [
        {"key": "voice", "type": "select", "default": "af_bella", "choices": ["af_bella", "ff_siwis"], "min": None, "max": None}
    ],
    "deps": {
        "python_extras": ["tts"],
        "pip": ["mlx-audio>=0.5.0"],
        "system": ["ffmpeg optional"],
        "notes": "Requires mlx-audio for Kokoro synthesis.",
    },
}

LANGUAGE_CODES = {
    "f": "f",
    "fr": "f",
    "french": "f",
    "a": "a",
    "en": "a",
    "english": "a",
}
DEFAULT_VOICE = {"a": "af_bella", "f": "ff_siwis"}
DEFAULT_LANG = "a"
DEFAULT_SAMPLE_RATE = 44100


def load(ctx: RunContext) -> dict[str, Any]:
    _ensure_autoconfig_available()
    os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")
    try:
        import tqdm  # type: ignore
        from threading import RLock

        if not hasattr(tqdm, "_lock"):
            tqdm._lock = RLock()  # type: ignore[attr-defined]
    except Exception:
        pass
    try:
        from mlx_audio.tts.utils import load_model  # type: ignore
    except ImportError as exc:
        raise RuntimeError(
            "mlx-audio is required for Kokoro TTS. Install it with `pip install mlx-audio`."
        ) from exc
    model_name = SPEC["backend"]["model_ref"]
    ctx.logger.info("kokoro_local.load", extra={"model_id": SPEC["id"], "provider": "mlx_audio"})
    model = load_model(model_name, model_type="kokoro", lazy=False)
    return {
        "model": model,
        "model_name": model_name,
    }


def warmup(instance: dict[str, Any], ctx: RunContext) -> None:
    ctx.logger.info("kokoro_local.warmup", extra={"model_id": SPEC["id"]})


def _extract_text(payload: dict[str, Any] | None) -> str:
    if not payload:
        return ""
    if isinstance(payload.get("input"), str):
        return payload["input"]
    if isinstance(payload.get("input"), list):
        for entry in payload["input"]:
            if isinstance(entry, str):
                return entry
            if isinstance(entry, dict):
                if entry.get("type") == "input_text" and "text" in entry:
                    return str(entry["text"])
                if isinstance(entry.get("content"), list):
                    for chunk in entry["content"]:
                        if isinstance(chunk, dict) and chunk.get("type") == "input_text":
                            return str(chunk.get("text", ""))
    if "text" in payload and isinstance(payload["text"], str):
        return payload["text"]
    return ""


def _resolve_lang_code(value: Any) -> str:
    if not value:
        return DEFAULT_LANG
    key = str(value).strip().lower()
    return LANGUAGE_CODES.get(key, DEFAULT_LANG)


def _resolve_voice(lang_code: str, requested: str | None) -> str:
    if requested:
        return requested
    return DEFAULT_VOICE.get(lang_code, DEFAULT_VOICE[DEFAULT_LANG])


def _to_numpy(array: Any) -> np.ndarray:
    if hasattr(array, "to_numpy"):
        return array.to_numpy()
    return np.asarray(array)


async def _run_generate(instance: dict[str, Any], text: str, lang_code: str, voice: str) -> bytes:
    model = instance["model"]

    def _invoke() -> bytes:
        results = model.generate(
            text=text,
            voice=voice,
            lang_code=lang_code,
            speed=1.0,
            temperature=0.7,
            cfg_scale=None,
            ddpm_steps=None,
            max_tokens=SPEC["limits"]["max_output_tokens_default"],
            stream=False,
        )
        audio_arrays: List[np.ndarray] = []
        sample_rate = DEFAULT_SAMPLE_RATE
        for result in results:
            audio_arrays.append(_to_numpy(result.audio))
            sample_rate = getattr(result, "sample_rate", DEFAULT_SAMPLE_RATE)
        if not audio_arrays:
            raise RuntimeError("No audio generated from Kokoro model.")
        combined = np.concatenate(audio_arrays)
        buffer = io.BytesIO()
        sf.write(buffer, combined, sample_rate, format="WAV")
        return buffer.getvalue()

    return await asyncio.to_thread(_invoke)


async def run(req: RunRequest, ctx: RunContext):
    payload = req.payload or {}
    text = _extract_text(payload)
    if not text:
        raise ValueError("Input text is required for speech synthesis.")
    model_id = req.model or SPEC["id"]
    instance = await ctx.registry.ensure_instance(model_id, ctx)
    if not instance:
        raise RuntimeError("Kokoro TTS model is not initialized.")

    language = payload.get("language") or payload.get("lang") or payload.get("voice_language")
    lang_code = _resolve_lang_code(language)
    voice = _resolve_voice(lang_code, payload.get("voice"))

    run_meta = {
        "model_id": model_id,
        "language": lang_code,
        "voice": voice,
        "stream": bool(req.stream),
        "text_chars": len(text),
    }
    ctx.logger.info("kokoro_tts.run.start", extra=run_meta)
    start = time.perf_counter()
    audio_bytes = await _run_generate(instance, text, lang_code=lang_code, voice=voice)
    if req.stream:
        async def generator() -> AsyncIterator[bytes]:
            chunk = 8192
            for idx in range(0, len(audio_bytes), chunk):
                yield audio_bytes[idx : idx + chunk]

        async def tracked_generator() -> AsyncIterator[bytes]:
            try:
                async for chunk_bytes in generator():
                    yield chunk_bytes
            finally:
                duration_ms = round((time.perf_counter() - start) * 1000, 2)
                ctx.logger.info("kokoro_tts.run.complete", extra={**run_meta, "duration_ms": duration_ms})

        return tracked_generator()
    duration_ms = round((time.perf_counter() - start) * 1000, 2)
    ctx.logger.info("kokoro_tts.run.complete", extra={**run_meta, "duration_ms": duration_ms, "bytes": len(audio_bytes)})
    return audio_bytes
