import bpy
import mathutils
import bpy
import bmesh
import math
from mathutils import Vector


# ============================================================
# MYWAY: Stylized Low-Poly Wooden Treasure Chest
# ============================================================

def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    for block in list(bpy.data.meshes):
        bpy.data.meshes.remove(block)

    for block in list(bpy.data.materials):
        bpy.data.materials.remove(block)

    for block in list(bpy.data.curves):
        bpy.data.curves.remove(block)


def make_material(name, base_color, roughness=0.6, metallic=0.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True

    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*base_color, 1.0)
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic

    return mat


def assign_material(obj, mat):
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)


def add_material_slot(obj, mat):
    obj.data.materials.append(mat)
    return len(obj.data.materials) - 1


def shade_smooth(obj):
    if obj.type != "MESH":
        return

    for polygon in obj.data.polygons:
        polygon.use_smooth = True


def apply_transforms(obj):
    bpy.ops.object.mode_set(mode="OBJECT") if bpy.context.object and bpy.context.object.mode != "OBJECT" else None
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.select_set(False)


def create_box(name, size, location, bevel_width=0.02, bevel_segments=2):
    bpy.ops.mesh.primitive_cube_add(size=size, location=location)
    obj = bpy.context.active_object
    obj.name = name

    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.bevel(
        offset=bevel_width,
        segments=bevel_segments,
        profile=0.7,
    )
    bpy.ops.object.mode_set(mode="OBJECT")

    return obj


def create_cylinder(
    name,
    radius,
    depth,
    location,
    rotation,
    vertices=16,
):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=location,
        rotation=rotation,
    )

    obj = bpy.context.active_object
    obj.name = name
    return obj


def create_torus(
    name,
    major_radius,
    minor_radius,
    location,
    rotation,
    major_segments=16,
    minor_segments=8,
):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=major_segments,
        minor_segments=minor_segments,
        location=location,
        rotation=rotation,
    )

    obj = bpy.context.active_object
    obj.name = name
    return obj


def create_lid(name, width, height, depth, location):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (width, depth, height)
    bpy.ops.object.transform_apply(
        location=False,
        rotation=False,
        scale=True,
    )

    # Shape the upper surface into a stylized rounded lid.
    bpy.ops.object.mode_set(mode="EDIT")
    bm = bmesh.from_edit_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()

    for edge in bm.edges:
        edge.select = all(vertex.co.z > 0.01 for vertex in edge.verts)

    bmesh.update_edit_mesh(obj.data)
    bpy.ops.mesh.bevel(
        offset=height * 0.45,
        segments=4,
        profile=0.55,
    )

    # Refresh the editable BMesh after the first operator changed topology.
    bm = bmesh.from_edit_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()

    for edge in bm.edges:
        is_top = all(vertex.co.z > 0.01 for vertex in edge.verts)
        is_side = abs(edge.verts[0].co.y - edge.verts[1].co.y) < 0.01
        edge.select = is_top and is_side

    bmesh.update_edit_mesh(obj.data)
    bpy.ops.mesh.bevel(
        offset=width * 0.08,
        segments=3,
        profile=0.6,
    )

    bpy.ops.object.mode_set(mode="OBJECT")
    return obj


def add_iron_bands(
    obj,
    mat,
    z_positions,
    thickness=0.04,
    inset=0.0,
):
    """Add horizontal iron bands around a chest component."""
    bbox = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]

    min_x = min(vertex.x for vertex in bbox)
    max_x = max(vertex.x for vertex in bbox)
    min_y = min(vertex.y for vertex in bbox)
    max_y = max(vertex.y for vertex in bbox)

    width = max_x - min_x
    depth = max_y - min_y

    bands = []

    for index, z_value in enumerate(z_positions, start=1):
        bpy.ops.mesh.primitive_cube_add(
            size=1,
            location=(obj.location.x, obj.location.y, z_value),
        )

        band = bpy.context.active_object
        band.name = f"{obj.name}_Band_{index:02d}"
        band.scale = (
            max(width - inset, 0.01) + 0.02,
            max(depth - inset, 0.01) + 0.02,
            thickness,
        )

        bpy.ops.object.transform_apply(
            location=False,
            rotation=False,
            scale=True,
        )

        assign_material(band, mat)
        shade_smooth(band)
        bands.append(band)

    return bands


def add_corner_brackets(
    obj,
    mat,
    z_bottom,
    z_top,
    bracket_width=0.08,
):
    """Add simple vertical corner brackets."""
    bbox = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]

    min_x = min(vertex.x for vertex in bbox)
    max_x = max(vertex.x for vertex in bbox)
    min_y = min(vertex.y for vertex in bbox)
    max_y = max(vertex.y for vertex in bbox)

    brackets = []
    corners = [
        (min_x, min_y, "FL"),
        (max_x, min_y, "FR"),
        (min_x, max_y, "BL"),
        (max_x, max_y, "BR"),
    ]

    bracket_height = max(z_top - z_bottom, 0.01)

    for x_value, y_value, label in corners:
        bpy.ops.mesh.primitive_cube_add(
            size=1,
            location=(
                x_value,
                y_value,
                (z_bottom + z_top) / 2,
            ),
        )

        bracket = bpy.context.active_object
        bracket.name = f"{obj.name}_Bracket_{label}"
        bracket.scale = (
            bracket_width,
            bracket_width,
            bracket_height,
        )

        bpy.ops.object.transform_apply(
            location=False,
            rotation=False,
            scale=True,
        )

        assign_material(bracket, mat)
        shade_smooth(bracket)
        brackets.append(bracket)

    return brackets


def create_lockplate(mat_gold, mat_wood_dark, front_y):
    """Create the front lock plate and keyhole."""
    parts = []

    bpy.ops.mesh.primitive_cube_add(
        size=0.12,
        location=(0, front_y - 0.01, 0.55),
    )

    plate = bpy.context.active_object
    plate.name = "Chest_LockPlate"
    plate.rotation_euler = (0, 0, math.radians(45))
    plate.scale = (1.0, 0.3, 1.5)

    bpy.ops.object.transform_apply(
        location=False,
        rotation=True,
        scale=True,
    )

    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.bevel(
        offset=0.01,
        segments=2,
        profile=0.7,
    )
    bpy.ops.object.mode_set(mode="OBJECT")

    assign_material(plate, mat_gold)
    shade_smooth(plate)
    parts.append(plate)

    bpy.ops.mesh.primitive_cylinder_add(
        vertices=12,
        radius=0.015,
        depth=0.04,
        location=(0, front_y - 0.03, 0.55),
        rotation=(math.radians(90), 0, 0),
    )

    keyhole = bpy.context.active_object
    keyhole.name = "Chest_Keyhole"
    assign_material(keyhole, mat_wood_dark)
    shade_smooth(keyhole)
    parts.append(keyhole)

    return parts


def create_hinge(location, mat_gold, name_suffix):
    """Create one stylized barrel hinge."""
    parts = []

    barrel = create_cylinder(
        name=f"Chest_Hinge_Barrel_{name_suffix}",
        radius=0.025,
        depth=0.12,
        location=location,
        rotation=(0, math.radians(90), 0),
        vertices=12,
    )

    assign_material(barrel, mat_gold)
    shade_smooth(barrel)
    parts.append(barrel)

    for x_offset, cap_suffix in [
        (-0.06, "L"),
        (0.06, "R"),
    ]:
        bpy.ops.mesh.primitive_uv_sphere_add(
            radius=0.028,
            location=(
                location[0] + x_offset,
                location[1],
                location[2],
            ),
            segments=10,
            ring_count=6,
        )

        cap = bpy.context.active_object
        cap.name = f"Chest_Hinge_Cap_{name_suffix}_{cap_suffix}"
        assign_material(cap, mat_gold)
        shade_smooth(cap)
        parts.append(cap)

    return parts


def hollow_body_with_solidify(body, wall_thickness):
    """Delete the top face and apply a Solidify modifier safely."""
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    bpy.context.view_layer.objects.active = body

    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")

    bm = bmesh.from_edit_mesh(body.data)
    bm.faces.ensure_lookup_table()

    if not bm.faces:
        raise RuntimeError("Chest body has no faces to hollow.")

    top_face = max(
        bm.faces,
        key=lambda face: sum(vertex.co.z for vertex in face.verts)
        / max(len(face.verts), 1),
    )

    bmesh.ops.delete(
        bm,
        geom=[top_face],
        context="FACES",
    )
    bmesh.update_edit_mesh(body.data)

    # Modifier creation/application must happen in Object Mode.
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.view_layer.objects.active = body
    body.select_set(True)

    solidify = body.modifiers.new(
        name="Solidify",
        type="SOLIDIFY",
    )
    solidify.thickness = -wall_thickness
    solidify.offset = 1.0

    bpy.ops.object.modifier_apply(
        modifier=solidify.name,
    )


def build_chest():
    print("MYWAY_PROGRESS: Starting chest build")

    mat_wood = make_material(
        "Wood_Oak",
        (0.45, 0.28, 0.15),
        roughness=0.7,
    )
    mat_wood_dark = make_material(
        "Wood_Dark",
        (0.25, 0.15, 0.08),
        roughness=0.8,
    )
    mat_gold = make_material(
        "Gold",
        (0.85, 0.65, 0.2),
        roughness=0.3,
        metallic=0.9,
    )
    mat_iron = make_material(
        "Iron",
        (0.2, 0.2, 0.22),
        roughness=0.5,
        metallic=0.7,
    )

    # Target overall extent: roughly 1.4 metres.
    width = 1.4
    depth = 0.7
    body_height = 0.7
    lid_height = 0.35
    wall_thickness = 0.04

    front_y = -(depth / 2)
    back_y = depth / 2

    # ---- BODY ----
    print("MYWAY_PROGRESS: Building body")

    body = create_box(
        "Chest_Body",
        1.0,
        (0, 0, body_height / 2),
        bevel_width=0.015,
        bevel_segments=2,
    )

    body.scale = (
        width,
        depth,
        body_height,
    )

    bpy.ops.object.transform_apply(
        location=False,
        rotation=False,
        scale=True,
    )

    hollow_body_with_solidify(
        body,
        wall_thickness,
    )

    assign_material(body, mat_wood)
    shade_smooth(body)

    # ---- LID ----
    print("MYWAY_PROGRESS: Building lid")

    lid = create_lid(
        "Chest_Lid",
        width,
        lid_height,
        depth,
        (0, 0, body_height + lid_height / 2),
    )

    assign_material(lid, mat_wood)
    shade_smooth(lid)

    # Set the lid origin at the back hinge line for animation.
    bpy.ops.object.select_all(action="DESELECT")
    lid.select_set(True)
    bpy.context.view_layer.objects.active = lid
    bpy.context.scene.cursor.location = (
        0,
        back_y,
        body_height,
    )
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    bpy.context.scene.cursor.location = (0, 0, 0)
    lid.select_set(False)

    # ---- IRON BANDS ----
    print("MYWAY_PROGRESS: Adding iron bands")

    body_bands = add_iron_bands(
        body,
        mat_iron,
        [
            0.12,
            body_height - 0.12,
        ],
        thickness=0.05,
    )

    lid_bands = add_iron_bands(
        lid,
        mat_iron,
        [
            body_height + lid_height * 0.62,
        ],
        thickness=0.05,
    )

    # ---- CORNER BRACKETS ----
    print("MYWAY_PROGRESS: Adding corner brackets")

    body_brackets = add_corner_brackets(
        body,
        mat_iron,
        0.02,
        body_height - 0.02,
        bracket_width=0.06,
    )

    # ---- LOCK PLATE ----
    print("MYWAY_PROGRESS: Adding lock plate")

    lock_parts = create_lockplate(
        mat_gold,
        mat_wood_dark,
        front_y,
    )

    # ---- HINGES ----
    print("MYWAY_PROGRESS: Adding hinges")

    hinge_z = body_height
    hinge_x_offset = width / 2 - 0.15
    hinges = []

    hinges.extend(
        create_hinge(
            (
                -hinge_x_offset,
                back_y,
                hinge_z,
            ),
            mat_gold,
            "Left",
        )
    )

    hinges.extend(
        create_hinge(
            (
                hinge_x_offset,
                back_y,
                hinge_z,
            ),
            mat_gold,
            "Right",
        )
    )

    # ---- LID CLASP ----
    print("MYWAY_PROGRESS: Adding lid clasp")

    bpy.ops.mesh.primitive_cube_add(
        size=0.08,
        location=(
            0,
            front_y - 0.01,
            body_height + lid_height * 0.6,
        ),
    )

    clasp = bpy.context.active_object
    clasp.name = "Chest_Lid_Clasp"
    clasp.scale = (
        1.5,
        0.4,
        0.8,
    )

    bpy.ops.object.transform_apply(
        location=False,
        rotation=False,
        scale=True,
    )

    assign_material(clasp, mat_gold)
    shade_smooth(clasp)

    # ---- INTERIOR FLOOR ----
    print("MYWAY_PROGRESS: Adding interior floor")

    bpy.ops.mesh.primitive_cube_add(
        size=1,
        location=(0, 0, wall_thickness),
    )

    floor = bpy.context.active_object
    floor.name = "Chest_Interior_Floor"
    floor.scale = (
        width - 2 * wall_thickness,
        depth - 2 * wall_thickness,
        wall_thickness / 2,
    )

    bpy.ops.object.transform_apply(
        location=False,
        rotation=False,
        scale=True,
    )

    assign_material(floor, mat_wood_dark)
    shade_smooth(floor)

    # ---- GROUPING ----
    print("MYWAY_PROGRESS: Grouping objects")

    for child in body_bands + body_brackets + lock_parts + [floor]:
        child.parent = body

    for child in lid_bands + [clasp]:
        child.parent = lid

    # Hinges remain separate because they bridge the body and lid.

    # ---- FINAL POSITIONING ----
    print("MYWAY_PROGRESS: Finalizing position")
    bpy.context.view_layer.update()

    all_objects = (
        [body, lid]
        + body_bands
        + lid_bands
        + body_brackets
        + lock_parts
        + hinges
        + [clasp, floor]
    )

    min_z = float("inf")

    for scene_object in all_objects:
        if scene_object.type != "MESH":
            continue

        for corner in scene_object.bound_box:
            world_corner = scene_object.matrix_world @ Vector(corner)
            min_z = min(min_z, world_corner.z)

    if min_z != float("inf"):
        offset = -min_z

        # Move only root-level parts to avoid moving parented children twice.
        for scene_object in all_objects:
            if scene_object.parent is None:
                scene_object.location.z += offset

    bpy.context.view_layer.update()

    total_triangles = 0

    for scene_object in all_objects:
        if scene_object.type == "MESH":
            total_triangles += sum(
                max(len(polygon.vertices) - 2, 0)
                for polygon in scene_object.data.polygons
            )

    print(f"MYWAY_PROGRESS: Total triangles: {total_triangles}")

    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    lid.select_set(True)
    bpy.context.view_layer.objects.active = body

    print("MYWAY_PROGRESS: Build complete")
    print("MYWAY_PROGRESS: Chest_Body and Chest_Lid are animation-ready")
    print("MYWAY_PROGRESS: Lid origin is at hinge line for rotation animation")


# ============================================================
# MAIN
# ============================================================

if __name__ == "__main__":
    clear_scene()
    build_chest()

# ---------------------------------------------------------------------------
# Trusted MyWay export and preview footer.
# ---------------------------------------------------------------------------
import os as _myway_os
import math as _myway_math

_myway_output_dir = _myway_os.environ["MYWAY_BLENDER_OUTPUT_DIR"]
_myway_asset_name = _myway_os.environ.get(
    "MYWAY_BLENDER_ASSET_NAME",
    "generated_asset",
)
_myway_os.makedirs(_myway_output_dir, exist_ok=True)

def _myway_scene_meshes():
    return [
        obj for obj in bpy.context.scene.objects
        if obj.type == "MESH"
    ]

_myway_meshes = _myway_scene_meshes()
if not _myway_meshes:
    raise RuntimeError("The script completed without creating any mesh objects.")

for _myway_obj in _myway_meshes:
    _myway_obj.select_set(True)

_myway_glb_path = _myway_os.path.join(
    _myway_output_dir,
    _myway_asset_name + ".glb",
)
_myway_blend_path = _myway_os.path.join(
    _myway_output_dir,
    _myway_asset_name + ".blend",
)
_myway_preview_path = _myway_os.path.join(
    _myway_output_dir,
    "preview.png",
)

bpy.ops.wm.save_as_mainfile(filepath=_myway_blend_path)
bpy.ops.export_scene.gltf(
    filepath=_myway_glb_path,
    export_format="GLB",
    export_apply=True,
    export_animations=True,
)

# Build a simple preview camera and lights without modifying exported geometry.
_myway_min = [float("inf"), float("inf"), float("inf")]
_myway_max = [float("-inf"), float("-inf"), float("-inf")]
for _myway_obj in _myway_meshes:
    for _myway_corner in _myway_obj.bound_box:
        _myway_world = _myway_obj.matrix_world @ mathutils.Vector(_myway_corner)
        for _myway_i in range(3):
            _myway_min[_myway_i] = min(_myway_min[_myway_i], _myway_world[_myway_i])
            _myway_max[_myway_i] = max(_myway_max[_myway_i], _myway_world[_myway_i])

_myway_center = mathutils.Vector((
    (_myway_min[0] + _myway_max[0]) / 2,
    (_myway_min[1] + _myway_max[1]) / 2,
    (_myway_min[2] + _myway_max[2]) / 2,
))
_myway_extent = max(
    _myway_max[0] - _myway_min[0],
    _myway_max[1] - _myway_min[1],
    _myway_max[2] - _myway_min[2],
    0.5,
)

bpy.ops.object.camera_add(
    location=(
        _myway_center.x + _myway_extent * 1.8,
        _myway_center.y - _myway_extent * 2.2,
        _myway_center.z + _myway_extent * 1.35,
    )
)
_myway_camera = bpy.context.object
_myway_direction = _myway_center - _myway_camera.location
_myway_camera.rotation_euler = _myway_direction.to_track_quat("-Z", "Y").to_euler()
_myway_camera.data.lens = 52
bpy.context.scene.camera = _myway_camera

for _myway_location, _myway_energy, _myway_size in [
    ((_myway_center.x + _myway_extent * 1.4,
      _myway_center.y - _myway_extent * 1.2,
      _myway_center.z + _myway_extent * 2.0), 1100, _myway_extent),
    ((_myway_center.x - _myway_extent * 1.8,
      _myway_center.y - _myway_extent * 0.4,
      _myway_center.z + _myway_extent * 1.0), 700, _myway_extent * 1.2),
]:
    bpy.ops.object.light_add(type="AREA", location=_myway_location)
    _myway_light = bpy.context.object
    _myway_light.data.energy = _myway_energy
    _myway_light.data.shape = "DISK"
    _myway_light.data.size = _myway_size
    _myway_light.rotation_euler = (
        _myway_center - _myway_light.location
    ).to_track_quat("-Z", "Y").to_euler()

# Blender builds expose different Eevee identifiers. Select from the enum
# actually available in this installation rather than assuming a version name.
_myway_available_engines = {
    item.identifier
    for item in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items
}
if "BLENDER_EEVEE_NEXT" in _myway_available_engines:
    bpy.context.scene.render.engine = "BLENDER_EEVEE_NEXT"
elif "BLENDER_EEVEE" in _myway_available_engines:
    bpy.context.scene.render.engine = "BLENDER_EEVEE"
elif "BLENDER_WORKBENCH" in _myway_available_engines:
    bpy.context.scene.render.engine = "BLENDER_WORKBENCH"
elif "CYCLES" in _myway_available_engines:
    bpy.context.scene.render.engine = "CYCLES"

bpy.context.scene.render.resolution_x = 768
bpy.context.scene.render.resolution_y = 768
bpy.context.scene.render.resolution_percentage = 100
bpy.context.scene.render.image_settings.file_format = "PNG"
bpy.context.scene.render.filepath = _myway_preview_path
if bpy.context.scene.world is None:
    bpy.context.scene.world = bpy.data.worlds.new("MyWayPreviewWorld")
bpy.context.scene.world.color = (0.035, 0.045, 0.07)

# A preview is useful but must not invalidate a GLB that already exported.
try:
    bpy.ops.render.render(write_still=True)
    print("MYWAY_PREVIEW_COMPLETE:" + _myway_preview_path)
except Exception as _myway_preview_error:
    print("MYWAY_PREVIEW_WARNING:" + repr(_myway_preview_error))

print("MYWAY_ASSET_BUILD_COMPLETE:" + _myway_glb_path)
