from __future__ import annotations

import asyncio
import os
import threading
from typing import Any, AsyncIterator

from local_runtime.helpers.responses_helpers import new_response
from local_runtime.types import RunContext, RunRequest

SPEC = {
    "id": "local//llm/qwen3-hf",
    "kind": "llm",
    "display": {
        "title": "Qwen3 Hugging Face",
        "description": "Local Qwen3 inference via Hugging Face Transformers.",
        "tags": ["qwen", "hf", "local"],
        "icon": "bolt",
    },
    "compat": {
        "platforms": ["darwin-arm64", "darwin-x64", "windows-x64", "linux-x64"],
        "acceleration": ["cpu", "cuda"],
        "priority": 100,
        "requires_ram_gb": 12,
        "requires_vram_gb": 6,
        "disk_gb": 8,
    },
    "api": {
        "endpoint": "responses",
        "advertised_model_name": "qwen3-hf",
        "supports_stream": True,
    },
    "limits": {
        "timeout_sec": 300,
        "concurrency": 1,
        "max_input_mb": 25,
        "max_output_tokens_default": 2048,
    },
    "backend": {
        "provider": "hf",
        "model_ref": "Qwen/Qwen3-4B-Instruct-2507",
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
        "explain": "HF models are run via worker subprocess.",
        "env": {},
        "cmd": ["python", "-m", "local_runtime"],
        "ready": {
            "kind": "http",
            "timeout_sec": 60,
            "http_url": "http://127.0.0.1:{port}/health",
            "log_regex": "READY",
        },
    },
    "ui_params": [],
    "deps": {
        "python_extras": ["hf"],
        "pip": ["torch", "transformers"],
        "system": [],
        "notes": "Requires torch + transformers.",
    },
}

DEFAULT_MAX_TOKENS = int(os.getenv("LOCAL_RUNTIME_QWEN_HF_MAX_TOKENS", SPEC["limits"]["max_output_tokens_default"]))
DEFAULT_TEMPERATURE = float(os.getenv("LOCAL_RUNTIME_QWEN_HF_TEMPERATURE", "0.7"))
DEFAULT_TOP_P = float(os.getenv("LOCAL_RUNTIME_QWEN_HF_TOP_P", "0.9"))


def _prepare_prompt(payload: dict | None, tokenizer: Any | None = None) -> str:
    if not payload:
        return "You are a helpful assistant."
    if payload.get("messages"):
        messages = payload["messages"]
        if tokenizer and getattr(tokenizer, "chat_template", None):
            return tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        return "\n".join(f"{msg.get('role', 'user')}: {msg.get('content', '')}" for msg in messages)
    if isinstance(payload.get("input"), list):
        fragments: list[str] = []
        for entry in payload["input"]:
            if isinstance(entry, str):
                fragments.append(entry)
            elif isinstance(entry, dict):
                if entry.get("type") == "text" and "text" in entry:
                    fragments.append(str(entry["text"]))
                elif entry.get("content"):
                    fragments.extend(str(chunk.get("text", "")) for chunk in entry["content"] if isinstance(chunk, dict))
        if fragments:
            return "\n".join(fragments)
    if isinstance(payload.get("input"), str):
        return payload["input"]
    return str(payload.get("prompt") or "You are a helpful assistant.")


def _generation_params(payload: dict | None) -> dict[str, Any]:
    if not payload:
        return {"max_new_tokens": DEFAULT_MAX_TOKENS, "temperature": DEFAULT_TEMPERATURE, "top_p": DEFAULT_TOP_P}
    return {
        "max_new_tokens": int(payload.get("max_output_tokens") or DEFAULT_MAX_TOKENS),
        "temperature": float(payload.get("temperature") or DEFAULT_TEMPERATURE),
        "top_p": float(payload.get("top_p") or DEFAULT_TOP_P),
    }


def load(ctx: RunContext) -> dict[str, Any]:
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    model_ref = os.getenv("LOCAL_RUNTIME_QWEN3_HF_MODEL", SPEC["backend"]["model_ref"])
    ctx.logger.info("qwen3_hf.load", extra={"model_id": SPEC["id"], "model_ref": model_ref})
    tokenizer = AutoTokenizer.from_pretrained(model_ref, trust_remote_code=True)
    dtype = torch.float16 if torch.cuda.is_available() else torch.float32
    model = AutoModelForCausalLM.from_pretrained(
        model_ref,
        torch_dtype=dtype,
        trust_remote_code=True,
        device_map="auto" if torch.cuda.is_available() else None,
    )
    model.eval()
    return {"model": model, "tokenizer": tokenizer, "device": model.device}


def warmup(instance: dict[str, Any], ctx: RunContext) -> None:
    import torch

    tokenizer = instance["tokenizer"]
    model = instance["model"]
    prompt = "You are an assistant. Say hi."
    inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
    with torch.no_grad():
        model.generate(**inputs, max_new_tokens=32)
    ctx.logger.info("qwen3_hf.warmup", extra={"model_id": SPEC["id"], "status": "ok"})


async def _generate(instance: dict[str, Any], prompt: str, params: dict[str, Any]) -> str:
    import torch

    tokenizer = instance["tokenizer"]
    model = instance["model"]
    inputs = tokenizer(prompt, return_tensors="pt").to(model.device)

    def _invoke():
        with torch.no_grad():
            output_ids = model.generate(
                **inputs,
                max_new_tokens=params["max_new_tokens"],
                temperature=params["temperature"],
                top_p=params["top_p"],
            )
        text = tokenizer.decode(output_ids[0], skip_special_tokens=True)
        if text.startswith(prompt):
            return text[len(prompt) :].strip()
        return text.strip()

    return await asyncio.to_thread(_invoke)


async def _generate_stream(instance: dict[str, Any], prompt: str, params: dict[str, Any]) -> AsyncIterator[str]:
    import torch
    from transformers import TextIteratorStreamer

    tokenizer = instance["tokenizer"]
    model = instance["model"]
    inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
    streamer = TextIteratorStreamer(tokenizer, skip_prompt=True, skip_special_tokens=True)

    def _worker():
        with torch.no_grad():
            model.generate(
                **inputs,
                max_new_tokens=params["max_new_tokens"],
                temperature=params["temperature"],
                top_p=params["top_p"],
                streamer=streamer,
            )

    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[str | None | Exception] = asyncio.Queue()

    def _pump():
        try:
            for text in streamer:
                loop.call_soon_threadsafe(queue.put_nowait, text)
        except Exception as exc:
            loop.call_soon_threadsafe(queue.put_nowait, exc)
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, None)

    threading.Thread(target=_worker, daemon=True).start()
    threading.Thread(target=_pump, daemon=True).start()

    while True:
        item = await queue.get()
        if item is None:
            break
        if isinstance(item, Exception):
            raise item
        yield item


async def run(req: RunRequest, ctx: RunContext):
    payload = req.payload or {}
    model_id = req.model or SPEC["id"]
    instance = await ctx.registry.ensure_instance(model_id, ctx)
    if not instance:
        raise RuntimeError("Qwen3 HF model not initialized.")
    prompt = _prepare_prompt(payload, tokenizer=instance.get("tokenizer"))
    params = _generation_params(payload)
    if req.stream:
        async def generator() -> AsyncIterator[dict]:
            response = new_response(model_id, "", request_id=ctx.request_id)
            yield {"event": "response.created", "data": response}
            accumulated = ""
            async for chunk in _generate_stream(instance, prompt, params):
                if not chunk:
                    continue
                accumulated += chunk
                yield {"event": "response.output_text.delta", "data": {"id": response["id"], "delta": chunk}}
            response["output_text"] = accumulated
            response["output"][0]["content"][0]["text"] = accumulated
            yield {"event": "response.output_text.done", "data": {"id": response["id"], "text": accumulated}}
            yield {"event": "response.completed", "data": response}

        return generator()

    reply = await _generate(instance, prompt, params)
    return new_response(model_id, reply, request_id=ctx.request_id)
