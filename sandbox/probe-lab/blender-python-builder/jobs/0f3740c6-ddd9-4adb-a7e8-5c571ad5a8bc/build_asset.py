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
    bpy.ops.object.select_all(action='SELECT')
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
    for p in obj.data.polygons:
        p.use_smooth = True

def apply_transforms(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.select_set(False)

def create_box(name, size, location, bevel_width=0.02, bevel_segments=2):
    bpy.ops.mesh.primitive_cube_add(size=size, location=location)
    obj = bpy.context.active_object
    obj.name = name
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.bevel(offset=bevel_width, segments=bevel_segments, profile=0.7)
    bpy.ops.object.mode_set(mode='OBJECT')
    return obj

def create_cylinder(name, radius, depth, location, rotation, vertices=16):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=depth,
        location=location, rotation=rotation
    )
    obj = bpy.context.active_object
    obj.name = name
    return obj

def create_torus(name, major_radius, minor_radius, location, rotation, major_segments=16, minor_segments=8):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius, minor_radius=minor_radius,
        major_segments=major_segments, minor_segments=minor_segments,
        location=location, rotation=rotation
    )
    obj = bpy.context.active_object
    obj.name = name
    return obj

def create_lid(name, width, height, depth, location):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (width, depth, height)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    
    # Edit to make the top rounded
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    
    # Select top edges (highest Z)
    for e in bm.edges:
        if all(v.co.z > 0.01 for v in e.verts):
            e.select = True
        else:
            e.select = False
    
    bmesh.update_edit_mesh(obj.data)
    bpy.ops.mesh.bevel(offset=height * 0.45, segments=4, profile=0.55)
    
    # Select side edges (along Y) on the top half to round the top
    for e in bm.edges:
        is_top = all(v.co.z > 0.01 for v in e.verts)
        is_side = abs(e.verts[0].co.y - e.verts[1].co.y) < 0.01
        if is_top and is_side:
            e.select = True
        else:
            e.select = False
    
    bmesh.update_edit_mesh(obj.data)
    bpy.ops.mesh.bevel(offset=width * 0.08, segments=3, profile=0.6)
    
    bpy.ops.object.mode_set(mode='OBJECT')
    return obj

def add_iron_bands(obj, mat, z_positions, thickness=0.04, inset=0.0):
    """Add horizontal iron bands around the chest body"""
    bbox = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    min_x = min(v.x for v in bbox)
    max_x = max(v.x for v in bbox)
    min_y = min(v.y for v in bbox)
    max_y = max(v.y for v in bbox)
    width = max_x - min_x
    depth = max_y - min_y
    
    bands = []
    for z in z_positions:
        # Create a thin box slightly larger than the chest cross-section
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, z))
        band = bpy.context.active_object
        band.name = f"{obj.name}_Band_{z:.2f}"
        band.scale = (width + 0.02, depth + 0.02, thickness)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        assign_material(band, mat)
        shade_smooth(band)
        bands.append(band)
    return bands

def add_corner_brackets(obj, mat, z_bottom, z_top, bracket_width=0.08):
    """Add L-shaped corner brackets to the chest"""
    bbox = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    min_x = min(v.x for v in bbox)
    max_x = max(v.x for v in bbox)
    min_y = min(v.y for v in bbox)
    max_y = max(v.y for v in bbox)
    
    brackets = []
    corners = [
        (min_x, min_y, "FL"),
        (max_x, min_y, "FR"),
        (min_x, max_y, "BL"),
        (max_x, max_y, "BR"),
    ]
    
    for x, y, label in corners:
        # Vertical bracket strip
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, (z_bottom + z_top) / 2))
        bracket = bpy.context.active_object
        bracket.name = f"{obj.name}_Bracket_{label}"
        bracket.scale = (bracket_width, bracket_width, z_top - z_bottom)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        assign_material(bracket, mat)
        shade_smooth(bracket)
        brackets.append(bracket)
    
    return brackets

def create_lockplate(mat_gold, mat_wood_dark):
    """Create the front lock plate and keyhole"""
    parts = []
    
    # Lock plate (diamond shape)
    bpy.ops.mesh.primitive_cube_add(size=0.12, location=(0, -0.41, 0.55))
    plate = bpy.context.active_object
    plate.name = "Chest_LockPlate"
    plate.rotation_euler = (0, 0, math.radians(45))
    plate.scale = (1.0, 0.3, 1.5)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    
    # Bevel the plate
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.bevel(offset=0.01, segments=2, profile=0.7)
    bpy.ops.object.mode_set(mode='OBJECT')
    assign_material(plate, mat_gold)
    shade_smooth(plate)
    parts.append(plate)
    
    # Keyhole (small dark cylinder)
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=12, radius=0.015, depth=0.04,
        location=(0, -0.43, 0.55), rotation=(math.radians(90), 0, 0)
    )
    keyhole = bpy.context.active_object
    keyhole.name = "Chest_Keyhole"
    assign_material(keyhole, mat_wood_dark)
    shade_smooth(keyhole)
    parts.append(keyhole)
    
    return parts

def create_hinge(location, mat_gold):
    """Create a single barrel hinge at the given location"""
    parts = []
    
    # Hinge barrel (cylinder along X axis)
    barrel = create_cylinder(
        "Chest_Hinge_Barrel",
        radius=0.025, depth=0.12,
        location=location, rotation=(0, math.radians(90), 0),
        vertices=12
    )
    assign_material(barrel, mat_gold)
    shade_smooth(barrel)
    parts.append(barrel)
    
    # Hinge end caps (small spheres)
    for x_offset in [-0.06, 0.06]:
        bpy.ops.mesh.primitive_uv_sphere_add(
            radius=0.028, location=(location[0] + x_offset, location[1], location[2]),
            segments=10, ring_count=6
        )
        cap = bpy.context.active_object
        cap.name = f"Chest_Hinge_Cap_{'L' if x_offset < 0 else 'R'}"
        assign_material(cap, mat_gold)
        shade_smooth(cap)
        parts.append(cap)
    
    return parts

def build_chest():
    print("MYWAY_PROGRESS: Starting chest build")
    
    # Materials
    mat_wood = make_material("Wood_Oak", (0.45, 0.28, 0.15), roughness=0.7)
    mat_wood_dark = make_material("Wood_Dark", (0.25, 0.15, 0.08), roughness=0.8)
    mat_gold = make_material("Gold", (0.85, 0.65, 0.2), roughness=0.3, metallic=0.9)
    mat_iron = make_material("Iron", (0.2, 0.2, 0.22), roughness=0.5, metallic=0.7)
    
    # Dimensions (target ~2m extent)
    W = 1.4   # X width
    D = 0.7   # Y depth
    BH = 0.7  # Body height
    LH = 0.35  # Lid height
    WT = 0.04  # Wall thickness
    
    # ---- BODY ----
    print("MYWAY_PROGRESS: Building body")
    body = create_box("Chest_Body", 1.0, (0, 0, BH / 2), bevel_width=0.015, bevel_segments=2)
    body.scale = (W, D, BH)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    
    # Hollow out the body
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.normals_make_consistent(inside=False)
    
    bm = bmesh.from_edit_mesh(body.data)
    bm.faces.ensure_lookup_table()
    
    # Delete top face
    for f in bm.faces:
        if all(v.co.z > BH / 2 - 0.01 for v in f.verts):
            bm.faces.remove(f)
    
    bmesh.update_edit_mesh(body.data)
    
    # Solidify to create wall thickness
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.normals_make_consistent(inside=False)
    solidify = body.modifiers.new(name="Solidify", type='SOLIDIFY')
    solidify.thickness = -WT
    solidify.offset = 1.0
    bpy.ops.object.modifier_apply(modifier="Solidify")
    
    bpy.ops.object.mode_set(mode='OBJECT')
    assign_material(body, mat_wood)
    shade_smooth(body)
    
    # ---- LID ----
    print("MYWAY_PROGRESS: Building lid")
    lid = create_lid("Chest_Lid", W, LH, D, (0, 0, BH + LH / 2))
    assign_material(lid, mat_wood)
    shade_smooth(lid)
    
    # Set lid origin to the back hinge edge for animation
    bpy.context.view_layer.objects.active = lid
    lid.select_set(True)
    # Place 3D cursor at back-top edge of body (hinge line)
    bpy.context.scene.cursor.location = (0, D / 2, BH)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    bpy.context.scene.cursor.location = (0, 0, 0)
    lid.select_set(False)
    
    # ---- IRON BANDS ----
    print("MYWAY_PROGRESS: Adding iron bands")
    bands = add_iron_bands(body, mat_iron, [0.12, BH - 0.12], thickness=0.05)
    lid_band_z = BH + LH - 0.08
    lid_band = add_iron_bands(lid, mat_iron, [lid_band_z - BH], thickness=0.05)
    
    # ---- CORNER BRACKETS ----
    print("MYWAY_PROGRESS: Adding corner brackets")
    brackets_body = add_corner_brackets(body, mat_iron, 0.02, BH - 0.02, bracket_width=0.06)
    
    # ---- LOCK PLATE ----
    print("MYWAY_PROGRESS: Adding lock plate")
    lock_parts = create_lockplate(mat_gold, mat_wood_dark)
    
    # ---- HINGES ----
    print("MYWAY_PROGRESS: Adding hinges")
    hinge_y = D / 2
    hinge_z = BH
    hinge_x_offset = W / 2 - 0.15
    hinges = []
    hinges.extend(create_hinge((-hinge_x_offset, hinge_y, hinge_z), mat_gold))
    hinges.extend(create_hinge((hinge_x_offset, hinge_y, hinge_z), mat_gold))
    
    # ---- LID LATCH (small gold clasp on front of lid) ----
    print("MYWAY_PROGRESS: Adding lid clasp")
    bpy.ops.mesh.primitive_cube_add(size=0.08, location=(0, -D / 2 - 0.01, BH + LH * 0.6))
    clasp = bpy.context.active_object
    clasp.name = "Chest_Lid_Clasp"
    clasp.scale = (1.5, 0.4, 0.8)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign_material(clasp, mat_gold)
    shade_smooth(clasp)
    
    # ---- INTERIOR FLOOR ----
    print("MYWAY_PROGRESS: Adding interior floor")
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, WT))
    floor = bpy.context.active_object
    floor.name = "Chest_Interior_Floor"
    floor.scale = (W - 2 * WT, D - 2 * WT, WT / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign_material(floor, mat_wood_dark)
    shade_smooth(floor)
    
    # ---- GROUPING ----
    print("MYWAY_PROGRESS: Grouping objects")
    
    # Parent bands and brackets to body
    for obj in bands + brackets_body + lock_parts + [floor]:
        obj.parent = body
    
    # Parent lid elements to lid
    for obj in lid_band + [clasp]:
        obj.parent = lid
    
    # Hinges are separate (they bridge body and lid)
    # In a real animation, hinges would stay at the pivot line
    
    # ---- FINAL POSITIONING ----
    # Ensure lowest point is at Z=0
    print("MYWAY_PROGRESS: Finalizing position")
    bpy.context.view_layer.update()
    
    # Check all objects for minimum Z
    min_z = float('inf')
    all_objs = [body, lid] + bands + lid_band + brackets_body + lock_parts + hinges + [clasp, floor]
    for obj in all_objs:
        for corner in obj.bound_box:
            world_corner = obj.matrix_world @ Vector(corner)
            min_z = min(min_z, world_corner.z)
    
    offset = -min_z
    for obj in all_objs:
        obj.location.z += offset
    
    # Print triangle count
    total_tris = 0
    for obj in all_objs:
        if obj.type == 'MESH':
            total_tris += sum(len(p.vertices) - 2 for p in obj.data.polygons)
    print(f"MYWAY_PROGRESS: Total triangles: {total_tris}")
    
    # Select the main parts for easy access
    bpy.ops.object.select_all(action='DESELECT')
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
