from __future__ import annotations

import argparse
import hashlib
import json
import re
import struct
from dataclasses import dataclass
from pathlib import Path
from typing import Any

LINUX_TARGET = "x86_64-unknown-linux-gnu"
TRANSFORMATION_KIND = "linuxdeploy-rpath-v1"
EXPECTED_RUNTIME_PATH = "$ORIGIN/../lib"
SHA256 = re.compile(r"^[a-f0-9]{64}$")

ELF_HEADER = struct.Struct("<16sHHIQQQIHHHHHH")
PROGRAM_HEADER = struct.Struct("<IIQQQQQQ")
SECTION_HEADER = struct.Struct("<IIQQQQIIQQ")
DYNAMIC_ENTRY = struct.Struct("<qQ")
NOTE_HEADER = struct.Struct("<III")

PT_LOAD = 1
PT_DYNAMIC = 2
PT_GNU_STACK = 0x6474E551
SHT_NOBITS = 8
SHT_DYNAMIC = 6
SHT_NOTE = 7
DT_NULL = 0
DT_NEEDED = 1
DT_STRTAB = 5
DT_STRSZ = 10
DT_SONAME = 14
DT_RPATH = 15
DT_RUNPATH = 29
DT_AUXILIARY = 0x7FFFFFFD
DT_FILTER = 0x7FFFFFFF
NT_GNU_BUILD_ID = 3

PROGRAM_TYPE_NAMES = {
    0: "PT_NULL",
    PT_LOAD: "PT_LOAD",
    PT_DYNAMIC: "PT_DYNAMIC",
    3: "PT_INTERP",
    4: "PT_NOTE",
    6: "PT_PHDR",
    7: "PT_TLS",
    0x6474E550: "PT_GNU_EH_FRAME",
    PT_GNU_STACK: "PT_GNU_STACK",
    0x6474E552: "PT_GNU_RELRO",
    0x6474E553: "PT_GNU_PROPERTY",
}
DYNAMIC_TAG_NAMES = {
    DT_NEEDED: "NEEDED",
    DT_STRTAB: "STRTAB",
    DT_STRSZ: "STRSZ",
    DT_SONAME: "SONAME",
    DT_RPATH: "RPATH",
    DT_RUNPATH: "RUNPATH",
    DT_AUXILIARY: "AUXILIARY",
    DT_FILTER: "FILTER",
}
STRING_DYNAMIC_TAGS = {
    DT_NEEDED,
    DT_SONAME,
    DT_RPATH,
    DT_RUNPATH,
    DT_AUXILIARY,
    DT_FILTER,
}
ALLOWED_DYNAMIC_TAGS = {DT_STRSZ, DT_RPATH, DT_RUNPATH}
TOP_LEVEL_FIELDS = {
    "schema_version",
    "target",
    "result",
    "transformation_kind",
    "pre_bundle",
    "packaged",
    "elf_identity",
    "proof",
}
LAUNCHER_FIELDS = {"sha256", "runtime_paths"}
IDENTITY_FIELDS = {
    "class",
    "byte_order",
    "abi",
    "abi_version",
    "machine",
    "file_type",
    "entry_point",
    "flags",
    "build_id",
}
PROOF_FIELDS = {
    "elf_header",
    "program_headers",
    "stable_sections",
    "changed_sections",
    "changed_dynamic_tags",
    "dynamic_string_sizes",
}
STABLE_SECTION_FIELDS = {"pre_bundle_sha256", "packaged_sha256", "count"}
DYNAMIC_STRING_SIZE_FIELDS = {"pre_bundle", "packaged"}
PROGRAM_PROOF_FIELDS = {"pre_bundle", "packaged", "changed_indices"}
PROGRAM_FIELDS = {
    "index",
    "type",
    "type_name",
    "flags",
    "offset",
    "virtual_address",
    "physical_address",
    "file_size",
    "memory_size",
    "alignment",
    "sections",
}
CHANGED_SECTION_FIELDS = {
    "name",
    "pre_sha256",
    "packaged_sha256",
    "pre_offset",
    "packaged_offset",
    "pre_size",
    "packaged_size",
}


def _require_exact_fields(value: Any, fields: set[str], label: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != fields:
        actual = sorted(value) if isinstance(value, dict) else type(value).__name__
        raise RuntimeError(f"{label} fields are {actual}; expected {sorted(fields)}.")
    return value


def _sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _checked_slice(payload: bytes, offset: int, size: int, label: str) -> bytes:
    if offset < 0 or size < 0 or offset > len(payload) or size > len(payload) - offset:
        raise RuntimeError(f"{label} extends beyond the ELF file.")
    return payload[offset : offset + size]


def _read_c_string(payload: bytes, offset: int, label: str) -> str:
    if offset < 0 or offset >= len(payload):
        raise RuntimeError(f"{label} has an invalid string offset.")
    end = payload.find(b"\0", offset)
    if end < 0:
        raise RuntimeError(f"{label} contains an unterminated string.")
    try:
        return payload[offset:end].decode("utf-8")
    except UnicodeDecodeError as error:
        raise RuntimeError(f"{label} contains a non-UTF-8 string.") from error


@dataclass(frozen=True)
class Section:
    index: int
    name: str
    type: int
    flags: int
    address: int
    offset: int
    size: int
    link: int
    info: int
    alignment: int
    entry_size: int
    data: bytes

    def stable_record(self) -> dict[str, Any]:
        return {
            "index": self.index,
            "name": self.name,
            "type": self.type,
            "flags": self.flags,
            "address": self.address,
            "offset": self.offset,
            "size": self.size,
            "link": self.link,
            "info": self.info,
            "alignment": self.alignment,
            "entry_size": self.entry_size,
            "sha256": _sha256_bytes(self.data),
        }

    def transform_record(self) -> dict[str, Any]:
        return {
            "index": self.index,
            "name": self.name,
            "type": self.type,
            "flags": self.flags,
            "address": self.address,
            "link": self.link,
            "info": self.info,
            "alignment": self.alignment,
            "entry_size": self.entry_size,
        }


@dataclass(frozen=True)
class ProgramHeader:
    index: int
    type: int
    flags: int
    offset: int
    virtual_address: int
    physical_address: int
    file_size: int
    memory_size: int
    alignment: int


class ElfFile:
    def __init__(self, path: Path) -> None:
        if not path.is_file() or path.is_symlink():
            raise RuntimeError(
                f"Launcher must be a regular, non-symbolic-link file: {path}."
            )
        self.path = path
        self.payload = path.read_bytes()
        self.header = self._parse_header()
        self.sections = self._parse_sections()
        self.program_headers = self._parse_program_headers()
        self.dynamic_entries = self._parse_dynamic_entries()
        self.runtime_paths = [
            {
                "tag": DYNAMIC_TAG_NAMES[entry["tag"]],
                "value": entry["value"],
            }
            for entry in self.dynamic_entries
            if entry["tag"] in {DT_RPATH, DT_RUNPATH}
        ]
        self.build_id = self._parse_build_id()

    def _parse_header(self) -> dict[str, Any]:
        if len(self.payload) < ELF_HEADER.size:
            raise RuntimeError("Launcher is shorter than an ELF64 header.")
        values = ELF_HEADER.unpack_from(self.payload)
        ident = values[0]
        if ident[:4] != b"\x7fELF":
            raise RuntimeError("Launcher is not an ELF file.")
        if ident[4] != 2 or ident[5] != 1:
            raise RuntimeError("Launcher must be a 64-bit little-endian ELF file.")
        if ident[6] != 1 or values[3] != 1:
            raise RuntimeError("Launcher uses an unsupported ELF version.")
        header = {
            "class": "ELF64",
            "byte_order": "little",
            "ident_version": ident[6],
            "abi": ident[7],
            "abi_version": ident[8],
            "file_type": values[1],
            "machine": values[2],
            "version": values[3],
            "entry_point": values[4],
            "program_header_offset": values[5],
            "section_header_offset": values[6],
            "flags": values[7],
            "elf_header_size": values[8],
            "program_header_entry_size": values[9],
            "program_header_count": values[10],
            "section_header_entry_size": values[11],
            "section_header_count": values[12],
            "section_name_index": values[13],
        }
        if (
            header["elf_header_size"] != ELF_HEADER.size
            or header["program_header_entry_size"] != PROGRAM_HEADER.size
            or header["section_header_entry_size"] != SECTION_HEADER.size
            or header["program_header_count"] in {0, 0xFFFF}
            or header["section_header_count"] in {0, 0xFFFF}
            or header["section_name_index"] in {0xFFFF}
            or header["section_name_index"] >= header["section_header_count"]
        ):
            raise RuntimeError(
                "Launcher uses unsupported or malformed ELF header tables."
            )
        _checked_slice(
            self.payload,
            header["program_header_offset"],
            header["program_header_count"] * PROGRAM_HEADER.size,
            "Program-header table",
        )
        _checked_slice(
            self.payload,
            header["section_header_offset"],
            header["section_header_count"] * SECTION_HEADER.size,
            "Section-header table",
        )
        return header

    def _parse_sections(self) -> list[Section]:
        raw_headers = []
        for index in range(self.header["section_header_count"]):
            offset = self.header["section_header_offset"] + index * SECTION_HEADER.size
            raw_headers.append(SECTION_HEADER.unpack_from(self.payload, offset))
        names_header = raw_headers[self.header["section_name_index"]]
        names = _checked_slice(
            self.payload,
            names_header[4],
            names_header[5],
            "Section-name string table",
        )
        sections: list[Section] = []
        seen_names: set[str] = set()
        for index, raw in enumerate(raw_headers):
            name = (
                ""
                if index == 0
                else _read_c_string(names, raw[0], f"Section {index} name")
            )
            if name and name in seen_names:
                raise RuntimeError(f"Launcher contains duplicate section name {name}.")
            seen_names.add(name)
            data = (
                b""
                if raw[1] == SHT_NOBITS
                else _checked_slice(
                    self.payload, raw[4], raw[5], f"Section {name or index}"
                )
            )
            sections.append(
                Section(
                    index=index,
                    name=name,
                    type=raw[1],
                    flags=raw[2],
                    address=raw[3],
                    offset=raw[4],
                    size=raw[5],
                    link=raw[6],
                    info=raw[7],
                    alignment=raw[8],
                    entry_size=raw[9],
                    data=data,
                )
            )
        return sections

    def _parse_program_headers(self) -> list[ProgramHeader]:
        headers = []
        for index in range(self.header["program_header_count"]):
            offset = self.header["program_header_offset"] + index * PROGRAM_HEADER.size
            raw = PROGRAM_HEADER.unpack_from(self.payload, offset)
            headers.append(
                ProgramHeader(
                    index=index,
                    type=raw[0],
                    flags=raw[1],
                    offset=raw[2],
                    virtual_address=raw[3],
                    physical_address=raw[4],
                    file_size=raw[5],
                    memory_size=raw[6],
                    alignment=raw[7],
                )
            )
        if not any(header.type == PT_LOAD for header in headers):
            raise RuntimeError("Launcher contains no PT_LOAD segment.")
        if not any(header.type == PT_DYNAMIC for header in headers):
            raise RuntimeError("Launcher contains no PT_DYNAMIC segment.")
        if not any(header.type == PT_GNU_STACK for header in headers):
            raise RuntimeError("Launcher contains no PT_GNU_STACK declaration.")
        for header in headers:
            if (
                header.type == PT_LOAD
                and header.alignment > 1
                and header.offset % header.alignment
                != header.virtual_address % header.alignment
            ):
                raise RuntimeError(
                    "Launcher contains an incongruent PT_LOAD file mapping."
                )
        return headers

    def _parse_dynamic_entries(self) -> list[dict[str, Any]]:
        dynamic_sections = [
            section for section in self.sections if section.type == SHT_DYNAMIC
        ]
        if len(dynamic_sections) != 1:
            raise RuntimeError(
                f"Launcher must contain exactly one dynamic section; found {len(dynamic_sections)}."
            )
        dynamic = dynamic_sections[0]
        if (
            dynamic.entry_size != DYNAMIC_ENTRY.size
            or dynamic.size % dynamic.entry_size
        ):
            raise RuntimeError(
                "Launcher dynamic section has an unsupported entry layout."
            )
        if dynamic.link >= len(self.sections):
            raise RuntimeError(
                "Launcher dynamic section has an invalid string-table link."
            )
        strings = self.sections[dynamic.link]
        entries = []
        saw_null = False
        for offset in range(0, dynamic.size, dynamic.entry_size):
            tag, value = DYNAMIC_ENTRY.unpack_from(dynamic.data, offset)
            if tag == DT_NULL:
                saw_null = True
                break
            semantic_value: str | int = (
                _read_c_string(strings.data, value, f"Dynamic tag {tag}")
                if tag in STRING_DYNAMIC_TAGS
                else value
            )
            entries.append({"tag": tag, "value": semantic_value})
        if not saw_null:
            raise RuntimeError(
                "Launcher dynamic section has no terminating DT_NULL entry."
            )
        string_sizes = [entry["value"] for entry in entries if entry["tag"] == DT_STRSZ]
        if len(string_sizes) != 1 or string_sizes[0] != strings.size:
            raise RuntimeError(
                "Launcher DT_STRSZ must occur once and equal the linked string-table size."
            )
        return entries

    def _parse_build_id(self) -> str:
        identities = []
        for section in self.sections:
            if section.type != SHT_NOTE:
                continue
            offset = 0
            while offset < len(section.data):
                if len(section.data) - offset < NOTE_HEADER.size:
                    raise RuntimeError(f"ELF note section {section.name} is truncated.")
                name_size, description_size, note_type = NOTE_HEADER.unpack_from(
                    section.data, offset
                )
                offset += NOTE_HEADER.size
                name = _checked_slice(section.data, offset, name_size, "ELF note name")
                offset += (name_size + 3) & ~3
                description = _checked_slice(
                    section.data, offset, description_size, "ELF note description"
                )
                offset += (description_size + 3) & ~3
                if name.rstrip(b"\0") == b"GNU" and note_type == NT_GNU_BUILD_ID:
                    identities.append(description.hex())
        if len(identities) != 1 or not identities[0]:
            raise RuntimeError(
                f"Launcher must contain exactly one GNU build identity; found {len(identities)}."
            )
        return identities[0]

    def identity(self) -> dict[str, Any]:
        return {
            "class": self.header["class"],
            "byte_order": self.header["byte_order"],
            "abi": self.header["abi"],
            "abi_version": self.header["abi_version"],
            "machine": self.header["machine"],
            "file_type": self.header["file_type"],
            "entry_point": self.header["entry_point"],
            "flags": self.header["flags"],
            "build_id": self.build_id,
        }

    def program_records(self) -> list[dict[str, Any]]:
        return [
            {
                "index": header.index,
                "type": header.type,
                "type_name": PROGRAM_TYPE_NAMES.get(
                    header.type, f"PT_{header.type:#x}"
                ),
                "flags": header.flags,
                "offset": header.offset,
                "virtual_address": header.virtual_address,
                "physical_address": header.physical_address,
                "file_size": header.file_size,
                "memory_size": header.memory_size,
                "alignment": header.alignment,
                "sections": self._sections_in_segment(header),
            }
            for header in self.program_headers
        ]

    def _sections_in_segment(self, header: ProgramHeader) -> list[str]:
        members = []
        for section in self.sections[1:]:
            if section.size == 0 or not section.flags & 0x2:
                continue
            if section.type == SHT_NOBITS:
                inside = (
                    section.address >= header.virtual_address
                    and section.address + section.size
                    <= header.virtual_address + header.memory_size
                )
            else:
                inside = (
                    section.offset >= header.offset
                    and section.offset + section.size
                    <= header.offset + header.file_size
                )
                if section.flags & 0x2:
                    inside = inside and (
                        section.address >= header.virtual_address
                        and section.address + section.size
                        <= header.virtual_address + header.memory_size
                    )
            if inside:
                members.append(section.name)
        return members


def _stable_sections_digest(
    sections: list[Section], changed_names: set[str]
) -> tuple[str, int]:
    records = [
        section.stable_record()
        for section in sections
        if section.index != 0 and section.name not in changed_names
    ]
    encoded = json.dumps(records, sort_keys=True, separators=(",", ":")).encode()
    return _sha256_bytes(encoded), len(records)


def _compare_program_headers(
    before: list[dict[str, Any]],
    after: list[dict[str, Any]],
    changed_sections: list[dict[str, Any]],
) -> list[int]:
    if len(before) != len(after):
        raise RuntimeError("linuxdeploy changed the program-header count.")
    changed_indices = []
    changed_section_names = {section["name"] for section in changed_sections}
    before_allowed_ranges = [
        interval
        for section in changed_sections
        for interval in _interval_difference(
            (section["pre_offset"], section["pre_offset"] + section["pre_size"]),
            (
                section["packaged_offset"],
                section["packaged_offset"] + section["packaged_size"],
            ),
        )
    ]
    after_allowed_ranges = [
        interval
        for section in changed_sections
        for interval in _interval_difference(
            (
                section["packaged_offset"],
                section["packaged_offset"] + section["packaged_size"],
            ),
            (section["pre_offset"], section["pre_offset"] + section["pre_size"]),
        )
    ]
    exact_fields = {
        "index",
        "type",
        "type_name",
        "flags",
        "virtual_address",
        "physical_address",
        "memory_size",
        "alignment",
        "sections",
    }
    for left, right in zip(before, after, strict=True):
        if any(left[field] != right[field] for field in exact_fields):
            if left["type"] == PT_LOAD and left["flags"] != right["flags"]:
                raise RuntimeError("linuxdeploy changed PT_LOAD permissions.")
            if left["type"] == PT_GNU_STACK and left["flags"] != right["flags"]:
                raise RuntimeError("linuxdeploy changed PT_GNU_STACK executability.")
            if left["sections"] != right["sections"]:
                raise RuntimeError("linuxdeploy changed a section-to-segment mapping.")
            raise RuntimeError(
                "linuxdeploy changed an unapproved program-header semantic."
            )
        if left["offset"] != right["offset"] or left["file_size"] != right["file_size"]:
            if not changed_section_names.intersection(left["sections"]):
                raise RuntimeError(
                    "linuxdeploy changed a program-header offset or file size outside "
                    "the runtime-path relocation segment."
                )
            removed_ranges = _interval_difference(
                (left["offset"], left["offset"] + left["file_size"]),
                (right["offset"], right["offset"] + right["file_size"]),
            )
            added_ranges = _interval_difference(
                (right["offset"], right["offset"] + right["file_size"]),
                (left["offset"], left["offset"] + left["file_size"]),
            )
            if not _ranges_are_covered(
                removed_ranges, before_allowed_ranges
            ) or not _ranges_are_covered(added_ranges, after_allowed_ranges):
                raise RuntimeError(
                    "linuxdeploy changed program-header file coverage beyond the "
                    "approved runtime-path byte ranges."
                )
            changed_indices.append(left["index"])
    return changed_indices


def _interval_difference(
    primary: tuple[int, int], subtract: tuple[int, int]
) -> list[tuple[int, int]]:
    start, end = primary
    other_start, other_end = subtract
    if end <= start:
        return []
    overlap_start = max(start, other_start)
    overlap_end = min(end, other_end)
    if overlap_start >= overlap_end:
        return [(start, end)]
    difference = []
    if start < overlap_start:
        difference.append((start, overlap_start))
    if overlap_end < end:
        difference.append((overlap_end, end))
    return difference


def _ranges_are_covered(
    required: list[tuple[int, int]], allowed: list[tuple[int, int]]
) -> bool:
    merged: list[list[int]] = []
    for start, end in sorted(allowed):
        if end <= start:
            continue
        if merged and start <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    return all(
        any(
            allowed_start <= start and end <= allowed_end
            for allowed_start, allowed_end in merged
        )
        for start, end in required
    )


def _canonical_dynamic_entries(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [entry for entry in entries if entry["tag"] not in ALLOWED_DYNAMIC_TAGS]


def create_receipt(pre_bundle: Path, packaged: Path) -> dict[str, Any]:
    before = ElfFile(pre_bundle)
    after = ElfFile(packaged)
    if before.header != after.header:
        raise RuntimeError("linuxdeploy changed the canonical ELF header.")
    if before.identity() != after.identity():
        raise RuntimeError(
            "linuxdeploy changed the ELF identity or GNU build identity."
        )
    if before.runtime_paths == after.runtime_paths:
        raise RuntimeError(
            "linuxdeploy did not produce a distinct runtime-path transformation."
        )
    if (
        len(after.runtime_paths) != 1
        or after.runtime_paths[0]["tag"] not in {"RPATH", "RUNPATH"}
        or after.runtime_paths[0]["value"] != EXPECTED_RUNTIME_PATH
    ):
        raise RuntimeError(
            f"Packaged launcher runtime path must be exactly {EXPECTED_RUNTIME_PATH}."
        )
    if _canonical_dynamic_entries(before.dynamic_entries) != _canonical_dynamic_entries(
        after.dynamic_entries
    ):
        raise RuntimeError("linuxdeploy changed a non-runtime-path dynamic entry.")

    before_sections = {section.name: section for section in before.sections}
    after_sections = {section.name: section for section in after.sections}
    if list(before_sections) != list(after_sections):
        raise RuntimeError("linuxdeploy changed the ELF section inventory or order.")
    dynamic = next(
        section for section in before.sections if section.type == SHT_DYNAMIC
    )
    linked_strings = before.sections[dynamic.link]
    allowed_section_names = {dynamic.name, linked_strings.name}
    changed_sections = []
    for name, left in before_sections.items():
        right = after_sections[name]
        if name in allowed_section_names:
            if left.transform_record() != right.transform_record():
                raise RuntimeError(
                    f"linuxdeploy changed unapproved metadata for runtime-linking section {name}."
                )
            if (
                left.data != right.data
                or left.offset != right.offset
                or left.size != right.size
            ):
                changed_sections.append(
                    {
                        "name": name,
                        "pre_sha256": _sha256_bytes(left.data),
                        "packaged_sha256": _sha256_bytes(right.data),
                        "pre_offset": left.offset,
                        "packaged_offset": right.offset,
                        "pre_size": left.size,
                        "packaged_size": right.size,
                    }
                )
        elif left.stable_record() != right.stable_record():
            raise RuntimeError(f"linuxdeploy changed stable ELF section {name}.")
    if {item["name"] for item in changed_sections} != allowed_section_names:
        raise RuntimeError(
            "linuxdeploy did not limit the transformation to .dynamic and its linked string table."
        )

    stable_before, stable_count = _stable_sections_digest(
        before.sections, allowed_section_names
    )
    stable_after, stable_after_count = _stable_sections_digest(
        after.sections, allowed_section_names
    )
    if stable_before != stable_after or stable_count != stable_after_count:
        raise RuntimeError("linuxdeploy changed the canonical stable-section digest.")

    before_programs = before.program_records()
    after_programs = after.program_records()
    changed_program_indices = _compare_program_headers(
        before_programs, after_programs, changed_sections
    )
    before_allowed_dynamic = [
        entry
        for entry in before.dynamic_entries
        if entry["tag"] in ALLOWED_DYNAMIC_TAGS
    ]
    after_allowed_dynamic = [
        entry for entry in after.dynamic_entries if entry["tag"] in ALLOWED_DYNAMIC_TAGS
    ]
    before_string_size = next(
        entry["value"] for entry in before_allowed_dynamic if entry["tag"] == DT_STRSZ
    )
    after_string_size = next(
        entry["value"] for entry in after_allowed_dynamic if entry["tag"] == DT_STRSZ
    )
    changed_dynamic_tags = sorted(
        {
            DYNAMIC_TAG_NAMES[tag]
            for tag in ALLOWED_DYNAMIC_TAGS
            if [entry for entry in before_allowed_dynamic if entry["tag"] == tag]
            != [entry for entry in after_allowed_dynamic if entry["tag"] == tag]
        }
    )
    if not {"RPATH", "RUNPATH"}.intersection(changed_dynamic_tags):
        raise RuntimeError(
            "linuxdeploy receipt does not contain a runtime-path dynamic change."
        )

    receipt = {
        "schema_version": 1,
        "target": LINUX_TARGET,
        "result": "passed",
        "transformation_kind": TRANSFORMATION_KIND,
        "pre_bundle": {
            "sha256": sha256_file(pre_bundle),
            "runtime_paths": before.runtime_paths,
        },
        "packaged": {
            "sha256": sha256_file(packaged),
            "runtime_paths": after.runtime_paths,
        },
        "elf_identity": before.identity(),
        "proof": {
            "elf_header": before.header,
            "program_headers": {
                "pre_bundle": before_programs,
                "packaged": after_programs,
                "changed_indices": changed_program_indices,
            },
            "stable_sections": {
                "pre_bundle_sha256": stable_before,
                "packaged_sha256": stable_after,
                "count": stable_count,
            },
            "changed_sections": sorted(changed_sections, key=lambda item: item["name"]),
            "changed_dynamic_tags": changed_dynamic_tags,
            "dynamic_string_sizes": {
                "pre_bundle": before_string_size,
                "packaged": after_string_size,
            },
        },
    }
    validate_receipt(receipt)
    return receipt


def _validate_runtime_paths(value: Any, label: str) -> list[dict[str, str]]:
    if not isinstance(value, list):
        raise TypeError(f"{label} runtime paths must be a list.")
    for item in value:
        item = _require_exact_fields(item, {"tag", "value"}, f"{label} runtime path")
        if item["tag"] not in {"RPATH", "RUNPATH"} or not isinstance(
            item["value"], str
        ):
            raise RuntimeError(f"{label} runtime path is invalid.")
    return value


def _validate_program_record(value: Any, label: str) -> dict[str, Any]:
    value = _require_exact_fields(value, PROGRAM_FIELDS, label)
    integer_fields = PROGRAM_FIELDS - {"type_name", "sections"}
    if any(
        not isinstance(value[field], int) or isinstance(value[field], bool)
        for field in integer_fields
    ):
        raise RuntimeError(f"{label} contains a non-integer ELF field.")
    if not isinstance(value["type_name"], str) or not value["type_name"]:
        raise RuntimeError(f"{label} has an invalid type name.")
    if (
        not isinstance(value["sections"], list)
        or any(not isinstance(name, str) for name in value["sections"])
        or len(value["sections"]) != len(set(value["sections"]))
    ):
        raise RuntimeError(f"{label} has an invalid section mapping.")
    if (
        value["type"] == PT_LOAD
        and value["alignment"] > 1
        and value["offset"] % value["alignment"]
        != value["virtual_address"] % value["alignment"]
    ):
        raise RuntimeError(f"{label} contains an incongruent PT_LOAD file mapping.")
    return value


def validate_receipt(receipt: Any) -> dict[str, Any]:
    receipt = _require_exact_fields(
        receipt, TOP_LEVEL_FIELDS, "launcher transformation"
    )
    if (
        receipt["schema_version"] != 1
        or receipt["target"] != LINUX_TARGET
        or receipt["result"] != "passed"
        or receipt["transformation_kind"] != TRANSFORMATION_KIND
    ):
        raise RuntimeError("Launcher transformation identity is invalid.")
    launchers = {}
    for label in ("pre_bundle", "packaged"):
        launcher = _require_exact_fields(receipt[label], LAUNCHER_FIELDS, label)
        if not isinstance(launcher["sha256"], str) or not SHA256.fullmatch(
            launcher["sha256"]
        ):
            raise RuntimeError(f"{label} launcher SHA-256 is invalid.")
        _validate_runtime_paths(launcher["runtime_paths"], label)
        launchers[label] = launcher
    if launchers["pre_bundle"]["sha256"] == launchers["packaged"]["sha256"]:
        raise RuntimeError(
            "Launcher transformation must attest distinct pre and packaged bytes."
        )
    if (
        launchers["pre_bundle"]["runtime_paths"]
        == launchers["packaged"]["runtime_paths"]
    ):
        raise RuntimeError("Launcher transformation runtime paths are unchanged.")
    if len(launchers["pre_bundle"]["runtime_paths"]) > 1:
        raise RuntimeError("Pre-bundle launcher has ambiguous runtime-path evidence.")
    packaged_paths = launchers["packaged"]["runtime_paths"]
    if (
        len(packaged_paths) != 1
        or packaged_paths[0]["value"] != EXPECTED_RUNTIME_PATH
        or packaged_paths[0]["tag"] not in {"RPATH", "RUNPATH"}
    ):
        raise RuntimeError("Packaged launcher runtime-path evidence is invalid.")

    identity = _require_exact_fields(
        receipt["elf_identity"], IDENTITY_FIELDS, "ELF identity"
    )
    if (
        identity["class"] != "ELF64"
        or identity["byte_order"] != "little"
        or identity["machine"] != 62
        or not isinstance(identity["build_id"], str)
        or not identity["build_id"]
        or not all(
            character in "0123456789abcdef" for character in identity["build_id"]
        )
        or any(
            not isinstance(identity[field], int) or isinstance(identity[field], bool)
            for field in ("abi", "abi_version", "file_type", "entry_point", "flags")
        )
    ):
        raise RuntimeError("ELF identity evidence is invalid.")

    proof = _require_exact_fields(
        receipt["proof"], PROOF_FIELDS, "transformation proof"
    )
    header = proof["elf_header"]
    required_header_fields = {
        "class",
        "byte_order",
        "ident_version",
        "abi",
        "abi_version",
        "file_type",
        "machine",
        "version",
        "entry_point",
        "program_header_offset",
        "section_header_offset",
        "flags",
        "elf_header_size",
        "program_header_entry_size",
        "program_header_count",
        "section_header_entry_size",
        "section_header_count",
        "section_name_index",
    }
    header = _require_exact_fields(
        header, required_header_fields, "canonical ELF header"
    )
    if (
        header["class"] != identity["class"]
        or header["byte_order"] != identity["byte_order"]
        or header["abi"] != identity["abi"]
        or header["abi_version"] != identity["abi_version"]
        or header["file_type"] != identity["file_type"]
        or header["machine"] != identity["machine"]
        or header["entry_point"] != identity["entry_point"]
        or header["flags"] != identity["flags"]
        or any(
            not isinstance(header[field], int) or isinstance(header[field], bool)
            for field in required_header_fields - {"class", "byte_order"}
        )
    ):
        raise RuntimeError("Canonical ELF header is inconsistent with ELF identity.")

    programs = _require_exact_fields(
        proof["program_headers"], PROGRAM_PROOF_FIELDS, "program-header proof"
    )
    before_programs = (
        [
            _validate_program_record(item, f"pre-bundle program header {index}")
            for index, item in enumerate(programs["pre_bundle"])
        ]
        if isinstance(programs["pre_bundle"], list)
        else []
    )
    after_programs = (
        [
            _validate_program_record(item, f"packaged program header {index}")
            for index, item in enumerate(programs["packaged"])
        ]
        if isinstance(programs["packaged"], list)
        else []
    )
    if (
        not before_programs
        or not after_programs
        or len(before_programs) != header["program_header_count"]
    ):
        raise RuntimeError("Program-header proof is incomplete.")
    if [item["index"] for item in before_programs] != list(range(len(before_programs))):
        raise RuntimeError("Program-header indices are not canonical.")
    required_program_types = {PT_LOAD, PT_DYNAMIC, PT_GNU_STACK}
    if not required_program_types.issubset({item["type"] for item in before_programs}):
        raise RuntimeError(
            "Program-header proof omits a required load, dynamic, or stack segment."
        )
    if any(
        item["type"] == PT_GNU_STACK and item["flags"] & 0x1 for item in before_programs
    ):
        raise RuntimeError("Program-header proof contains an executable PT_GNU_STACK.")

    changed_sections = proof["changed_sections"]
    if not isinstance(changed_sections, list):
        raise TypeError("Changed-section proof must be a list.")
    validated_sections = [
        _require_exact_fields(item, CHANGED_SECTION_FIELDS, "changed section")
        for item in changed_sections
    ]
    changed_names = {item["name"] for item in validated_sections}
    if changed_names != {".dynamic", ".dynstr"} or len(validated_sections) != 2:
        raise RuntimeError("Changed sections must be exactly .dynamic and .dynstr.")
    for section in validated_sections:
        if (
            not isinstance(section["name"], str)
            or not isinstance(section["pre_offset"], int)
            or isinstance(section["pre_offset"], bool)
            or not isinstance(section["packaged_offset"], int)
            or isinstance(section["packaged_offset"], bool)
            or section["pre_offset"] < 0
            or section["packaged_offset"] < 0
            or not isinstance(section["pre_size"], int)
            or not isinstance(section["packaged_size"], int)
            or section["pre_size"] <= 0
            or section["packaged_size"] <= 0
            or any(
                not isinstance(section[field], str)
                or not SHA256.fullmatch(section[field])
                for field in ("pre_sha256", "packaged_sha256")
            )
            or section["pre_sha256"] == section["packaged_sha256"]
        ):
            raise RuntimeError("Changed-section proof is invalid.")

    expected_changed_indices = _compare_program_headers(
        before_programs, after_programs, validated_sections
    )
    if (
        not isinstance(programs["changed_indices"], list)
        or programs["changed_indices"] != expected_changed_indices
        or any(
            not isinstance(index, int) or isinstance(index, bool)
            for index in programs["changed_indices"]
        )
    ):
        raise RuntimeError("Program-header changed-index proof is inconsistent.")
    stable_sections = _require_exact_fields(
        proof["stable_sections"], STABLE_SECTION_FIELDS, "stable-section proof"
    )
    if (
        any(
            not isinstance(stable_sections[field], str)
            or not SHA256.fullmatch(stable_sections[field])
            for field in ("pre_bundle_sha256", "packaged_sha256")
        )
        or stable_sections["pre_bundle_sha256"] != stable_sections["packaged_sha256"]
        or not isinstance(stable_sections["count"], int)
        or isinstance(stable_sections["count"], bool)
        or stable_sections["count"] < 1
    ):
        raise RuntimeError("Stable-section proof is invalid.")
    dynstr = next(
        section for section in validated_sections if section["name"] == ".dynstr"
    )
    string_size_changed = dynstr["pre_size"] != dynstr["packaged_size"]
    dynamic_string_sizes = _require_exact_fields(
        proof["dynamic_string_sizes"],
        DYNAMIC_STRING_SIZE_FIELDS,
        "dynamic string-table sizes",
    )
    if (
        dynamic_string_sizes["pre_bundle"] != dynstr["pre_size"]
        or dynamic_string_sizes["packaged"] != dynstr["packaged_size"]
        or any(
            not isinstance(dynamic_string_sizes[field], int)
            or isinstance(dynamic_string_sizes[field], bool)
            or dynamic_string_sizes[field] <= 0
            for field in ("pre_bundle", "packaged")
        )
    ):
        raise RuntimeError("Dynamic string-table size proof is invalid.")
    expected_dynamic_tags = {
        tag
        for tag in ("RPATH", "RUNPATH")
        if [
            item["value"]
            for item in receipt["pre_bundle"]["runtime_paths"]
            if item["tag"] == tag
        ]
        != [
            item["value"]
            for item in receipt["packaged"]["runtime_paths"]
            if item["tag"] == tag
        ]
    }
    if string_size_changed:
        expected_dynamic_tags.add("STRSZ")
    if (
        not isinstance(proof["changed_dynamic_tags"], list)
        or proof["changed_dynamic_tags"] != sorted(set(proof["changed_dynamic_tags"]))
        or set(proof["changed_dynamic_tags"]) != expected_dynamic_tags
    ):
        raise RuntimeError("Dynamic-tag transformation proof is invalid.")
    return receipt


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pre-bundle", type=Path, required=True)
    parser.add_argument("--packaged", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    arguments = parser.parse_args()
    receipt = create_receipt(
        arguments.pre_bundle.resolve(), arguments.packaged.resolve()
    )
    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    arguments.output.write_text(
        json.dumps(receipt, indent=2, sort_keys=True) + "\n", "utf-8"
    )
    print(f"Verified bounded linuxdeploy launcher transformation: {arguments.output}")


if __name__ == "__main__":
    main()
