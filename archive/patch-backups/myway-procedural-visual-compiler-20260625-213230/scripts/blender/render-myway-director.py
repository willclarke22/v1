import json
import math
import os
import sys
from typing import Any, Dict, List, Tuple

import bpy


def clean_text(value: Any, fallback: str, max_len: int = 86) -> str:
    if not isinstance(value, str):
        return fallback[:max_len]
    text = " ".join(value.strip().split())
    if not text:
        return fallback[:max_len]
    return text[:max_len]


def as_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def as_list(value: Any) -> List[Any]:
    return value if isinstance(value, list) else []


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def make_mat(name: str, color: Tuple[float, float, float, float], metallic: float = 0.0, roughness: float = 0.55):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color
    try:
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            if "Base Color" in bsdf.inputs:
                bsdf.inputs["Base Color"].default_value = color
            if "Alpha" in bsdf.inputs:
                bsdf.inputs["Alpha"].default_value = color[3]
            if "Metallic" in bsdf.inputs:
                bsdf.inputs["Metallic"].default_value = metallic
            if "Roughness" in bsdf.inputs:
                bsdf.inputs["Roughness"].default_value = roughness
    except Exception:
        pass
    return mat


MAT_PURPLE = None
MAT_CYAN = None
MAT_BLUE = None
MAT_WHITE = None
MAT_DIM = None
MAT_GREEN = None
MAT_AMBER = None
MAT_RED = None


def init_materials():
    global MAT_PURPLE, MAT_CYAN, MAT_BLUE, MAT_WHITE, MAT_DIM, MAT_GREEN, MAT_AMBER, MAT_RED
    MAT_PURPLE = make_mat("MyWay purple glass", (0.52, 0.22, 1.0, 0.72), roughness=0.36)
    MAT_CYAN = make_mat("MyWay cyan glow", (0.15, 0.86, 1.0, 1.0), roughness=0.25)
    MAT_BLUE = make_mat("MyWay blue", (0.2, 0.38, 1.0, 0.95), roughness=0.4)
    MAT_WHITE = make_mat("MyWay white", (1.0, 1.0, 1.0, 1.0), roughness=0.3)
    MAT_DIM = make_mat("MyWay dim violet", (0.22, 0.12, 0.38, 0.75), roughness=0.62)
    MAT_GREEN = make_mat("MyWay green", (0.18, 0.9, 0.48, 1.0), roughness=0.35)
    MAT_AMBER = make_mat("MyWay amber", (1.0, 0.63, 0.16, 1.0), roughness=0.35)
    MAT_RED = make_mat("MyWay red", (1.0, 0.18, 0.32, 1.0), roughness=0.35)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def setup_scene(width: int, height: int):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = int(width)
    scene.render.resolution_y = int(height)
    scene.render.fps = 12
    scene.render.image_settings.file_format = "PNG"

    world = scene.world or bpy.data.worlds.new("MyWay World")
    scene.world = world
    world.color = (0.015, 0.0, 0.04)

    bpy.ops.object.light_add(type="AREA", location=(0, -4.4, 6.5))
    light = bpy.context.object
    light.name = "MyWay cinematic softbox"
    light.data.energy = 850
    light.data.size = 5.5

    bpy.ops.object.light_add(type="POINT", location=(-3.8, 3.2, 3.8))
    rim = bpy.context.object
    rim.name = "MyWay rim light"
    rim.data.energy = 85

    bpy.ops.object.camera_add(location=(4.8, -6.4, 4.1), rotation=(math.radians(61), 0, math.radians(39)))
    camera = bpy.context.object
    camera.name = "MyWay Director Camera"
    bpy.context.scene.camera = camera
    return camera


def look_at(obj, target=(0, 0, 0.15)):
    dx = target[0] - obj.location.x
    dy = target[1] - obj.location.y
    dz = target[2] - obj.location.z
    direction = mathutils_vector((dx, dy, dz))
    quat = direction.to_track_quat("-Z", "Y")
    obj.rotation_euler = quat.to_euler()


def mathutils_vector(values):
    import mathutils

    return mathutils.Vector(values)


def make_text(name: str, body: str, location, size=0.18, mat=None, align="CENTER"):
    curve = bpy.data.curves.new(name + " curve", type="FONT")
    curve.body = body
    curve.align_x = align
    curve.align_y = "CENTER"
    curve.size = size
    obj = bpy.data.objects.new(name, curve)
    obj.location = location
    obj.rotation_euler = (math.radians(64), 0, 0)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat or MAT_WHITE)
    return obj


def make_curve(name: str, points: List[Tuple[float, float, float]], mat, bevel=0.024):
    curve = bpy.data.curves.new(name, type="CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 2
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


def make_card(name: str, label: str, location, scale, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    card = bpy.context.object
    card.name = name
    card.scale = scale
    card.data.materials.append(mat)
    text = make_text(name + " label", label, (location[0], location[1] - 0.055, location[2] + scale[2] + 0.18), 0.16, MAT_WHITE)
    text.rotation_euler = (math.radians(70), 0, 0)
    return card, text


def get_director(payload: Dict[str, Any]) -> Dict[str, Any]:
    return as_dict(payload.get("director_contract"))


def get_context(payload: Dict[str, Any]) -> Dict[str, Any]:
    return as_dict(payload.get("request_context"))


def contract_text_bundle(contract: Dict[str, Any], context: Dict[str, Any]) -> str:
    values = [
        contract.get("title"),
        contract.get("learner_signal"),
        as_dict(contract.get("creative_brief")).get("visual_metaphor"),
        as_dict(contract.get("creative_brief")).get("aha_moment"),
        as_dict(context.get("learning_context")).get("root_problem"),
        as_dict(context.get("learning_context")).get("misconception_target"),
        context.get("learner_message"),
    ]
    return " ".join([value for value in values if isinstance(value, str)]).lower()


def get_scene_kind(contract: Dict[str, Any], context: Dict[str, Any]) -> str:
    intent = as_dict(contract.get("renderer_intent"))
    scene_kind = clean_text(intent.get("scene_kind"), "", 60).lower()
    preferred = clean_text(intent.get("preferred_renderer"), "", 60).lower()
    bundle = contract_text_bundle(contract, context)

    if "surface" in scene_kind or "surface" in preferred or "saddle" in bundle or "x^2" in bundle or "x²" in bundle:
        return "surface_3d"
    if "flow" in scene_kind or "flow" in preferred or "electron" in bundle or "air" in bundle or "water" in bundle or "current" in bundle:
        return "flow_system_3d"
    if "state" in scene_kind or "transition" in scene_kind or "sequence" in bundle or "order" in bundle:
        return "state_transition_3d"
    return "relationship_map_3d"


def build_surface_scene(contract: Dict[str, Any], context: Dict[str, Any]):
    title = clean_text(contract.get("title"), "MyWay 3D surface explanation", 68)
    brief = as_dict(contract.get("creative_brief"))
    aha = clean_text(brief.get("aha_moment"), "Same point. Different directions. Different result.", 74)

    size = 5.2
    subdivisions = 72
    vertices = []
    faces = []

    for row in range(subdivisions + 1):
        y = -size / 2 + size * row / subdivisions
        for col in range(subdivisions + 1):
            x = -size / 2 + size * col / subdivisions
            z = 0.16 * (x * x - y * y)
            vertices.append((x, y, z))

    for row in range(subdivisions):
        for col in range(subdivisions):
            a = row * (subdivisions + 1) + col
            b = a + 1
            c = a + (subdivisions + 1)
            d = c + 1
            faces.append((a, c, b))
            faces.append((b, c, d))

    mesh = bpy.data.meshes.new("MyWay director saddle surface mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    surface = bpy.data.objects.new("director surface", mesh)
    bpy.context.collection.objects.link(surface)
    surface.data.materials.append(MAT_PURPLE)

    # explanatory grid lines, intentionally sparse so it does not become a white lattice
    values = [-2.4, -1.6, -0.8, 0, 0.8, 1.6, 2.4]
    samples = 48
    grid_objects = []
    for fixed_y in values:
        points = []
        for i in range(samples + 1):
            x = -2.6 + 5.2 * i / samples
            z = 0.16 * (x * x - fixed_y * fixed_y)
            points.append((x, fixed_y, z + 0.012))
        grid_objects.append(make_curve("surface grid x", points, MAT_DIM, 0.006))
    for fixed_x in values:
        points = []
        for i in range(samples + 1):
            y = -2.6 + 5.2 * i / samples
            z = 0.16 * (fixed_x * fixed_x - y * y)
            points.append((fixed_x, y, z + 0.012))
        grid_objects.append(make_curve("surface grid y", points, MAT_DIM, 0.006))

    x_points = []
    y_points = []
    for i in range(samples + 1):
        t = -2.7 + 5.4 * i / samples
        x_points.append((t, 0, 0.16 * t * t + 0.045))
        y_points.append((0, t, -0.16 * t * t + 0.045))
    x_curve = make_curve("glowing x upward slice", x_points, MAT_PURPLE, 0.035)
    y_curve = make_curve("glowing y downward slice", y_points, MAT_CYAN, 0.035)

    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=0.105, location=(0, 0, 0.06))
    origin = bpy.context.object
    origin.name = "same origin marker"
    origin.data.materials.append(MAT_WHITE)

    title_obj = make_text("scene title", title, (0, -3.05, 1.55), 0.18, MAT_WHITE)
    caption_obj = make_text("scene caption", aha, (0, -3.05, 1.18), 0.135, MAT_CYAN)
    return {
        "kind": "surface_3d",
        "focus_objects": [x_curve, y_curve, surface, origin],
        "texts": [title_obj, caption_obj],
    }


def build_flow_scene(contract: Dict[str, Any], context: Dict[str, Any]):
    title = clean_text(contract.get("title"), "Hidden flow made visible", 68)
    brief = as_dict(contract.get("creative_brief"))
    aha = clean_text(brief.get("aha_moment"), "Follow what moves, then the relationship becomes visible.", 76)

    # transparent process body
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.15))
    body = bpy.context.object
    body.name = "transparent process body"
    body.scale = (2.8, 0.95, 0.52)
    body.data.materials.append(MAT_DIM)

    # flow path
    points = []
    for i in range(96):
        t = i / 95
        x = -2.45 + 4.9 * t
        y = 0.18 * math.sin(t * math.pi * 2)
        z = 0.25 + 0.28 * math.sin(t * math.pi)
        points.append((x, y, z))
    path_obj = make_curve("visible hidden flow", points, MAT_CYAN, 0.035)

    particles = []
    for i in range(8):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=0.075, location=(-2.2 + i * 0.55, 0, 0.38))
        particle = bpy.context.object
        particle.name = "flow particle"
        particle.data.materials.append(MAT_WHITE if i % 2 == 0 else MAT_CYAN)
        particles.append(particle)

    make_card("source card", "source", (-2.8, -0.9, 0.15), (0.5, 0.08, 0.28), MAT_BLUE)
    make_card("stuck card", "stuck link", (0, -1.05, 0.22), (0.68, 0.08, 0.3), MAT_AMBER)
    make_card("result card", "result", (2.8, -0.9, 0.15), (0.5, 0.08, 0.28), MAT_GREEN)

    title_obj = make_text("scene title", title, (0, -3.0, 1.45), 0.18, MAT_WHITE)
    caption_obj = make_text("scene caption", aha, (0, -3.0, 1.08), 0.135, MAT_CYAN)
    return {"kind": "flow_system_3d", "particles": particles, "path": path_obj, "texts": [title_obj, caption_obj]}


def build_relationship_scene(contract: Dict[str, Any], context: Dict[str, Any]):
    title = clean_text(contract.get("title"), "Make the hidden relationship visible", 70)
    brief = as_dict(contract.get("creative_brief"))
    aha = clean_text(brief.get("aha_moment"), "The missing link is the relationship between the pieces.", 76)

    relationships = as_list(contract.get("relationships"))
    objects = as_list(contract.get("conceptual_objects"))

    labels = []
    for item in objects[:3]:
        record = as_dict(item)
        labels.append(clean_text(record.get("name"), record.get("role") or "idea", 22))
    while len(labels) < 3:
        labels.append(["known", "stuck link", "new view"][len(labels)])

    make_card("left concept", labels[0], (-2.35, -0.25, 0.25), (0.62, 0.08, 0.34), MAT_BLUE)
    make_card("middle concept", labels[1], (0, -0.25, 0.42), (0.75, 0.08, 0.38), MAT_PURPLE)
    make_card("right concept", labels[2], (2.35, -0.25, 0.25), (0.62, 0.08, 0.34), MAT_GREEN)

    make_curve("left relation arrow", [(-1.72, -0.25, 0.45), (-0.92, -0.25, 0.55), (-0.35, -0.25, 0.52)], MAT_WHITE, 0.026)
    make_curve("right relation arrow", [(0.35, -0.25, 0.52), (0.92, -0.25, 0.55), (1.72, -0.25, 0.45)], MAT_WHITE, 0.026)

    rel_label = "relationship"
    if relationships:
        rel_label = clean_text(as_dict(relationships[0]).get("kind"), "relationship", 22).replace("_", " ")
    make_text("relationship label", rel_label, (0, -0.62, 1.0), 0.15, MAT_CYAN)

    title_obj = make_text("scene title", title, (0, -3.0, 1.45), 0.18, MAT_WHITE)
    caption_obj = make_text("scene caption", aha, (0, -3.0, 1.08), 0.135, MAT_CYAN)
    return {"kind": "relationship_map_3d", "texts": [title_obj, caption_obj]}


def set_camera_for_frame(camera, frame_index: int, total_frames: int, scene_kind: str):
    t = frame_index / max(1, total_frames - 1)
    angle = math.radians(38 + 46 * t)
    radius = 6.9 if scene_kind == "surface_3d" else 6.2
    height = 3.5 + 0.3 * math.sin(t * math.pi)
    camera.location = (math.sin(angle) * radius, -math.cos(angle) * radius, height)
    look_at(camera, (0, 0, 0.22))


def update_flow_for_frame(scene_data: Dict[str, Any], frame_index: int, total_frames: int):
    particles = scene_data.get("particles") or []
    for i, particle in enumerate(particles):
        t = ((frame_index / max(1, total_frames - 1)) + i / max(1, len(particles))) % 1
        x = -2.45 + 4.9 * t
        y = 0.18 * math.sin(t * math.pi * 2)
        z = 0.25 + 0.28 * math.sin(t * math.pi)
        particle.location = (x, y, z)


def update_surface_for_frame(scene_data: Dict[str, Any], frame_index: int, total_frames: int):
    t = frame_index / max(1, total_frames - 1)
    focus = scene_data.get("focus_objects", [])
    if len(focus) >= 4:
        x_curve, y_curve, surface, origin = focus[:4]
        # Reveal the pedagogical beats: x slice, y slice, then the stitched surface.
        x_curve.hide_render = False
        y_curve.hide_render = t < 0.25
        surface.hide_render = t < 0.48
        origin.scale = (1 + 0.22 * math.sin(t * math.pi * 4),) * 3


def render_frames(payload: Dict[str, Any], output_dir: str, frames: int, fps: int, width: int, height: int):
    clear_scene()
    init_materials()
    camera = setup_scene(width, height)

    contract = get_director(payload)
    context = get_context(payload)
    scene_kind = get_scene_kind(contract, context)

    if scene_kind == "surface_3d":
        scene_data = build_surface_scene(contract, context)
    elif scene_kind == "flow_system_3d":
        scene_data = build_flow_scene(contract, context)
    else:
        scene_data = build_relationship_scene(contract, context)

    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = frames
    scene.render.fps = fps

    os.makedirs(output_dir, exist_ok=True)

    for frame in range(1, frames + 1):
        scene.frame_set(frame)
        frame_index = frame - 1
        set_camera_for_frame(camera, frame_index, frames, scene_kind)
        if scene_kind == "flow_system_3d":
            update_flow_for_frame(scene_data, frame_index, frames)
        if scene_kind == "surface_3d":
            update_surface_for_frame(scene_data, frame_index, frames)

        scene.render.filepath = os.path.join(output_dir, f"frame_{frame:04d}.png")
        bpy.ops.render.render(write_still=True)


def main():
    if "--" in sys.argv:
        args = sys.argv[sys.argv.index("--") + 1 :]
    else:
        args = sys.argv[1:]

    input_path = os.path.abspath(args[0]) if len(args) >= 1 else "director-input.json"
    output_dir = os.path.abspath(args[1]) if len(args) >= 2 else "public/generated-video-renders/myway_blender_manual"
    frames = int(args[2]) if len(args) >= 3 else 48
    fps = int(args[3]) if len(args) >= 4 else 12
    width = int(args[4]) if len(args) >= 5 else 960
    height = int(args[5]) if len(args) >= 6 else 540

    with open(input_path, "r", encoding="utf-8") as handle:
        payload = json.load(handle)

    render_frames(payload, output_dir, frames, fps, width, height)
    print(f"MYWAY_BLENDER_FRAMES_OUTPUT={output_dir}")


if __name__ == "__main__":
    main()
