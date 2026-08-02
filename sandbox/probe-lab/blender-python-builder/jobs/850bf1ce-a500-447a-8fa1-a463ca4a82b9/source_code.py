"""
Treasure Chest — high-quality stylized wooden treasure chest with curved lid,
dark iron bands, hinges, corner hardware, side handles, front lock, and
softened manufactured edges. Animation-ready pivots for lid and hasp.
"""
import bpy
import math
from mathutils import Vector, Matrix

# ---------------------------------------------------------------------------
# Constants (chest designed in a ~1.0m unit space, normalized to 2.0m at end)
# ---------------------------------------------------------------------------
CHEST_W = 1.0       # X width
CHEST_D = 1.0       # Y depth
BASE_H = 0.70       # Z height of base body
WALL_T = 0.05       # wall thickness

LID_RADIUS = 0.42   # curved lid dome radius
LID_HALF_W = CHEST_W / 2.0
LID_FRONT_LIP_H = 0.15
LID_BACK_WALL_H = 0.06

HINGE_Y = -0.50
HINGE_Z = 0.70
HINGE_X = 0.48

BEVEL_WOOD = 0.015
BEVEL_METAL = 0.008

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')

def _select_only(obj):
    _ensure_object_mode()
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

def _apply_all_modifiers(obj):
    _select_only(obj)
    for m in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)

def _bevel_object(obj, width=0.01, segments=2):
    _select_only(obj)
    mod = obj.modifiers.new(name="Bevel", type='BEVEL')
    mod.width = width
    mod.segments = segments
    mod.limit_method = 'ANGLE'
    mod.angle_limit = math.radians(35)
    bpy.ops.object.modifier_apply(modifier=mod.name)

def _shade_smooth(obj):
    _select_only(obj)
    bpy.ops.object.shade_smooth()

def _set_smooth_by_angle(obj, angle_deg=40):
    _select_only(obj)
    mod = obj.modifiers.new(name="SmoothByAngle", type='WEIGHTED_NORMAL')
    mod.keep_sharp = True
    mod.weight = 50
    bpy.ops.object.modifier_apply(modifier=mod.name)

def _add_rivets(parent_obj, positions, radius=0.012, height=0.008, name_prefix="rivet"):
    """Add small hemisphere rivets as children of parent_obj."""
    rivets = []
    for i, pos in enumerate(positions):
        r = myway_sphere(radius, location=pos)
        r.name = f"{name_prefix}_{i}"
        # Flatten slightly
        r.scale.z = 0.5
        myway_apply_transform(r)
        _bevel_object(r, width=0.003, segments=1)
        myway_assign_material_slot(r, "slot_metal_dark_iron")
        myway_parent(r, parent_obj)
        rivets.append(r)
    return rivets

def _make_band_strip(name, length, height, depth, bevel_w=BEVEL_METAL):
    """Create a thin metal band strip centered at origin."""
    band = myway_box(length, height, depth, name=name)
    _bevel_object(band, width=bevel_w, segments=2)
    myway_assign_material_slot(band, "slot_metal_dark_iron")
    return band

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

myway_reset_scene()
myway_print_progress("Building treasure chest...")

# Material slots
myway_material_slot("slot_wood_warm")
myway_material_slot("slot_metal_dark_iron")

# === CHEST BASE BODY ===
myway_print_progress("Creating chest_base_body...")

# Outer shell
base_outer = myway_box(CHEST_W, CHEST_D, BASE_H, name="chest_base_body")
base_outer.location = (0, 0, BASE_H / 2.0)
myway_apply_transform(base_outer)

# Hollow interior using boolean
inner = myway_box(
    CHEST_W - 2 * WALL_T,
    CHEST_D - 2 * WALL_T,
    BASE_H - WALL_T,
    name="_inner_cavity"
)
inner.location = (0, 0, WALL_T + (BASE_H - WALL_T) / 2.0)
myway_apply_transform(inner)

_select_only(base_outer)
bool_mod = base_outer.modifiers.new(name="Hollow", type='BOOLEAN')
bool_mod.operation = 'DIFFERENCE'
bool_mod.object = inner
bpy.ops.object.modifier_apply(modifier=bool_mod.name)
bpy.data.objects.remove(inner, do_unlink=True)

# Slight outward bow on front/back faces using simple deform
_select_only(base_outer)
bow_mod = base_outer.modifiers.new(name="Bow", type='SIMPLE_DEFORM')
bow_mod.deform_method = 'BEND'
bow_mod.deform_axis = 'X'
bow_mod.angle = math.radians(2.5)
bpy.ops.object.modifier_apply(modifier=bow_mod.name)

# Bevel exterior edges
_bevel_object(base_outer, width=BEVEL_WOOD, segments=3)
myway_assign_material_slot(base_outer, "slot_wood_warm")
myway_generate_uvs(base_outer)
_shade_smooth(base_outer)
_set_smooth_by_angle(base_outer)

# === WOOD PLANK SEAMS ===
myway_print_progress("Creating wood_plank_seams...")

seam_objs = []
seam_depth = 0.004
seam_width = 0.006

# Front face plank seams (3 planks => 2 seams)
front_y = CHEST_D / 2.0 + 0.001
for i in range(2):
    z = BASE_H * (i + 1) / 3.0
    s = myway_box(CHEST_W * 0.96, seam_width, seam_depth, name=f"seam_front_{i}")
    s.location = (0, front_y, z)
    myway_apply_transform(s)
    seam_objs.append(s)

# Back face plank seams
back_y = -CHEST_D / 2.0 - 0.001
for i in range(2):
    z = BASE_H * (i + 1) / 3.0
    s = myway_box(CHEST_W * 0.96, seam_width, seam_depth, name=f"seam_back_{i}")
    s.location = (0, back_y, z)
    myway_apply_transform(s)
    seam_objs.append(s)

# Side face plank seams (2 planks => 1 seam each side)
for side_x in [CHEST_W / 2.0 + 0.001, -CHEST_W / 2.0 - 0.001]:
    s = myway_box(seam_width, CHEST_D * 0.96, seam_depth, name=f"seam_side_{side_x:.2f}")
    s.location = (side_x, 0, BASE_H / 2.0)
    myway_apply_transform(s)
    seam_objs.append(s)

# Join all seams into one object
if seam_objs:
    _select_only(seam_objs[0])
    for s in seam_objs[1:]:
        s.select_set(True)
    bpy.context.view_layer.objects.active = seam_objs[0]
    bpy.ops.object.join()
    wood_plank_seams = bpy.context.view_layer.objects.active
    wood_plank_seams.name = "wood_plank_seams"
    myway_assign_material_slot(wood_plank_seams, "slot_wood_warm")
    myway_generate_uvs(wood_plank_seams)
    myway_parent(wood_plank_seams, base_outer)

# === CHEST LID SHELL ===
myway_print_progress("Creating chest_lid_shell...")

# Build lid as a half-cylinder cap + front lip + back wall
# The lid pivots at (0, HINGE_Y, HINGE_Z) = (0, -0.5, 0.70)
# We build geometry in lid-local space then set origin to pivot.

lid_parts = []

# Curved dome: half cylinder oriented so axis = X, dome opens downward
# Use a cylinder rotated 90° about X, then cut bottom half
dome = myway_cylinder(LID_RADIUS, LID_HALF_W * 2, name="_lid_dome", segments=32)
dome.rotation_euler = (0, math.radians(90), 0)
dome.location = (0, 0, 0)
myway_apply_transform(dome)

# Cut bottom half away (keep only top semicircle)
# The cylinder is centered at origin, axis along X after rotation
# We need to remove vertices with Z < 0 (bottom half)
_select_only(dome)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='DESELECT')
bpy.ops.object.mode_set(mode='OBJECT')

mesh = dome.data
for v in mesh.vertices:
    v.select = v.co.z < -0.001

_select_only(dome)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.delete(type='VERT')
bpy.ops.object.mode_set(mode='OBJECT')

# Now we have a top half-cylinder shell. Add front lip and back wall.
# The dome spans Y from -LID_RADIUS to +LID_RADIUS, Z from 0 to LID_RADIUS
# Front lip: vertical plate at Y = +LID_RADIUS, from Z=0 to Z=LID_FRONT_LIP_H
# Back wall: vertical plate at Y = -LID_RADIUS, from Z=0 to Z=LID_BACK_WALL_H

# Front lip
front_lip = myway_box(
    CHEST_W * 0.98,
    WALL_T,
    LID_FRONT_LIP_H,
    name="_lid_front_lip"
)
front_lip.location = (0, LID_RADIUS, LID_FRONT_LIP_H / 2.0)
myway_apply_transform(front_lip)

# Back wall
back_wall = myway_box(
    CHEST_W * 0.98,
    WALL_T,
    LID_BACK_WALL_H,
    name="_lid_back_wall"
)
back_wall.location = (0, -LID_RADIUS, LID_BACK_WALL_H / 2.0)
myway_apply_transform(back_wall)

# End caps for the dome (close the semicircle ends)
for x_sign in [1, -1]:
    # Create semicircle end cap via mesh from vertices
    verts = []
    faces = []
    n_seg = 16
    for i in range(n_seg + 1):
        angle = math.pi * i / n_seg  # 0 to pi (top half)
        y = LID_RADIUS * math.cos(angle)
        z = LID_RADIUS * math.sin(angle)
        verts.append((x_sign * LID_HALF_W, y, z))
    # Add bottom edge vertices
    verts.append((x_sign * LID_HALF_W, LID_RADIUS, 0))
    verts.append((x_sign * LID_HALF_W, -LID_RADIUS, 0))
    # Face: fan from first vertex (top center)
    # Actually create a strip of quads
    for i in range(n_seg):
        faces.append((i, i + 1, n_seg + 2, n_seg + 1))
    # Close bottom
    faces.append((n_seg, n_seg + 2, n_seg + 1, n_seg + 1))  # degenerate, skip
    
    # Simpler: just make a filled semicircle
    verts2 = []
    for i in range(n_seg + 1):
        angle = math.pi * i / n_seg
        y = LID_RADIUS * math.cos(angle)
        z = LID_RADIUS * math.sin(angle)
        verts2.append((x_sign * LID_HALF_W, y, z))
    # Center vertex
    verts2.append((x_sign * LID_HALF_W, 0, LID_RADIUS * 0.5))
    center_idx = len(verts2) - 1
    faces2 = []
    for i in range(n_seg):
        faces2.append((i, i + 1, center_idx))
    
    cap = myway_mesh_from_vertices_faces(verts2, faces2, name=f"_lid_cap_{x_sign}")
    myway_apply_transform(cap)
    lid_parts.append(cap)

# Join dome + front_lip + back_wall + caps
lid_parts.extend([dome, front_lip, back_wall])

_select_only(lid_parts[0])
for p in lid_parts[1:]:
    p.select_set(True)
bpy.context.view_layer.objects.active = lid_parts[0]
bpy.ops.object.join()
lid_shell = bpy.context.view_layer.objects.active
lid_shell.name = "chest_lid_shell"

# The lid geometry is built around (0,0,0) with dome center at origin
# We need to position it so the hinge edge (back-bottom of dome) is at
# the pivot point (0, HINGE_Y, HINGE_Z) in world space.
# Currently the back-bottom of the dome is at Y=-LID_RADIUS, Z=0 in local.
# We want that at Y=HINGE_Y, Z=HINGE_Z.
# Offset: Y = HINGE_Y - (-LID_RADIUS) = HINGE_Y + LID_RADIUS
#         Z = HINGE_Z - 0 = HINGE_Z
lid_offset_y = HINGE_Y + LID_RADIUS  # = -0.5 + 0.42 = -0.08
lid_offset_z = HINGE_Z               # = 0.70

# Move geometry into position
_select_only(lid_shell)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.transform.translate(value=(0, lid_offset_y, lid_offset_z))
bpy.ops.object.mode_set(mode='OBJECT')

# Set origin to hinge pivot point
myway_pivot_at(lid_shell, (0, HINGE_Y, HINGE_Z))

# Bevel and material
_bevel_object(lid_shell, width=BEVEL_WOOD, segments=3)
myway_assign_material_slot(lid_shell, "slot_wood_warm")
myway_generate_uvs(lid_shell)
_shade_smooth(lid_shell)
_set_smooth_by_angle(lid_shell)

# Parent lid to base
myway_parent(lid_shell, base_outer)

# === HORIZONTAL BANDS (FRONT & BACK) ===
myway_print_progress("Creating horizontal bands...")

band_height = 0.05
band_depth = 0.025  # protrusion from surface
band_wrap = 0.12   # how far band wraps onto sides
band_gap = 0.005   # gap from wood surface

band_z_positions = [0.08, 0.28, 0.48, 0.68]

# Front bands
front_bands = []
for i, z in enumerate(band_z_positions):
    # Main front strip
    band = _make_band_strip(
        f"band_front_{i}",
        CHEST_W - 2 * band_wrap + 0.02,
        band_height,
        band_depth
    )
    band.location = (0, CHEST_D / 2.0 + band_gap, z)
    myway_apply_transform(band)
    front_bands.append(band)
    
    # Left wrap
    lw = _make_band_strip(
        f"band_front_lw_{i}",
        band_wrap,
        band_height,
        band_depth
    )
    lw.location = (-CHEST_W / 2.0 + band_wrap / 2.0, CHEST_D / 2.0 + band_gap, z)
    myway_apply_transform(lw)
    front_bands.append(lw)
    
    # Right wrap
    rw = _make_band_strip(
        f"band_front_rw_{i}",
        band_wrap,
        band_height,
        band_depth
    )
    rw.location = (CHEST_W / 2.0 - band_wrap / 2.0, CHEST_D / 2.0 + band_gap, z)
    myway_apply_transform(rw)
    front_bands.append(rw)

# Join front bands
_select_only(front_bands[0])
for b in front_bands[1:]:
    b.select_set(True)
bpy.context.view_layer.objects.active = front_bands[0]
bpy.ops.object.join()
band_front = bpy.context.view_layer.objects.active
band_front.name = "band_horizontal_front"

# Add rivets to front bands
rivet_positions_front = []
for z in band_z_positions:
    for x in [-0.40, -0.20, 0.0, 0.20, 0.40]:
        rivet_positions_front.append((x, CHEST_D / 2.0 + band_gap + band_depth, z))
_add_rivets(band_front, rivet_positions_front, radius=0.01, height=0.006, name_prefix="f_rivet")
myway_parent(band_front, base_outer)

# Back bands
back_bands = []
for i, z in enumerate(band_z_positions):
    band = _make_band_strip(
        f"band_back_{i}",
        CHEST_W - 2 * band_wrap + 0.02,
        band_height,
        band_depth
    )
    band.location = (0, -CHEST_D / 2.0 - band_gap, z)
    myway_apply_transform(band)
    back_bands.append(band)
    
    lw = _make_band_strip(
        f"band_back_lw_{i}",
        band_wrap,
        band_height,
        band_depth
    )
    lw.location = (-CHEST_W / 2.0 + band_wrap / 2.0, -CHEST_D / 2.0 - band_gap, z)
    myway_apply_transform(lw)
    back_bands.append(lw)
    
    rw = _make_band_strip(
        f"band_back_rw_{i}",
        band_wrap,
        band_height,
        band_depth
    )
    rw.location = (CHEST_W / 2.0 - band_wrap / 2.0, -CHEST_D / 2.0 - band_gap, z)
    myway_apply_transform(rw)
    back_bands.append(rw)

_select_only(back_bands[0])
for b in back_bands[1:]:
    b.select_set(True)
bpy.context.view_layer.objects.active = back_bands[0]
bpy.ops.object.join()
band_back = bpy.context.view_layer.objects.active
band_back.name = "band_horizontal_back"

rivet_positions_back = []
for z in band_z_positions:
    for x in [-0.40, -0.20, 0.0, 0.20, 0.40]:
        rivet_positions_back.append((x, -CHEST_D / 2.0 - band_gap - band_depth, z))
_add_rivets(band_back, rivet_positions_back, radius=0.01, height=0.006, name_prefix="b_rivet")
myway_parent(band_back, base_outer)

# === LID CURVED BANDS ===
myway_print_progress("Creating band_lid_curved...")

# Two curved bands at X = ±0.48, conforming to lid dome radius
# The lid dome center (in world space before pivot offset) is at:
#   Y = lid_offset_y = -0.08, Z = lid_offset_z = 0.70
# The dome radius is LID_RADIUS = 0.42
# A band at X = ±0.48 wraps from front (Y = center_y + R) to back (Y = center_y - R)
# along the semicircular top of the dome.

lid_band_parts = []
lid_dome_center_y = lid_offset_y  # -0.08
lid_dome_center_z = lid_offset_z  # 0.70

for x_sign, band_name in [(-1, "lid_band_l"), (1, "lid_band_r")]:
    x_pos = x_sign * 0.48
    # Create a half-torus arc following the dome curve
    # Torus major radius = LID_RADIUS, minor radius = 0.025 (band thickness)
    # Orient so the torus axis is along X, and we take the top half
    
    band = myway_torus(
        major_radius=LID_RADIUS,
        minor_radius=0.025,
        major_segments=24,
        minor_segments=8,
        name=band_name
    )
    band.rotation_euler = (0, math.radians(90), 0)
    band.location = (x_pos, lid_dome_center_y, lid_dome_center_z)
    myway_apply_transform(band)
    
    # Remove bottom half of torus (keep Z > center)
    _select_only(band)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='DESELECT')
    bpy.ops.object.mode_set(mode='OBJECT')
    
    for v in band.data.vertices:
        world_z = band.matrix_world @ v.co
        if world_z.z < lid_dome_center_z - 0.01:
            v.select = True
    
    _select_only(band)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.delete(type='VERT')
    bpy.ops.object.mode_set(mode='OBJECT')
    
    # Flatten the band to be a strip, not a full torus tube
    band.scale = (1.0, 1.0, 0.4)
    myway_apply_transform(band)
    
    _bevel_object(band, width=0.004, segments=2)
    myway_assign_material_slot(band, "slot_metal_dark_iron")
    lid_band_parts.append(band)

# Join lid bands
_select_only(lid_band_parts[0])
for b in lid_band_parts[1:]:
    b.select_set(True)
bpy.context.view_layer.objects.active = lid_band_parts[0]
bpy.ops.object.join()
band_lid = bpy.context.view_layer.objects.active
band_lid.name = "band_lid_curved"

# Add rivets along the lid bands
rivet_positions_lid = []
n_rivets = 5
for x_pos in [-0.48, 0.48]:
    for i in range(n_rivets):
        angle = math.pi * i / (n_rivets - 1)  # 0 to pi
        y = lid_dome_center_y + LID_RADIUS * math.cos(angle)
        z = lid_dome_center_z + LID_RADIUS * math.sin(angle) + 0.03
        rivet_positions_lid.append((x_pos, y, z))
_add_rivets(band_lid, rivet_positions_lid, radius=0.01, height=0.006, name_prefix="l_rivet")

# Parent to lid
myway_parent(band_lid, lid_shell)

# === HINGES ===
myway_print_progress("Creating hinges...")

def make_hinge(name, x_pos):
    """Create a hinge at the back-top edge of the base."""
    parts = []
    
    # Base knuckle (fixed to base)
    base_knuckle = myway_cylinder(
        radius=0.035,
        depth=0.12,
        name=f"{name}_base_knuckle"
    )
    base_knuckle.rotation_euler = (0, math.radians(90), 0)
    base_knuckle.location = (x_pos, HINGE_Y, HINGE_Z)
    myway_apply_transform(base_knuckle)
    _bevel_object(base_knuckle, width=0.005, segments=2)
    myway_assign_material_slot(base_knuckle, "slot_metal_dark_iron")
    parts.append(base_knuckle)
    
    # Lid knuckle (fixed to lid) - offset along Y toward front
    lid_knuckle = myway_cylinder(
        radius=0.035,
        depth=0.12,
        name=f"{name}_lid_knuckle"
    )
    lid_knuckle.rotation_euler = (0, math.radians(90), 0)
    lid_knuckle.location = (x_pos, HINGE_Y + 0.07, HINGE_Z)
    myway_apply_transform(lid_knuckle)
    _bevel_object(lid_knuckle, width=0.005, segments=2)
    myway_assign_material_slot(lid_knuckle, "slot_metal_dark_iron")
    parts.append(lid_knuckle)
    
    # Pin rod through both knuckles
    pin = myway_cylinder(
        radius=0.012,
        depth=0.28,
        name=f"{name}_pin"
    )
    pin.rotation_euler = (0, math.radians(90), 0)
    pin.location = (x_pos, HINGE_Y + 0.035, HINGE_Z)
    myway_apply_transform(pin)
    myway_assign_material_slot(pin, "slot_metal_dark_iron")
    parts.append(pin)
    
    # Mounting plates
    # Base mount plate
    base_plate = myway_box(0.14, 0.04, 0.06, name=f"{name}_base_plate")
    base_plate.location = (x_pos, HINGE_Y - 0.02, HINGE_Z - 0.04)
    myway_apply_transform(base_plate)
    _bevel_object(base_plate, width=0.004, segments=2)
    myway_assign_material_slot(base_plate, "slot_metal_dark_iron")
    parts.append(base_plate)
    
    # Lid mount plate
    lid_plate = myway_box(0.14, 0.04, 0.06, name=f"{name}_lid_plate")
    lid_plate.location = (x_pos, HINGE_Y + 0.09, HINGE_Z + 0.04)
    myway_apply_transform(lid_plate)
    _bevel_object(lid_plate, width=0.004, segments=2)
    myway_assign_material_slot(lid_plate, "slot_metal_dark_iron")
    parts.append(lid_plate)
    
    # Join all hinge parts
    _select_only(parts[0])
    for p in parts[1:]:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    hinge = bpy.context.view_layer.objects.active
    hinge.name = name
    
    # Add rivets to mount plates
    rivets = []
    for dx in [-0.04, 0.04]:
        for dz in [-0.015, 0.015]:
            rivets.append((x_pos + dx, HINGE_Y - 0.04, HINGE_Z - 0.04 + dz))
            rivets.append((x_pos + dx, HINGE_Y + 0.11, HINGE_Z + 0.04 + dz))
    _add_rivets(hinge, rivets, radius=0.008, height=0.005, name_prefix=f"{name}_r")
    
    return hinge

hinge_left = make_hinge("hinge_left", -HINGE_X)
myway_parent(hinge_left, base_outer)

hinge_right = make_hinge("hinge_right", HINGE_X)
myway_parent(hinge_right, base_outer)

# === LOCK PLATE FRONT ===
myway_print_progress("Creating lock_plate_front...")

lock_plate = myway_box(0.22, 0.015, 0.28, name="lock_plate_front")
lock_plate.location = (0, CHEST_D / 2.0 + 0.005, 0.35)
myway_apply_transform(lock_plate)
_bevel_object(lock_plate, width=0.006, segments=3)
myway_assign_material_slot(lock_plate, "slot_metal_dark_iron")

# Keyhole cutout using boolean
keyhole_cutter = myway_cylinder(0.018, 0.05, name="_keyhole_circle")
keyhole_cutter.rotation_euler = (math.radians(90), 0, 0)
keyhole_cutter.location = (0, CHEST_D / 2.0 + 0.005, 0.38)
myway_apply_transform(keyhole_cutter)

keyhole_rect = myway_box(0.008, 0.05, 0.04, name="_keyhole_rect")
keyhole_rect.location = (0, CHEST_D / 2.0 + 0.005, 0.32)
myway_apply_transform(keyhole_rect)

# Join cutters
_select_only(keyhole_cutter)
keyhole_rect.select_set(True)
bpy.context.view_layer.objects.active = keyhole_cutter
bpy.ops.object.join()
keyhole = bpy.context.view_layer.objects.active

_select_only(lock_plate)
bool_mod = lock_plate.modifiers.new(name="Keyhole", type='BOOLEAN')
bool_mod.operation = 'DIFFERENCE'
bool_mod.object = keyhole
bpy.ops.object.modifier_apply(modifier=bool_mod.name)
bpy.data.objects.remove(keyhole, do_unlink=True)

# Ornamental scrollwork relief (small bumps)
scroll_rivets = []
for dx in [-0.07, 0.07]:
    scroll_rivets.append((dx, CHEST_D / 2.0 + 0.02, 0.48))
    scroll_rivets.append((dx, CHEST_D / 2.0 + 0.02, 0.22))
_add_rivets(lock_plate, scroll_rivets, radius=0.01, height=0.005, name_prefix="lock_r")

myway_parent(lock_plate, base_outer)

# === LOCK HASP ===
myway_print_progress("Creating lock_hasp...")

# Hasp: curved arm that pivots from top of lid front lip
# Pivot at (0, front_of_lid, top_of_front_lip) in world space
# The lid front lip is at Y = lid_offset_y + LID_RADIUS = -0.08 + 0.42 = 0.34
# Top of front lip Z = lid_offset_z + LID_FRONT_LIP_H = 0.70 + 0.15 = 0.85
hasp_pivot_y = lid_offset_y + LID_RADIUS  # 0.34
hasp_pivot_z = lid_offset_z + LID_FRONT_LIP_H  # 0.85

# Build hasp geometry in local space around pivot
hasp_parts = []

# Main hasp arm: curved plate
hasp_arm = myway_box(0.08, 0.012, 0.22, name="_hasp_arm")
hasp_arm.location = (0, 0, -0.11)  # hangs down from pivot
myway_apply_transform(hasp_arm)

# Bend it slightly
_select_only(hasp_arm)
bend = hasp_arm.modifiers.new(name="Bend", type='SIMPLE_DEFORM')
bend.deform_method = 'BEND'
bend.deform_axis = 'X'
bend.angle = math.radians(-15)
bpy.ops.object.modifier_apply(modifier=bend.name)
_bevel_object(hasp_arm, width=0.004, segments=2)
myway_assign_material_slot(hasp_arm, "slot_metal_dark_iron")
hasp_parts.append(hasp_arm)

# Padlock hole at bottom
padlock_hole = myway_torus(0.015, 0.004, major_segments=12, minor_segments=6, name="_hasp_ring")
padlock_hole.location = (0, 0, -0.22)
myway_apply_transform(padlock_hole)
myway_assign_material_slot(padlock_hole, "slot_metal_dark_iron")
hasp_parts.append(padlock_hole)

# Top mounting bracket
hasp_bracket = myway_box(0.1, 0.015, 0.04, name="_hasp_bracket")
hasp_bracket.location = (0, 0, 0.0)
myway_apply_transform(hasp_bracket)
_bevel_object(hasp_bracket, width=0.003, segments=2)
myway_assign_material_slot(hasp_bracket, "slot_metal_dark_iron")
hasp_parts.append(hasp_bracket)

# Join hasp parts
_select_only(hasp_parts[0])
for p in hasp_parts[1:]:
    p.select_set(True)
bpy.context.view_layer.objects.active = hasp_parts[0]
bpy.ops.object.join()
hasp = bpy.context.view_layer.objects.active
hasp.name = "lock_hasp"

# Position hasp at pivot point
hasp.location = (0, hasp_pivot_y + 0.02, hasp_pivot_z)
myway_apply_transform(hasp)

# Set pivot to top of hasp (hinge point)
myway_pivot_at(hasp, (0, hasp_pivot_y + 0.02, hasp_pivot_z))

# Parent to lid
myway_parent(hasp, lid_shell)

# === SIDE HANDLES ===
myway_print_progress("Creating handles...")

def make_handle(name, x_pos):
    """Create a D-shaped side handle with mounting plate."""
    parts = []
    
    # Mounting plate
    plate = myway_box(0.04, 0.14, 0.1, name=f"{name}_plate")
    plate.location = (x_pos, 0, 0.35)
    myway_apply_transform(plate)
    _bevel_object(plate, width=0.004, segments=2)
    myway_assign_material_slot(plate, "slot_metal_dark_iron")
    parts.append(plate)
    
    # D-shaped handle loop using torus
    handle_loop = myway_torus(
        major_radius=0.06,
        minor_radius=0.01,
        major_segments=16,
        minor_segments=6,
        name=f"{name}_loop"
    )
    # Orient torus so the flat side is against the plate, loop protrudes outward
    handle_loop.rotation_euler = (math.radians(90), 0, 0)
    # Position: protrude 0.12m from side, centered on plate
    protrude = 0.12
    handle_loop.location = (x_pos + (protrude * (1 if x_pos > 0 else -1)) * 0.5, 0, 0.35)
    myway_apply_transform(handle_loop)
    
    # Cut the torus in half (keep the outer half - the D loop)
    _select_only(handle_loop)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='DESELECT')
    bpy.ops.object.mode_set(mode='OBJECT')
    
    for v in handle_loop.data.vertices:
        world_x = handle_loop.matrix_world @ v.co
        if (x_pos > 0 and world_x.x < x_pos + 0.01) or (x_pos < 0 and world_x.x > x_pos - 0.01):
            v.select = True
    
    _select_only(handle_loop)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.delete(type='VERT')
    bpy.ops.object.mode_set(mode='OBJECT')
    
    _bevel_object(handle_loop, width=0.003, segments=2)
    myway_assign_material_slot(handle_loop, "slot_metal_dark_iron")
    parts.append(handle_loop)
    
    # Mounting posts (2 short cylinders connecting loop to plate)
    for y_off in [-0.05, 0.05]:
        post = myway_cylinder(0.008, 0.04, name=f"{name}_post_{y_off}")
        post.rotation_euler = (0, math.radians(90), 0)
        post.location = (x_pos + (0.02 if x_pos > 0 else -0.02), y_off, 0.35)
        myway_apply_transform(post)
        myway_assign_material_slot(post, "slot_metal_dark_iron")
        parts.append(post)
    
    # Join
    _select_only(parts[0])
    for p in parts[1:]:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    handle = bpy.context.view_layer.objects.active
    handle.name = name
    
    # Corner rivets on plate
    rivets = []
    for y_off in [-0.05, 0.05]:
        for z_off in [-0.035, 0.035]:
            rivets.append((x_pos + (0.015 if x_pos > 0 else -0.015), y_off, 0.35 + z_off))
    _add_rivets(handle, rivets, radius=0.007, height=0.004, name_prefix=f"{name}_r")
    
    return handle

handle_left = make_handle("handle_left", -CHEST_W / 2.0)
myway_parent(handle_left, base_outer)

handle_right = make_handle("handle_right", CHEST_W / 2.0)
myway_parent(handle_right, base_outer)

# === CORNER BRACKETS ===
myway_print_progress("Creating corner brackets...")

def make_corner_bracket(name, x_sign, y_sign):
    """Create an L-shaped corner bracket at bottom corners."""
    parts = []
    
    bracket_height = 0.18
    bracket_leg = 0.06  # width of each leg
    bracket_thickness = 0.02
    
    x_face = x_sign * CHEST_W / 2.0
    y_face = y_sign * CHEST_D / 2.0
    
    # Leg 1: on front/back face
    leg1 = myway_box(bracket_leg, bracket_thickness, bracket_height, name=f"{name}_leg1")
    leg1.location = (x_face - x_sign * bracket_leg / 2.0, y_face + y_sign * 0.005, bracket_height / 2.0)
    myway_apply_transform(leg1)
    _bevel_object(leg1, width=0.004, segments=2)
    myway_assign_material_slot(leg1, "slot_metal_dark_iron")
    parts.append(leg1)
    
    # Leg 2: on side face
    leg2 = myway_box(bracket_thickness, bracket_leg, bracket_height, name=f"{name}_leg2")
    leg2.location = (x_face + x_sign * 0.005, y_face - y_sign * bracket_leg / 2.0, bracket_height / 2.0)
    myway_apply_transform(leg2)
    _bevel_object(leg2, width=0.004, segments=2)
    myway_assign_material_slot(leg2, "slot_metal_dark_iron")
    parts.append(leg2)
    
    # Join
    _select_only(parts[0])
    for p in parts[1:]:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    bracket = bpy.context.view_layer.objects.active
    bracket.name = name
    
    # Rivets: two per leg
    rivets = []
    for z in [0.04, 0.14]:
        rivets.append((x_face - x_sign * bracket_leg / 2.0, y_face + y_sign * 0.015, z))
        rivets.append((x_face + x_sign * 0.015, y_face - y_sign * bracket_leg / 2.0, z))
    _add_rivets(bracket, rivets, radius=0.008, height=0.005, name_prefix=f"{name}_r")
    
    return bracket

corner_bracket_fl = make_corner_bracket("corner_bracket_fl", -1, 1)
myway_parent(corner_bracket_fl, base_outer)

corner_bracket_fr = make_corner_bracket("corner_bracket_fr", 1, 1)
myway_parent(corner_bracket_fr, base_outer)

corner_bracket_bl = make_corner_bracket("corner_bracket_bl", -1, -1)
myway_parent(corner_bracket_bl, base_outer)

corner_bracket_br = make_corner_bracket("corner_bracket_br", 1, -1)
myway_parent(corner_bracket_br, base_outer)

# === LID TOP ORNAMENT ===
myway_print_progress("Creating lid_top_ornament...")

# Position at lid apex: top of dome
# Dome center: (0, lid_dome_center_y, lid_dome_center_z)
# Apex: (0, lid_dome_center_y, lid_dome_center_z + LID_RADIUS)
apex_y = lid_dome_center_y
apex_z = lid_dome_center_z + LID_RADIUS

ornament_parts = []

# Central dome boss
boss = myway_sphere(0.04, name="_ornament_boss")
boss.location = (0, apex_y, apex_z + 0.02)
myway_apply_transform(boss)
boss.scale.z = 0.5
myway_apply_transform(boss)
_bevel_object(boss, width=0.003, segments=2)
myway_assign_material_slot(boss, "slot_metal_dark_iron")
ornament_parts.append(boss)

# Base plate for ornament
orn_plate = myway_cylinder(0.06, 0.015, name="_ornament_plate")
orn_plate.rotation_euler = (math.radians(90), 0, 0)
orn_plate.location = (0, apex_y, apex_z + 0.005)
myway_apply_transform(orn_plate)
_bevel_object(orn_plate, width=0.003, segments=2)
myway_assign_material_slot(orn_plate, "slot_metal_dark_iron")
ornament_parts.append(orn_plate)

# Four surrounding rivets in square pattern
for dx in [-0.05, 0.05]:
    for dy in [-0.05, 0.05]:
        r = myway_sphere(0.012, name=f"_orn_rivet_{dx}_{dy}")
        r.location = (dx, apex_y + dy, apex_z + 0.01)
        myway_apply_transform(r)
        r.scale.z = 0.5
        myway_apply_transform(r)
        _bevel_object(r, width=0.002, segments=1)
        myway_assign_material_slot(r, "slot_metal_dark_iron")
        ornament_parts.append(r)

# Join
_select_only(ornament_parts[0])
for p in ornament_parts[1:]:
    p.select_set(True)
bpy.context.view_layer.objects.active = ornament_parts[0]
bpy.ops.object.join()
ornament = bpy.context.view_layer.objects.active
ornament.name = "lid_top_ornament"

myway_parent(ornament, lid_shell)

# === FINALIZE ===
myway_print_progress("Grounding and normalizing...")

# Ground the asset
myway_ground_asset(base_outer)

# Normalize to 2.0m target extent
myway_normalize_extent(2.0, base_outer)

# Set chest_base_body as the root parent for clean hierarchy
# (all other parts are already parented to base_outer or lid_shell)

myway_print_progress("Treasure chest build complete.")
myway_print_progress(f"Parts created: {len(bpy.data.objects)} objects")