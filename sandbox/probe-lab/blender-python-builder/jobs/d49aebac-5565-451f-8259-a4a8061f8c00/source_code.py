"""
Treasure Chest — Stylized Wooden Chest with Curved Lid, Metal Bands, Hardware
Asset: treasure_chest_stylized_001
Target extent: 2m (1.6 x 1.0 x 1.2)
"""

import bpy
import bmesh
import math
from mathutils import Vector, Matrix

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')

def _deselect_all():
    bpy.ops.object.select_all(action='DESELECT')

def _select_active(obj):
    _deselect_all()
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

def _apply_all_modifiers(obj):
    _ensure_object_mode()
    _select_active(obj)
    for m in list(obj.modifiers):
        try:
            bpy.ops.object.modifier_apply(modifier=m.name)
        except Exception:
            pass

def _join_objects(target, sources):
    _ensure_object_mode()
    _deselect_all()
    for s in sources:
        if s and s.name in bpy.data.objects:
            s.select_set(True)
    if target and target.name in bpy.data.objects:
        target.select_set(True)
        bpy.context.view_layer.objects.active = target
    else:
        if sources:
            bpy.context.view_layer.objects.active = sources[0]
    bpy.ops.object.join()

def _set_origin(obj, location):
    _ensure_object_mode()
    _select_active(obj)
    obj.location = location

def _set_pivot(obj, pivot_world):
    """Set object origin to a world-space pivot by translating geometry."""
    _ensure_object_mode()
    _select_active(obj)
    cur_loc = obj.matrix_world.translation.copy()
    delta = Vector(pivot_world) - cur_loc
    obj.location = Vector(pivot_world)
    # Move mesh data in opposite direction
    mesh = obj.data
    for v in mesh.vertices:
        v.co += obj.matrix_world.inverted() @ (cur_loc - Vector(pivot_world))

def _make_box(name, size, location=(0,0,0)):
    sx, sy, sz = size
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (sx, sy, sz)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return obj

def _make_cylinder(name, radius, depth, location=(0,0,0), rotation=(0,0,0), verts=32):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=verts, radius=radius, depth=depth,
        location=location, rotation=rotation
    )
    obj = bpy.context.active_object
    obj.name = name
    return obj

def _make_torus(name, major_r, minor_r, location=(0,0,0), rotation=(0,0,0),
                major_seg=24, minor_seg=12):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_r, minor_radius=minor_r,
        major_segments=major_seg, minor_segments=minor_seg,
        location=location, rotation=rotation
    )
    obj = bpy.context.active_object
    obj.name = name
    return obj

def _bevel_object(obj, width=0.015, segments=2):
    _ensure_object_mode()
    _select_active(obj)
    mod = obj.modifiers.new(name="Bevel", type='BEVEL')
    mod.width = width
    mod.segments = segments
    mod.limit_method = 'ANGLE'
    mod.angle_limit = math.radians(35)
    _apply_all_modifiers(obj)

def _shade_smooth(obj):
    _ensure_object_mode()
    _select_active(obj)
    bpy.ops.object.shade_smooth()

def _shade_flat(obj):
    _ensure_object_mode()
    _select_active(obj)
    bpy.ops.object.shade_flat()

def _assign_mat(obj, slot_id):
    myway_assign_material_slot(obj, slot_id)

def _generate_uvs(obj):
    myway_generate_uvs(obj)

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

myway_reset_scene()

# Material slots
myway_material_slot("wood_primary")
myway_material_slot("metal_dark")
myway_material_slot("metal_hardware")

# Dimensions (meters)
CHEST_W = 1.6    # X
CHEST_D = 1.0    # Y
BASE_H = 0.55    # Z base height
LID_R = 0.45     # lid radius (half-cylinder)
LID_LEN = CHEST_W  # lid spans full width
WALL_T = 0.05    # wall thickness

# Pivot at back top edge of base
PIVOT_X = 0.0
PIVOT_Y = -CHEST_D / 2
PIVOT_Z = BASE_H

myway_print_progress("Building chest_base...")

# === CHEST BASE ===
# Outer shell
base_outer = _make_box("chest_base", (CHEST_W, CHEST_D, BASE_H), (0, 0, BASE_H/2))

# Hollow interior via boolean
inner = _make_box("_inner_void",
                  (CHEST_W - 2*WALL_T, CHEST_D - 2*WALL_T, BASE_H - WALL_T),
                  (0, 0, WALL_T + (BASE_H - WALL_T)/2 + 0.01))

_ensure_object_mode()
_select_active(base_outer)
bool_mod = base_outer.modifiers.new(name="Hollow", type='BOOLEAN')
bool_mod.operation = 'DIFFERENCE'
bool_mod.object = inner
_apply_all_modifiers(base_outer)
bpy.data.objects.remove(inner, do_unlink=True)

# Recessed top lip — cut a shallow inset on top
lip_cutter = _make_box("_lip_cutter",
                       (CHEST_W - 2*WALL_T, CHEST_D - 2*WALL_T, 0.04),
                       (0, 0, BASE_H - 0.02))
_select_active(base_outer)
bool_mod = base_outer.modifiers.new(name="LipRecess", type='BOOLEAN')
bool_mod.operation = 'DIFFERENCE'
bool_mod.object = lip_cutter
_apply_all_modifiers(base_outer)
bpy.data.objects.remove(lip_cutter, do_unlink=True)

# Plank seams — create thin inset grooves on front and back
for sign in [1, -1]:
    for i in range(1, 4):
        y_pos = sign * (CHEST_D/2 + 0.001)
        z_pos = BASE_H * i / 4
        seam = _make_box(f"_seam_{sign}_{i}", (CHEST_W - 0.1, 0.008, 0.004),
                        (0, y_pos, z_pos))
        _select_active(base_outer)
        bm = base_outer.modifiers.new(name=f"Seam{sign}{i}", type='BOOLEAN')
        bm.operation = 'DIFFERENCE'
        bm.object = seam
        _apply_all_modifiers(base_outer)
        bpy.data.objects.remove(seam, do_unlink=True)

_bevel_object(base_outer, width=0.012, segments=2)
_assign_mat(base_outer, "wood_primary")
_generate_uvs(base_outer)
myway_print_progress("chest_base complete")

# === LID SHELL ===
myway_print_progress("Building lid_shell...")

# Build lid as a half-cylinder shell
# Create full cylinder then cut to half
bpy.ops.mesh.primitive_cylinder_add(
    vertices=48, radius=LID_R, depth=LID_LEN,
    location=(0, 0, 0), rotation=(0, math.radians(90), 0)
)
lid_full = bpy.context.active_object
lid_full.name = "lid_shell"

# Cut bottom half away (keep upper half)
cutter = _make_box("_lid_cutter", (LID_LEN + 0.2, CHEST_D + 0.2, LID_R * 2),
                   (0, 0, -LID_R))
_select_active(lid_full)
bm = lid_full.modifiers.new(name="HalfCut", type='BOOLEAN')
bm.operation = 'DIFFERENCE'
bm.object = cutter
_apply_all_modifiers(lid_full)
bpy.data.objects.remove(cutter, do_unlink=True)

# Hollow the lid shell
lid_inner = _make_cylinder("_lid_inner_void", LID_R - WALL_T, LID_LEN - 0.02,
                           rotation=(0, math.radians(90), 0), verts=48)
_select_active(lid_full)
bm = lid_full.modifiers.new(name="LidHollow", type='BOOLEAN')
bm.operation = 'DIFFERENCE'
bm.object = lid_inner
_apply_all_modifiers(lid_full)
bpy.data.objects.remove(lid_inner, do_unlink=True)

# Flatten the back face (flat back per spec)
back_cutter = _make_box("_back_cut", (0.1, 0.15, LID_R * 2 + 0.1),
                        (0, -CHEST_D/2 - 0.05, 0))
_select_active(lid_full)
bm = lid_full.modifiers.new(name="FlatBack", type='BOOLEAN')
bm.operation = 'DIFFERENCE'
bm.object = back_cutter
_apply_all_modifiers(lid_full)
bpy.data.objects.remove(back_cutter, do_unlink=True)

# Overhanging front edge — extend front slightly
front_ext = _make_box("_front_ext", (LID_LEN, 0.04, 0.06),
                      (0, CHEST_D/2 + 0.02, -0.02))
_select_active(lid_full)
bm = lid_full.modifiers.new(name="FrontExt", type='BOOLEAN')
bm.operation = 'UNION'
bm.object = front_ext
_apply_all_modifiers(lid_full)
bpy.data.objects.remove(front_ext, do_unlink=True)

# Position lid: pivot at back top edge of base
# The lid's flat bottom should sit at z=BASE_H, back at y=-CHEST_D/2
# Currently lid centered at origin with flat side down
# Move so flat bottom is at z=BASE_H and back edge at y=-CHEST_D/2
lid_full.location = (0, -CHEST_D/2 + 0.0, BASE_H)
bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)

# Now set pivot to back top edge
_set_pivot(lid_full, (PIVOT_X, PIVOT_Y, PIVOT_Z))

_bevel_object(lid_full, width=0.01, segments=2)
_shade_smooth(lid_full)
_assign_mat(lid_full, "wood_primary")
_generate_uvs(lid_full)
myway_print_progress("lid_shell complete")

# === METAL BANDS BASE ===
myway_print_progress("Building metal_bands_base...")
band_parts = []

# Two horizontal wrapping bands on the base
for z_frac in [0.25, 0.75]:
    z_pos = z_frac * BASE_H
    # Front band segment
    band_front = _make_box(f"_band_f_{z_frac}",
                           (CHEST_W + 0.02, 0.06, 0.08),
                           (0, CHEST_D/2 + 0.005, z_pos))
    band_parts.append(band_front)
    # Back band segment
    band_back = _make_box(f"_band_b_{z_frac}",
                          (CHEST_W + 0.02, 0.06, 0.08),
                          (0, -CHEST_D/2 - 0.005, z_pos))
    band_parts.append(band_back)
    # Side band segments
    for sx in [1, -1]:
        band_side = _make_box(f"_band_s_{z_frac}_{sx}",
                              (0.06, CHEST_D + 0.02, 0.08),
                              (sx * CHEST_W/2 + 0.005 * sx, 0, z_pos))
        band_parts.append(band_side)

# Rivets along bands
rivet_objs = []
for z_frac in [0.25, 0.75]:
    z_pos = z_frac * BASE_H
    for x in [-0.7, -0.35, 0, 0.35, 0.7]:
        for sy in [1, -1]:
            riv = _make_cylinder(f"_rivet_b_{z_frac}_{x}_{sy}",
                                0.018, 0.025,
                                location=(x, sy * (CHEST_D/2 + 0.04), z_pos),
                                rotation=(math.radians(90), 0, 0),
                                verts=12)
            rivet_objs.append(riv)

# Join all band parts
if band_parts:
    _join_objects(band_parts[0], band_parts[1:])
    metal_bands_base = band_parts[0]
    metal_bands_base.name = "metal_bands_base"
else:
    metal_bands_base = _make_box("metal_bands_base", (0.01, 0.01, 0.01))

# Join rivets into bands
if rivet_objs:
    _join_objects(metal_bands_base, rivet_objs)

_bevel_object(metal_bands_base, width=0.004, segments=1)
_assign_mat(metal_bands_base, "metal_dark")
_generate_uvs(metal_bands_base)
myway_print_progress("metal_bands_base complete")

# === METAL BANDS LID ===
myway_print_progress("Building metal_bands_lid...")
lid_band_parts = []

# Vertical bands wrapping the curved lid — 3 bands
for x_pos in [-0.5, 0.0, 0.5]:
    # Create a curved band following the lid radius
    # Use a thin torus segment or curved strip
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=32, radius=LID_R + 0.005, depth=0.08,
        location=(x_pos, 0, 0), rotation=(0, math.radians(90), 0)
    )
    band = bpy.context.active_object
    band.name = f"_lid_band_{x_pos}"
    
    # Cut to half (upper)
    cutter = _make_box(f"_lbc_{x_pos}", (0.2, CHEST_D + 0.2, LID_R * 2),
                       (x_pos, 0, -LID_R))
    _select_active(band)
    bm = band.modifiers.new(name="HalfCut", type='BOOLEAN')
    bm.operation = 'DIFFERENCE'
    bm.object = cutter
    _apply_all_modifiers(band)
    bpy.data.objects.remove(cutter, do_unlink=True)
    
    # Cut to lid width (trim ends)
    end_cut = _make_box(f"_lec_{x_pos}", (0.2, 0.2, LID_R * 2 + 0.2),
                        (x_pos, CHEST_D/2 + 0.05, 0))
    _select_active(band)
    bm = band.modifiers.new(name="EndCut1", type='BOOLEAN')
    bm.operation = 'DIFFERENCE'
    bm.object = end_cut
    _apply_all_modifiers(band)
    bpy.data.objects.remove(end_cut, do_unlink=True)
    
    end_cut2 = _make_box(f"_lec2_{x_pos}", (0.2, 0.2, LID_R * 2 + 0.2),
                         (x_pos, -CHEST_D/2 - 0.15, 0))
    _select_active(band)
    bm = band.modifiers.new(name="EndCut2", type='BOOLEAN')
    bm.operation = 'DIFFERENCE'
    bm.object = end_cut2
    _apply_all_modifiers(band)
    bpy.data.objects.remove(end_cut2, do_unlink=True)
    
    # Position relative to lid pivot
    band.location = (x_pos, -CHEST_D/2, BASE_H)
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
    _set_pivot(band, (PIVOT_X, PIVOT_Y, PIVOT_Z))
    lid_band_parts.append(band)

# Rivets on lid bands
lid_rivets = []
for x_pos in [-0.5, 0.0, 0.5]:
    for angle_frac in [0.2, 0.5, 0.8]:
        angle = math.pi * angle_frac  # 0 to pi for upper half
        ry = -math.cos(angle) * (LID_R + 0.02)
        rz = math.sin(angle) * (LID_R + 0.02)
        for sy_sign in [1, -1]:
            riv = _make_cylinder(f"_lriv_{x_pos}_{angle_frac}_{sy_sign}",
                                 0.015, 0.02,
                                 location=(x_pos, sy_sign * (CHEST_D/2 + 0.01) + ry * 0, BASE_H + rz),
                                 rotation=(math.radians(90), 0, 0),
                                 verts=10)
            # Reposition to follow curve on front/back
            riv.location = (x_pos, sy_sign * (CHEST_D/2 - 0.02) + ry, BASE_H + rz)
            _set_pivot(riv, (PIVOT_X, PIVOT_Y, PIVOT_Z))
            lid_rivets.append(riv)

if lid_band_parts:
    _join_objects(lid_band_parts[0], lid_band_parts[1:])
    metal_bands_lid = lid_band_parts[0]
    metal_bands_lid.name = "metal_bands_lid"
    if lid_rivets:
        _join_objects(metal_bands_lid, lid_rivets)
else:
    metal_bands_lid = _make_box("metal_bands_lid", (0.01, 0.01, 0.01))
    _set_pivot(metal_bands_lid, (PIVOT_X, PIVOT_Y, PIVOT_Z))

_bevel_object(metal_bands_lid, width=0.003, segments=1)
_assign_mat(metal_bands_lid, "metal_dark")
_generate_uvs(metal_bands_lid)
myway_print_progress("metal_bands_lid complete")

# === CORNER BRACKETS ===
myway_print_progress("Building corner_brackets...")
bracket_parts = []

# L-shaped corner brackets at 4 bottom corners
for sx in [1, -1]:
    for sy in [1, -1]:
        # Horizontal leg
        h_leg = _make_box(f"_bh_{sx}_{sy}",
                          (0.18, 0.06, 0.04),
                          (sx * (CHEST_W/2 - 0.09), sy * (CHEST_D/2 + 0.005), 0.02))
        bracket_parts.append(h_leg)
        # Vertical leg
        v_leg = _make_box(f"_bv_{sx}_{sy}",
                          (0.06, 0.18, 0.04),
                          (sx * (CHEST_W/2 + 0.005), sy * (CHEST_D/2 - 0.09), 0.02))
        bracket_parts.append(v_leg)
        # Corner connector
        corner = _make_box(f"_bc_{sx}_{sy}",
                           (0.06, 0.06, 0.12),
                           (sx * (CHEST_W/2 + 0.005), sy * (CHEST_D/2 + 0.005), 0.06))
        bracket_parts.append(corner)
        
        # Large rivets on corner
        for rz in [0.02, 0.08]:
            riv = _make_cylinder(f"_criv_{sx}_{sy}_{rz}",
                                 0.022, 0.03,
                                 location=(sx * (CHEST_W/2 + 0.015), sy * (CHEST_D/2 + 0.015), rz),
                                 verts=12)
            bracket_parts.append(riv)

if bracket_parts:
    _join_objects(bracket_parts[0], bracket_parts[1:])
    corner_brackets = bracket_parts[0]
    corner_brackets.name = "corner_brackets"
else:
    corner_brackets = _make_box("corner_brackets", (0.01, 0.01, 0.01))

_bevel_object(corner_brackets, width=0.005, segments=2)
_assign_mat(corner_brackets, "metal_dark")
_generate_uvs(corner_brackets)
myway_print_progress("corner_brackets complete")

# === HINGES ===
myway_print_progress("Building hinges...")
hinge_parts_base = []
hinge_parts_lid = []
pin_parts = []

for x_off in [-0.55, 0.55]:
    hx = x_off
    hy = -CHEST_D / 2 - 0.01
    hz = BASE_H
    
    # Base knuckles (3 knuckles on base side)
    for i, frac in enumerate([0.0, 0.4, 0.8]):
        knuckle = _make_cylinder(f"_hbk_{x_off}_{i}",
                                  0.025, 0.04,
                                  location=(hx + frac * 0.06, hy - 0.01, hz),
                                  rotation=(0, math.radians(90), 0),
                                  verts=16)
        hinge_parts_base.append(knuckle)
    
    # Lid knuckles (2 knuckles, offset)
    for i, frac in enumerate([0.2, 0.6]):
        knuckle = _make_cylinder(f"_hlk_{x_off}_{i}",
                                 0.025, 0.04,
                                 location=(hx + frac * 0.06, hy - 0.01, hz),
                                 rotation=(0, math.radians(90), 0),
                                 verts=16)
        _set_pivot(knuckle, (PIVOT_X, PIVOT_Y, PIVOT_Z))
        hinge_parts_lid.append(knuckle)
    
    # Hinge pin
    pin = _make_cylinder(f"_hpin_{x_off}",
                         0.008, 0.14,
                         location=(hx + 0.03, hy - 0.01, hz),
                         rotation=(0, math.radians(90), 0),
                         verts=10)
    pin_parts.append(pin)
    
    # Hinge mounting plates on base
    plate_b = _make_box(f"_hpb_{x_off}",
                        (0.12, 0.03, 0.06),
                        (hx + 0.03, hy - 0.02, hz - 0.04))
    hinge_parts_base.append(plate_b)
    
    # Hinge mounting plates on lid
    plate_l = _make_box(f"_hpl_{x_off}",
                        (0.12, 0.03, 0.06),
                        (hx + 0.03, hy - 0.02, hz + 0.04))
    _set_pivot(plate_l, (PIVOT_X, PIVOT_Y, PIVOT_Z))
    hinge_parts_lid.append(plate_l)

# Join base hinge parts
if hinge_parts_base:
    _join_objects(hinge_parts_base[0], hinge_parts_base[1:])
    hinges_base = hinge_parts_base[0]
else:
    hinges_base = _make_box("hinges_base", (0.01, 0.01, 0.01))

# Join lid hinge parts
if hinge_parts_lid:
    _join_objects(hinge_parts_lid[0], hinge_parts_lid[1:])
    hinges_lid = hinge_parts_lid[0]
else:
    hinges_lid = _make_box("hinges_lid", (0.01, 0.01, 0.01))
    _set_pivot(hinges_lid, (PIVOT_X, PIVOT_Y, PIVOT_Z))

# Join pins into base hinges
if pin_parts:
    _join_objects(hinges_base, pin_parts)

# Combine into single "hinges" object — base portion is the main object
# Lid portion gets parented to lid
hinges_base.name = "hinges"
_bevel_object(hinges_base, width=0.003, segments=1)
_assign_mat(hinges_base, "metal_hardware")
_generate_uvs(hinges_base)

_bevel_object(hinges_lid, width=0.003, segments=1)
_assign_mat(hinges_lid, "metal_hardware")
_generate_uvs(hinges_lid)
hinges_lid.name = "hinges_lid_part"
myway_print_progress("hinges complete")

# === SIDE HANDLES ===
myway_print_progress("Building side_handles...")
handle_parts = []

for sx in [1, -1]:
    # Bracket plate
    bracket = _make_box(f"_hb_{sx}",
                        (0.04, 0.18, 0.12),
                        (sx * (CHEST_W/2 + 0.005), 0, BASE_H * 0.5))
    handle_parts.append(bracket)
    
    # Bracket rivets
    for ry in [-0.06, 0.06]:
        riv = _make_cylinder(f"_hriv_{sx}_{ry}",
                             0.015, 0.02,
                             location=(sx * (CHEST_W/2 + 0.02), ry, BASE_H * 0.5),
                             rotation=(0, math.radians(90), 0),
                             verts=10)
        handle_parts.append(riv)
    
    # Handle loop (torus)
    loop = _make_torus(f"_hl_{sx}",
                       0.06, 0.012,
                       location=(sx * (CHEST_W/2 + 0.05), 0, BASE_H * 0.5),
                       rotation=(0, math.radians(90), 0),
                       major_seg=20, minor_seg=8)
    handle_parts.append(loop)

if handle_parts:
    _join_objects(handle_parts[0], handle_parts[1:])
    side_handles = handle_parts[0]
    side_handles.name = "side_handles"
else:
    side_handles = _make_box("side_handles", (0.01, 0.01, 0.01))

_bevel_object(side_handles, width=0.004, segments=2)
_shade_smooth(side_handles)
_assign_mat(side_handles, "metal_hardware")
_generate_uvs(side_handles)
myway_print_progress("side_handles complete")

# === LOCK PLATE ===
myway_print_progress("Building lock_plate...")
lock_parts = []

# Main plate
plate = _make_box("_lp_main",
                  (0.28, 0.04, 0.35),
                  (0, CHEST_D/2 + 0.006, BASE_H * 0.45))
lock_parts.append(plate)

# Ornamental border (slightly larger, thinner)
border = _make_box("_lp_border",
                   (0.32, 0.02, 0.39),
                   (0, CHEST_D/2 + 0.003, BASE_H * 0.45))
lock_parts.append(border)

# Keyhole — cut a hole
keyhole_cutter = _make_cylinder("_kh_cutter",
                                0.025, 0.1,
                                location=(0, CHEST_D/2 + 0.01, BASE_H * 0.45),
                                rotation=(math.radians(90), 0, 0),
                                verts=16)
# Keyhole slot below
keyhole_slot = _make_box("_kh_slot",
                         (0.012, 0.1, 0.04),
                         (0, CHEST_D/2 + 0.01, BASE_H * 0.45 - 0.04))

# Join plate and border first
_join_objects(lock_parts[0], lock_parts[1:])
lock_plate = lock_parts[0]
lock_plate.name = "lock_plate"

# Cut keyhole
_select_active(lock_plate)
bm = lock_plate.modifiers.new(name="KH1", type='BOOLEAN')
bm.operation = 'DIFFERENCE'
bm.object = keyhole_cutter
_apply_all_modifiers(lock_plate)
bpy.data.objects.remove(keyhole_cutter, do_unlink=True)

_select_active(lock_plate)
bm = lock_plate.modifiers.new(name="KH2", type='BOOLEAN')
bm.operation = 'DIFFERENCE'
bm.object = keyhole_slot
_apply_all_modifiers(lock_plate)
bpy.data.objects.remove(keyhole_slot, do_unlink=True)

# Rivets on lock plate
for rz in [BASE_H * 0.45 + 0.12, BASE_H * 0.45 - 0.12]:
    for rx in [-0.1, 0.1]:
        riv = _make_cylinder(f"_lpr_{rx}_{rz}",
                             0.012, 0.015,
                             location=(rx, CHEST_D/2 + 0.015, rz),
                             rotation=(math.radians(90), 0, 0),
                             verts=10)
        _join_objects(lock_plate, [riv])

_bevel_object(lock_plate, width=0.004, segments=2)
_assign_mat(lock_plate, "metal_hardware")
_generate_uvs(lock_plate)
myway_print_progress("lock_plate complete")

# === LOCK HASP ===
myway_print_progress("Building lock_hasp...")
hasp_parts = []

# Hinged strap — curved bar
hasp_bar = _make_box("_hasp_bar",
                    (0.08, 0.04, 0.22),
                    (0, CHEST_D/2 + 0.01, 0))
hasp_parts.append(hasp_bar)

# Padlock hole
hasp_hole = _make_cylinder("_hasp_hole",
                           0.018, 0.06,
                           location=(0, CHEST_D/2 + 0.02, -0.08),
                           rotation=(math.radians(90), 0, 0),
                           verts=16)

# Rivets on hasp
for rz in [0.06, 0.0]:
    riv = _make_cylinder(f"_hasp_riv_{rz}",
                         0.012, 0.015,
                         location=(0, CHEST_D/2 + 0.025, rz),
                         rotation=(math.radians(90), 0, 0),
                         verts=10)
    hasp_parts.append(riv)

# Top attachment ring
hasp_ring = _make_torus("_hasp_ring",
                        0.025, 0.008,
                        location=(0, CHEST_D/2 + 0.02, 0.12),
                        rotation=(math.radians(90), 0, 0),
                        major_seg=16, minor_seg=8)
hasp_parts.append(hasp_ring)

_join_objects(hasp_parts[0], hasp_parts[1:])
lock_hasp = hasp_parts[0]
lock_hasp.name = "lock_hasp"

# Cut padlock hole
_select_active(lock_hasp)
bm = lock_hasp.modifiers.new(name="HaspHole", type='BOOLEAN')
bm.operation = 'DIFFERENCE'
bm.object = hasp_hole
_apply_all_modifiers(lock_hasp)
bpy.data.objects.remove(hasp_hole, do_unlink=True)

# Position hasp on lid front
# Lid front edge is at approximately y = CHEST_D/2, z = BASE_H (when closed)
# Hasp hangs down from lid front
hasp_attach_z = BASE_H + 0.05  # slightly above base top, on lid front
lock_hasp.location = (0, CHEST_D/2 - 0.02, hasp_attach_z)
bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)

# Set pivot at top attachment point on lid front
hasp_pivot = (0, CHEST_D/2 - 0.02, hasp_attach_z + 0.1)
_set_pivot(lock_hasp, hasp_pivot)

_bevel_object(lock_hasp, width=0.004, segments=2)
_assign_mat(lock_hasp, "metal_hardware")
_generate_uvs(lock_hasp)
myway_print_progress("lock_hasp complete")

# === PARENTING ===
myway_print_progress("Setting up hierarchy...")

# Parent lid to base
myway_parent(lid_full, base_outer)

# Parent lid-mounted parts to lid
myway_parent(metal_bands_lid, lid_full)
myway_parent(hinges_lid, lid_full)
myway_parent(lock_hasp, lid_full)

# Parent base-mounted parts to base
myway_parent(metal_bands_base, base_outer)
myway_parent(corner_brackets, base_outer)
myway_parent(hinges_base, base_outer)
myway_parent(side_handles, base_outer)
myway_parent(lock_plate, base_outer)

myway_print_progress("Hierarchy complete")

# === GROUND AND NORMALIZE ===
myway_print_progress("Grounding and normalizing...")
myway_ground_asset(base_outer)
myway_normalize_extent(base_outer, 2.0)

myway_print_progress("Treasure chest build complete!")
myway_print_progress(f"Parts: {[o.name for o in bpy.data.objects if o.type == 'MESH']}")