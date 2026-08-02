import bpy
import math
from mathutils import Vector, Matrix

# ============================================================
# Wheelchair Asset Script
# ============================================================

myway_reset_scene()

# Material slots
myway_material_slot("mat_metal_frame")
myway_material_slot("mat_rubber_tire")
myway_material_slot("mat_metal_rim")
myway_material_slot("mat_fabric_seat")

myway_print_progress("MYWAY_PROGRESS: Materials initialized")

# ============================================================
# Helper: Tube between points
# ============================================================
def make_tube(name, p1, p2, radius, mat_slot="mat_metal_frame"):
    obj = myway_tube_between_points(p1, p2, radius, resolution=12)
    obj.name = name
    myway_assign_material_slot(obj, mat_slot)
    myway_generate_uvs(obj)
    return obj

def make_box_part(name, size, location, mat_slot="mat_metal_frame"):
    obj = myway_box(size[0], size[1], size[2])
    obj.name = name
    obj.location = location
    myway_assign_material_slot(obj, mat_slot)
    myway_generate_uvs(obj)
    return obj

def make_cyl_part(name, radius, depth, location, rotation=(0,0,0), mat_slot="mat_metal_frame", verts=16):
    obj = myway_cylinder(radius, depth, vertices=verts)
    obj.name = name
    obj.location = location
    obj.rotation_euler = rotation
    myway_assign_material_slot(obj, mat_slot)
    myway_generate_uvs(obj)
    return obj

# ============================================================
# Dimensions (meters)
# ============================================================
W = 0.42  # half width between side frames
HL = 0.55  # seat length
HB = 0.45  # backrest height
SZ = 0.50  # seat height
TR = 0.30  # rear wheel radius
CR = 0.08  # caster wheel radius
TRad = 0.025 # tube radius

# ============================================================
# Frame Main
# ============================================================
myway_print_progress("MYWAY_PROGRESS: Building frame_main")

frame_parts = []

# Seat rails (left/right)
for side, x in [("L", -W), ("R", W)]:
    rail = make_tube(f"frame_seat_rail_{side}", (x, -HL/2, SZ), (x, HL/2, SZ), TRad)
    frame_parts.append(rail)

# Backrest uprights
for side, x in [("L", -W), ("R", W)]:
    up = make_tube(f"frame_backrest_up_{side}", (x, HL/2, SZ), (x, HL/2, SZ+HB), TRad)
    frame_parts.append(up)

# Backrest top bar
top_bar = make_tube("frame_backrest_top", (-W, HL/2, SZ+HB), (W, HL/2, SZ+HB), TRad)
frame_parts.append(top_bar)

# Front uprights (caster mounts)
for side, x in [("L", -W), ("R", W)]:
    fu = make_tube(f"frame_front_up_{side}", (x, -HL/2, SZ), (x, -HL/2, SZ*0.45), TRad)
    frame_parts.append(fu)

# Rear axle uprights
for side, x in [("L", -W), ("R", W)]:
    ru = make_tube(f"frame_rear_up_{side}", (x, HL/2-0.05, SZ), (x, HL/2-0.05, TR), TRad)
    frame_parts.append(ru)

# Push handles (curved up from backrest top)
for side, x in [("L", -W), ("R", W)]:
    ph = make_tube(f"frame_push_handle_{side}", (x, HL/2, SZ+HB), (x, HL/2+0.12, SZ+HB+0.10), TRad)
    frame_parts.append(ph)
    # Handle grip cylinder
    grip = make_cyl_part(f"frame_handle_grip_{side}", 0.028, 0.12, (x, HL/2+0.12, SZ+HB+0.10), rotation=(math.radians(90),0,0), verts=12)
    frame_parts.append(grip)

# Bottom front connector
bc = make_tube("frame_bottom_front", (-W, -HL/2, SZ*0.45), (W, -HL/2, SZ*0.45), TRad*0.8)
frame_parts.append(bc)

# Bottom rear connector
brc = make_tube("frame_bottom_rear", (-W, HL/2-0.05, SZ*0.45), (W, HL/2-0.05, SZ*0.45), TRad*0.8)
frame_parts.append(brc)

# Join all frame parts into frame_main
myway_activate(frame_parts[0])
for p in frame_parts[1:]:
    p.select_set(True)
frame_main = myway_join(frame_parts[0])
frame_main.name = "frame_main"
myway_bevel_relative(frame_main, 0.02)
myway_smooth(frame_main)

# ============================================================
# Cross Braces (folding mechanism)
# ============================================================
myway_print_progress("MYWAY_PROGRESS: Building cross braces")

# Left cross brace: from front-left-bottom to rear-right-bottom
cb_l_parts = []
p1_l = Vector((-W, -HL/2+0.05, SZ*0.3))
p2_l = Vector((W, HL/2-0.1, SZ*0.3))
mid_l = (p1_l + p2_l) / 2
t1 = make_tube("cb_l_a", p1_l, mid_l, TRad*0.6)
t2 = make_tube("cb_l_b", mid_l, p2_l, TRad*0.6)
cb_l_parts.extend([t1, t2])
# Center pivot bushing
bush_l = make_cyl_part("cb_l_bush", 0.02, 0.04, mid_l, rotation=(math.radians(90),0,0), verts=12)
cb_l_parts.append(bush_l)
myway_activate(cb_l_parts[0])
for p in cb_l_parts[1:]:
    p.select_set(True)
cb_l = myway_join(cb_l_parts[0])
cb_l.name = "frame_cross_brace_left"
myway_pivot_at(cb_l, mid_l)

# Right cross brace: from front-right-bottom to rear-left-bottom
cb_r_parts = []
p1_r = Vector((W, -HL/2+0.05, SZ*0.3))
p2_r = Vector((-W, HL/2-0.1, SZ*0.3))
mid_r = (p1_r + p2_r) / 2
t3 = make_tube("cb_r_a", p1_r, mid_r, TRad*0.6)
t4 = make_tube("cb_r_b", mid_r, p2_r, TRad*0.6)
cb_r_parts.extend([t3, t4])
bush_r = make_cyl_part("cb_r_bush", 0.02, 0.04, mid_r, rotation=(math.radians(90),0,0), verts=12)
cb_r_parts.append(bush_r)
myway_activate(cb_r_parts[0])
for p in cb_r_parts[1:]:
    p.select_set(True)
cb_r = myway_join(cb_r_parts[0])
cb_r.name = "frame_cross_brace_right"
myway_pivot_at(cb_r, mid_r)

# ============================================================
# Rear Wheels
# ============================================================
myway_print_progress("MYWAY_PROGRESS: Building rear wheels")

def build_wheel(name, hub_x, tire_radius=TR):
    parts = []
    # Tire (torus)
    tire = myway_torus(tire_radius, tire_radius*0.08, major_segments=32, minor_segments=12)
    tire.name = f"{name}_tire"
    tire.location = (hub_x, 0, tire_radius)
    tire.rotation_euler = (math.radians(90), 0, 0)
    myway_assign_material_slot(tire, "mat_rubber_tire")
    myway_generate_uvs(tire)
    parts.append(tire)
    
    # Rim (inner torus)
    rim = myway_torus(tire_radius*0.92, tire_radius*0.025, major_segments=32, minor_segments=8)
    rim.name = f"{name}_rim"
    rim.location = (hub_x, 0, tire_radius)
    rim.rotation_euler = (math.radians(90), 0, 0)
    myway_assign_material_slot(rim, "mat_metal_rim")
    myway_generate_uvs(rim)
    parts.append(rim)
    
    # Hub
    hub = make_cyl_part(f"{name}_hub", 0.04, 0.06, (hub_x, 0, tire_radius), rotation=(0, math.radians(90), 0), verts=16)
    parts.append(hub)
    
    # Spokes
    n_spokes = 12
    for i in range(n_spokes):
        ang = (2 * math.pi / n_spokes) * i
        sx = math.cos(ang) * tire_radius * 0.85
        sz = math.sin(ang) * tire_radius * 0.85
        spoke = make_tube(f"{name}_spoke_{i}", (hub_x, 0, tire_radius), (hub_x, sx, tire_radius+sz), 0.005)
        parts.append(spoke)
    
    # Join into wheel object
    myway_activate(parts[0])
    for p in parts[1:]:
        p.select_set(True)
    wheel = myway_join(parts[0])
    wheel.name = name
    # Pivot at hub center
    myway_pivot_at(wheel, (hub_x, 0, tire_radius))
    return wheel

wheel_l = build_wheel("wheel_rear_left", -W - 0.04)
wheel_r = build_wheel("wheel_rear_right", W + 0.04)

# ============================================================
# Hand Rims
# ============================================================
myway_print_progress("MYWAY_PROGRESS: Building hand rims")

def build_hand_rim(name, x):
    parts = []
    # Main rim tube
    rim = myway_torus(TR*0.85, 0.012, major_segments=32, minor_segments=8)
    rim.name = f"{name}_rim"
    rim.location = (x, 0, TR)
    rim.rotation_euler = (math.radians(90), 0, 0)
    myway_assign_material_slot(rim, "mat_metal_rim")
    myway_generate_uvs(rim)
    parts.append(rim)
    
    # Standoff brackets (4 small tubes connecting rim to wheel hub plane)
    for i in range(4):
        ang = (2 * math.pi / 4) * i + math.pi/4
        sx = math.cos(ang) * TR * 0.85
        sz = math.sin(ang) * TR * 0.85
        # standoff from rim inward to wheel plane
        standoff = make_tube(f"{name}_standoff_{i}", (x, sx, TR+sz), (x - (0.04 if x < 0 else -0.04), sx, TR+sz), 0.006)
        parts.append(standoff)
    
    myway_activate(parts[0])
    for p in parts[1:]:
        p.select_set(True)
    hr = myway_join(parts[0])
    hr.name = name
    myway_pivot_at(hr, (x, 0, TR))
    return hr

hr_l = build_hand_rim("hand_rim_left", -W - 0.08)
hr_r = build_hand_rim("hand_rim_right", W + 0.08)

# ============================================================
# Caster Assemblies
# ============================================================
myway_print_progress("MYWAY_PROGRESS: Building caster assemblies")

def build_caster(name, x, y):
    parts = []
    # Swivel stem
    stem = make_cyl_part(f"{name}_stem", 0.015, 0.06, (x, y, SZ*0.45), verts=12)
    parts.append(stem)
    
    # Fork
    fork_y = y - 0.02
    fork_l = make_tube(f"{name}_fork_l", (x-0.025, fork_y, SZ*0.42), (x-0.025, fork_y, SZ*0.42 - 0.06), 0.008)
    fork_r = make_tube(f"{name}_fork_r", (x+0.025, fork_y, SZ*0.42), (x+0.025, fork_y, SZ*0.42 - 0.06), 0.008)
    parts.extend([fork_l, fork_r])
    
    # Caster wheel (small torus)
    cw_z = SZ*0.42 - 0.06 - CR
    cw = myway_torus(CR, CR*0.1, major_segments=16, minor_segments=8)
    cw.name = f"{name}_wheel"
    cw.location = (x, fork_y, cw_z)
    cw.rotation_euler = (0, math.radians(90), 0)
    myway_assign_material_slot(cw, "mat_rubber_tire")
    myway_generate_uvs(cw)
    parts.append(cw)
    
    # Caster hub
    ch = make_cyl_part(f"{name}_hub", 0.01, 0.05, (x, fork_y, cw_z), rotation=(0, math.radians(90), 0), verts=12)
    parts.append(ch)
    
    myway_activate(parts[0])
    for p in parts[1:]:
        p.select_set(True)
    caster = myway_join(parts[0])
    caster.name = name
    # Pivot at swivel stem top
    myway_pivot_at(caster, (x, y, SZ*0.45))
    return caster

caster_l = build_caster("caster_assembly_front_left", -W+0.02, -HL/2)
caster_r = build_caster("caster_assembly_front_right", W-0.02, -HL/2)

# ============================================================
# Seat Sling & Backrest Sling
# ============================================================
myway_print_progress("MYWAY_PROGRESS: Building fabric slings")

# Seat sling - slightly curved box
seat = myway_box(W*2 - 0.02, HL - 0.04, 0.01)
seat.name = "seat_sling"
seat.location = (0, 0, SZ - 0.005)
# Slight sag in middle via simple scale Z manipulation (stylized)
myway_assign_material_slot(seat, "mat_fabric_seat")
myway_generate_uvs(seat)
myway_box_uv(seat)

# Backrest sling
back = myway_box(W*2 - 0.02, 0.01, HB - 0.04)
back.name = "backrest_sling"
back.location = (0, HL/2 - 0.005, SZ + HB/2)
myway_assign_material_slot(back, "mat_fabric_seat")
myway_generate_uvs(back)
myway_box_uv(back)

# ============================================================
# Armrests
# ============================================================
myway_print_progress("MYWAY_PROGRESS: Building armrests")

def build_armrest(name, x):
    parts = []
    # Support post
    post = make_tube(f"{name}_post", (x, -HL/4, SZ), (x, -HL/4, SZ+0.20), TRad*0.7)
    parts.append(post)
    # Arm bar
    bar = make_tube(f"{name}_bar", (x, -HL/4, SZ+0.20), (x, HL/4-0.05, SZ+0.20), TRad*0.7)
    parts.append(bar)
    # Grip pad
    pad = make_box_part(f"{name}_pad", (0.04, HL/2, 0.015), (x, HL/8, SZ+0.20))
    parts.append(pad)
    
    myway_activate(parts[0])
    for p in parts[1:]:
        p.select_set(True)
    ar = myway_join(parts[0])
    ar.name = name
    return ar

arm_l = build_armrest("armrest_left", -W - 0.03)
arm_r = build_armrest("armrest_right", W + 0.03)

# ============================================================
# Footrests
# ============================================================
myway_print_progress("MYWAY_PROGRESS: Building footrests")

def build_footrest(name, x):
    parts = []
    # Swing-away arm
    arm_top = (x, -HL/2, SZ*0.45)
    arm_bot = (x, -HL/2 - 0.08, SZ*0.15)
    arm = make_tube(f"{name}_arm", arm_top, arm_bot, TRad*0.7)
    parts.append(arm)
    # Footplate
    plate = make_box_part(f"{name}_plate", (0.12, 0.10, 0.008), (x, -HL/2 - 0.14, SZ*0.15))
    parts.append(plate)
    # Support strut
    strut = make_tube(f"{name}_strut", arm_bot, (x, -HL/2 - 0.14, SZ*0.15), TRad*0.5)
    parts.append(strut)
    
    myway_activate(parts[0])
    for p in parts[1:]:
        p.select_set(True)
    fr = myway_join(parts[0])
    fr.name = name
    # Pivot at swing-away joint
    myway_pivot_at(fr, arm_top)
    return fr

foot_l = build_footrest("footrest_left", -W*0.5)
foot_r = build_footrest("footrest_right", W*0.5)

# ============================================================
# Brake Levers
# ============================================================
myway_print_progress("MYWAY_PROGRESS: Building brake levers")

def build_brake(name, x):
    parts = []
    # Mount block
    mount = make_box_part(f"{name}_mount", (0.02, 0.03, 0.02), (x, HL/4, SZ+0.02))
    parts.append(mount)
    # Lever bar
    lever = make_tube(f"{name}_lever", (x, HL/4, SZ+0.03), (x, HL/4 + 0.10, SZ+0.03), TRad*0.6)
    parts.append(lever)
    # Lever tip
    tip = make_tube(f"{name}_tip", (x, HL/4 + 0.10, SZ+0.03), (x, HL/4 + 0.10, SZ-0.02), TRad*0.6)
    parts.append(tip)
    
    myway_activate(parts[0])
    for p in parts[1:]:
        p.select_set(True)
    bl = myway_join(parts[0])
    bl.name = name
    # Pivot at lock pivot
    myway_pivot_at(bl, (x, HL/4, SZ+0.03))
    return bl

brake_l = build_brake("brake_lever_left", -W - 0.02)
brake_r = build_brake("brake_lever_right", W + 0.02)

# ============================================================
# Parenting / Hierarchy
# ============================================================
myway_print_progress("MYWAY_PROGRESS: Assembling hierarchy")

# Parent wheels to hand rims first (hand rim parented to wheel per brief)
myway_parent_keep_transform(hr_l, wheel_l)
myway_parent_keep_transform(hr_r, wheel_r)

# Parent everything to frame_main
children_of_frame = [
    cb_l, cb_r,
    wheel_l, wheel_r,
    caster_l, caster_r,
    seat, back,
    arm_l, arm_r,
    foot_l, foot_r,
    brake_l, brake_r
]

for child in children_of_frame:
    myway_parent_keep_transform(child, frame_main)

# ============================================================
# Ground & Normalize
# ============================================================
myway_print_progress("MYWAY_PROGRESS: Grounding and normalizing")

myway_ground_asset(frame_main)
myway_normalize_extent(2.0, frame_main)

myway_print_progress("MYWAY_PROGRESS: Wheelchair asset complete")