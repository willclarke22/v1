import argparse
import json
import math
import os
import shutil
import sys
import tempfile
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

import bpy
from mathutils import Vector


def log(message):
    print(f"[MyWay Blender] {message}", flush=True)


def asset_temp_root():
    configured = os.environ.get("MYWAY_ASSET_TEMP_ROOT", "").strip()
    root = Path(configured).expanduser().resolve() if configured else Path(tempfile.gettempdir()) / "myway-assets"
    if configured:
        project_root = Path.cwd().resolve()
        try:
            root.resolve().relative_to(project_root)
            raise RuntimeError(
                f"MYWAY_ASSET_TEMP_ROOT must be outside the MyWay project: {root}"
            )
        except ValueError:
            pass
    root.mkdir(parents=True, exist_ok=True)
    return root


def prune_stale_asset_temp_workspaces():
    root = asset_temp_root()
    configured = os.environ.get("MYWAY_ASSET_TEMP_MAX_AGE_HOURS", "24").strip()
    try:
        max_age_hours = float(configured)
    except ValueError:
        max_age_hours = 24.0
    if not math.isfinite(max_age_hours) or max_age_hours <= 0:
        max_age_hours = 24.0
    cutoff = time.time() - max_age_hours * 60.0 * 60.0
    for candidate in root.iterdir():
        if not candidate.is_dir():
            continue
        try:
            if candidate.stat().st_mtime < cutoff:
                shutil.rmtree(candidate, ignore_errors=True)
        except OSError:
            continue


def create_asset_temp_workspace(kind):
    prune_stale_asset_temp_workspaces()
    safe_kind = "".join(
        char if char.isalnum() or char in {"-", "_"} else "-"
        for char in str(kind).strip().lower()
    ).strip("-") or "job"
    return Path(
        tempfile.mkdtemp(
            prefix=f"{safe_kind}-",
            dir=str(asset_temp_root()),
        )
    )


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



def _mesh_color_attribute_names(mesh):
    names = []

    color_attributes = getattr(mesh, "color_attributes", None)
    if color_attributes is not None:
        try:
            names.extend(
                attribute.name
                for attribute in color_attributes
                if getattr(attribute, "name", "")
            )
        except Exception:
            pass

    legacy_colors = getattr(mesh, "vertex_colors", None)
    if legacy_colors is not None:
        try:
            names.extend(
                layer.name
                for layer in legacy_colors
                if getattr(layer, "name", "")
            )
        except Exception:
            pass

    return list(dict.fromkeys(names))


def _preferred_mesh_color_attribute(mesh):
    color_attributes = getattr(mesh, "color_attributes", None)

    if color_attributes is not None:
        for candidate in [
            getattr(color_attributes, "active_color", None),
            getattr(color_attributes, "render_color_index", None),
        ]:
            if candidate is not None and hasattr(candidate, "name"):
                return candidate.name

        try:
            active = getattr(color_attributes, "active", None)
            if active is not None and getattr(active, "name", ""):
                return active.name
        except Exception:
            pass

        try:
            if len(color_attributes) > 0:
                return color_attributes[0].name
        except Exception:
            pass

    legacy_colors = getattr(mesh, "vertex_colors", None)
    if legacy_colors is not None:
        try:
            active = getattr(legacy_colors, "active", None)
            if active is not None and getattr(active, "name", ""):
                return active.name
            if len(legacy_colors) > 0:
                return legacy_colors[0].name
        except Exception:
            pass

    return None


def _ensure_principled_material(material):
    material.use_nodes = True
    node_tree = material.node_tree

    output = next(
        (node for node in node_tree.nodes if node.type == "OUTPUT_MATERIAL"),
        None,
    )
    if output is None:
        output = node_tree.nodes.new("ShaderNodeOutputMaterial")

    principled = next(
        (node for node in node_tree.nodes if node.type == "BSDF_PRINCIPLED"),
        None,
    )
    if principled is None:
        principled = node_tree.nodes.new("ShaderNodeBsdfPrincipled")

    surface = output.inputs.get("Surface")
    if surface is not None and not surface.is_linked:
        node_tree.links.new(principled.outputs.get("BSDF"), surface)

    return node_tree, principled


def _base_color_already_uses_attribute(base_color):
    if base_color is None or not base_color.is_linked:
        return False

    for link in base_color.links:
        source = link.from_node
        if source and source.type in {"VERTEX_COLOR", "ATTRIBUTE"}:
            return True

    return False


def _connect_color_attribute(material, attribute_name):
    node_tree, principled = _ensure_principled_material(material)
    base_color = principled.inputs.get("Base Color")

    if base_color is None or _base_color_already_uses_attribute(base_color):
        return False

    color_node = None

    try:
        color_node = node_tree.nodes.new("ShaderNodeVertexColor")
        color_node.layer_name = attribute_name
    except Exception:
        color_node = node_tree.nodes.new("ShaderNodeAttribute")
        color_node.attribute_name = attribute_name

    color_output = color_node.outputs.get("Color")
    if color_output is None:
        node_tree.nodes.remove(color_node)
        return False

    # A glTF vertex colour is multiplied with the material base colour.
    # White keeps the authored vertex colours unchanged.
    base_color.default_value = (1.0, 1.0, 1.0, 1.0)
    node_tree.links.new(color_output, base_color)

    alpha_input = principled.inputs.get("Alpha")
    alpha_output = color_node.outputs.get("Alpha")
    if (
        alpha_input is not None
        and alpha_output is not None
        and not alpha_input.is_linked
    ):
        node_tree.links.new(alpha_output, alpha_input)

    material.diffuse_color = (1.0, 1.0, 1.0, 1.0)
    return True


def preserve_imported_appearance():
    report = {
        "mesh_count": 0,
        "material_count": len(bpy.data.materials),
        "image_count": 0,
        "packed_image_count": 0,
        "missing_image_count": 0,
        "vertex_color_meshes": [],
        "vertex_color_attributes": [],
        "materials_created": [],
        "materials_rebound_to_vertex_colors": [],
        "warnings": [],
    }

    for image in list(bpy.data.images):
        if image.name in {"Render Result", "Viewer Node"}:
            continue

        report["image_count"] += 1
        if len(getattr(image, "packed_files", [])) > 0:
            report["packed_image_count"] += 1

        if (
            getattr(image, "source", "") not in {"GENERATED", "VIEWER"}
            and not _image_has_usable_source(image)
        ):
            report["missing_image_count"] += 1
            report["warnings"].append(
                f"Image '{image.name}' has no usable packed or external source."
            )

    all_attribute_names = []

    for obj in mesh_objects():
        report["mesh_count"] += 1
        mesh = obj.data
        attribute_names = _mesh_color_attribute_names(mesh)
        if not attribute_names:
            continue

        report["vertex_color_meshes"].append(obj.name)
        all_attribute_names.extend(attribute_names)
        preferred_attribute = _preferred_mesh_color_attribute(mesh) or attribute_names[0]

        if len(obj.material_slots) == 0:
            material = bpy.data.materials.new(
                name=f"MyWayVertexColor_{obj.name}"
            )
            obj.data.materials.append(material)
            report["materials_created"].append(material.name)

        for slot in obj.material_slots:
            material = slot.material
            if material is None:
                material = bpy.data.materials.new(
                    name=f"MyWayVertexColor_{obj.name}"
                )
                slot.material = material
                report["materials_created"].append(material.name)

            try:
                if _connect_color_attribute(material, preferred_attribute):
                    report["materials_rebound_to_vertex_colors"].append(
                        f"{obj.name}:{material.name}:{preferred_attribute}"
                    )
            except Exception as exc:
                report["warnings"].append(
                    f"Could not connect colour attribute '{preferred_attribute}' "
                    f"for {obj.name}/{material.name}: {type(exc).__name__}: {exc}"
                )

    report["vertex_color_attributes"] = list(dict.fromkeys(all_attribute_names))
    report["materials_created"] = list(dict.fromkeys(report["materials_created"]))
    report["materials_rebound_to_vertex_colors"] = list(
        dict.fromkeys(report["materials_rebound_to_vertex_colors"])
    )

    if report["vertex_color_meshes"]:
        log(
            "Preserved vertex colours for "
            f"{len(report['vertex_color_meshes'])} mesh object(s): "
            + ", ".join(report["vertex_color_attributes"])
        )

    return report


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



def make_analysis_renders(render_directory, public_url_root, dimensions):
    render_dir = Path(render_directory)
    render_dir.mkdir(parents=True, exist_ok=True)

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
    scene.render.film_transparent = False
    if scene.world is None:
        scene.world = bpy.data.worlds.new("MyWayAssetAnalysisWorld")
    scene.world.color = (0.055, 0.065, 0.08)

    longest = max(dimensions) if dimensions else 2.0
    target = Vector((0, 0, max(dimensions[2] * 0.45, 0.2)))

    camera_data = bpy.data.cameras.new("MyWayAssetAnalysisCamera")
    camera = bpy.data.objects.new("MyWayAssetAnalysisCamera", camera_data)
    scene.collection.objects.link(camera)
    camera_data.lens = 52
    scene.camera = camera

    for name, location, energy, size in [
        ("MyWayAnalysisKey", (longest * 2, -longest * 2, longest * 3), 1100, longest * 2),
        ("MyWayAnalysisFill", (-longest * 2, -longest, longest * 1.5), 650, longest * 2),
        ("MyWayAnalysisRim", (0, longest * 2, longest * 2.5), 900, longest * 1.5),
    ]:
        light_data = bpy.data.lights.new(name, type="AREA")
        light_data.energy = energy
        light_data.shape = "DISK"
        light_data.size = max(size, 1.0)
        light = bpy.data.objects.new(name, light_data)
        light.location = location
        scene.collection.objects.link(light)

    view_specs = [
        ("front_three_quarter", (longest * 1.55, -longest * 1.75, longest * 1.2)),
        ("rear_three_quarter", (-longest * 1.55, longest * 1.75, longest * 1.2)),
        ("side", (longest * 2.2, 0, longest * 1.0)),
        ("elevated_front", (longest * 1.2, -longest * 1.55, longest * 2.0)),
    ]

    public_root = str(public_url_root).rstrip("/")
    views = []
    for view_name, location in view_specs:
        camera.location = location
        camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
        file_path = render_dir / f"{view_name}.png"
        scene.render.filepath = str(file_path)
        bpy.ops.render.render(write_still=True)
        views.append(
            {
                "name": view_name,
                "file_path": str(file_path),
                "public_path": f"{public_root}/{view_name}.png",
            }
        )

    return views

def polygon_count():
    return sum(len(obj.data.polygons) for obj in mesh_objects() if getattr(obj, "data", None))


def animation_clips():
    names = []
    for action in bpy.data.actions:
        names.append(action.name)
    return sorted(set(names))


def get_blenderkit_api_key():
    # MyWay owns its BlenderKit credential explicitly through the server
    # environment. Do not silently inherit Blender add-on preferences: a stale
    # interactive-Blender token can otherwise make public CC0 requests fail
    # even when the same request succeeds anonymously.
    return os.environ.get("BLENDERKIT_API_KEY", "").strip()


def blenderkit_request(url, api_key="", timeout=90, accept_json=False):
    def open_request(token):
        headers = {"User-Agent": "MyWay-Blender-Bridge/1.0"}
        if accept_json:
            headers["Accept"] = "application/json"
        if token:
            headers["Authorization"] = f"Bearer {token}"
        request = urllib.request.Request(url, headers=headers)
        return urllib.request.urlopen(request, timeout=timeout)

    try:
        return open_request(api_key)
    except urllib.error.HTTPError as exc:
        if exc.code != 401 or not api_key:
            raise
        # BlenderKit exposes free assets without login. If a configured token
        # has expired or been revoked, retry the public request instead of
        # allowing stale authentication to break MyWay's CC0 acquisition path.
        log("BlendKit rejected the configured API key with HTTP 401; retrying this public request without Authorization.")
        return open_request("")


def http_json(url, api_key=""):
    with blenderkit_request(url, api_key, timeout=90, accept_json=True) as response:
        return json.loads(response.read().decode("utf-8"))


def http_bytes(url, api_key=""):
    with blenderkit_request(url, api_key, timeout=600) as response:
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
    selected_source_asset_id,
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
    selected_id = str(selected_source_asset_id or "").strip()

    if selected_id:
        exact_results = [
            item
            for item in results
            if str(item.get("assetBaseId") or item.get("id") or "").strip()
            == selected_id
        ]
        if not exact_results:
            raise RuntimeError(
                "The selected BlendKit candidate was no longer present, "
                "downloadable, and CC0 when import began. Search again and "
                "choose another candidate."
            )
        asset = exact_results[0]
    else:
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



def gltf_y_up_point(vector):
    """Convert Blender Z-up world coordinates to exported glTF Y-up."""
    return [
        round(float(vector.x), 6),
        round(float(vector.z), 6),
        round(float(-vector.y), 6),
    ]


def _mesh_name_is_helper(obj):
    name = str(getattr(obj, "name", "")).lower()
    helper_terms = (
        "collision",
        "collider",
        "ucx_",
        "ubx_",
        "helper",
        "proxy",
        "bounding",
        "bounds",
    )
    return any(term in name for term in helper_terms)


def _interval_gap(a_min, a_max, b_min, b_max):
    if a_max < b_min:
        return b_min - a_max
    if b_max < a_min:
        return a_min - b_max
    return 0.0


def _mesh_surface_contact_regions(geometry_meshes, depsgraph, gltf_size, gltf_center):
    """Measure occupied exterior mesh patches instead of whole-bounds pseudo-faces."""
    side_specs = {
        "left": {"axis": 0, "sign": -1.0, "u": 1, "v": 2},
        "right": {"axis": 0, "sign": 1.0, "u": 1, "v": 2},
        "front": {"axis": 2, "sign": 1.0, "u": 0, "v": 1},
        "back": {"axis": 2, "sign": -1.0, "u": 0, "v": 1},
    }
    longest = max(float(gltf_size.x), float(gltf_size.y), float(gltf_size.z), 1e-6)
    depth_tolerance = max(0.003, longest * 0.018)
    spatial_gap_tolerance = max(0.006, longest * 0.028)
    min_triangle_area = max(1e-8, longest * longest * 1e-7)
    side_triangles = {side: [] for side in side_specs}

    for source_obj in geometry_meshes:
        evaluated = source_obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        try:
            mesh.calc_loop_triangles()
            matrix = evaluated.matrix_world
            for triangle in mesh.loop_triangles:
                vertices_world = [matrix @ mesh.vertices[index].co for index in triangle.vertices]
                ab = vertices_world[1] - vertices_world[0]
                ac = vertices_world[2] - vertices_world[0]
                cross = ab.cross(ac)
                doubled_area = cross.length
                if doubled_area <= min_triangle_area * 2:
                    continue
                normal_world = cross.normalized()
                normal_gltf = Vector((normal_world.x, normal_world.z, -normal_world.y))
                if normal_gltf.length <= 1e-9:
                    continue
                normal_gltf.normalize()
                triangle_center_gltf = sum(
                    [Vector((vertex.x, vertex.z, -vertex.y)) for vertex in vertices_world],
                    Vector((0.0, 0.0, 0.0)),
                ) / 3.0
                outward_hint = triangle_center_gltf - gltf_center
                if outward_hint.length > 1e-9 and normal_gltf.dot(outward_hint) < 0:
                    normal_gltf.negate()
                horizontal = max(abs(normal_gltf.x), abs(normal_gltf.z))
                if horizontal < 0.58:
                    continue
                if abs(normal_gltf.x) >= abs(normal_gltf.z):
                    side = "right" if normal_gltf.x >= 0 else "left"
                else:
                    side = "front" if normal_gltf.z >= 0 else "back"
                spec = side_specs[side]
                alignment = max(0.0, normal_gltf[spec["axis"]] * spec["sign"])
                if alignment < 0.58:
                    continue
                vertices = [
                    Vector((vertex.x, vertex.z, -vertex.y))
                    for vertex in vertices_world
                ]
                center = sum(vertices, Vector((0.0, 0.0, 0.0))) / 3.0
                u_values = [vertex[spec["u"]] for vertex in vertices]
                v_values = [vertex[spec["v"]] for vertex in vertices]
                side_triangles[side].append({
                    "plane": center[spec["axis"]],
                    "area": doubled_area * 0.5,
                    "center": center,
                    "normal": normal_gltf,
                    "alignment": alignment,
                    "min_u": min(u_values),
                    "max_u": max(u_values),
                    "min_v": min(v_values),
                    "max_v": max(v_values),
                })
        finally:
            evaluated.to_mesh_clear()

    regions = []
    for side, triangles in side_triangles.items():
        if not triangles:
            continue
        spec = side_specs[side]
        clusters = []
        triangles.sort(key=lambda item: (item["plane"], item["min_u"], item["min_v"]))
        for triangle in triangles:
            best = None
            best_score = None
            for candidate in clusters:
                plane_delta = abs(candidate["plane"] - triangle["plane"])
                if plane_delta > depth_tolerance:
                    continue
                gap_u = _interval_gap(
                    candidate["min_u"], candidate["max_u"],
                    triangle["min_u"], triangle["max_u"],
                )
                gap_v = _interval_gap(
                    candidate["min_v"], candidate["max_v"],
                    triangle["min_v"], triangle["max_v"],
                )
                spatial_gap = math.hypot(gap_u, gap_v)
                if spatial_gap > spatial_gap_tolerance:
                    continue
                score = plane_delta + spatial_gap * 0.35
                if best_score is None or score < best_score:
                    best = candidate
                    best_score = score
            if best is None:
                best = {
                    "plane": triangle["plane"],
                    "area": 0.0,
                    "weighted_center": Vector(),
                    "weighted_normal": Vector(),
                    "weighted_alignment": 0.0,
                    "min_u": triangle["min_u"],
                    "max_u": triangle["max_u"],
                    "min_v": triangle["min_v"],
                    "max_v": triangle["max_v"],
                    "triangle_count": 0,
                }
                clusters.append(best)
            area = triangle["area"]
            previous_area = best["area"]
            total_area = previous_area + area
            best["plane"] = (
                best["plane"] * previous_area + triangle["plane"] * area
            ) / max(total_area, 1e-9)
            best["area"] = total_area
            best["weighted_center"] += triangle["center"] * area
            best["weighted_normal"] += triangle["normal"] * area
            best["weighted_alignment"] += triangle["alignment"] * area
            best["min_u"] = min(best["min_u"], triangle["min_u"])
            best["max_u"] = max(best["max_u"], triangle["max_u"])
            best["min_v"] = min(best["min_v"], triangle["min_v"])
            best["max_v"] = max(best["max_v"], triangle["max_v"])
            best["triangle_count"] += 1

        projected_area = max(
            1e-9,
            float(gltf_size[spec["u"]]) * float(gltf_size[spec["v"]]),
        )
        candidates = []
        for cluster in clusters:
            width = cluster["max_u"] - cluster["min_u"]
            height = cluster["max_v"] - cluster["min_v"]
            if width < longest * 0.018 or height < longest * 0.018:
                continue
            if cluster["area"] < projected_area * 0.0012:
                continue
            rectangle_area = max(width * height, 1e-9)
            coverage = max(0.0, min(1.0, cluster["area"] / rectangle_area))
            area_ratio = max(0.0, min(1.0, cluster["area"] / projected_area))
            alignment = cluster["weighted_alignment"] / max(cluster["area"], 1e-9)
            confidence = max(
                0.05,
                min(
                    1.0,
                    alignment * 0.48
                    + coverage * 0.27
                    + min(1.0, area_ratio * 8.0) * 0.25,
                ),
            )
            if confidence < 0.48:
                continue
            center = cluster["weighted_center"] / max(cluster["area"], 1e-9)
            normal = cluster["weighted_normal"]
            if normal.length <= 1e-9:
                normal = Vector((0.0, 0.0, 0.0))
                normal[spec["axis"]] = spec["sign"]
            else:
                normal.normalize()
            edge_margin = min(0.04, max(0.003, min(width, height) * 0.05))
            usable_width = max(0.001, width - edge_margin * 2)
            usable_height = max(0.001, height - edge_margin * 2)
            candidates.append({
                "center": center,
                "normal": normal,
                "size": [usable_width, usable_height],
                "area": cluster["area"],
                "confidence": confidence,
                "triangle_count": cluster["triangle_count"],
                "score": confidence * 1.7 + math.sqrt(max(0.0, area_ratio)),
            })

        candidates.sort(key=lambda item: (-item["score"], -item["area"]))
        for index, candidate in enumerate(candidates[:4]):
            regions.append({
                "id": f"mesh_contact_{side}_{index + 1}",
                "label": f"Measured {side} exterior mesh patch",
                "center": [round(float(value), 6) for value in candidate["center"]],
                "normal": [round(float(value), 6) for value in candidate["normal"]],
                "u_axis": (
                    [0.0, 1.0, 0.0]
                    if side in ("left", "right")
                    else [1.0, 0.0, 0.0]
                ),
                "v_axis": (
                    [0.0, 0.0, 1.0]
                    if side in ("left", "right")
                    else [0.0, 1.0, 0.0]
                ),
                "size": [round(float(max(value, 1e-6)), 6) for value in candidate["size"]],
                "side": side,
                "confidence": round(float(candidate["confidence"]), 6),
                "source": "blender_geometry",
                "exposure": "exterior",
                "orientation": "vertical",
            })
    return regions


def geometry_profile():
    """Measure one GLB into generic spatial regions for collision-safe placement."""
    all_meshes = mesh_objects()
    if not all_meshes:
        raise RuntimeError("Cannot profile an asset without mesh objects.")

    visible_meshes = [
        obj
        for obj in all_meshes
        if not bool(getattr(obj, "hide_render", False))
        and not bool(obj.hide_get())
    ]
    if not visible_meshes:
        visible_meshes = all_meshes

    excluded_meshes = [obj for obj in visible_meshes if _mesh_name_is_helper(obj)]
    geometry_meshes = [obj for obj in visible_meshes if obj not in excluded_meshes]
    if not geometry_meshes:
        geometry_meshes = visible_meshes
        excluded_meshes = []

    # Bounds intentionally match visible render geometry because Three.js fits
    # the complete loaded GLB. Region detection may ignore helper meshes.
    minimum, maximum = world_bbox(visible_meshes)
    dimensions = maximum - minimum
    longest = max(dimensions.x, dimensions.y, dimensions.z, 1e-6)
    height_tolerance = max(0.003, longest * 0.008)
    spatial_gap_tolerance = max(0.008, longest * 0.025)
    min_triangle_area = max(1e-8, longest * longest * 1e-7)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    scene = bpy.context.scene
    triangles = []
    triangle_count = 0

    for source_obj in geometry_meshes:
        evaluated = source_obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        try:
            mesh.calc_loop_triangles()
            matrix = evaluated.matrix_world

            for triangle in mesh.loop_triangles:
                triangle_count += 1
                vertices = [matrix @ mesh.vertices[index].co for index in triangle.vertices]
                ab = vertices[1] - vertices[0]
                ac = vertices[2] - vertices[0]
                cross = ab.cross(ac)
                doubled_area = cross.length
                if doubled_area <= min_triangle_area * 2:
                    continue

                normal = cross.normalized()
                if normal.z < 0.86:
                    continue

                center = sum(vertices, Vector((0.0, 0.0, 0.0))) / 3.0
                xs = [vertex.x for vertex in vertices]
                ys = [vertex.y for vertex in vertices]
                triangles.append(
                    {
                        "height": center.z,
                        "area": doubled_area * 0.5,
                        "center": center,
                        "normal": normal,
                        "min_x": min(xs),
                        "max_x": max(xs),
                        "min_y": min(ys),
                        "max_y": max(ys),
                    }
                )
        finally:
            evaluated.to_mesh_clear()

    triangles.sort(key=lambda item: (item["height"], item["min_x"], item["min_y"]))
    clusters = []

    for triangle in triangles:
        cluster = None
        best_score = None

        for candidate in clusters:
            height_delta = abs(candidate["height"] - triangle["height"])
            if height_delta > height_tolerance:
                continue

            gap_x = _interval_gap(
                candidate["min_x"], candidate["max_x"],
                triangle["min_x"], triangle["max_x"],
            )
            gap_y = _interval_gap(
                candidate["min_y"], candidate["max_y"],
                triangle["min_y"], triangle["max_y"],
            )
            spatial_gap = math.hypot(gap_x, gap_y)
            if spatial_gap > spatial_gap_tolerance:
                continue

            score = height_delta + spatial_gap * 0.35
            if best_score is None or score < best_score:
                cluster = candidate
                best_score = score

        if cluster is None:
            cluster = {
                "height": triangle["height"],
                "area": 0.0,
                "weighted_center": Vector(),
                "weighted_normal": Vector(),
                "min_x": triangle["min_x"],
                "max_x": triangle["max_x"],
                "min_y": triangle["min_y"],
                "max_y": triangle["max_y"],
                "triangle_count": 0,
            }
            clusters.append(cluster)

        area = triangle["area"]
        previous_area = cluster["area"]
        total_area = previous_area + area
        cluster["height"] = (
            cluster["height"] * previous_area + triangle["height"] * area
        ) / max(total_area, 1e-9)
        cluster["area"] = total_area
        cluster["weighted_center"] += triangle["center"] * area
        cluster["weighted_normal"] += triangle["normal"] * area
        cluster["min_x"] = min(cluster["min_x"], triangle["min_x"])
        cluster["max_x"] = max(cluster["max_x"], triangle["max_x"])
        cluster["min_y"] = min(cluster["min_y"], triangle["min_y"])
        cluster["max_y"] = max(cluster["max_y"], triangle["max_y"])
        cluster["triangle_count"] += 1

    max_cluster_area = max([cluster["area"] for cluster in clusters] or [0.0])
    footprint_area = max(dimensions.x * dimensions.y, 1e-9)
    minimum_surface_area = max(footprint_area * 0.0015, max_cluster_area * 0.018)
    candidates = []

    def clearance_samples(candidate):
        width = candidate["width"]
        depth = candidate["depth"]
        center = candidate["center"]
        offsets = (
            (0.0, 0.0),
            (-0.32, -0.32),
            (-0.32, 0.32),
            (0.32, -0.32),
            (0.32, 0.32),
            (-0.48, 0.0),
            (0.48, 0.0),
            (0.0, -0.48),
            (0.0, 0.48),
        )
        start_epsilon = max(0.002, longest * 0.002)
        maximum_distance = max(longest * 2.5, dimensions.z + 0.5)
        hits = []

        for u, v in offsets:
            origin = Vector((
                center.x + u * width,
                center.y + v * depth,
                candidate["height"] + start_epsilon,
            ))
            hit, location, _normal, _index, _obj, _matrix = scene.ray_cast(
                depsgraph,
                origin,
                Vector((0.0, 0.0, 1.0)),
                distance=maximum_distance,
            )
            if hit:
                distance = float(location.z - origin.z)
                if distance > start_epsilon * 0.5:
                    hits.append(distance)

        blocked_fraction = len(hits) / len(offsets)
        clearance = None
        if hits and blocked_fraction >= 0.34:
            ordered = sorted(hits)
            index = max(0, min(len(ordered) - 1, int(len(ordered) * 0.2)))
            clearance = ordered[index]
        return blocked_fraction, clearance

    for cluster in clusters:
        width = cluster["max_x"] - cluster["min_x"]
        depth = cluster["max_y"] - cluster["min_y"]
        rectangle_area = max(width * depth, 1e-9)
        coverage_ratio = max(0.0, min(1.0, cluster["area"] / rectangle_area))
        if (
            cluster["area"] < minimum_surface_area
            or width < longest * 0.012
            or depth < longest * 0.012
            or coverage_ratio < 0.08
        ):
            continue

        center = cluster["weighted_center"] / max(cluster["area"], 1e-9)
        normal = cluster["weighted_normal"]
        if normal.length <= 1e-9:
            normal = Vector((0, 0, 1))
        else:
            normal.normalize()

        area_ratio = min(1.0, cluster["area"] / footprint_area)
        normal_score = max(0.0, min(1.0, normal.z))
        confidence = max(
            0.05,
            min(
                1.0,
                normal_score * 0.45
                + min(1.0, area_ratio * 5.0) * 0.25
                + coverage_ratio * 0.30,
            ),
        )
        height_ratio = (cluster["height"] - minimum.z) / max(dimensions.z, 1e-9)
        candidate = {
            "height": cluster["height"],
            "height_ratio": height_ratio,
            "area": cluster["area"],
            "area_ratio": area_ratio,
            "coverage_ratio": coverage_ratio,
            "confidence": confidence,
            "center": center,
            "normal": normal,
            "width": width,
            "depth": depth,
        }
        blocked_fraction, clearance = clearance_samples(candidate)
        candidate["blocked_fraction"] = blocked_fraction
        candidate["clearance_above_m"] = clearance
        candidate["exposure"] = "interior" if blocked_fraction >= 0.45 else "exterior"
        candidate["openness"] = "enclosed" if blocked_fraction >= 0.45 else "open"
        candidate["enclosure_confidence"] = min(1.0, abs(blocked_fraction - 0.45) * 2.0 + 0.35)
        edge_margin = min(0.06, max(0.005, min(width, depth) * 0.055))
        candidate["edge_margin_m"] = edge_margin
        candidate["usable_width"] = max(0.001, width - edge_margin * 2)
        candidate["usable_depth"] = max(0.001, depth - edge_margin * 2)
        candidates.append(candidate)

    by_height = sorted(candidates, key=lambda item: (-item["height"], -item["area"]))
    for rank, candidate in enumerate(by_height):
        candidate["vertical_rank"] = rank

    candidates.sort(
        key=lambda item: (
            -(
                item["confidence"] * 1.8
                + item["area_ratio"]
                + item["height_ratio"] * 0.45
                + (0.7 if item["exposure"] == "exterior" else 0.0)
                + (0.25 if item["openness"] == "open" else 0.0)
            ),
            -item["area"],
        )
    )
    primary = candidates[0] if candidates else None
    surfaces = []

    for index, candidate in enumerate(candidates[:24]):
        is_primary = candidate is primary
        if is_primary:
            surface_id = "primary_support_surface"
            label = "Primary support region"
        else:
            surface_id = f"support_region_{index + 1}"
            label = "Support region"

        center = candidate["center"]
        surfaces.append(
            {
                "id": surface_id,
                "label": label,
                "center": gltf_y_up_point(Vector((center.x, center.y, candidate["height"]))),
                "normal": gltf_y_up_point(candidate["normal"]),
                "u_axis": [1.0, 0.0, 0.0],
                "v_axis": [0.0, 0.0, -1.0],
                "size": [
                    round(float(candidate["width"]), 6),
                    round(float(candidate["depth"]), 6),
                ],
                "usable_size": [
                    round(float(candidate["usable_width"]), 6),
                    round(float(candidate["usable_depth"]), 6),
                ],
                "area": round(float(candidate["area"]), 8),
                "confidence": round(float(candidate["confidence"]), 6),
                "source": "blender_geometry",
                "region_kind": "support",
                "exposure": candidate["exposure"],
                "orientation": "upward",
                "openness": candidate["openness"],
                "vertical_rank": int(candidate["vertical_rank"]),
                "clearance_above_m": (
                    round(float(candidate["clearance_above_m"]), 6)
                    if candidate["clearance_above_m"] is not None
                    else None
                ),
                "blocked_fraction": round(float(candidate["blocked_fraction"]), 6),
                "enclosure_confidence": round(float(candidate["enclosure_confidence"]), 6),
                "edge_margin_m": round(float(candidate["edge_margin_m"]), 6),
                "height_ratio": round(float(candidate["height_ratio"]), 6),
                "footprint_ratio": [
                    round(float(candidate["width"] / max(dimensions.x, 1e-9)), 6),
                    round(float(candidate["depth"] / max(dimensions.y, 1e-9)), 6),
                ],
                "coverage_ratio": round(float(candidate["coverage_ratio"]), 6),
            }
        )

    gltf_min = Vector((minimum.x, minimum.z, -maximum.y))
    gltf_max = Vector((maximum.x, maximum.z, -minimum.y))
    gltf_size = gltf_max - gltf_min
    gltf_center = (gltf_min + gltf_max) / 2.0
    bottom_center = Vector((gltf_center.x, gltf_min.y, gltf_center.z))

    interior_volumes = []
    for index, candidate in enumerate(candidates):
        clearance = candidate["clearance_above_m"]
        if (
            candidate["exposure"] != "interior"
            or clearance is None
            or clearance < max(0.04, longest * 0.025)
        ):
            continue
        center = candidate["center"]
        volume_center = Vector((
            center.x,
            center.y,
            candidate["height"] + clearance * 0.5,
        ))
        interior_volumes.append(
            {
                "id": f"containment_region_{index + 1}",
                "label": "Measured containment region",
                "center": gltf_y_up_point(volume_center),
                "size": [
                    round(float(candidate["usable_width"]), 6),
                    round(float(max(0.001, clearance * 0.94)), 6),
                    round(float(candidate["usable_depth"]), 6),
                ],
                "rotation": [0.0, 0.0, 0.0],
                "confidence": round(float(min(candidate["confidence"], candidate["enclosure_confidence"])), 6),
                "source": "blender_geometry",
                "exposure": "interior",
                "openness": candidate["openness"],
                "access_direction": [0.0, 0.0, 1.0],
            }
        )
        if len(interior_volumes) >= 16:
            break

    # v4 generator refinement: generic exterior attachment evidence must be an
    # actually occupied mesh patch. Whole-object left/right/front/back bounds are
    # not physical surfaces for irregular assets such as chairs with protruding
    # casters or armrests.
    attachment_regions = _mesh_surface_contact_regions(
        geometry_meshes,
        depsgraph,
        gltf_size,
        gltf_center,
    )

    mesh_collision_boxes = []
    for index, obj in enumerate(geometry_meshes):
        obj_min, obj_max = world_bbox([obj])
        obj_gltf_min = Vector((obj_min.x, obj_min.z, -obj_max.y))
        obj_gltf_max = Vector((obj_max.x, obj_max.z, -obj_min.y))
        obj_size = obj_gltf_max - obj_gltf_min
        volume = max(0.0, obj_size.x * obj_size.y * obj_size.z)
        if volume <= max(1e-12, gltf_size.x * gltf_size.y * gltf_size.z * 1e-7):
            continue
        obj_center = (obj_gltf_min + obj_gltf_max) / 2.0
        mesh_collision_boxes.append(
            {
                "id": f"solid_region_{index + 1}",
                "label": str(obj.name),
                "center": [round(float(obj_center.x), 6), round(float(obj_center.y), 6), round(float(obj_center.z), 6)],
                "size": [round(float(max(obj_size.x, 1e-6)), 6), round(float(max(obj_size.y, 1e-6)), 6), round(float(max(obj_size.z, 1e-6)), 6)],
                "rotation": [0.0, 0.0, 0.0],
                "confidence": 0.68,
                "source": "blender_geometry",
                "volume": volume,
            }
        )
    mesh_collision_boxes.sort(key=lambda item: -item["volume"])
    collision_boxes = []
    for item in mesh_collision_boxes[:32]:
        item.pop("volume", None)
        collision_boxes.append(item)
    if not collision_boxes:
        collision_boxes = [
            {
                "id": "solid_region_1",
                "label": "Whole visible asset bounds",
                "center": [round(float(gltf_center.x), 6), round(float(gltf_center.y), 6), round(float(gltf_center.z), 6)],
                "size": [round(float(max(gltf_size.x, 1e-6)), 6), round(float(max(gltf_size.y, 1e-6)), 6), round(float(max(gltf_size.z, 1e-6)), 6)],
                "rotation": [0.0, 0.0, 0.0],
                "confidence": 0.45,
                "source": "blender_geometry",
            }
        ]

    warnings = []
    smallest = max(min(dimensions.x, dimensions.y, dimensions.z), 1e-9)
    aspect_ratio = longest / smallest
    if aspect_ratio > 120:
        warnings.append("The measured bounds have an extreme aspect ratio and should be reviewed.")
    if excluded_meshes:
        warnings.append(
            "Helper-like mesh objects were excluded from spatial-region detection: "
            + ", ".join(obj.name for obj in excluded_meshes[:12])
        )
    if primary and primary["confidence"] < 0.48:
        warnings.append("The best support region has low geometric confidence.")
    if primary and primary["coverage_ratio"] < 0.18:
        warnings.append("The best support region is sparse or disconnected inside its rectangle.")

    audit_confidence = 0.94 - min(0.35, len(warnings) * 0.12)
    review_required = any(
        phrase in " ".join(warnings).lower()
        for phrase in ("extreme aspect", "low geometric", "sparse")
    )

    return {
        "schema_version": "myway_asset_geometry_profile_v1",
        "coordinate_space": "normalized_glb_y_up",
        "local_bounds": {
            "min": [round(float(gltf_min.x), 6), round(float(gltf_min.y), 6), round(float(gltf_min.z), 6)],
            "max": [round(float(gltf_max.x), 6), round(float(gltf_max.y), 6), round(float(gltf_max.z), 6)],
            "size": [round(float(gltf_size.x), 6), round(float(gltf_size.y), 6), round(float(gltf_size.z), 6)],
            "center": [round(float(gltf_center.x), 6), round(float(gltf_center.y), 6), round(float(gltf_center.z), 6)],
        },
        "orientation": {"up_axis": [0.0, 1.0, 0.0], "forward_axis": [0.0, 0.0, 1.0]},
        "bottom_contact_region": {
            "id": "bottom_contact",
            "center": [round(float(bottom_center.x), 6), round(float(bottom_center.y), 6), round(float(bottom_center.z), 6)],
            "normal": [0.0, 1.0, 0.0],
            "size": [round(float(max(gltf_size.x, 1e-6)), 6), round(float(max(gltf_size.z, 1e-6)), 6)],
            "area": round(float(max(gltf_size.x * gltf_size.z, 1e-9)), 8),
            "confidence": 0.72,
        },
        "support_surfaces": surfaces,
        "interior_volumes": interior_volumes,
        "attachment_regions": attachment_regions,
        "collision_boxes": collision_boxes,
        "primary_support_surface_id": "primary_support_surface" if primary else None,
        "audit": {
            "status": "review_required" if review_required else "measured",
            "confidence": round(float(max(0.0, min(1.0, audit_confidence))), 6),
            "warnings": warnings,
            "mesh_object_count": len(all_meshes),
            "included_mesh_count": len(geometry_meshes),
            "excluded_mesh_names": [obj.name for obj in excluded_meshes[:32]],
            "triangle_count": triangle_count,
            "support_surface_count": len(surfaces),
        },
        "generated_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "generator": "myway_blender_geometry_profile_v4_mesh_contact_regions",
    }

def execute(job):
    temp_workspace = None
    source_metadata = {}
    texture_report = {
        "texture_directory": None,
        "unpacked_images": [],
        "missing_images_removed": [],
        "warnings": [],
    }
    appearance_report = {
        "mesh_count": 0,
        "material_count": 0,
        "image_count": 0,
        "packed_image_count": 0,
        "missing_image_count": 0,
        "vertex_color_meshes": [],
        "vertex_color_attributes": [],
        "materials_created": [],
        "materials_rebound_to_vertex_colors": [],
        "warnings": [],
    }

    if job["kind"] == "profile_asset_geometry":
        import_asset(job["input_path"])
        profile = geometry_profile()
        return {
            "dimensions_m": profile["local_bounds"]["size"],
            "geometry_profile": profile,
        }
    elif job["kind"] == "normalize_asset":
        import_asset(job["input_path"])
    elif job["kind"] == "render_asset_analysis":
        import_asset(job["input_path"])
        dimensions = normalize_scene(float(job.get("target_extent_m", 2.0)))
        views = make_analysis_renders(
            job["render_directory"],
            job["public_url_root"],
            dimensions,
        )
        return {
            "dimensions_m": dimensions,
            "analysis_views": views,
        }
    elif job["kind"] == "blenderkit_acquire":
        temp_workspace = create_asset_temp_workspace("blenderkit")
        try:
            blend_path, source_metadata = acquire_blenderkit(
                job["query"],
                job.get("resolution", "resolution_1K"),
                bool(job.get("free_only", True)),
                job.get("required_license_kind"),
                job.get("excluded_source_asset_ids", []),
                job.get("selected_source_asset_id"),
                temp_workspace,
            )
            append_blend_file(blend_path)
            texture_report = prepare_blenderkit_textures(
                blend_path.parent,
                job.get("resolution", "resolution_1K"),
            )
        except Exception:
            shutil.rmtree(temp_workspace, ignore_errors=True)
            temp_workspace = None
            raise
    else:
        raise RuntimeError(f"Unknown Blender job kind: {job['kind']}")

    try:
        appearance_report = preserve_imported_appearance()
        dimensions = normalize_scene(float(job.get("target_extent_m", 2.0)))
        profile = geometry_profile()
        export_glb(job["output_path"])
        make_thumbnail(job["thumbnail_path"], dimensions)
        return {
            "output_path": job["output_path"],
            "thumbnail_path": job["thumbnail_path"],
            "dimensions_m": dimensions,
            "polygon_count": polygon_count(),
            "rigged": any(obj.type == "ARMATURE" for obj in asset_objects()),
            "animation_clips": animation_clips(),
            "geometry_profile": profile,
            "texture_report": texture_report,
            "appearance_report": appearance_report,
            **source_metadata,
        }
    finally:
        if temp_workspace is not None:
            shutil.rmtree(temp_workspace, ignore_errors=True)


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
