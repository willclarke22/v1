import bpy
import mathutils
import bpy
import math
import random
from mathutils import Vector


# ============================================================
# MyWay - Open Treasure Chest with Coins
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


def ensure_object_mode():
    active = bpy.context.active_object
    if active and active.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    ensure_object_mode()
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def apply_transforms(obj, location=False, rotation=False, scale=True):
    set_active(obj)
    bpy.ops.object.transform_apply(
        location=location,
        rotation=rotation,
        scale=scale,
    )


def apply_modifier(obj, modifier):
    set_active(obj)
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def shade_smooth(obj):
    if obj.type != "MESH":
        return
    for polygon in obj.data.polygons:
        polygon.use_smooth = True


def shade_flat(obj):
    if obj.type != "MESH":
        return
    for polygon in obj.data.polygons:
        polygon.use_smooth = False


def set_origin_to_world_point(obj, world_point):
    set_active(obj)
    old_cursor = bpy.context.scene.cursor.location.copy()
    bpy.context.scene.cursor.location = world_point
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR", center="MEDIAN")
    bpy.context.scene.cursor.location = old_cursor


def set_material(obj, mat):
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)


def add_box(name, size=(1, 1, 1), location=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=2.0, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
    apply_transforms(obj, scale=True)
    return obj


def add_cylinder(
    name,
    radius=0.05,
    depth=0.1,
    vertices=20,
    location=(0, 0, 0),
    rotation=(0, 0, 0),
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


def add_uv_sphere(
    name,
    radius=0.05,
    segments=16,
    rings=8,
    location=(0, 0, 0),
):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments,
        ring_count=rings,
        radius=radius,
        location=location,
    )
    obj = bpy.context.active_object
    obj.name = name
    return obj


def add_bevel(obj, width=0.02, segments=2):
    mod = obj.modifiers.new(name="Bevel", type="BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(30)
    apply_modifier(obj, mod)


def boolean_difference(target, cutter, modifier_name="BooleanCut"):
    mod = target.modifiers.new(name=modifier_name, type="BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.object = cutter
    apply_modifier(target, mod)
    bpy.data.objects.remove(cutter, do_unlink=True)


def join_objects(objects, name):
    if not objects:
        raise ValueError("join_objects requires at least one object.")
    ensure_object_mode()
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    joined = bpy.context.active_object
    joined.name = name
    return joined


def make_material(name, base_color, roughness=0.5, metallic=0.0, specular=0.5):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*base_color, 1.0)
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
        if "Specular IOR Level" in bsdf.inputs:
            bsdf.inputs["Specular IOR Level"].default_value = specular
        elif "Specular" in bsdf.inputs:
            bsdf.inputs["Specular"].default_value = specular
    return mat


def build_coin_pile(
    interior_width,
    interior_depth,
    floor_z,
    wall_thickness,
    mat_gold,
):
    print("MYWAY_PROGRESS: building coin pile")

    random.seed(17)
    coins = []
    coin_radius = 0.055
    coin_thickness = 0.014
    max_coins = 95

    count = 0
    layers = 5

    # Main mound
    for layer in range(layers):
        layer_height = floor_z + coin_thickness / 2 + layer * (coin_thickness * 0.85)
        a = interior_width * (0.42 - 0.05 * layer)
        b = interior_depth * (0.30 - 0.04 * layer)
        attempts = 35

        for _ in range(attempts):
            if count >= max_coins:
                break

            x = random.uniform(-a, a)
            y = random.uniform(-b, b)

            if (x * x) / (a * a + 1e-6) + (y * y) / (b * b + 1e-6) > 1.0:
                continue

            z = layer_height + random.uniform(-0.004, 0.004)
            rot_z = random.uniform(0, math.tau)

            coin = add_cylinder(
                name=f"Coin_{count:03d}",
                radius=coin_radius,
                depth=coin_thickness,
                vertices=18,
                location=(x, y, z),
                rotation=(0, 0, rot_z),
            )
            set_material(coin, mat_gold)
            shade_flat(coin)
            coins.append(coin)
            count += 1

    # A few leaning / visible accent coins near the back and sides
    accent_positions = [
        (-interior_width * 0.22, interior_depth * 0.18, floor_z + 0.09),
        (interior_width * 0.18, interior_depth * 0.16, floor_z + 0.10),
        (-interior_width * 0.10, -interior_depth * 0.16, floor_z + 0.08),
        (interior_width * 0.24, -interior_depth * 0.10, floor_z + 0.095),
    ]

    for px, py, pz in accent_positions:
        if count >= max_coins:
            break

        coin = add_cylinder(
            name=f"CoinAccent_{count:03d}",
            radius=coin_radius,
            depth=coin_thickness,
            vertices=18,
            location=(px, py, pz),
            rotation=(math.radians(76 + random.uniform(-10, 10)), 0, random.uniform(-0.5, 0.5)),
        )
        set_material(coin, mat_gold)
        shade_flat(coin)
        coins.append(coin)
        count += 1

    joined = join_objects(coins, "GoldCoins")
    return joined


def build_treasure_chest():
    print("MYWAY_PROGRESS: starting treasure chest build")
    clear_scene()

    # --------------------------------------------------------
    # Materials
    # --------------------------------------------------------
    mat_wood = make_material("Wood", (0.42, 0.24, 0.11), roughness=0.72)
    mat_wood_dark = make_material("WoodDark", (0.24, 0.13, 0.06), roughness=0.84)
    mat_gold = make_material("Gold", (0.95, 0.76, 0.24), roughness=0.25, metallic=1.0, specular=1.0)
    mat_brass = make_material("Brass", (0.76, 0.58, 0.18), roughness=0.38, metallic=1.0, specular=0.85)
    mat_shadow = make_material("ShadowInterior", (0.14, 0.08, 0.04), roughness=0.92)

    # --------------------------------------------------------
    # Dimensions
    # --------------------------------------------------------
    width = 1.45
    depth = 0.95
    body_height = 0.78
    wall = 0.07
    lid_height = 0.34
    open_angle = math.radians(-108)

    interior_width = width - 2 * wall
    interior_depth = depth - 2 * wall
    interior_floor_z = wall * 0.55

    # --------------------------------------------------------
    # Body
    # --------------------------------------------------------
    print("MYWAY_PROGRESS: building chest body")

    body_outer = add_box(
        "ChestBody_Outer",
        size=(width, depth, body_height),
        location=(0, 0, body_height / 2),
    )
    add_bevel(body_outer, width=0.032, segments=3)
    shade_flat(body_outer)
    set_material(body_outer, mat_wood)

    body_inner = add_box(
        "ChestBody_InnerCutter",
        size=(width - 2 * wall, depth - 2 * wall, body_height),
        location=(0, 0, body_height / 2 + wall * 0.55),
    )
    boolean_difference(body_outer, body_inner, modifier_name="BodyHollow")

    body_parts = [body_outer]

    # Dark wood bands
    band_zs = [0.13, body_height - 0.13]
    for index, z in enumerate(band_zs, start=1):
        band = add_box(
            f"ChestBody_Band_{index:02d}",
            size=(width + 0.02, depth + 0.02, 0.095),
            location=(0, 0, z),
        )
        add_bevel(band, width=0.010, segments=2)
        shade_flat(band)
        set_material(band, mat_wood_dark)
        body_parts.append(band)

    # Front lock plate
    lock_plate = add_box(
        "Chest_LockPlate",
        size=(0.22, 0.03, 0.34),
        location=(0, -(depth / 2) - 0.015, body_height * 0.52),
    )
    add_bevel(lock_plate, width=0.008, segments=2)
    shade_flat(lock_plate)
    set_material(lock_plate, mat_brass)
    body_parts.append(lock_plate)

    # Decorative keyhole
    keyhole_top = add_uv_sphere(
        "Chest_KeyholeTop",
        radius=0.028,
        segments=12,
        rings=8,
        location=(0, -(depth / 2) - 0.028, body_height * 0.57),
    )
    keyhole_stem = add_box(
        "Chest_KeyholeStem",
        size=(0.028, 0.018, 0.070),
        location=(0, -(depth / 2) - 0.028, body_height * 0.50),
    )
    set_material(keyhole_top, mat_shadow)
    set_material(keyhole_stem, mat_shadow)
    body_parts.extend([keyhole_top, keyhole_stem])

    chest_body = join_objects(body_parts, "ChestBody")
    chest_body.location = (0, 0, 0)

    # --------------------------------------------------------
    # Lid
    # --------------------------------------------------------
    print("MYWAY_PROGRESS: building lid")

    lid_outer = add_box(
        "ChestLid_Outer",
        size=(width, depth, lid_height),
        location=(0, 0, body_height + lid_height / 2 - 0.01),
    )
    add_bevel(lid_outer, width=0.045, segments=4)
    shade_flat(lid_outer)
    set_material(lid_outer, mat_wood)

    lid_inner = add_box(
        "ChestLid_InnerCutter",
        size=(width - 2 * wall, depth - wall * 1.1, lid_height - wall * 0.55),
        location=(0, -wall * 0.22, body_height + lid_height / 2 - 0.005),
    )
    boolean_difference(lid_outer, lid_inner, modifier_name="LidHollow")

    lid_parts = [lid_outer]

    # Lid dark bands
    lid_band_y_positions = [-(depth * 0.22), depth * 0.22]
    for index, y in enumerate(lid_band_y_positions, start=1):
        band = add_box(
            f"ChestLid_Band_{index:02d}",
            size=(width + 0.02, 0.10, lid_height + 0.01),
            location=(0, y, body_height + lid_height / 2),
        )
        add_bevel(band, width=0.010, segments=2)
        shade_flat(band)
        set_material(band, mat_wood_dark)
        lid_parts.append(band)

    # Front clasp piece on lid
    clasp = add_box(
        "ChestLid_Clasp",
        size=(0.16, 0.028, 0.16),
        location=(0, -(depth / 2) - 0.013, body_height + 0.085),
    )
    add_bevel(clasp, width=0.008, segments=2)
    shade_flat(clasp)
    set_material(clasp, mat_brass)
    lid_parts.append(clasp)

    chest_lid = join_objects(lid_parts, "ChestLid")

    # Put lid origin on hinge line, then rotate open
    hinge_origin = Vector((0, depth / 2, body_height))
    set_origin_to_world_point(chest_lid, hinge_origin)
    chest_lid.rotation_euler = (open_angle, 0, 0)

    # --------------------------------------------------------
    # Hinges
    # --------------------------------------------------------
    print("MYWAY_PROGRESS: building hinges")

    hinge_objects = []
    hinge_xs = [-width * 0.28, width * 0.28]

    for index, hx in enumerate(hinge_xs, start=1):
        barrel = add_cylinder(
            f"Chest_HingeBarrel_{index:02d}",
            radius=0.035,
            depth=0.15,
            vertices=20,
            location=(hx, depth / 2 + 0.005, body_height + 0.01),
            rotation=(0, math.radians(90), 0),
        )
        set_material(barrel, mat_gold)
        shade_smooth(barrel)
        hinge_objects.append(barrel)

        body_plate = add_box(
            f"Chest_HingeBodyPlate_{index:02d}",
            size=(0.14, 0.028, 0.10),
            location=(hx, depth / 2 - 0.010, body_height - 0.05),
        )
        add_bevel(body_plate, width=0.006, segments=2)
        shade_flat(body_plate)
        set_material(body_plate, mat_brass)
        hinge_objects.append(body_plate)

        lid_plate = add_box(
            f"Chest_HingeLidPlate_{index:02d}",
            size=(0.14, 0.028, 0.10),
            location=(hx, depth / 2 - 0.010, body_height + 0.05),
        )
        add_bevel(lid_plate, width=0.006, segments=2)
        shade_flat(lid_plate)
        set_material(lid_plate, mat_brass)
        lid_plate.parent = chest_lid
        hinge_objects.append(lid_plate)

    # --------------------------------------------------------
    # Coins
    # --------------------------------------------------------
    coins = build_coin_pile(
        interior_width=interior_width,
        interior_depth=interior_depth,
        floor_z=interior_floor_z,
        wall_thickness=wall,
        mat_gold=mat_gold,
    )

    # --------------------------------------------------------
    # Root and parenting
    # --------------------------------------------------------
    print("MYWAY_PROGRESS: parenting objects")

    bpy.ops.object.empty_add(type="PLAIN_AXES", location=(0, 0, 0))
    root = bpy.context.active_object
    root.name = "TreasureChest"

    chest_body.parent = root
    chest_lid.parent = root

    for obj in hinge_objects:
        if obj.parent is None:
            obj.parent = root

    coins.parent = chest_body

    # --------------------------------------------------------
    # Final polish
    # --------------------------------------------------------
    print("MYWAY_PROGRESS: finalizing")

    bpy.context.view_layer.update()

    total_tris = 0
    for obj in bpy.data.objects:
        if obj.type == "MESH":
            total_tris += sum(max(len(p.vertices) - 2, 0) for p in obj.data.polygons)

    print(f"MYWAY_PROGRESS: total triangles: {total_tris}")
    print("MYWAY_PROGRESS: treasure chest build complete")
    print("MYWAY_PROGRESS: lid is open and coins are visible")


if __name__ == "__main__":
    build_treasure_chest()

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
