import bpy
import math
from mathutils import Vector

# =============================================================================
# MyWay reference-build test: stylized mechanical desk fan
# Reference intent:
# - reference-inspired taller support neck and slightly taller overall stance
# - 300 mm cage diameter
# - 220 mm weighted base
# - 160 mm overall depth
# - painted blue-gray metal, charcoal molded plastic,
#   matte light-gray blades, black rubber, silver pivot hardware
#
# This script uses native bpy geometry and only relies on MyWay at the trusted
# material / lifecycle boundary.
# =============================================================================

TARGET_EXTENT_M = 2.0

# Reference-scale dimensions in meters.
BASE_RADIUS = 0.110
BASE_HEIGHT = 0.026
PAD_HEIGHT = 0.008

HEAD_Z = 0.255
CAGE_RADIUS = 0.150
CAGE_FRONT_Y = -0.030
CAGE_REAR_Y = 0.030
CAGE_OUTER_WIRE = 0.0038
CAGE_INNER_WIRE = 0.00145

BLADE_RADIUS = 0.124
BLADE_THICKNESS = 0.0045
HUB_RADIUS = 0.037

MOTOR_RADIUS = 0.058
MOTOR_DEPTH = 0.078
MOTOR_CENTER_Y = 0.070

COLUMN_RADIUS = 0.018
COLUMN_BOTTOM_Z = BASE_HEIGHT
COLUMN_TOP_Z = 0.130

YOKE_PIVOT_X = 0.163
YOKE_DEPTH = 0.010
YOKE_WIDTH = 0.015

# -----------------------------------------------------------------------------
# MyWay lifecycle
# -----------------------------------------------------------------------------

if "myway_reset_scene" in globals():
    myway_reset_scene()
else:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

if "myway_print_progress" in globals():
    myway_print_progress("building reference-matched mechanical desk fan")

# -----------------------------------------------------------------------------
# Materials
# -----------------------------------------------------------------------------

def create_fallback_material(name, color, metallic, roughness):
    material = bpy.data.materials.get(name)
    if material is None:
        material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    principled = nodes.get("Principled BSDF")
    if principled is not None:
        base = principled.inputs.get("Base Color")
        if base is not None:
            base.default_value = color
        metal = principled.inputs.get("Metallic")
        if metal is not None:
            metal.default_value = metallic
        rough = principled.inputs.get("Roughness")
        if rough is not None:
            rough.default_value = roughness
    return material


def material_slot(slot_id, fallback_color, metallic, roughness):
    if "myway_material_slot" in globals():
        return myway_material_slot(
            slot_id,
            fallback_color=fallback_color,
            metallic=metallic,
            roughness=roughness,
        )
    return create_fallback_material(
        f"Fallback_{slot_id}",
        fallback_color,
        metallic,
        roughness,
    )


painted_metal = material_slot(
    "painted_blue_gray_metal",
    (0.25, 0.34, 0.42, 1.0),
    0.55,
    0.34,
)
dark_plastic = material_slot(
    "charcoal_molded_plastic",
    (0.075, 0.082, 0.090, 1.0),
    0.05,
    0.42,
)
blade_material = material_slot(
    "matte_translucent_blade",
    (0.52, 0.57, 0.64, 1.0),
    0.0,
    0.38,
)
rubber_material = material_slot(
    "black_rubber",
    (0.020, 0.024, 0.028, 1.0),
    0.0,
    0.78,
)
silver_metal = material_slot(
    "brushed_silver_metal",
    (0.58, 0.61, 0.64, 1.0),
    0.82,
    0.24,
)

# Give the blades a slightly softer, lighter response when the current
# Blender Principled node exposes these inputs.
blade_principled = None
if blade_material and blade_material.use_nodes:
    blade_principled = blade_material.node_tree.nodes.get("Principled BSDF")
if blade_principled is not None:
    transmission = blade_principled.inputs.get("Transmission Weight")
    if transmission is not None:
        transmission.default_value = 0.12
    coat = blade_principled.inputs.get("Coat Weight")
    if coat is not None:
        coat.default_value = 0.08

# -----------------------------------------------------------------------------
# Shared helpers
# -----------------------------------------------------------------------------

def activate(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def apply_transform(obj, location=False, rotation=False, scale=True):
    activate(obj)
    bpy.ops.object.transform_apply(
        location=location,
        rotation=rotation,
        scale=scale,
    )


def assign_material(obj, material):
    if obj is None or obj.type != "MESH":
        return obj
    obj.data.materials.clear()
    obj.data.materials.append(material)
    return obj


def set_smooth(obj, smooth=True):
    if obj is None or obj.type != "MESH":
        return obj
    for polygon in obj.data.polygons:
        polygon.use_smooth = smooth
    return obj


def apply_bevel(obj, width, segments=3):
    if obj is None or obj.type != "MESH" or width <= 0.0:
        return obj
    modifier = obj.modifiers.new(name="ReferenceBevel", type="BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = "ANGLE"
    activate(obj)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    return obj


def parent_keep_transform(child, parent):
    world = child.matrix_world.copy()
    child.parent = parent
    child.matrix_world = world
    return child


def join_meshes(objects, name, material=None, parent=None):
    meshes = [
        obj for obj in objects
        if obj is not None and obj.type == "MESH"
    ]
    if not meshes:
        return None
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    joined = bpy.context.object
    joined.name = name
    if material is not None:
        assign_material(joined, material)
    if parent is not None:
        parent_keep_transform(joined, parent)
    return joined


def add_box(name, size, location, material, bevel=0.0, parent=None):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (
        size[0] * 0.5,
        size[1] * 0.5,
        size[2] * 0.5,
    )
    apply_transform(obj, scale=True)
    assign_material(obj, material)
    if bevel > 0.0:
        apply_bevel(obj, bevel, 3)
    if parent is not None:
        parent_keep_transform(obj, parent)
    return obj


def add_cylinder(
    name,
    radius,
    depth,
    location,
    material,
    axis="Z",
    vertices=48,
    bevel=0.0,
    parent=None,
):
    rotation = (0.0, 0.0, 0.0)
    if axis == "X":
        rotation = (0.0, math.radians(90.0), 0.0)
    elif axis == "Y":
        rotation = (math.radians(90.0), 0.0, 0.0)

    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    apply_transform(obj, rotation=True, scale=True)
    assign_material(obj, material)
    set_smooth(obj, True)
    if bevel > 0.0:
        apply_bevel(obj, bevel, 3)
    if parent is not None:
        parent_keep_transform(obj, parent)
    return obj


def add_torus_y(
    name,
    major_radius,
    minor_radius,
    location,
    material,
    major_segments=64,
    minor_segments=10,
    parent=None,
):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=major_segments,
        minor_segments=minor_segments,
        location=location,
        rotation=(math.radians(90.0), 0.0, 0.0),
    )
    obj = bpy.context.object
    obj.name = name
    apply_transform(obj, rotation=True, scale=True)
    assign_material(obj, material)
    set_smooth(obj, True)
    if parent is not None:
        parent_keep_transform(obj, parent)
    return obj


def add_cylinder_between(
    name,
    start,
    end,
    radius,
    material,
    vertices=14,
    bevel=0.0,
    parent=None,
):
    p1 = Vector(start)
    p2 = Vector(end)
    direction = p2 - p1
    length = direction.length
    midpoint = (p1 + p2) * 0.5

    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=length,
        location=midpoint,
    )
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    apply_transform(obj, rotation=True, scale=True)
    assign_material(obj, material)
    set_smooth(obj, True)
    if bevel > 0.0:
        apply_bevel(obj, bevel, 2)
    if parent is not None:
        parent_keep_transform(obj, parent)
    return obj


def add_bar_between(
    name,
    start,
    end,
    width,
    depth,
    material,
    bevel=0.002,
    parent=None,
):
    p1 = Vector(start)
    p2 = Vector(end)
    direction = p2 - p1
    length = direction.length
    midpoint = (p1 + p2) * 0.5

    bpy.ops.mesh.primitive_cube_add(location=midpoint)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (width * 0.5, depth * 0.5, length * 0.5)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    apply_transform(obj, rotation=True, scale=True)
    assign_material(obj, material)
    if bevel > 0.0:
        apply_bevel(obj, bevel, 3)
    if parent is not None:
        parent_keep_transform(obj, parent)
    return obj


# -----------------------------------------------------------------------------
# Root hierarchy
# -----------------------------------------------------------------------------

root = bpy.data.objects.new("DeskFan_Root", None)
bpy.context.scene.collection.objects.link(root)
root.empty_display_type = "PLAIN_AXES"

head_pivot = bpy.data.objects.new("fan_head_pivot", None)
bpy.context.scene.collection.objects.link(head_pivot)
head_pivot.location = (0.0, 0.0, HEAD_Z)
head_pivot.empty_display_type = "ARROWS"
parent_keep_transform(head_pivot, root)

rotor_pivot = bpy.data.objects.new("rotor_pivot", None)
bpy.context.scene.collection.objects.link(rotor_pivot)
rotor_pivot.location = (0.0, 0.0, HEAD_Z)
rotor_pivot.empty_display_type = "CIRCLE"
parent_keep_transform(rotor_pivot, head_pivot)

# -----------------------------------------------------------------------------
# Base and stand
# -----------------------------------------------------------------------------

if "myway_print_progress" in globals():
    myway_print_progress("creating weighted base and support column")

base_pad = add_cylinder(
    "base_rubber_pad",
    BASE_RADIUS * 0.98,
    PAD_HEIGHT,
    (0.0, 0.0, PAD_HEIGHT * 0.5),
    rubber_material,
    axis="Z",
    vertices=64,
    bevel=0.0025,
    parent=root,
)

base_lower = add_cylinder(
    "fan_base_lower",
    BASE_RADIUS,
    BASE_HEIGHT * 0.74,
    (0.0, 0.0, PAD_HEIGHT + BASE_HEIGHT * 0.37),
    painted_metal,
    axis="Z",
    vertices=64,
    bevel=0.004,
    parent=root,
)

base_upper = add_cylinder(
    "fan_base_upper",
    BASE_RADIUS * 0.90,
    BASE_HEIGHT * 0.46,
    (
        0.0,
        0.0,
        PAD_HEIGHT + BASE_HEIGHT * 0.74,
    ),
    painted_metal,
    axis="Z",
    vertices=64,
    bevel=0.004,
    parent=root,
)

column_height = COLUMN_TOP_Z - COLUMN_BOTTOM_Z
column = add_cylinder(
    "support_column",
    COLUMN_RADIUS,
    column_height,
    (
        0.0,
        0.0,
        COLUMN_BOTTOM_Z + column_height * 0.5,
    ),
    painted_metal,
    axis="Z",
    vertices=48,
    bevel=0.003,
    parent=root,
)

column_base_collar = add_cylinder(
    "support_column_base_collar",
    COLUMN_RADIUS * 1.45,
    0.014,
    (0.0, 0.0, COLUMN_BOTTOM_Z + 0.006),
    painted_metal,
    axis="Z",
    vertices=48,
    bevel=0.0025,
    parent=root,
)

column_top_collar = add_cylinder(
    "support_column_top_collar",
    COLUMN_RADIUS * 1.25,
    0.016,
    (0.0, 0.0, COLUMN_TOP_Z - 0.004),
    painted_metal,
    axis="Z",
    vertices=48,
    bevel=0.0025,
    parent=root,
)

# -----------------------------------------------------------------------------
# U-shaped tilt yoke
# -----------------------------------------------------------------------------

if "myway_print_progress" in globals():
    myway_print_progress("creating support yoke and tilt pivots")

yoke_points = [
    (-YOKE_PIVOT_X, 0.008, HEAD_Z),
    (-0.160, 0.008, 0.213),
    (-0.140, 0.008, 0.167),
    (-0.092, 0.008, 0.137),
    (-0.038, 0.008, 0.125),
    (0.000, 0.008, 0.123),
    (0.038, 0.008, 0.125),
    (0.092, 0.008, 0.137),
    (0.140, 0.008, 0.167),
    (0.160, 0.008, 0.213),
    (YOKE_PIVOT_X, 0.008, HEAD_Z),
]

yoke_segments = []
for index in range(len(yoke_points) - 1):
    yoke_segments.append(
        add_bar_between(
            f"yoke_segment_{index + 1:02d}",
            yoke_points[index],
            yoke_points[index + 1],
            YOKE_WIDTH,
            YOKE_DEPTH,
            painted_metal,
            bevel=0.0025,
        )
    )

yoke = join_meshes(
    yoke_segments,
    "support_yoke",
    painted_metal,
    root,
)

# Tilt bolts and washers on both sides.
for side, x in (("left", -YOKE_PIVOT_X), ("right", YOKE_PIVOT_X)):
    add_cylinder(
        f"tilt_pivot_{side}",
        0.0135,
        0.030,
        (x, 0.008, HEAD_Z),
        silver_metal,
        axis="X",
        vertices=40,
        bevel=0.002,
        parent=root,
    )
    add_cylinder(
        f"tilt_pivot_washer_{side}",
        0.0185,
        0.006,
        (x + (-0.017 if x < 0 else 0.017), 0.008, HEAD_Z),
        painted_metal,
        axis="X",
        vertices=40,
        bevel=0.0015,
        parent=root,
    )

# -----------------------------------------------------------------------------
# Motor housing
# -----------------------------------------------------------------------------

if "myway_print_progress" in globals():
    myway_print_progress("creating motor housing and rear control knob")

motor_main = add_cylinder(
    "motor_housing",
    MOTOR_RADIUS,
    MOTOR_DEPTH,
    (0.0, MOTOR_CENTER_Y, HEAD_Z),
    dark_plastic,
    axis="Y",
    vertices=64,
    bevel=0.006,
    parent=head_pivot,
)

motor_front_neck = add_cylinder(
    "motor_front_neck",
    0.043,
    0.030,
    (0.0, 0.017, HEAD_Z),
    dark_plastic,
    axis="Y",
    vertices=56,
    bevel=0.004,
    parent=head_pivot,
)

motor_rear_cap = add_cylinder(
    "motor_rear_cap",
    MOTOR_RADIUS * 0.88,
    0.020,
    (0.0, 0.118, HEAD_Z),
    dark_plastic,
    axis="Y",
    vertices=56,
    bevel=0.005,
    parent=head_pivot,
)

# Subtle housing ribs.
for index, y in enumerate((0.042, 0.060, 0.078, 0.096)):
    add_torus_y(
        f"motor_vent_ring_{index + 1:02d}",
        MOTOR_RADIUS * 0.96,
        0.0018,
        (0.0, y, HEAD_Z),
        painted_metal,
        major_segments=56,
        minor_segments=8,
        parent=head_pivot,
    )

control_knob = add_cylinder(
    "rear_control_knob",
    0.018,
    0.024,
    (0.0, 0.140, HEAD_Z),
    rubber_material,
    axis="Y",
    vertices=24,
    bevel=0.0025,
    parent=head_pivot,
)

# Knob ridges as narrow rings.
for index, y in enumerate((0.132, 0.140, 0.148)):
    add_torus_y(
        f"control_knob_ring_{index + 1:02d}",
        0.0175,
        0.0012,
        (0.0, y, HEAD_Z),
        rubber_material,
        major_segments=32,
        minor_segments=6,
        parent=head_pivot,
    )

# -----------------------------------------------------------------------------
# Rotor hub and three blades
# -----------------------------------------------------------------------------

if "myway_print_progress" in globals():
    myway_print_progress("creating rotor hub and three swept blades")

rear_hub = add_cylinder(
    "rotor_hub_rear",
    HUB_RADIUS * 0.90,
    0.022,
    (0.0, 0.006, HEAD_Z),
    painted_metal,
    axis="Y",
    vertices=56,
    bevel=0.003,
    parent=rotor_pivot,
)

front_hub = add_cylinder(
    "central_hub",
    HUB_RADIUS,
    0.028,
    (0.0, -0.046, HEAD_Z),
    painted_metal,
    axis="Y",
    vertices=56,
    bevel=0.004,
    parent=rotor_pivot,
)

front_hub_cap = add_cylinder(
    "central_hub_cap",
    HUB_RADIUS * 0.78,
    0.010,
    (0.0, -0.064, HEAD_Z),
    painted_metal,
    axis="Y",
    vertices=56,
    bevel=0.003,
    parent=rotor_pivot,
)


def create_blade(name, angle_degrees):
    # Local X/Z outline for one swept blade extending to +X.
    outline = [
        (0.032, -0.010),
        (0.061, -0.021),
        (0.101, -0.043),
        (BLADE_RADIUS, -0.031),
        (BLADE_RADIUS * 0.98, 0.010),
        (0.091, 0.034),
        (0.052, 0.029),
        (0.032, 0.014),
    ]
    count = len(outline)
    vertices = []

    # Slight forward sweep/pitch toward the tip.
    for x, z in outline:
        center_y = -0.006 * (x / BLADE_RADIUS)
        vertices.append((x, center_y - BLADE_THICKNESS * 0.5, z))
    for x, z in outline:
        center_y = -0.006 * (x / BLADE_RADIUS)
        vertices.append((x, center_y + BLADE_THICKNESS * 0.5, z))

    faces = []
    faces.append(tuple(range(count)))
    faces.append(tuple(range(count, count * 2))[::-1])
    for index in range(count):
        next_index = (index + 1) % count
        faces.append((
            index,
            next_index,
            count + next_index,
            count + index,
        ))

    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = (0.0, 0.0, HEAD_Z)
    obj.rotation_euler[1] = math.radians(angle_degrees)
    assign_material(obj, blade_material)
    set_smooth(obj, True)
    apply_bevel(obj, 0.0018, 3)
    parent_keep_transform(obj, rotor_pivot)
    return obj


blades = [
    create_blade("blade_01", 0.0),
    create_blade("blade_02", 120.0),
    create_blade("blade_03", 240.0),
]

# -----------------------------------------------------------------------------
# Front and rear protective cages
# -----------------------------------------------------------------------------

if "myway_print_progress" in globals():
    myway_print_progress("creating front and rear wire cages")


def build_cage(name, y_position, parent):
    parts = []

    # Outer structural rim.
    parts.append(
        add_torus_y(
            f"{name}_outer_rim",
            CAGE_RADIUS,
            CAGE_OUTER_WIRE,
            (0.0, y_position, HEAD_Z),
            painted_metal,
            major_segments=80,
            minor_segments=12,
        )
    )

    # Inner hub guard.
    parts.append(
        add_torus_y(
            f"{name}_hub_ring",
            0.043,
            0.0022,
            (0.0, y_position, HEAD_Z),
            painted_metal,
            major_segments=56,
            minor_segments=8,
        )
    )

    # Concentric safety wires.
    for ring_index, radius in enumerate((0.060, 0.079, 0.098, 0.117, 0.136)):
        parts.append(
            add_torus_y(
                f"{name}_ring_{ring_index + 1:02d}",
                radius,
                CAGE_INNER_WIRE,
                (0.0, y_position, HEAD_Z),
                painted_metal,
                major_segments=72,
                minor_segments=8,
            )
        )

    # Radial spokes.
    spoke_count = 12
    inner_radius = 0.040
    outer_radius = 0.146
    for spoke_index in range(spoke_count):
        angle = (math.tau * spoke_index / spoke_count)
        sin_a = math.sin(angle)
        cos_a = math.cos(angle)
        start = (
            inner_radius * cos_a,
            y_position,
            HEAD_Z + inner_radius * sin_a,
        )
        end = (
            outer_radius * cos_a,
            y_position,
            HEAD_Z + outer_radius * sin_a,
        )
        parts.append(
            add_cylinder_between(
                f"{name}_spoke_{spoke_index + 1:02d}",
                start,
                end,
                CAGE_INNER_WIRE,
                painted_metal,
                vertices=12,
            )
        )

    return join_meshes(parts, name, painted_metal, parent)


front_cage = build_cage("front_cage", CAGE_FRONT_Y, head_pivot)
rear_cage = build_cage("rear_cage", CAGE_REAR_Y, head_pivot)

# Depth connectors around the outer rim.
connector_parts = []
for connector_index in range(8):
    angle = math.tau * connector_index / 8.0
    x = CAGE_RADIUS * math.cos(angle)
    z = HEAD_Z + CAGE_RADIUS * math.sin(angle)
    connector_parts.append(
        add_cylinder_between(
            f"cage_connector_{connector_index + 1:02d}",
            (x, CAGE_FRONT_Y, z),
            (x, CAGE_REAR_Y, z),
            0.0021,
            painted_metal,
            vertices=12,
        )
    )

cage_connectors = join_meshes(
    connector_parts,
    "cage_depth_connectors",
    painted_metal,
    head_pivot,
)

# Small center support bars give the front cage the product-reference look.
front_support_parts = []
for angle_degrees in (0.0, 90.0):
    angle = math.radians(angle_degrees)
    dx = math.cos(angle)
    dz = math.sin(angle)
    front_support_parts.append(
        add_cylinder_between(
            f"front_center_support_{int(angle_degrees)}",
            (-0.145 * dx, CAGE_FRONT_Y - 0.001, HEAD_Z - 0.145 * dz),
            (0.145 * dx, CAGE_FRONT_Y - 0.001, HEAD_Z + 0.145 * dz),
            0.0024,
            painted_metal,
            vertices=12,
        )
    )

front_center_support = join_meshes(
    front_support_parts,
    "front_cage_cross_support",
    painted_metal,
    head_pivot,
)

# -----------------------------------------------------------------------------
# Final organization and normalization
# -----------------------------------------------------------------------------

# A tiny upward tilt creates a more designed hero silhouette while keeping
# the pivots structurally meaningful.
head_pivot.rotation_euler[0] = math.radians(-3.0)

if "myway_normalize_extent" in globals():
    myway_normalize_extent(TARGET_EXTENT_M, root)

if "myway_print_progress" in globals():
    myway_print_progress("mechanical desk fan reference build complete")