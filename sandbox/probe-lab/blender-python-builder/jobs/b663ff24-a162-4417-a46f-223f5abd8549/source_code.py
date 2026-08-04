import bpy
import bmesh
import math
from mathutils import Vector

myway_reset_scene()
myway_print_progress("building stylized wooden treasure chest")

# Materials
wood_mat = myway_material_slot(
    "wood_oak",
    fallback_color=(0.545, 0.353, 0.169, 1.0),
    metallic=0.0,
    roughness=0.7,
)
metal_mat = myway_material_slot(
    "metal_dark_iron",
    fallback_color=(0.227, 0.227, 0.227, 1.0),
    metallic=0.9,
    roughness=0.8,
)

# Dimensions (target_extent_m = 2.0)
BODY_W = 1.40
BODY_D = 0.80
BODY_H = 0.80
LID_H = 0.40
WALL_T = 0.05

def assign(obj, material):
    if obj is None or obj.type != "MESH":
        return obj
    obj.data.materials.clear()
    obj.data.materials.append(material)
    return obj

def activate(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

def apply_scale(obj):
    activate(obj)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

def finish_mesh(obj, bevel=0.01, smooth=False):
    if bevel > 0.0:
        modifier = obj.modifiers.new(name="NativeBevel", type="BEVEL")
        modifier.width = bevel
        modifier.segments = 3
        modifier.limit_method = "ANGLE"
    if smooth:
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    try:
        weighted = obj.modifiers.new(name="NativeWeightedNormals", type="WEIGHTED_NORMAL")
        weighted.keep_sharp = True
    except Exception:
        pass
    return obj

def rounded_box(name, size, location, material, bevel=0.01):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (size[0] * 0.5, size[1] * 0.5, size[2] * 0.5)
    apply_scale(obj)
    assign(obj, material)
    finish_mesh(obj, bevel=bevel, smooth=False)
    return obj

def cylinder_x(name, radius, depth, location, material, vertices=32, bevel=0.005):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=location,
        rotation=(0.0, math.radians(90.0), 0.0),
    )
    obj = bpy.context.object
    obj.name = name
    assign(obj, material)
    finish_mesh(obj, bevel=bevel, smooth=True)
    return obj

def cylinder_y(name, radius, depth, location, material, vertices=32, bevel=0.005):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=location,
        rotation=(math.radians(90.0), 0.0, 0.0),
    )
    obj = bpy.context.object
    obj.name = name
    assign(obj, material)
    finish_mesh(obj, bevel=bevel, smooth=True)
    return obj

def cylinder_z(name, radius, depth, location, material, vertices=32, bevel=0.005):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=location,
    )
    obj = bpy.context.object
    obj.name = name
    assign(obj, material)
    finish_mesh(obj, bevel=bevel, smooth=True)
    return obj

def torus_x(name, major_radius, minor_radius, location, material):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=32,
        minor_segments=12,
        location=location,
        rotation=(0.0, math.radians(90.0), 0.0),
    )
    obj = bpy.context.object
    obj.name = name
    assign(obj, material)
    finish_mesh(obj, smooth=True)
    return obj

def parent_keep_transform(child, parent):
    world = child.matrix_world.copy()
    child.parent = parent
    child.matrix_world = world

def join_objects(objs, name, parent_obj, material):
    """Join a list of mesh objects into a single named object, parent it, and assign material."""
    if not objs:
        return None
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    joined = bpy.context.object
    joined.name = name
    assign(joined, material)
    parent_keep_transform(joined, parent_obj)
    return joined

# Root
root = bpy.data.objects.new("TreasureChest_Root", None)
bpy.context.scene.collection.objects.link(root)
root.empty_display_type = "PLAIN_AXES"

# 1. Chest Body (hollow box)
myway_print_progress("creating chest body")
bpy.ops.mesh.primitive_cube_add(location=(0, 0, BODY_H * 0.5))
chest_body = bpy.context.object
chest_body.name = "chest_body"
chest_body.scale = (BODY_W * 0.5, BODY_D * 0.5, BODY_H * 0.5)
apply_scale(chest_body)

# Hollow it out
bpy.ops.object.mode_set(mode="EDIT")
bm = bmesh.from_edit_mesh(chest_body.data)
bm.faces.ensure_lookup_table()

# Delete top face
for f in bm.faces:
    if abs(f.normal.z - 1.0) < 0.1 and f.calc_center_median().z > BODY_H * 0.4:
        bm.faces.remove(f)
bmesh.update_edit_mesh(chest_body.data)

# Inset and extrude down to create walls
bpy.ops.mesh.select_all(action="DESELECT")
bm = bmesh.from_edit_mesh(chest_body.data)
bm.faces.ensure_lookup_table()
for f in bm.faces:
    if abs(f.normal.z - 1.0) < 0.1:
        f.select = True
bmesh.update_edit_mesh(chest_body.data)

bpy.ops.mesh.inset(thickness=WALL_T, depth=0)
bpy.ops.mesh.extrude_region_move(TRANSFORM_OT_translate={"value": (0, 0, -(BODY_H - WALL_T))})

bpy.ops.object.mode_set(mode="OBJECT")
assign(chest_body, wood_mat)
finish_mesh(chest_body, bevel=0.015, smooth=False)
parent_keep_transform(chest_body, root)

# 2. Lid (curved barrel shape) - clean construction to avoid non-manifold edges
myway_print_progress("creating curved lid")
lid_pivot_y = BODY_D * 0.5
lid_pivot_z = BODY_H
lid_radius = BODY_W * 0.5
lid_length = BODY_D + 0.01
lid_thickness = 0.05

# Build lid from a half-cylinder shell using bmesh for clean topology
lid_mesh = bpy.data.meshes.new("lid_mesh")
lid = bpy.data.objects.new("lid", lid_mesh)
bpy.context.scene.collection.objects.link(lid)

bm = bmesh.new()
segments = 24
# Create vertices for the curved shell (half cylinder)
verts_outer = []
verts_inner = []
for i in range(segments + 1):
    angle = math.pi * i / segments  # 0 to pi
    x = 0.0
    y = lid_length * 0.5 - lid_length * i / segments
    z_outer = lid_radius * math.sin(angle)
    x_outer = lid_radius * math.cos(angle)
    z_inner = (lid_radius - lid_thickness) * math.sin(angle)
    x_inner = (lid_radius - lid_thickness) * math.cos(angle)
    verts_outer.append(bm.verts.new((x_outer, y, z_outer)))
    verts_inner.append(bm.verts.new((x_inner, y, z_inner)))

bm.verts.ensure_lookup_table()

# Create faces for the outer shell
for i in range(segments):
    for j in range(1):
        v1 = verts_outer[i + j]
        v2 = verts_outer[i + j + 1]
        v3 = verts_inner[i + j + 1]
        v4 = verts_inner[i + j]
        bm.faces.new((v1, v2, v3, v4))

# Cap the ends
for i in range(segments):
    # End at y = +lid_length/2 (first row)
    v1 = verts_outer[0]
    v2 = verts_outer[1]
    # We need end caps - create them as strips
    pass

# Simpler approach: create end caps
# Front cap (y = +lid_length/2)
front_verts_outer = [verts_outer[i] for i in range(0, segments + 1, segments)]
# Actually let's do this more carefully with a cleaner approach

bm.free()

# Use a cleaner approach: create the lid as a solid half-cylinder then hollow it
bpy.ops.mesh.primitive_cylinder_add(
    vertices=32,
    radius=lid_radius,
    depth=lid_length,
    location=(0, 0, 0),
    rotation=(math.radians(90), 0, 0)
)
lid = bpy.context.object
lid.name = "lid"
apply_scale(lid)

# Delete bottom half faces to make a half-cylinder shell
bpy.ops.object.mode_set(mode="EDIT")
bm = bmesh.from_edit_mesh(lid.data)
bm.faces.ensure_lookup_table()

# Delete faces where normal.z < 0 (bottom half)
faces_to_delete = [f for f in bm.faces if f.normal.z < -0.05]
bmesh.ops.delete(bm, geom=faces_to_delete, context="FACES")

# Also delete the flat bottom face if any remains
bm.faces.ensure_lookup_table()
faces_to_delete = [f for f in bm.faces if f.normal.z < -0.05]
bmesh.ops.delete(bm, geom=faces_to_delete, context="FACES")

bmesh.update_edit_mesh(lid.data)

# Now solidify to give thickness inward
bpy.ops.object.mode_set(mode="OBJECT")
solid = lid.modifiers.new(name="LidSolidify", type="SOLIDIFY")
solid.thickness = -lid_thickness
solid.offset = 1
activate(lid)
bpy.ops.object.modifier_apply(modifier="LidSolidify")

# Trim to match body depth - delete vertices beyond body front
bpy.ops.object.mode_set(mode="EDIT")
bm = bmesh.from_edit_mesh(lid.data)
bm.verts.ensure_lookup_table()
verts_to_delete = [v for v in bm.verts if v.co.y < -BODY_D * 0.5]
if verts_to_delete:
    bmesh.ops.delete(bm, geom=verts_to_delete, context="VERTS")
bmesh.update_edit_mesh(lid.data)

# Fill any open holes at the cut
bpy.ops.mesh.select_all(action="DESELECT")
bm = bmesh.from_edit_mesh(lid.data)
bm.edges.ensure_lookup_table()
open_edges = [e for e in bm.edges if e.is_boundary]
if open_edges:
    for e in open_edges:
        e.select = True
    bmesh.update_edit_mesh(lid.data)
    bpy.ops.mesh.fill()

bpy.ops.object.mode_set(mode="OBJECT")

# Remove any remaining non-manifold edges by merging close vertices
bpy.ops.object.mode_set(mode="EDIT")
bm = bmesh.from_edit_mesh(lid.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.001)
bmesh.update_edit_mesh(lid.data)
bpy.ops.object.mode_set(mode="OBJECT")

# Set origin to pivot
bpy.context.scene.cursor.location = (0, lid_pivot_y, lid_pivot_z)
activate(lid)
bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
bpy.context.scene.cursor.location = (0, 0, 0)

assign(lid, wood_mat)
finish_mesh(lid, bevel=0.01, smooth=True)
parent_keep_transform(lid, chest_body)

# 3. Horizontal Bands - join sub-parts into single named objects
myway_print_progress("creating horizontal bands")
band_thickness = 0.04
band_height = 0.12
band_z = BODY_H * 0.25

def make_horizontal_band(name, y_center):
    parts = []
    # Front/Back panel
    panel = rounded_box(
        name + "_panel",
        (BODY_W + 0.02, band_thickness, band_height),
        (0, y_center, band_z),
        metal_mat,
        bevel=0.005,
    )
    parts.append(panel)
    # Side wraps
    for x in (-BODY_W * 0.5, BODY_W * 0.5):
        side = rounded_box(
            name + "_side",
            (band_thickness, BODY_D + 0.02, band_height),
            (x, 0, band_z),
            metal_mat,
            bevel=0.005,
        )
        parts.append(side)
    return join_objects(parts, name, chest_body, metal_mat)

band_front = make_horizontal_band("band_horizontal_front", -BODY_D * 0.5)
band_back = make_horizontal_band("band_horizontal_back", BODY_D * 0.5)

# 4. Vertical Corner Bands - join sub-parts into single named objects
myway_print_progress("creating vertical corner bands")
v_band_width = 0.08
v_band_thickness = 0.04

def make_vertical_corner_band(name, x_sign, y_sign):
    parts = []
    # X-face band
    x_face = rounded_box(
        name + "_x",
        (v_band_thickness, v_band_width, BODY_H + 0.02),
        (x_sign * BODY_W * 0.5, y_sign * (BODY_D * 0.5 - v_band_width * 0.5), BODY_H * 0.5),
        metal_mat,
        bevel=0.005,
    )
    parts.append(x_face)
    # Y-face band
    y_face = rounded_box(
        name + "_y",
        (v_band_width, v_band_thickness, BODY_H + 0.02),
        (x_sign * (BODY_W * 0.5 - v_band_width * 0.5), y_sign * BODY_D * 0.5, BODY_H * 0.5),
        metal_mat,
        bevel=0.005,
    )
    parts.append(y_face)
    return join_objects(parts, name, chest_body, metal_mat)

make_vertical_corner_band("band_vertical_corner_01", -1, -1)
make_vertical_corner_band("band_vertical_corner_02", 1, -1)
make_vertical_corner_band("band_vertical_corner_03", -1, 1)
make_vertical_corner_band("band_vertical_corner_04", 1, 1)

# 5. Hinges - join sub-parts into single named objects
myway_print_progress("creating hinges")
hinge_y = BODY_D * 0.5
hinge_z = BODY_H
hinge_radius = 0.05
hinge_length = 0.15
hinge_offset_x = BODY_W * 0.35

def make_hinge(name, x_pos):
    parts = []
    # Knuckle
    knuckle = cylinder_y(
        name + "_knuckle",
        hinge_radius,
        hinge_length,
        (x_pos, hinge_y, hinge_z),
        metal_mat,
        bevel=0.005,
    )
    parts.append(knuckle)
    # Leaf on body
    body_leaf = rounded_box(
        name + "_body_leaf",
        (hinge_length * 0.8, 0.12, 0.04),
        (x_pos, hinge_y + 0.06, hinge_z - 0.02),
        metal_mat,
        bevel=0.005,
    )
    parts.append(body_leaf)
    # Leaf on lid
    lid_leaf = rounded_box(
        name + "_lid_leaf",
        (hinge_length * 0.8, 0.12, 0.04),
        (x_pos, hinge_y + 0.06, hinge_z + 0.02),
        metal_mat,
        bevel=0.005,
    )
    parts.append(lid_leaf)
    
    # Join all hinge parts
    joined = join_objects(parts, name, lid, metal_mat)
    
    # Set origin to pivot
    bpy.context.scene.cursor.location = (x_pos, hinge_y, hinge_z)
    activate(joined)
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    bpy.context.scene.cursor.location = (0, 0, 0)
    
    return joined

hinge_left = make_hinge("hinge_left", -hinge_offset_x)
hinge_right = make_hinge("hinge_right", hinge_offset_x)

# 6. Lock Plate
myway_print_progress("creating lock plate")
lock_plate = rounded_box(
    "lock_plate",
    (0.24, 0.04, 0.30),
    (0, -BODY_D * 0.5 - 0.01, BODY_H * 0.55),
    metal_mat,
    bevel=0.01,
)

# Keyhole (boolean)
bpy.ops.mesh.primitive_cube_add(location=(0, -BODY_D * 0.5 - 0.02, BODY_H * 0.55))
keyhole_cut = bpy.context.object
keyhole_cut.scale = (0.04, 0.1, 0.06)
apply_scale(keyhole_cut)

bpy.ops.mesh.primitive_cylinder_add(
    vertices=16,
    radius=0.03,
    depth=0.1,
    location=(0, -BODY_D * 0.5 - 0.02, BODY_H * 0.55 + 0.06),
    rotation=(math.radians(90), 0, 0)
)
keyhole_circle = bpy.context.object
apply_scale(keyhole_circle)

activate(keyhole_cut)
bpy.ops.object.modifier_add(type="BOOLEAN")
bpy.context.object.modifiers["Boolean"].operation = "UNION"
bpy.context.object.modifiers["Boolean"].object = keyhole_circle
bpy.ops.object.modifier_apply(modifier="Boolean")
bpy.data.objects.remove(keyhole_circle, do_unlink=True)

activate(lock_plate)
bpy.ops.object.modifier_add(type="BOOLEAN")
bpy.context.object.modifiers["Boolean"].operation = "DIFFERENCE"
bpy.context.object.modifiers["Boolean"].object = keyhole_cut
bpy.ops.object.modifier_apply(modifier="Boolean")
bpy.data.objects.remove(keyhole_cut, do_unlink=True)

parent_keep_transform(lock_plate, chest_body)

# 7. Lock Hasp
myway_print_progress("creating lock hasp")
hasp_pivot_y = -BODY_D * 0.5
hasp_pivot_z = BODY_H
hasp = torus_x(
    "lock_hasp",
    0.12,
    0.02,
    (0, hasp_pivot_y - 0.05, hasp_pivot_z - 0.02),
    metal_mat,
)
# Flatten slightly
hasp.scale = (1.0, 0.5, 1.0)
apply_scale(hasp)

# Set origin to hinge point on lid front bottom edge
bpy.context.scene.cursor.location = (0, hasp_pivot_y, hasp_pivot_z)
activate(hasp)
bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
bpy.context.scene.cursor.location = (0, 0, 0)

parent_keep_transform(hasp, lid)

# 8. Handles - join sub-parts into single named objects
myway_print_progress("creating side handles")
handle_z = BODY_H * 0.5
handle_grip_length = 0.25
handle_grip_radius = 0.04
handle_anchor_size = (0.08, 0.04, 0.12)

def make_handle(name, x_pos):
    parts = []
    # Anchor plates
    anchor_top = rounded_box(
        name + "_anchor_top",
        handle_anchor_size,
        (x_pos, 0, handle_z + 0.15),
        metal_mat,
        bevel=0.005,
    )
    parts.append(anchor_top)
    anchor_bot = rounded_box(
        name + "_anchor_bot",
        handle_anchor_size,
        (x_pos, 0, handle_z - 0.15),
        metal_mat,
        bevel=0.005,
    )
    parts.append(anchor_bot)
    # Grip cylinder
    grip = cylinder_x(
        name + "_grip",
        handle_grip_radius,
        handle_grip_length,
        (x_pos, 0, handle_z),
        metal_mat,
        bevel=0.005,
    )
    parts.append(grip)
    
    joined = join_objects(parts, name, chest_body, metal_mat)
    
    # Set origin to center of grip
    bpy.context.scene.cursor.location = (x_pos, 0, handle_z)
    activate(joined)
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    bpy.context.scene.cursor.location = (0, 0, 0)
    
    return joined

handle_left = make_handle("handle_left", -BODY_W * 0.5 - 0.02)
handle_right = make_handle("handle_right", BODY_W * 0.5 + 0.02)

# 9. Corner Brackets - join sub-parts into single named objects
myway_print_progress("creating corner brackets")
bracket_size = 0.15
bracket_thickness = 0.04

def make_corner_bracket(name, x_sign, y_sign):
    parts = []
    # X-face bracket
    x_face = rounded_box(
        name + "_x",
        (bracket_thickness, bracket_size, bracket_size),
        (x_sign * BODY_W * 0.5, y_sign * (BODY_D * 0.5 - bracket_size * 0.5), bracket_size * 0.5),
        metal_mat,
        bevel=0.005,
    )
    parts.append(x_face)
    # Y-face bracket
    y_face = rounded_box(
        name + "_y",
        (bracket_size, bracket_thickness, bracket_size),
        (x_sign * (BODY_W * 0.5 - bracket_size * 0.5), y_sign * BODY_D * 0.5, bracket_size * 0.5),
        metal_mat,
        bevel=0.005,
    )
    parts.append(y_face)
    return join_objects(parts, name, chest_body, metal_mat)

make_corner_bracket("corner_bracket_bl_01", -1, -1)
make_corner_bracket("corner_bracket_br_01", 1, -1)
make_corner_bracket("corner_bracket_bl_02", -1, 1)
make_corner_bracket("corner_bracket_br_02", 1, 1)

# 10. Rivets
myway_print_progress("creating rivets")
rivet_radius = 0.015
rivet_objs = []

def add_rivet(location, parent_obj):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=12,
        ring_count=8,
        radius=rivet_radius,
        location=location,
    )
    rivet = bpy.context.object
    rivet.name = "rivet"
    rivet.scale = (1.0, 1.0, 0.5)
    apply_scale(rivet)
    assign(rivet, metal_mat)
    finish_mesh(rivet, smooth=True)
    parent_keep_transform(rivet, parent_obj)
    rivet_objs.append(rivet)

# Rivets on horizontal bands
for y in [-BODY_D * 0.5, BODY_D * 0.5]:
    for x in [-0.5, -0.25, 0, 0.25, 0.5]:
        add_rivet((x, y + (-0.02 if y < 0 else 0.02), band_z + 0.04), chest_body)
        add_rivet((x, y + (-0.02 if y < 0 else 0.02), band_z - 0.04), chest_body)

# Rivets on vertical bands
for x_sign in [-1, 1]:
    for y_sign in [-1, 1]:
        x = x_sign * BODY_W * 0.5
        y = y_sign * (BODY_D * 0.5 - v_band_width * 0.5)
        for z in [0.15, 0.4, 0.65]:
            add_rivet((x + (0.02 if x_sign > 0 else -0.02), y, z), chest_body)
            y = y_sign * BODY_D * 0.5
            x = x_sign * (BODY_W * 0.5 - v_band_width * 0.5)
            add_rivet((x, y + (0.02 if y_sign > 0 else -0.02), z), chest_body)

# Rivets on lock plate
for z in [BODY_H * 0.55 - 0.1, BODY_H * 0.55 + 0.1]:
    for x in [-0.08, 0.08]:
        add_rivet((x, -BODY_D * 0.5 - 0.03, z), chest_body)

# Rivets on corner brackets
for x_sign in [-1, 1]:
    for y_sign in [-1, 1]:
        x = x_sign * (BODY_W * 0.5 - bracket_size * 0.5)
        y = y_sign * BODY_D * 0.5
        add_rivet((x, y + (-0.02 if y_sign < 0 else 0.02), bracket_size * 0.5), chest_body)
        x = x_sign * BODY_W * 0.5
        y = y_sign * (BODY_D * 0.5 - bracket_size * 0.5)
        add_rivet((x + (0.02 if x_sign > 0 else -0.02), y, bracket_size * 0.5), chest_body)

# Join all rivets into one mesh
if rivet_objs:
    activate(rivet_objs[0])
    for r in rivet_objs[1:]:
        r.select_set(True)
    bpy.context.view_layer.objects.active = rivet_objs[0]
    bpy.ops.object.join()
    rivets = bpy.context.object
    rivets.name = "rivets"
    parent_keep_transform(rivets, chest_body)

# Normalize extent
myway_normalize_extent(2.0, root)

myway_print_progress("treasure chest assembly complete")