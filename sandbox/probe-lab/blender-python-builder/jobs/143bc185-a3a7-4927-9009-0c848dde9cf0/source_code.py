import bpy
import math

myway_reset_scene()

# --- Material Slots ---
myway_material_slot("camera_body_paint")
myway_material_slot("leather_grip")
myway_material_slot("aged_brass")
myway_material_slot("matte_rubber")
myway_material_slot("dark_metal")

# --- Camera Body ---
myway_print_progress("Building camera body")
body_w = 0.18
body_h = 0.10
body_d = 0.06
camerabody = myway_box(body_w, body_h, body_d, name="camerabody")
camerabody.location = (0, 0, body_h / 2)
myway_bevel_relative(camerabody, 0.08, segments=4)
myway_smooth(camerabody)
myway_assign_material_slot(camerabody, "camera_body_paint")
myway_generate_uvs(camerabody)

# --- Top Housing ---
top_housing = myway_box(body_w * 0.85, 0.025, body_d * 0.9, name="top_housing")
top_housing.location = (0, 0, body_h + 0.0125)
myway_bevel_relative(top_housing, 0.15, segments=3)
myway_smooth(top_housing)
myway_assign_material_slot(top_housing, "camera_body_paint")
myway_parent(top_housing, camerabody)

# --- Front Leather Panel ---
myway_print_progress("Building front leather panel")
leather_panel = myway_box(body_w * 0.78, body_h * 0.78, 0.004, name="frontleatherpanel")
leather_panel.location = (0, -body_d / 2 - 0.001, body_h / 2)
myway_bevel_relative(leather_panel, 0.1, segments=3)
myway_smooth(leather_panel)
myway_assign_material_slot(leather_panel, "leather_grip")
myway_generate_uvs(leather_panel)
myway_parent(leather_panel, camerabody)

# --- Lens Mount ---
myway_print_progress("Building lens mount")
lens_mount_r = 0.038
lens_mount_d = 0.012
lensmount = myway_cylinder(lens_mount_r, lens_mount_d, axis='Y', name="lensmount")
lensmount.location = (0, -body_d / 2 - lens_mount_d / 2, body_h / 2)
myway_bevel_relative(lensmount, 0.08, segments=3)
myway_smooth(lensmount)
myway_assign_material_slot(lensmount, "aged_brass")
myway_generate_uvs(lensmount)
myway_parent(lensmount, camerabody)

# --- Lens Barrel Outer ---
myway_print_progress("Building layered lens barrel")
lens_y_start = -body_d / 2 - lens_mount_d
lens_segments = [
    (0.034, 0.015),
    (0.032, 0.008),
    (0.030, 0.020),
    (0.028, 0.005),
    (0.026, 0.012),
    (0.024, 0.008),
    (0.022, 0.006)
]

lensbarrelouter = None
current_y = lens_y_start
for i, (r, d) in enumerate(lens_segments):
    seg = myway_cylinder(r, d, axis='Y', name=f"lens_seg_{i}")
    seg.location = (0, current_y - d / 2, body_h / 2)
    myway_bevel_relative(seg, 0.05, segments=2)
    myway_smooth(seg)
    myway_assign_material_slot(seg, "dark_metal")
    if lensbarrelouter is None:
        lensbarrelouter = seg
    else:
        myway_join(lensbarrelouter, seg)
    current_y -= d

# Front Glass Recess
glass_recess = myway_cylinder(0.018, 0.004, axis='Y', name="lens_glass_recess")
glass_recess.location = (0, current_y - 0.002, body_h / 2)
myway_smooth(glass_recess)
myway_assign_material_slot(glass_recess, "dark_metal")
myway_join(lensbarrelouter, glass_recess)

myway_generate_uvs(lensbarrelouter)
myway_pivot_at(lensbarrelouter, (0, -body_d / 2, body_h / 2))
myway_parent(lensbarrelouter, camerabody)

# --- Focus Ring ---
myway_print_progress("Building focus ring")
focus_r = 0.031
focus_d = 0.018
focus_y = lens_y_start - 0.015 - focus_d / 2
focusring = myway_cylinder(focus_r, focus_d, axis='Y', name="focusring")
focusring.location = (0, focus_y, body_h / 2)
myway_bevel_relative(focusring, 0.1, segments=4)
myway_smooth(focusring)
myway_assign_material_slot(focusring, "matte_rubber")
myway_generate_uvs(focusring)
myway_pivot_at(focusring, (0, -body_d / 2, body_h / 2))
myway_parent(focusring, lensbarrelouter)

# --- Shutter Dial ---
myway_print_progress("Building shutter dial")
shutter_r = 0.018
shutter_h = 0.012
shutterdial = myway_cylinder(shutter_r, shutter_h, axis='Z', name="shutterdial")
shutterdial.location = (-body_w * 0.3, 0, body_h + 0.025 + shutter_h / 2)
myway_bevel_relative(shutterdial, 0.15, segments=4)
myway_smooth(shutterdial)
myway_assign_material_slot(shutterdial, "aged_brass")
myway_generate_uvs(shutterdial)
myway_pivot_at(shutterdial, (-body_w * 0.3, 0, body_h + 0.025))
myway_parent(shutterdial, camerabody)

# Secondary Dial (Static)
secondary_dial = myway_cylinder(0.014, 0.010, axis='Z', name="secondary_dial")
secondary_dial.location = (body_w * 0.3, 0, body_h + 0.025 + 0.005)
myway_bevel_relative(secondary_dial, 0.15, segments=4)
myway_smooth(secondary_dial)
myway_assign_material_slot(secondary_dial, "aged_brass")
myway_parent(secondary_dial, camerabody)

# Shutter Button
shutter_btn = myway_cylinder(0.006, 0.006, axis='Z', name="shutter_btn")
shutter_btn.location = (-body_w * 0.1, 0, body_h + 0.025 + 0.003)
myway_smooth(shutter_btn)
myway_assign_material_slot(shutter_btn, "aged_brass")
myway_parent(shutter_btn, camerabody)

# --- Viewfinder Frame ---
myway_print_progress("Building viewfinder frame")
vf_frame = myway_box(0.035, 0.004, 0.022, name="viewfinderframe")
vf_frame.location = (body_w * 0.15, -body_d / 2 - 0.002, body_h * 0.75)
myway_bevel_relative(vf_frame, 0.2, segments=3)
myway_smooth(vf_frame)
myway_assign_material_slot(vf_frame, "aged_brass")
myway_generate_uvs(vf_frame)
myway_parent(vf_frame, camerabody)

# Viewfinder Glass
vf_glass = myway_box(0.028, 0.001, 0.016, name="vf_glass")
vf_glass.location = (body_w * 0.15, -body_d / 2 - 0.004, body_h * 0.75)
myway_smooth(vf_glass)
myway_assign_material_slot(vf_glass, "dark_metal")
myway_parent(vf_glass, camerabody)

# --- Strap Lugs ---
myway_print_progress("Building strap lugs")
for side in [-1, 1]:
    lug = myway_cylinder(0.005, 0.018, axis='Y', name=f"strap_lug_{'L' if side == -1 else 'R'}")
    lug.location = (side * body_w * 0.48, 0, body_h * 0.85)
    myway_smooth(lug)
    myway_assign_material_slot(lug, "aged_brass")
    myway_parent(lug, camerabody)

# --- Ground and Normalize ---
myway_print_progress("Grounding and normalizing")
myway_ground_asset(camerabody)
myway_normalize_extent(0.22, camerabody)

myway_print_progress("Vintage camera asset complete.")