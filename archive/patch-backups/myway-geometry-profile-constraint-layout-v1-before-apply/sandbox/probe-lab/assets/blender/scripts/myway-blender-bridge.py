import argparse
import json
import math
import os
import sys
import traceback
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

import bpy
from mathutils import Vector


def log(message):
    print(f"[MyWay Blender] {message}", flush=True)


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write_json(path, data):
    data["updated_at"] = __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat()
    Path(path).write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in list(bpy.data.collections):
        if collection.users == 0:
            bpy.data.collections.remove(collection)


def import_asset(input_path):
    suffix = Path(input_path).suffix.lower()
    clear_scene()
    if suffix in {".glb", ".gltf"}:
        bpy.ops.import_scene.gltf(filepath=str(input_path))
    elif suffix == ".obj":
        if hasattr(bpy.ops.wm, "obj_import"):
            bpy.ops.wm.obj_import(filepath=str(input_path))
        else:
            bpy.ops.import_scene.obj(filepath=str(input_path))
    elif suffix == ".fbx":
        bpy.ops.import_scene.fbx(filepath=str(input_path))
    elif suffix == ".blend":
        append_blend_file(input_path)
    else:
        raise RuntimeError(f"Unsupported input asset format: {suffix}")


def append_blend_file(blend_path):
    clear_scene()
    with bpy.data.libraries.load(str(blend_path), link=False) as (data_from, data_to):
        data_to.objects = [name for name in data_from.objects if name]
    for obj in data_to.objects:
        if obj is not None and obj.name not in bpy.context.scene.collection.objects:
            bpy.context.scene.collection.objects.link(obj)


def asset_objects():
    return [obj for obj in bpy.context.scene.objects if obj.type not in {"CAMERA", "LIGHT"}]


def mesh_objects():
    return [obj for obj in asset_objects() if obj.type == "MESH"]


def world_bbox(objects):
    points = []
    for obj in objects:
        if hasattr(obj, "bound_box"):
            points.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    if not points:
        raise RuntimeError("The imported asset did not contain renderable geometry.")
    minimum = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    maximum = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    return minimum, maximum


def normalize_scene(target_extent):
    objects = asset_objects()
    meshes = mesh_objects()
    if not meshes:
        raise RuntimeError("The imported asset contained no mesh objects.")

    for obj in objects:
        obj.hide_set(False)
        obj.hide_render = False
        obj.select_set(True)

    minimum, maximum = world_bbox(meshes)
    dimensions = maximum - minimum
    longest = max(dimensions.x, dimensions.y, dimensions.z, 1e-6)
    scale = float(target_extent) / longest
    roots = [obj for obj in objects if obj.parent is None or obj.parent not in objects]
    for obj in roots:
        obj.scale = obj.scale * scale
    bpy.context.view_layer.update()

    minimum, maximum = world_bbox(meshes)
    center_xy = Vector(((minimum.x + maximum.x) / 2, (minimum.y + maximum.y) / 2, 0))
    translation = Vector((-center_xy.x, -center_xy.y, -minimum.z))
    for obj in roots:
        obj.location += translation
    bpy.context.view_layer.update()

    minimum, maximum = world_bbox(meshes)
    dimensions = maximum - minimum
    return [round(dimensions.x, 6), round(dimensions.y, 6), round(dimensions.z, 6)]



def _texture_directory_name(resolution):
    names = {
        "resolution_0_5K": "textures_0_5k",
        "resolution_1K": "textures_1k",
        "resolution_2K": "textures_2k",
        "resolution_4K": "textures_4k",
        "resolution_8K": "textures_8k",
        "blend": "textures",
    }
    return names.get(str(resolution), "textures")


def _basename(value):
    if not value:
        return ""
    return str(value).replace("\\", "/").rsplit("/", 1)[-1]


def _safe_texture_name(value, fallback):
    name = _basename(value).strip()
    if not name or name in {".", ".."}:
        name = fallback
    return "".join(
        character if character.isalnum() or character in "._- " else "_"
        for character in name
    )


def _tile_number(image, index):
    try:
        tiles = list(image.tiles)
        if index < len(tiles):
            return int(tiles[index].number)
    except Exception:
        pass
    return 1001 + index


def _target_for_packed_file(image, packed_file, index, texture_dir):
    source_name = (
        getattr(packed_file, "filepath", "")
        or getattr(image, "filepath", "")
        or getattr(image, "filepath_raw", "")
        or image.name
    )
    fallback = f"{image.name}_{_tile_number(image, index)}.png"
    name = _safe_texture_name(source_name, fallback)
    if "<UDIM>" in name:
        name = name.replace("<UDIM>", str(_tile_number(image, index)))
    return texture_dir / name


def _set_image_path_after_unpack(image, targets):
    if not targets:
        return

    first_target = targets[0]
    if getattr(image, "source", "") == "TILED":
        pattern_name = first_target.name
        for index in range(max(1, len(targets))):
            tile_text = str(_tile_number(image, index))
            if tile_text in pattern_name:
                pattern_name = pattern_name.replace(tile_text, "<UDIM>", 1)
                break
        image.filepath = str(first_target.parent / pattern_name)
    else:
        image.filepath = str(first_target)

    image.filepath_raw = image.filepath


def _resolved_image_paths(image):
    filepath = getattr(image, "filepath", "") or getattr(image, "filepath_raw", "")
    if not filepath:
        return []

    try:
        absolute = bpy.path.abspath(
            filepath,
            library=getattr(image, "library", None),
        )
    except TypeError:
        absolute = bpy.path.abspath(filepath)

    if "<UDIM>" not in absolute:
        return [Path(absolute)]

    paths = []
    try:
        tiles = list(image.tiles)
    except Exception:
        tiles = []

    for index in range(max(1, len(tiles))):
        paths.append(
            Path(absolute.replace("<UDIM>", str(_tile_number(image, index))))
        )
    return paths


def _image_has_usable_source(image):
    if len(getattr(image, "packed_files", [])) > 0:
        return True

    paths = _resolved_image_paths(image)
    return bool(paths) and all(path.exists() for path in paths)


def _remove_missing_image_nodes(missing_images):
    missing_set = set(missing_images)
    removed = []

    for material in bpy.data.materials:
        node_tree = getattr(material, "node_tree", None)
        if not node_tree:
            continue

        material_removed = False
        for node in list(node_tree.nodes):
            if (
                node.type == "TEX_IMAGE"
                and getattr(node, "image", None) in missing_set
            ):
                removed.append(f"{material.name}:{node.image.name}")
                node_tree.nodes.remove(node)
                material_removed = True

        if material_removed:
            material.diffuse_color = (0.55, 0.55, 0.55, 1.0)
            for node in node_tree.nodes:
                if node.type != "BSDF_PRINCIPLED":
                    continue
                base_color = node.inputs.get("Base Color")
                roughness = node.inputs.get("Roughness")
                if base_color is not None and not base_color.is_linked:
                    base_color.default_value = material.diffuse_color
                if roughness is not None and not roughness.is_linked:
                    roughness.default_value = 0.55

    return removed


def prepare_blenderkit_textures(asset_directory, resolution):
    texture_dir = Path(asset_directory) / _texture_directory_name(resolution)
    texture_dir.mkdir(parents=True, exist_ok=True)

    unpacked_images = []
    unpack_warnings = []

    for image in list(bpy.data.images):
        if image.name in {"Render Result", "Viewer Node"}:
            continue
        if getattr(image, "source", "") in {"GENERATED", "VIEWER"}:
            continue

        packed_files = list(getattr(image, "packed_files", []))
        if not packed_files:
            continue

        targets = []
        for index, packed_file in enumerate(packed_files):
            target = _target_for_packed_file(
                image,
                packed_file,
                index,
                texture_dir,
            )
            target.parent.mkdir(parents=True, exist_ok=True)
            packed_file.filepath = str(target)
            targets.append(target)

        _set_image_path_after_unpack(image, targets)

        try:
            image.unpack(method="WRITE_ORIGINAL")
            unpacked_images.append(image.name)
        except Exception as exc:
            unpack_warnings.append(
                f"Could not unpack {image.name}: {type(exc).__name__}: {exc}"
            )

    missing_images = []
    for image in list(bpy.data.images):
        if image.name in {"Render Result", "Viewer Node"}:
            continue
        if getattr(image, "source", "") in {"GENERATED", "VIEWER"}:
            continue
        if not _image_has_usable_source(image):
            missing_images.append(image)

    removed_nodes = _remove_missing_image_nodes(missing_images)

    if unpacked_images:
        log(
            f"Materialized {len(unpacked_images)} packed texture image(s) in "
            f"{texture_dir}"
        )
    if missing_images:
        log(
            "Removed missing image texture nodes so GLB export can continue: "
            + ", ".join(image.name for image in missing_images)
        )

    return {
        "texture_directory": str(texture_dir),
        "unpacked_images": unpacked_images,
        "missing_images_removed": [image.name for image in missing_images],
        "removed_material_nodes": removed_nodes,
        "warnings": unpack_warnings,
    }


def export_glb(output_path):
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in asset_objects():
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=str(output_path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_animations=True,
    )


def make_thumbnail(thumbnail_path, dimensions):
    Path(thumbnail_path).parent.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    available_engines = {
        item.identifier
        for item in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items
    }
    if "BLENDER_EEVEE_NEXT" in available_engines:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    elif "BLENDER_EEVEE" in available_engines:
        scene.render.engine = "BLENDER_EEVEE"
    else:
        scene.render.engine = "CYCLES" if "CYCLES" in available_engines else next(iter(available_engines))
    scene.render.resolution_x = 512
    scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = True

    longest = max(dimensions) if dimensions else 2.0
    camera_data = bpy.data.cameras.new("MyWayAssetCamera")
    camera = bpy.data.objects.new("MyWayAssetCamera", camera_data)
    scene.collection.objects.link(camera)
    camera.location = (longest * 1.55, -longest * 1.75, longest * 1.2)
    target = Vector((0, 0, max(dimensions[2] * 0.45, 0.2)))
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera_data.lens = 52
    scene.camera = camera

    for name, location, energy, size in [
        ("Key", (longest * 2, -longest * 2, longest * 3), 1100, longest * 2),
        ("Fill", (-longest * 2, -longest, longest * 1.5), 650, longest * 2),
        ("Rim", (0, longest * 2, longest * 2.5), 900, longest * 1.5),
    ]:
        light_data = bpy.data.lights.new(name, type="AREA")
        light_data.energy = energy
        light_data.shape = "DISK"
        light_data.size = max(size, 1.0)
        light = bpy.data.objects.new(name, light_data)
        light.location = location
        scene.collection.objects.link(light)

    scene.render.filepath = str(thumbnail_path)
    bpy.ops.render.render(write_still=True)


def polygon_count():
    return sum(len(obj.data.polygons) for obj in mesh_objects() if getattr(obj, "data", None))


def animation_clips():
    names = []
    for action in bpy.data.actions:
        names.append(action.name)
    return sorted(set(names))


def get_blenderkit_api_key():
    explicit = os.environ.get("BLENDERKIT_API_KEY", "").strip()
    if explicit:
        return explicit
    for key, addon in bpy.context.preferences.addons.items():
        if "blenderkit" not in key.lower():
            continue
        value = getattr(addon.preferences, "api_key", "")
        if value:
            return value
    return ""


def http_json(url, api_key=""):
    headers = {"User-Agent": "MyWay-Blender-Bridge/1.0", "Accept": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=90) as response:
        return json.loads(response.read().decode("utf-8"))


def http_bytes(url, api_key=""):
    headers = {"User-Agent": "MyWay-Blender-Bridge/1.0"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=600) as response:
        return response.headers.get("content-type", ""), response.read()


def recursive_url(value):
    if isinstance(value, str) and value.startswith(("http://", "https://")):
        if ".blend" in value.lower() or "public-assets" in value.lower():
            return value
    if isinstance(value, dict):
        for preferred in ("filePath", "file_path", "downloadUrl", "download_url", "url"):
            if preferred in value:
                found = recursive_url(value[preferred])
                if found:
                    return found
        for child in value.values():
            found = recursive_url(child)
            if found:
                return found
    if isinstance(value, list):
        for child in value:
            found = recursive_url(child)
            if found:
                return found
    return None


def ordered_tokens(value):
    return [
        part
        for part in "".join(
            character.lower() if character.isalnum() else " "
            for character in str(value or "")
        ).split()
        if part
    ]


def tokenize(value):
    return set(ordered_tokens(value))


LOW_INFORMATION_QUERY_TOKENS = {
    "generic",
    "simple",
    "basic",
    "realistic",
    "small",
    "large",
    "medium",
    "modern",
    "classic",
    "wooden",
    "plastic",
    "metal",
    "household",
    "home",
    "indoor",
    "outdoor",
}


def token_matches(query_token, source_token):
    if query_token == source_token:
        return True

    if len(query_token) >= 4 and len(source_token) >= 4:
        if query_token in source_token or source_token in query_token:
            return True

    query_singular = (
        query_token[:-1]
        if query_token.endswith("s") and len(query_token) > 4
        else query_token
    )
    source_singular = (
        source_token[:-1]
        if source_token.endswith("s") and len(source_token) > 4
        else source_token
    )

    return query_singular == source_singular


def blenderkit_result_words(result):
    text = " ".join([
        str(result.get("displayName", "")),
        str(result.get("name", "")),
        str(result.get("description", "")),
        " ".join(result.get("tags", []) or []),
    ])
    return tokenize(text)


def query_anchor_token(query):
    tokens = ordered_tokens(query)
    meaningful = [
        token
        for token in tokens
        if token not in LOW_INFORMATION_QUERY_TOKENS
    ]
    return (meaningful or tokens)[-1] if tokens else None


def blenderkit_result_matches_query(result, query):
    anchor = query_anchor_token(query)
    if not anchor:
        return False

    words = blenderkit_result_words(result)
    return any(token_matches(anchor, word) for word in words)


def score_blenderkit_result(result, query_tokens):
    text = " ".join([
        str(result.get("displayName", "")),
        str(result.get("name", "")),
        str(result.get("description", "")),
        " ".join(result.get("tags", []) or []),
    ])
    words = tokenize(text)
    score = sum(8 for token in query_tokens if token in words)
    score += sum(2 for token in query_tokens if any(token in word or word in token for word in words))
    if result.get("verificationStatus") == "validated":
        score += 5
    if result.get("isFree"):
        score += 4
    rating = result.get("ratingsAverage") or {}
    quality = rating.get("quality")
    if isinstance(quality, (int, float)):
        score += float(quality)
    return score


def choose_file(asset, preferred_resolution):
    files = asset.get("files") or []
    order = [preferred_resolution, "resolution_1K", "resolution_2K", "resolution_0_5K", "blend"]
    for kind in order:
        for item in files:
            if item.get("fileType") == kind:
                return item
    raise RuntimeError("BlendKit result did not expose a downloadable .blend file.")



def normalized_blenderkit_license(value):
    normalized = (
        str(value or "")
        .strip()
        .lower()
        .replace("-", "_")
        .replace(" ", "_")
    )

    # BlendKit's API currently serializes Creative Commons Zero as
    # "cc_zero". Treat only known CC0 aliases as the same permissive license.
    if normalized in {
        "cc0",
        "cc_0",
        "cc_zero",
        "creative_commons_zero",
    }:
        return "cc0"

    return normalized


def blenderkit_asset_page_url(asset):
    asset_base_id = asset.get("assetBaseId")
    if asset_base_id:
        return f"https://www.blenderkit.com/asset-gallery-detail/{asset_base_id}/"
    return asset.get("url")


def collect_blenderkit_results(search_url, api_key, max_pages=12):
    results = []
    next_url = search_url
    seen_urls = set()

    for _ in range(max_pages):
        if not next_url or next_url in seen_urls:
            break

        seen_urls.add(next_url)
        payload = http_json(next_url, api_key)
        results.extend(payload.get("results", []) or [])
        next_url = payload.get("next")

    return results


def acquire_blenderkit(
    query,
    preferred_resolution,
    free_only,
    required_license_kind,
    excluded_source_asset_ids,
    temp_dir,
):
    api_key = get_blenderkit_api_key()
    # Keep the server query intentionally broad. BlendKit's own add-on sends
    # a short human search term plus asset_type and uses free status mainly as
    # result ordering. License and downloadability are verified locally below.
    concise_query = " ".join(str(query or "").split()).strip()
    query_parts = [concise_query, "asset_type:model", "order:_score"]
    encoded = urllib.parse.quote_plus(
        " ".join(part for part in query_parts if part),
        safe="+:",
    )
    search_url = (
        "https://www.blenderkit.com/api/v1/search/"
        f"?query={encoded}&page_size=100&dict_parameters=1"
    )
    log(f"Searching BlendKit broadly for: {concise_query}")
    all_results = collect_blenderkit_results(search_url, api_key)

    excluded_ids = {
        str(value).strip()
        for value in (excluded_source_asset_ids or [])
        if str(value).strip()
    }

    model_results = [
        item
        for item in all_results
        if str(item.get("assetType") or "").lower() == "model"
        and item.get("canDownload") is not False
        and str(item.get("assetBaseId") or item.get("id") or "").strip()
        not in excluded_ids
    ]

    normalized_required_license = normalized_blenderkit_license(
        required_license_kind
    )

    observed_licenses = {}
    for item in model_results:
        observed = normalized_blenderkit_license(item.get("license")) or "unknown"
        observed_licenses[observed] = observed_licenses.get(observed, 0) + 1

    results = model_results
    if normalized_required_license:
        results = [
            item
            for item in model_results
            if normalized_blenderkit_license(item.get("license"))
            == normalized_required_license
        ]

    # Do not discard a verified CC0 result merely because isFree is absent or
    # serialized differently. Exact CC0 is the permission gate.
    if free_only and not normalized_required_license:
        explicitly_free = [
            item for item in results if item.get("isFree") is True
        ]
        if explicitly_free:
            results = explicitly_free

    if not results:
        license_detail = (
            f" with license '{normalized_required_license}'"
            if normalized_required_license
            else ""
        )
        raise RuntimeError(
            f"BlendKit returned {len(all_results)} total results and "
            f"{len(model_results)} downloadable models for '{concise_query}', "
            f"but none matched{license_detail}. "
            f"Observed downloadable-model licenses: {observed_licenses or {'none': 0}}. "
            "MyWay will not fall back to a less permissive license."
        )

    query_tokens = tokenize(query)
    semantic_results = [
        item
        for item in results
        if blenderkit_result_matches_query(item, concise_query)
    ]

    if not semantic_results:
        preview_names = [
            str(item.get("displayName") or item.get("name") or "unnamed")
            for item in sorted(
                results,
                key=lambda item: score_blenderkit_result(
                    item,
                    query_tokens,
                ),
                reverse=True,
            )[:5]
        ]
        anchor = query_anchor_token(concise_query)
        raise RuntimeError(
            "BlendKit had correctly licensed candidates, but none matched "
            f"the core object word '{anchor}' for query "
            f"'{concise_query}'. Top rejected candidates: "
            f"{preview_names}. No asset was downloaded or registered."
        )

    asset = max(
        semantic_results,
        key=lambda item: score_blenderkit_result(item, query_tokens),
    )
    selected_license = normalized_blenderkit_license(
        asset.get("license")
    )

    if (
        normalized_required_license
        and selected_license != normalized_required_license
    ):
        raise RuntimeError(
            "BlendKit selected an asset whose license did not match the "
            f"required license: expected={normalized_required_license}, "
            f"actual={selected_license or 'unknown'}."
        )

    file_record = choose_file(asset, preferred_resolution)
    download_url = file_record.get("url") or file_record.get("downloadUrl")
    if not download_url:
        raise RuntimeError("Selected BlendKit result had no download URL.")

    if "api/v1/downloads/" in download_url and "scene_uuid=" not in download_url:
        separator = "&" if "?" in download_url else "?"
        download_url = f"{download_url}{separator}scene_uuid={uuid.uuid4()}"

    content_type, body = http_bytes(download_url, api_key)
    actual_url = None
    if "json" in content_type.lower() or body[:1] in {b"{", b"["}:
        response_payload = json.loads(body.decode("utf-8"))
        actual_url = recursive_url(response_payload)
        if not actual_url:
            raise RuntimeError(
                "BlendKit download endpoint did not return a usable file URL."
            )
        content_type, body = http_bytes(actual_url, api_key)

    blend_path = Path(temp_dir) / f"{asset.get('id', uuid.uuid4())}.blend"
    blend_path.write_bytes(body)
    if blend_path.stat().st_size < 1024:
        raise RuntimeError(
            "BlendKit download was unexpectedly small and likely invalid."
        )

    author = asset.get("author") or {}
    author_name = (
        author.get("fullName")
        or " ".join(
            filter(
                None,
                [
                    author.get("firstName"),
                    author.get("lastName"),
                ],
            )
        ).strip()
        or None
    )
    source_api_url = asset.get("url")
    source_page_url = blenderkit_asset_page_url(asset)

    return blend_path, {
        "source_asset_id": asset.get("assetBaseId") or asset.get("id"),
        "source_asset_name": asset.get("displayName") or asset.get("name"),
        "source_url": source_page_url,
        "source_license": selected_license or asset.get("license"),
        "source_author": author_name,
        "source_record": {
            "schema_version": "myway_blenderkit_source_record_v1",
            "captured_at": __import__("datetime").datetime.now(
                __import__("datetime").timezone.utc
            ).isoformat(),
            "asset_id": asset.get("id"),
            "asset_base_id": asset.get("assetBaseId"),
            "display_name": asset.get("displayName") or asset.get("name"),
            "description": asset.get("description"),
            "license": selected_license or asset.get("license"),
            "required_license_kind": normalized_required_license or None,
            "is_free": asset.get("isFree"),
            "can_download": asset.get("canDownload"),
            "verification_status": asset.get("verificationStatus"),
            "tags": asset.get("tags") or [],
            "author": {
                "id": author.get("id"),
                "name": author_name,
                "about_url": author.get("aboutMeUrl"),
            },
            "download_file_type": file_record.get("fileType"),
            "source_api_url": source_api_url,
            "source_page_url": source_page_url,
            "official_license_docs_url": (
                "https://www.blenderkit.com/docs/licenses/"
            ),
        },
    }


def execute(job):
    source_metadata = {}
    texture_report = {
        "texture_directory": None,
        "unpacked_images": [],
        "missing_images_removed": [],
        "warnings": [],
    }

    if job["kind"] == "normalize_asset":
        import_asset(job["input_path"])
    elif job["kind"] == "blenderkit_acquire":
        temp_dir = Path(job["output_path"]).parent / ".blenderkit-download"
        temp_dir.mkdir(parents=True, exist_ok=True)
        blend_path, source_metadata = acquire_blenderkit(
            job["query"],
            job.get("resolution", "resolution_1K"),
            bool(job.get("free_only", True)),
            job.get("required_license_kind"),
            job.get("excluded_source_asset_ids", []),
            temp_dir,
        )
        append_blend_file(blend_path)
        texture_report = prepare_blenderkit_textures(
            blend_path.parent,
            job.get("resolution", "resolution_1K"),
        )
    else:
        raise RuntimeError(f"Unknown Blender job kind: {job['kind']}")

    dimensions = normalize_scene(float(job.get("target_extent_m", 2.0)))
    export_glb(job["output_path"])
    make_thumbnail(job["thumbnail_path"], dimensions)
    return {
        "output_path": job["output_path"],
        "thumbnail_path": job["thumbnail_path"],
        "dimensions_m": dimensions,
        "polygon_count": polygon_count(),
        "rigged": any(obj.type == "ARMATURE" for obj in asset_objects()),
        "animation_clips": animation_clips(),
        "texture_report": texture_report,
        **source_metadata,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--job", required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else None)
    job_path = Path(args.job)
    job = read_json(job_path)
    job["status"] = "running"
    write_json(job_path, job)
    try:
        result = execute(job)
        job["result"] = result
        job["status"] = "completed"
        job["error"] = None
        write_json(job_path, job)
        log(f"Completed {job['job_id']}")
    except Exception as exc:
        job["status"] = "failed"
        job["error"] = f"{type(exc).__name__}: {exc}\n{traceback.format_exc()}"
        write_json(job_path, job)
        log(job["error"])
        raise


if __name__ == "__main__":
    main()


