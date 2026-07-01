import json
import math
import os
import sys
from typing import Any, Dict, List, Tuple

import bpy
import mathutils


Vec3 = Tuple[float, float, float]


MAT: Dict[str, Any] = {}
ALL_ANIMATED_OBJECTS: List[Any] = []
ASSET_OBJECTS: Dict[str, List[Any]] = {}


def as_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def as_list(value: Any) -> List[Any]:
    return value if isinstance(value, list) else []


def clean_text(value: Any, fallback: str, max_len: int = 74) -> str:
    if not isinstance(value, str):
        return fallback[:max_len]
    text = " ".join(value.strip().split())
    return (text or fallback)[:max_len]


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def color_rgba(name: str) -> Tuple[float, float, float, float]:
    return {
        "purple": (0.56, 0.22, 1.0, 0.92),
        "cyan": (0.12, 0.82, 1.0, 0.94),
        "blue": (0.22, 0.36, 1.0, 0.94),
        "green": (0.16, 0.92, 0.50, 0.94),
        "amber": (1.0, 0.58, 0.16, 0.95),
        "red": (1.0, 0.18, 0.30, 0.94),
        "white": (0.94, 0.96, 1.0, 1.0),
        "dim": (0.18, 0.12, 0.30, 0.82),
    }.get(name, (0.56, 0.22, 1.0, 0.92))


def make_mat(name: str, rgba: Tuple[float, float, float, float], emission: float = 0.0, metallic: float = 0.0, roughness: float = 0.45):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = rgba
    mat.use_nodes = True
    mat.blend_method = "BLEND"
    mat.use_screen_refraction = True
    mat.show_transparent_back = True
    try:
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            if "Base Color" in bsdf.inputs:
                bsdf.inputs["Base Color"].default_value = rgba
            if "Alpha" in bsdf.inputs:
                bsdf.inputs["Alpha"].default_value = rgba[3]
            if "Metallic" in bsdf.inputs:
                bsdf.inputs["Metallic"].default_value = metallic
            if "Roughness" in bsdf.inputs:
                bsdf.inputs["Roughness"].default_value = roughness
            if "Emission Color" in bsdf.inputs:
                bsdf.inputs["Emission Color"].default_value = rgba
            if "Emission Strength" in bsdf.inputs:
                bsdf.inputs["Emission Strength"].default_value = emission
    except Exception:
        pass
    return mat


def init_materials():
    for name in ["purple", "cyan", "blue", "green", "amber", "red", "white", "dim"]:
        MAT[name] = make_mat(f"MyWay {name}", color_rgba(name), emission=0.25 if name not in ["dim", "white"] else 0.0)
    MAT["panel"] = make_mat("MyWay frosted panel", (0.10, 0.07, 0.18, 0.78), emission=0.0, roughness=0.28)
    MAT["glass"] = make_mat("MyWay transparent glass", (0.40, 0.20, 0.9, 0.36), emission=0.08, roughness=0.18)
    MAT["floor"] = make_mat("MyWay dark matte floor", (0.018, 0.013, 0.030, 1.0), roughness=0.75)


def register(asset_id: str, *objects: Any):
    if asset_id not in ASSET_OBJECTS:
        ASSET_OBJECTS[asset_id] = []
    for obj in objects:
        if obj is None:
            continue
        ASSET_OBJECTS[asset_id].append(obj)
        ALL_ANIMATED_OBJECTS.append(obj)


def set_asset_visible(asset_id: str, visible: bool):
    for obj in ASSET_OBJECTS.get(asset_id, []):
        obj.hide_render = not visible
        obj.hide_viewport = not visible


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def look_at(obj, target: Vec3 = (0, 0, 0.35)):
    direction = mathutils.Vector((target[0] - obj.location.x, target[1] - obj.location.y, target[2] - obj.location.z))
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def setup_scene(width: int, height: int):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = int(width)
    scene.render.resolution_y = int(height)
    scene.render.fps = 12
    scene.render.image_settings.file_format = "PNG"
    scene.eevee.taa_render_samples = 24

    world = scene.world or bpy.data.worlds.new("MyWay World")
    scene.world = world
    world.color = (0.010, 0.0, 0.026)

    bpy.ops.object.light_add(type="AREA", location=(0, -4.6, 6.2))
    key = bpy.context.object
    key.name = "MyWay broad softbox"
    key.data.energy = 680
    key.data.size = 5.6

    bpy.ops.object.light_add(type="POINT", location=(-4.0, 2.4, 3.2))
    rim = bpy.context.object
    rim.name = "MyWay violet rim"
    rim.data.energy = 115

    bpy.ops.object.camera_add(location=(0, -7.8, 4.0))
    camera = bpy.context.object
    camera.name = "MyWay Procedural Camera"
    look_at(camera, (0, 0, 0.35))
    bpy.context.scene.camera = camera

    return camera


def make_stage_floor():
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0.35, -0.08))
    floor = bpy.context.object
    floor.name = "MyWay low dark stage"
    floor.scale = (5.6, 3.6, 0.035)
    floor.data.materials.append(MAT["floor"])

    # Sparse grid lines like a studio floor, not a dense wireframe.
    for x in [-4, -3, -2, -1, 0, 1, 2, 3, 4]:
        make_curve(f"grid x {x}", [(x * 0.58, -2.0, -0.02), (x * 0.58, 2.7, -0.02)], MAT["dim"], bevel=0.004)
    for y in [-2, -1, 0, 1, 2, 3, 4]:
        make_curve(f"grid y {y}", [(-2.8, y * 0.58, -0.018), (2.8, y * 0.58, -0.018)], MAT["dim"], bevel=0.004)


def make_text(name: str, body: str, location: Vec3, size: float = 0.18, mat=None, align="CENTER", camera=None):
    curve = bpy.data.curves.new(name + " curve", type="FONT")
    curve.body = body
    curve.align_x = align
    curve.align_y = "CENTER"
    curve.size = size
    curve.resolution_u = 8
    obj = bpy.data.objects.new(name, curve)
    obj.location = location
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat or MAT["white"])
    if camera:
        look_at(obj, tuple(camera.location))
    else:
        obj.rotation_euler = (math.radians(67), 0, 0)
    return obj


def make_curve(name: str, points: List[Vec3], mat, bevel: float = 0.026):
    curve = bpy.data.curves.new(name, type="CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 16
    curve.bevel_depth = bevel
    curve.bevel_resolution = 4
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, coord in zip(spline.points, points):
        point.co = (coord[0], coord[1], coord[2], 1)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def make_arrowhead(name: str, location: Vec3, direction: Vec3, mat, size=0.12):
    bpy.ops.mesh.primitive_cone_add(vertices=32, radius1=size, radius2=0.0, depth=size * 2.4, location=location)
    cone = bpy.context.object
    cone.name = name
    cone.data.materials.append(mat)
    direction_vec = mathutils.Vector(direction)
    if direction_vec.length == 0:
        direction_vec = mathutils.Vector((1, 0, 0))
    cone.rotation_euler = direction_vec.to_track_quat("Z", "Y").to_euler()
    return cone


def make_card(asset_id: str, label: str, location: Vec3, scale: Vec3, color_hint="purple", text_size=0.16, camera=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    card = bpy.context.object
    card.name = f"{asset_id} card"
    card.scale = scale
    card.data.materials.append(MAT.get(color_hint, MAT["purple"]))
    txt = make_text(f"{asset_id} label", label, (location[0], location[1] - 0.04, location[2] + scale[2] + 0.10), text_size, MAT["white"], camera=camera)
    return card, txt


def make_panel(asset_id: str, label: str, x: float, color_hint: str, camera=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, 0.35, 0.18))
    panel = bpy.context.object
    panel.name = f"{asset_id} panel"
    panel.scale = (1.55, 1.02, 0.055)
    panel.data.materials.append(MAT["panel"])
    title = make_text(f"{asset_id} title", label, (x, -0.92, 0.82), 0.18, MAT.get(color_hint, MAT["white"]), camera=camera)
    return panel, title


def make_actor_marker(asset_id: str, label: str, location: Vec3, color_hint: str, camera=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=0.18, location=(location[0], location[1], location[2] + 0.34))
    head = bpy.context.object
    head.name = f"{asset_id} head"
    head.data.materials.append(MAT.get(color_hint, MAT["purple"]))
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.16, depth=0.44, location=(location[0], location[1], location[2] + 0.04))
    body = bpy.context.object
    body.name = f"{asset_id} body"
    body.data.materials.append(MAT.get(color_hint, MAT["purple"]))
    txt = make_text(f"{asset_id} actor label", label, (location[0], location[1] - 0.18, location[2] + 0.68), 0.13, MAT["white"], camera=camera)
    return head, body, txt


def make_object_marker(asset_id: str, label: str, location: Vec3, color_hint: str, camera=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(location[0], location[1], location[2] + 0.12))
    obj = bpy.context.object
    obj.name = f"{asset_id} object marker"
    obj.scale = (0.32, 0.25, 0.22)
    obj.data.materials.append(MAT.get(color_hint, MAT["cyan"]))
    txt = make_text(f"{asset_id} object label", label, (location[0], location[1] - 0.22, location[2] + 0.58), 0.13, MAT["white"], camera=camera)
    return obj, txt


def make_self_loop(asset_id: str, label: str, center: Vec3, color_hint: str, camera=None):
    points: List[Vec3] = []
    for i in range(44):
        t = math.radians(330 - i * 275 / 43)
        points.append((center[0] + 0.58 * math.cos(t), center[1] + 0.12 * math.sin(t), center[2] + 0.54 + 0.34 * math.sin(t)))
    curve = make_curve(f"{asset_id} self loop", points, MAT.get(color_hint, MAT["purple"]), bevel=0.026)
    head = make_arrowhead(f"{asset_id} head", points[-1], (points[-1][0] - points[-2][0], points[-1][1] - points[-2][1], points[-1][2] - points[-2][2]), MAT.get(color_hint, MAT["purple"]), 0.11)
    txt = make_text(f"{asset_id} label", label, (center[0], center[1] - 0.28, center[2] + 1.12), 0.13, MAT.get(color_hint, MAT["purple"]), camera=camera)
    return curve, head, txt


def make_outside_arrow(asset_id: str, label: str, target: Vec3, color_hint: str, camera=None):
    start = (target[0] + 1.16, target[1] - 0.05, target[2] + 0.88)
    mid = (target[0] + 0.72, target[1] - 0.02, target[2] + 0.62)
    end = (target[0] + 0.18, target[1], target[2] + 0.34)
    curve = make_curve(f"{asset_id} outside arrow", [start, mid, end], MAT.get(color_hint, MAT["cyan"]), bevel=0.030)
    head = make_arrowhead(f"{asset_id} head", end, (end[0] - mid[0], end[1] - mid[1], end[2] - mid[2]), MAT.get(color_hint, MAT["cyan"]), 0.12)
    txt = make_text(f"{asset_id} label", label, (target[0] + 0.72, target[1] - 0.22, target[2] + 1.02), 0.13, MAT.get(color_hint, MAT["cyan"]), camera=camera)
    return curve, head, txt


def make_curved_arrow(asset_id: str, label: str, start: Vec3, end: Vec3, color_hint: str, camera=None, path_type="left_to_right"):
    lift = 0.86 if path_type != "right_to_left" else 0.62
    mid = ((start[0] + end[0]) / 2, (start[1] + end[1]) / 2 - 0.05, max(start[2], end[2]) + lift)
    points = []
    for i in range(32):
        t = i / 31
        ax = (1 - t) * start[0] + t * mid[0]
        ay = (1 - t) * start[1] + t * mid[1]
        az = (1 - t) * start[2] + t * mid[2]
        bx = (1 - t) * mid[0] + t * end[0]
        by = (1 - t) * mid[1] + t * end[1]
        bz = (1 - t) * mid[2] + t * end[2]
        points.append(((1 - t) * ax + t * bx, (1 - t) * ay + t * by, (1 - t) * az + t * bz))
    curve = make_curve(f"{asset_id} curved arrow", points, MAT.get(color_hint, MAT["green"]), bevel=0.028)
    head = make_arrowhead(f"{asset_id} head", points[-1], (points[-1][0] - points[-2][0], points[-1][1] - points[-2][1], points[-1][2] - points[-2][2]), MAT.get(color_hint, MAT["green"]), 0.12)
    txt = make_text(f"{asset_id} label", label, (mid[0], mid[1] - 0.18, mid[2] + 0.18), 0.13, MAT.get(color_hint, MAT["green"]), camera=camera)
    return curve, head, txt


def asset_position(asset: Dict[str, Any]) -> Vec3:
    hint = clean_text(asset.get("position_hint"), "center", 40)
    return {
        "left": (-1.55, 0.25, 0.18),
        "right": (1.55, 0.25, 0.18),
        "left_center": (-1.55, 0.25, 0.22),
        "right_center": (1.55, 0.25, 0.22),
        "center": (0.0, 0.25, 0.24),
        "bottom": (0.0, 1.48, 0.26),
        "top": (0.0, -1.15, 0.72),
        "above": (0.0, -0.45, 0.82),
        "outside_left": (-2.55, 0.25, 0.25),
        "outside_right": (2.55, 0.25, 0.25),
    }.get(hint, (0.0, 0.25, 0.24))


def render_relationship_plan(plan: Dict[str, Any], camera):
    make_stage_floor()
    title = clean_text(plan.get("title"), "MyWay generated visual", 74)
    goal = clean_text(plan.get("visual_goal"), "Reveal the hidden relationship.", 82)
    title_obj = make_text("main title", title, (0, -2.15, 1.82), 0.18, MAT["white"], camera=camera)
    goal_obj = make_text("visual goal", goal, (0, -2.13, 1.56), 0.12, MAT["dim"], camera=camera)
    register("always", title_obj, goal_obj)

    assets = as_list(plan.get("generated_assets"))
    positions: Dict[str, Vec3] = {}
    for asset in assets:
        asset = as_dict(asset)
        asset_id = clean_text(asset.get("id"), "asset", 48)
        label = clean_text(asset.get("label"), asset_id, 46)
        asset_type = clean_text(asset.get("asset_type"), "token_card", 48)
        color_hint = clean_text(asset.get("color_hint"), "purple", 24)

        if asset_type == "stage_panel":
            x = -1.55 if asset.get("position_hint") == "left" else 1.55 if asset.get("position_hint") == "right" else 0.0
            objs = make_panel(asset_id, label, x, color_hint, camera=camera)
            positions[asset_id] = (x, 0.25, 0.35)
            register(asset_id, *objs)
        elif asset_type == "actor_marker":
            pos = asset_position(asset)
            objs = make_actor_marker(asset_id, label, pos, color_hint, camera=camera)
            positions[asset_id] = pos
            register(asset_id, *objs)
        elif asset_type == "object_marker":
            pos = asset_position(asset)
            objs = make_object_marker(asset_id, label, pos, color_hint, camera=camera)
            positions[asset_id] = pos
            register(asset_id, *objs)
        elif asset_type == "token_card":
            # Token cards inherit left/right position from id when no exact hint exists.
            if "left" in asset_id:
                pos = (-1.55, -0.50, 0.78)
            elif "right" in asset_id:
                pos = (1.55, -0.50, 0.78)
            else:
                pos = asset_position(asset)
            objs = make_card(asset_id, label, pos, (0.34, 0.05, 0.18), color_hint, 0.18, camera=camera)
            positions[asset_id] = pos
            register(asset_id, *objs)
        elif asset_type == "self_loop_arrow":
            from_id = clean_text(asset.get("from_id"), "left_subject", 48)
            center = positions.get(from_id, (-1.55, 0.25, 0.22))
            objs = make_self_loop(asset_id, label, center, color_hint, camera=camera)
            register(asset_id, *objs)
        elif asset_type == "outside_force_arrow":
            to_id = clean_text(asset.get("to_id"), "right_subject", 48)
            target = positions.get(to_id, (1.55, 0.25, 0.22))
            objs = make_outside_arrow(asset_id, label, target, color_hint, camera=camera)
            register(asset_id, *objs)
        elif asset_type == "curved_arrow":
            from_id = clean_text(asset.get("from_id"), "left_object", 48)
            to_id = clean_text(asset.get("to_id"), "right_object", 48)
            path_type = clean_text(asset.get("path_type"), "left_to_right", 48)
            start = positions.get(from_id, (-1.35, 0.24, 0.55))
            end = positions.get(to_id, (1.35, 0.24, 0.55))
            if path_type == "right_to_left":
                start, end = positions.get(from_id, (1.35, 0.24, 0.55)), positions.get(to_id, (-1.35, 0.24, 0.55))
            objs = make_curved_arrow(asset_id, label, (start[0], start[1], start[2] + 0.3), (end[0], end[1], end[2] + 0.3), color_hint, camera=camera, path_type=path_type)
            register(asset_id, *objs)
        elif asset_type == "rule_card":
            pos = (0, 1.25, 0.78)
            objs = make_card(asset_id, label, pos, (1.10, 0.06, 0.21), color_hint, 0.13, camera=camera)
            positions[asset_id] = pos
            register(asset_id, *objs)
        else:
            pos = asset_position(asset)
            objs = make_card(asset_id, label, pos, (0.55, 0.05, 0.16), color_hint, 0.13, camera=camera)
            positions[asset_id] = pos
            register(asset_id, *objs)


def render_process_plan(plan: Dict[str, Any], camera):
    make_stage_floor()
    title = clean_text(plan.get("title"), "MyWay process flow", 70)
    register("always", make_text("process title", title, (0, -2.12, 1.8), 0.18, MAT["white"], camera=camera))

    assets = {clean_text(as_dict(asset).get("id"), "asset", 48): as_dict(asset) for asset in as_list(plan.get("generated_assets"))}
    channel_label = clean_text(assets.get("channel", {}).get("label"), "flow path", 40)
    barrier_label = clean_text(assets.get("barrier", {}).get("label"), "constraint", 40)

    # Transparent channel tube/cutaway-like path.
    channel_points = [(-2.35, 0.18, 0.58), (-1.15, 0.18, 0.58), (-0.45, 0.18, 0.58), (0.45, 0.18, 0.58), (1.15, 0.18, 0.58), (2.35, 0.18, 0.58)]
    channel = make_curve("process flow channel", channel_points, MAT["glass"], bevel=0.14)
    channel_txt = make_text("channel label", channel_label, (-1.65, -0.42, 1.06), 0.13, MAT["cyan"], camera=camera)
    register("channel", channel, channel_txt)

    # Narrowing barrier / resistor / filter.
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0.18, 0.58))
    barrier = bpy.context.object
    barrier.name = "process constraint"
    barrier.scale = (0.18, 0.22, 0.74)
    barrier.data.materials.append(MAT["amber"])
    barrier_txt = make_text("barrier label", barrier_label, (0, -0.46, 1.28), 0.15, MAT["amber"], camera=camera)
    register("barrier", barrier, barrier_txt)

    # Flow particles as small glowing spheres at staggered positions.
    for index in range(9):
        x = -2.15 + index * 0.52
        radius = 0.065 if abs(x) > 0.3 else 0.045
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=radius, location=(x, 0.18, 0.58 + 0.05 * math.sin(index)))
        p = bpy.context.object
        p.name = f"flow particle {index + 1}"
        p.data.materials.append(MAT["cyan"])
        register("particles", p)

    arrow = make_curved_arrow("flow_arrow", "flow changes", (-1.8, 0.18, 1.05), (1.8, 0.18, 1.05), "green", camera=camera, path_type="around_barrier")
    register("flow_arrow", *arrow)
    rule = make_card("rule_card", clean_text(assets.get("rule_card", {}).get("label"), "Change the path, change the flow", 52), (0, 1.25, 0.78), (1.2, 0.06, 0.22), "green", 0.12, camera=camera)
    register("rule_card", *rule)


def render_surface_plan(plan: Dict[str, Any], camera):
    make_stage_floor()
    register("always", make_text("surface title", clean_text(plan.get("title"), "Surface explanation", 70), (0, -2.12, 1.86), 0.18, MAT["white"], camera=camera))

    size = 4.3
    subdivisions = 44
    vertices = []
    faces = []
    for row in range(subdivisions + 1):
        y = -size / 2 + size * row / subdivisions
        for col in range(subdivisions + 1):
            x = -size / 2 + size * col / subdivisions
            z = 0.18 * (x * x - y * y) + 0.26
            vertices.append((x, y, z))
    for row in range(subdivisions):
        for col in range(subdivisions):
            a = row * (subdivisions + 1) + col
            b = a + 1
            c = a + (subdivisions + 1)
            d = c + 1
            faces.append((a, c, b))
            faces.append((b, c, d))
    mesh = bpy.data.meshes.new("MyWay procedural surface mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    surface = bpy.data.objects.new("procedural surface", mesh)
    bpy.context.collection.objects.link(surface)
    surface.data.materials.append(MAT["glass"])
    register("surface", surface)

    samples = 48
    x_points = []
    y_points = []
    for i in range(samples + 1):
        t = -2.25 + 4.5 * i / samples
        x_points.append((t, 0, 0.18 * t * t + 0.31))
        y_points.append((0, t, -0.18 * t * t + 0.31))
    x_curve = make_curve("surface x slice", x_points, MAT["purple"], bevel=0.035)
    y_curve = make_curve("surface y slice", y_points, MAT["cyan"], bevel=0.035)
    register("x_slice", x_curve, make_text("x slice label", "one direction rises", (1.42, -0.38, 1.30), 0.13, MAT["purple"], camera=camera))
    register("y_slice", y_curve, make_text("y slice label", "the other drops", (-0.98, 0.82, 0.98), 0.13, MAT["cyan"], camera=camera))
    rule = make_card("rule_card", "Same point, different directions", (0, 1.48, 0.82), (1.25, 0.06, 0.22), "green", 0.12, camera=camera)
    register("rule_card", *rule)


def render_plan(plan: Dict[str, Any], camera):
    strategy = clean_text(plan.get("strategy"), "relationship_reveal", 50)
    if strategy == "process_flow":
        render_process_plan(plan, camera)
    elif strategy == "surface_or_field":
        render_surface_plan(plan, camera)
    else:
        render_relationship_plan(plan, camera)


def visible_ids_for_frame(plan: Dict[str, Any], frame_index: int, total_frames: int) -> List[str]:
    beats = as_list(plan.get("beats"))
    if not beats:
        return list(ASSET_OBJECTS.keys())
    beat_index = min(len(beats) - 1, int(frame_index / max(1, total_frames) * len(beats)))
    visible = as_dict(beats[beat_index]).get("visible_asset_ids")
    ids = [clean_text(value, "", 64) for value in as_list(visible) if clean_text(value, "", 64)]
    if not ids:
        ids = list(ASSET_OBJECTS.keys())
    return ["always", *ids]


def animate_frame(plan: Dict[str, Any], camera, frame_number: int, total_frames: int):
    t = (frame_number - 1) / max(1, total_frames - 1)
    strategy = clean_text(plan.get("strategy"), "relationship_reveal", 50)

    if strategy == "surface_or_field":
        angle = math.radians(-28 + 28 * t)
        radius = 7.2
        camera.location = (radius * math.sin(angle), -radius * math.cos(angle), 3.7 - 0.25 * t)
        look_at(camera, (0, 0.12, 0.35))
    else:
        camera.location = (0.35 * math.sin(t * math.pi * 0.6), -7.8 + 1.0 * t, 4.05 - 0.28 * t)
        look_at(camera, (0, 0.25, 0.48))

    visible = set(visible_ids_for_frame(plan, frame_number - 1, total_frames))
    for asset_id in ASSET_OBJECTS.keys():
        set_asset_visible(asset_id, asset_id in visible)


def load_payload(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as file:
        return json.load(file)


def fallback_plan(payload: Dict[str, Any]) -> Dict[str, Any]:
    contract = as_dict(payload.get("director_contract"))
    context = as_dict(payload.get("request_context"))
    title = clean_text(contract.get("title") or as_dict(context.get("learning_context")).get("topic_label"), "MyWay visual explanation", 80)
    learner = clean_text(context.get("learner_message") or contract.get("learner_message"), "I am stuck on this idea.", 140)
    return {
        "schema_version": "myway_procedural_visual_plan_v1",
        "title": title,
        "learner_message": learner,
        "strategy": "relationship_reveal",
        "visual_goal": clean_text(as_dict(contract.get("creative_brief")).get("aha_moment"), "Reveal the missing relationship.", 90),
        "generated_assets": [
            {"id": "left_panel", "asset_type": "stage_panel", "label": "current picture", "position_hint": "left", "color_hint": "purple", "visible_from_beat": 1},
            {"id": "right_panel", "asset_type": "stage_panel", "label": "hidden link", "position_hint": "right", "color_hint": "cyan", "visible_from_beat": 1},
            {"id": "left_object", "asset_type": "token_card", "label": "piece A", "position_hint": "left_center", "color_hint": "purple", "visible_from_beat": 1},
            {"id": "right_object", "asset_type": "token_card", "label": "piece B", "position_hint": "right_center", "color_hint": "cyan", "visible_from_beat": 1},
            {"id": "missing_link", "asset_type": "curved_arrow", "label": "hidden link", "from_id": "left_object", "to_id": "right_object", "position_hint": "center", "color_hint": "green", "visible_from_beat": 2},
            {"id": "rule_card", "asset_type": "rule_card", "label": "Name the link", "position_hint": "center", "color_hint": "green", "visible_from_beat": 3},
        ],
        "beats": [
            {"visible_asset_ids": ["left_panel", "right_panel", "left_object", "right_object"]},
            {"visible_asset_ids": ["left_panel", "right_panel", "left_object", "right_object", "missing_link"]},
            {"visible_asset_ids": ["left_panel", "right_panel", "left_object", "right_object", "missing_link", "rule_card"]},
        ],
    }


def main():
    if len(sys.argv) < 7:
        raise SystemExit("Expected: blender --background --python render-myway-director.py -- input.json out_dir frames fps width height")

    input_path = sys.argv[-6]
    output_dir = sys.argv[-5]
    frames = int(sys.argv[-4])
    fps = int(sys.argv[-3])
    width = int(sys.argv[-2])
    height = int(sys.argv[-1])

    os.makedirs(output_dir, exist_ok=True)
    payload = load_payload(input_path)
    plan = as_dict(payload.get("procedural_visual_plan")) or fallback_plan(payload)

    clear_scene()
    init_materials()
    camera = setup_scene(width, height)
    render_plan(plan, camera)

    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = frames
    scene.render.fps = fps

    for frame_number in range(1, frames + 1):
        scene.frame_set(frame_number)
        animate_frame(plan, camera, frame_number, frames)
        scene.render.filepath = os.path.join(output_dir, f"frame_{frame_number:04d}.png")
        bpy.ops.render.render(write_still=True)

    print(f"MYWAY_BLENDER_PROCEDURAL_OUTPUT={output_dir}")


if __name__ == "__main__":
    main()
