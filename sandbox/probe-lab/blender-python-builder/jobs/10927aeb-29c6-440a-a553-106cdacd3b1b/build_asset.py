import bpy
import mathutils
import bpy
import bmesh
import math
import random
from mathutils import Vector, Matrix, Euler

# -----------------------------------------------------------------------------
# Setup
# -----------------------------------------------------------------------------

def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for block in list(bpy.data.meshes):
        bpy.data.meshes.remove(block)
    for block in list(bpy.data.materials):
        bpy.data.materials.remove(block)
    for block in list(bpy.data.curves):
        bpy.data.curves.remove(block)

def setup_render():
    scene = bpy.context.scene
    try:
        scene.render.engine = 'BLENDER_EEVEE_NEXT'
    except Exception:
        try:
            scene.render.engine = 'BLENDER_EEVEE'
        except Exception:
            pass

def make_material(name, base_color, roughness=0.6, metallic=0.0, specular=0.5):
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

# -----------------------------------------------------------------------------
# Geometry Helpers
# -----------------------------------------------------------------------------

def add_cube(name, size=(1,1,1), location=(0,0,0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return obj

def add_cylinder(name, radius=0.5, depth=1.0, vertices=32, location=(0,0,0), rotation=(0,0,0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    return obj

def add_torus(name, major_radius=1.0, minor_radius=0.1, major_segments=32, minor_segments=16, location=(0,0,0), rotation=(0,0,0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major_radius, minor_radius=minor_radius, major_segments=major_segments, minor_segments=minor_segments, location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    return obj

def add_uv_sphere(name, radius=0.5, segments=32, rings=16, location=(0,0,0), scale=(1,1,1)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=radius, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return obj

def apply_modifier(obj, mod):
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)

def add_bevel(obj, width=0.02, segments=2):
    mod = obj.modifiers.new(name="Bevel", type='BEVEL')
    mod.width = width
    mod.segments = segments
    mod.limit_method = 'ANGLE'
    mod.angle_limit = math.radians(30)
    apply_modifier(obj, mod)

def shade_smooth(obj):
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_smooth()

def shade_flat(obj):
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_flat()

def set_material(obj, mat):
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)

def join_objects(objects, name):
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    joined = bpy.context.active_object
    joined.name = name
    return joined

# -----------------------------------------------------------------------------
# Build Chest
# -----------------------------------------------------------------------------

def build_treasure_chest():
    print("MYWAY_PROGRESS: Starting treasure chest build")
    clear_scene()
    setup_render()

    # Materials
    mat_wood = make_material("Wood", (0.45, 0.25, 0.12), roughness=0.7)
    mat_wood_dark = make_material("WoodDark", (0.25, 0.12, 0.05), roughness=0.8)
    mat_gold = make_material("Gold", (1.0, 0.78, 0.25), roughness=0.25, metallic=1.0, specular=1.0)
    mat_gold_dark = make_material("GoldDark", (0.8, 0.55, 0.15), roughness=0.4, metallic=1.0, specular=0.8)
    mat_interior = make_material("Interior", (0.15, 0.08, 0.04), roughness=0.9)

    # Dimensions (overall ~2m)
    W = 1.6  # Width (X)
    D = 1.0  # Depth (Y)
    H = 0.8  # Body Height (Z)
    T = 0.08 # Wall Thickness
    LID_ANGLE = math.radians(110)

    # -------------------------------------------------------------------------
    # Chest Body
    # -------------------------------------------------------------------------
    print("MYWAY_PROGRESS: Building chest body")
    body_parts = []

    # Outer shell
    outer = add_cube("ChestBody_Outer", size=(W, D, H), location=(0, 0, H/2))
    add_bevel(outer, width=0.04, segments=3)
    shade_flat(outer)
    set_material(outer, mat_wood)
    body_parts.append(outer)

    # Interior cavity
    inner = add_cube("ChestBody_Inner", size=(W - 2*T, D - 2*T, H - T), location=(0, 0, H/2 + T/2))
    bpy.context.view_layer.objects.active = outer
    mod = outer.modifiers.new(name="Carve", type='BOOLEAN')
    mod.object = inner
    mod.operation = 'DIFFERENCE'
    apply_modifier(outer, mod)
    bpy.data.objects.remove(inner, do_unlink=True)

    # Wood Plank Details (Horizontal Bands)
    band_h = 0.12
    for z in [0.15, H - 0.15]:
        band = add_cube(f"Band_{z}", size=(W + 0.02, D + 0.02, band_h), location=(0, 0, z + band_h/2))
        add_bevel(band, width=0.015, segments=2)
        shade_flat(band)
        set_material(band, mat_wood_dark)
        body_parts.append(band)

    # Iron Corner Brackets
    bracket_size = 0.15
    bracket_thick = 0.05
    for x in [-W/2 + bracket_size/2, W/2 - bracket_size/2]:
        for y in [-D/2 + bracket_size/2, D/2 - bracket_size/2]:
            # Bottom brackets
            br = add_cube(f"Bracket_B_{x}_{y}", size=(bracket_size, bracket_size, bracket_size*1.5), location=(x, y, bracket_size*0.75))
            add_bevel(br, width=0.01, segments=2)
            shade_flat(br)
            set_material(br, mat_gold_dark)
            body_parts.append(br)

    # Lock Plate (Front)
    lock_plate = add_cube("LockPlate", size=(0.4, 0.06, 0.5), location=(0, -D/2 - 0.01, H/2))
    add_bevel(lock_plate, width=0.01, segments=2)
    shade_flat(lock_plate)
    set_material(lock_plate, mat_gold_dark)
    body_parts.append(lock_plate)

    # Lock Keyhole
    keyhole = add_cube("Keyhole", size=(0.08, 0.08, 0.15), location=(0, -D/2 - 0.02, H/2))
    set_material(keyhole, mat_interior)
    # Carve keyhole into lock plate
    bpy.context.view_layer.objects.active = lock_plate
    mod = lock_plate.modifiers.new(name="Keyhole", type='BOOLEAN')
    mod.object = keyhole
    mod.operation = 'DIFFERENCE'
    apply_modifier(lock_plate, mod)
    bpy.data.objects.remove(keyhole, do_unlink=True)

    # Join body parts
    chest_body = join_objects(body_parts, "ChestBody")
    chest_body.location = (0, 0, 0)

    # -------------------------------------------------------------------------
    # Lid
    # -------------------------------------------------------------------------
    print("MYWAY_PROGRESS: Building lid")
    lid_parts = []
    lid_h = 0.4
    lid_w = W
    lid_d = D

    # Lid origin at back hinge (y = D/2)
    lid_outer = add_cube("Lid_Outer", size=(lid_w, lid_d, lid_h), location=(0, -lid_d/2, lid_h/2))
    add_bevel(lid_outer, width=0.04, segments=3)
    shade_flat(lid_outer)
    set_material(lid_outer, mat_wood)
    lid_parts.append(lid_outer)

    # Lid Inner Carve
    lid_inner = add_cube("Lid_Inner", size=(lid_w - 2*T, lid_d - T, lid_h - T), location=(0, -lid_d/2 + T/2, lid_h/2 + T/2))
    bpy.context.view_layer.objects.active = lid_outer
    mod = lid_outer.modifiers.new(name="Carve", type='BOOLEAN')
    mod.object = lid_inner
    mod.operation = 'DIFFERENCE'
    apply_modifier(lid_outer, mod)
    bpy.data.objects.remove(lid_inner, do_unlink=True)

    # Lid Bands
    for z in [0.1, lid_h - 0.1]:
        band = add_cube(f"LidBand_{z}", size=(lid_w + 0.02, lid_d + 0.02, 0.1), location=(0, -lid_d/2, z + 0.05))
        add_bevel(band, width=0.015, segments=2)
        shade_flat(band)
        set_material(band, mat_wood_dark)
        lid_parts.append(band)

    # Lid Top Brackets
    for x in [-lid_w/2 + bracket_size/2, lid_w/2 - bracket_size/2]:
        for y in [-lid_d/2 + bracket_size/2, lid_d/2 - bracket_size/2]:
            br = add_cube(f"LidBracket_{x}_{y}", size=(bracket_size, bracket_size, bracket_size*1.5), location=(x, y - lid_d/2, lid_h - bracket_size*0.75))
            add_bevel(br, width=0.01, segments=2)
            shade_flat(br)
            set_material(br, mat_gold_dark)
            lid_parts.append(br)

    # Join lid parts
    lid = join_objects(lid_parts, "ChestLid")
    # Move origin to hinge
    bpy.context.scene.cursor.location = (0, 0, 0)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    # Rotate lid open
    lid.rotation_euler = (LID_ANGLE, 0, 0)

    # -------------------------------------------------------------------------
    # Hinges
    # -------------------------------------------------------------------------
    print("MYWAY_PROGRESS: Building hinges")
    hinge_parts = []
    hinge_y = D/2
    hinge_z = H
    for x in [-W/2 + 0.25, W/2 - 0.25]:
        # Hinge cylinder
        h = add_cylinder(f"Hinge_{x}", radius=0.06, depth=0.2, vertices=24, location=(x, hinge_y, hinge_z), rotation=(0, math.radians(90), 0))
        shade_smooth(h)
        set_material(h, mat_gold)
        hinge_parts.append(h)
        # Hinge knuckles
        for kx in [-0.06, 0.06]:
            kn = add_cylinder(f"HingeKnuckle_{x}_{kx}", radius=0.07, depth=0.04, vertices=24, location=(x + kx, hinge_y, hinge_z), rotation=(0, math.radians(90), 0))
            shade_smooth(kn)
            set_material(kn, mat_gold)
            hinge_parts.append(kn)
        # Hinge plates (attached to body and lid)
        plate_body = add_cube(f"HingePlateBody_{x}", size=(0.15, 0.1, 0.02), location=(x, hinge_y + 0.05, hinge_z - 0.01))
        set_material(plate_body, mat_gold_dark)
        hinge_parts.append(plate_body)
        # Lid plate (rotated with lid)
        plate_lid = add_cube(f"HingePlateLid_{x}", size=(0.15, 0.1, 0.02), location=(x, hinge_y - 0.05, hinge_z + 0.01))
        set_material(plate_lid, mat_gold_dark)
        # Rotate lid plate around hinge
        mat_rot = Matrix.Rotation(LID_ANGLE, 4, 'X')
        mat_loc = Matrix.Translation((x, hinge_y, hinge_z))
        plate_lid.matrix_world = mat_loc @ mat_rot @ Matrix.Translation((0, -0.05, 0.01)) @ Matrix.Translation((-x, -hinge_y, -hinge_z))
        hinge_parts.append(plate_lid)

    # -------------------------------------------------------------------------
    # Gold Coins
    # -------------------------------------------------------------------------
    print("MYWAY_PROGRESS: Building gold coins")
    coin_parts = []
    coin_radius = 0.12
    coin_thickness = 0.02
    interior_w = W - 2*T
    interior_d = D - 2*T
    interior_h = H - T

    random.seed(42)
    coin_count = 0
    max_coins = 60

    # Base layer of coins
    for i in range(8):
        for j in range(5):
            if coin_count >= max_coins:
                break
            x = -interior_w/2 + 0.15 + i * (interior_w - 0.3) / 7
            y = -interior_d/2 + 0.15 + j * (interior_d - 0.3) / 4
            z = T + coin_thickness/2 + random.uniform(0, 0.01)
            rot_z = random.uniform(0, math.pi*2)
            coin = add_cylinder(f"Coin_{coin_count}", radius=coin_radius, depth=coin_thickness, vertices=20, location=(x, y, z), rotation=(0, 0, rot_z))
            shade_flat(coin)
            set_material(coin, mat_gold)
            coin_parts.append(coin)
            coin_count += 1

    # Stacked coins
    for i in range(15):
        if coin_count >= max_coins:
            break
        x = random.uniform(-interior_w/2 + 0.2, interior_w/2 - 0.2)
        y = random.uniform(-interior_d/2 + 0.2, interior_d/2 - 0.2)
        z = T + coin_thickness/2 + random.uniform(0.03, 0.1)
        rot_z = random.uniform(0, math.pi*2)
        coin = add_cylinder(f"Coin_Stack_{coin_count}", radius=coin_radius, depth=coin_thickness, vertices=20, location=(x, y, z), rotation=(0, 0, rot_z))
        shade_flat(coin)
        set_material(coin, mat_gold)
        coin_parts.append(coin)
        coin_count += 1

    # Standing coins (leaning against back)
    for i in range(10):
        if coin_count >= max_coins:
            break
        x = random.uniform(-interior_w/2 + 0.2, interior_w/2 - 0.2)
        y = random.uniform(interior_d/4, interior_d/2 - 0.15)
        z = T + coin_radius * 0.8
        rot_x = math.radians(90) + random.uniform(-0.2, 0.2)
        rot_z = random.uniform(0, math.pi*2)
        coin = add_cylinder(f"Coin_Stand_{coin_count}", radius=coin_radius, depth=coin_thickness, vertices=20, location=(x, y, z), rotation=(rot_x, 0, rot_z))
        shade_flat(coin)
        set_material(coin, mat_gold)
        coin_parts.append(coin)
        coin_count += 1

    # Join coins
    if coin_parts:
        coins = join_objects(coin_parts, "GoldCoins")
    else:
        coins = None

    # -------------------------------------------------------------------------
    # Parenting
    # -------------------------------------------------------------------------
    print("MYWAY_PROGRESS: Parenting objects")
    # Create empty as root
    bpy.ops.object.empty_add(type='PLAIN_AXES', location=(0, 0, 0))
    root = bpy.context.active_object
    root.name = "TreasureChest"

    # Parent body to root
    bpy.ops.object.select_all(action='DESELECT')
    chest_body.select_set(True)
    chest_body.parent = root

    # Parent lid to root
    bpy.ops.object.select_all(action='DESELECT')
    lid.select_set(True)
    lid.parent = root

    # Parent hinges to root
    for h in hinge_parts:
        bpy.ops.object.select_all(action='DESELECT')
        h.select_set(True)
        h.parent = root

    # Parent coins to body (so they stay inside if body moves)
    if coins:
        bpy.ops.object.select_all(action='DESELECT')
        coins.select_set(True)
        coins.parent = chest_body

    # -------------------------------------------------------------------------
    # Final Adjustments
    # -------------------------------------------------------------------------
    print("MYWAY_PROGRESS: Finalizing")
    # Ensure lowest point is at Z=0
    bpy.context.view_layer.update()
    min_z = min(obj.location.z for obj in [chest_body, lid] if obj)
    # Body is already at 0, lid is rotated up so it's higher.

    # Print stats
    total_tris = 0
    for obj in bpy.data.objects:
        if obj.type == 'MESH':
            total_tris += sum(len(p.vertices) - 2 for p in obj.data.polygons)
    print(f"MYWAY_PROGRESS: Total triangles: {total_tris}")
    print("MYWAY_PROGRESS: Treasure chest build complete")

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
