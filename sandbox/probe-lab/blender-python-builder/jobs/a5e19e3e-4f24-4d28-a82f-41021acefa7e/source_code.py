import bpy
import math
from mathutils import Vector, Euler

myway_reset_scene()
myway_print_progress("establishing coordinate frame and semantic root")

TARGET_EXTENT_M = 2.0

# Approved design dimensions in metres before uniform MyWay normalization.
OVERALL_HEIGHT = 0.82
OVERALL_WIDTH = 0.68
BODY_HEIGHT = 0.55
HEAD_WIDTH = 0.34
HEAD_HEIGHT = 0.28
EAR_HEIGHT = 0.18
FRONT_PAW_SPACING = 0.22
TAIL_CURL_DIAMETER = 0.58
TAIL_PAW_CLEARANCE = 0.018

# Deterministically calculated proportions supplied by MyWay.
HEAD_WIDTH_TO_BODY_HEIGHT = 0.618182
EAR_HEIGHT_TO_HEAD_HEIGHT = 0.642857
TAIL_CURL_TO_OVERALL_WIDTH = 0.852941
PAW_SPACING_TO_HEAD_WIDTH = 0.647059


# -----------------------------------------------------------------------------
# Reliable local Blender helpers
# -----------------------------------------------------------------------------

def activate_object(obj):
    if bpy.context.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def apply_object_transform(obj, location=False, rotation=False, scale=True):
    activate_object(obj)
    bpy.ops.object.transform_apply(
        location=location,
        rotation=rotation,
        scale=scale,
    )


def parent_keep_world(child, parent):
    world_matrix = child.matrix_world.copy()
    child.parent = parent
    child.matrix_world = world_matrix
    return child


def assign_material(obj, material):
    if obj is None or obj.type != "MESH":
        return obj
    obj.data.materials.clear()
    obj.data.materials.append(material)
    return obj


def set_smooth(obj):
    if obj is None or obj.type != "MESH":
        return obj
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def apply_bevel(obj, width, segments=3):
    if obj is None or obj.type != "MESH" or width <= 0.0:
        return obj
    modifier = obj.modifiers.new(name="MyWayBevel", type="BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = "ANGLE"
    activate_object(obj)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    return obj


def add_ellipsoid(
    name,
    dimensions,
    location,
    material,
    rotation_degrees=(0.0, 0.0, 0.0),
    parent=None,
    segments=36,
    rings=24,
):
    rotation = tuple(math.radians(value) for value in rotation_degrees)
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments,
        ring_count=rings,
        radius=0.5,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = dimensions
    apply_object_transform(obj, rotation=True, scale=True)
    assign_material(obj, material)
    set_smooth(obj)
    if parent is not None:
        parent_keep_world(obj, parent)
    return obj


def add_empty(name, location=(0.0, 0.0, 0.0), parent=None, display_type="PLAIN_AXES"):
    obj = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    obj.empty_display_type = display_type
    if parent is not None:
        parent_keep_world(obj, parent)
    return obj


def mesh_object_from_data(name, vertices, faces, material, parent=None, smooth=True):
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    assign_material(obj, material)
    if smooth:
        set_smooth(obj)
    if parent is not None:
        parent_keep_world(obj, parent)
    return obj


def add_triangular_prism(
    name,
    width,
    depth,
    height,
    location,
    material,
    rotation_degrees=(0.0, 0.0, 0.0),
    tip_shift_x=0.0,
    parent=None,
    bevel=0.0,
):
    half_w = width * 0.5
    half_d = depth * 0.5
    half_h = height * 0.5
    vertices = [
        (-half_w, -half_d, -half_h),
        (half_w, -half_d, -half_h),
        (tip_shift_x, -half_d, half_h),
        (-half_w, half_d, -half_h),
        (half_w, half_d, -half_h),
        (tip_shift_x, half_d, half_h),
    ]
    faces = [
        (0, 1, 2),
        (5, 4, 3),
        (0, 3, 4, 1),
        (1, 4, 5, 2),
        (2, 5, 3, 0),
    ]
    obj = mesh_object_from_data(name, vertices, faces, material, parent=None, smooth=False)
    obj.location = location
    obj.rotation_euler = tuple(math.radians(value) for value in rotation_degrees)
    apply_object_transform(obj, rotation=True, scale=True)
    if bevel > 0.0:
        apply_bevel(obj, bevel, 3)
        set_smooth(obj)
    if parent is not None:
        parent_keep_world(obj, parent)
    return obj


def add_inverted_triangle_prism(
    name,
    width,
    depth,
    height,
    location,
    material,
    parent=None,
    bevel=0.0,
):
    half_w = width * 0.5
    half_d = depth * 0.5
    half_h = height * 0.5
    vertices = [
        (-half_w, -half_d, half_h),
        (half_w, -half_d, half_h),
        (0.0, -half_d, -half_h),
        (-half_w, half_d, half_h),
        (half_w, half_d, half_h),
        (0.0, half_d, -half_h),
    ]
    faces = [
        (0, 1, 2),
        (5, 4, 3),
        (0, 3, 4, 1),
        (1, 4, 5, 2),
        (2, 5, 3, 0),
    ]
    obj = mesh_object_from_data(name, vertices, faces, material, parent=None, smooth=False)
    obj.location = location
    apply_object_transform(obj, scale=True)
    if bevel > 0.0:
        apply_bevel(obj, bevel, 3)
        set_smooth(obj)
    if parent is not None:
        parent_keep_world(obj, parent)
    return obj


def create_tapered_tube(
    name,
    points,
    radii,
    material,
    parent=None,
    radial_segments=16,
):
    if len(points) < 2 or len(points) != len(radii):
        raise ValueError(f"{name}: points and radii must have the same length >= 2")

    points_v = [Vector(point) for point in points]
    vertices = []
    faces = []

    for index, point in enumerate(points_v):
        if index == 0:
            tangent = (points_v[1] - point).normalized()
        elif index == len(points_v) - 1:
            tangent = (point - points_v[index - 1]).normalized()
        else:
            tangent = (points_v[index + 1] - points_v[index - 1]).normalized()

        reference = Vector((0.0, 0.0, 1.0))
        if abs(tangent.dot(reference)) > 0.92:
            reference = Vector((1.0, 0.0, 0.0))
        side = tangent.cross(reference).normalized()
        up = side.cross(tangent).normalized()

        for segment in range(radial_segments):
            angle = (2.0 * math.pi * segment) / radial_segments
            offset = (
                side * math.cos(angle) * radii[index]
                + up * math.sin(angle) * radii[index]
            )
            vertices.append(tuple(point + offset))

    ring_count = len(points_v)
    for ring in range(ring_count - 1):
        start_a = ring * radial_segments
        start_b = (ring + 1) * radial_segments
        for segment in range(radial_segments):
            next_segment = (segment + 1) % radial_segments
            faces.append(
                (
                    start_a + segment,
                    start_a + next_segment,
                    start_b + next_segment,
                    start_b + segment,
                )
            )

    start_center_index = len(vertices)
    vertices.append(tuple(points_v[0]))
    end_center_index = len(vertices)
    vertices.append(tuple(points_v[-1]))

    for segment in range(radial_segments):
        next_segment = (segment + 1) % radial_segments
        faces.append((start_center_index, next_segment, segment))
        end_start = (ring_count - 1) * radial_segments
        faces.append(
            (
                end_center_index,
                end_start + segment,
                end_start + next_segment,
            )
        )

    obj = mesh_object_from_data(name, vertices, faces, material, parent=parent, smooth=True)
    return obj


def join_mesh_objects(objects, name, material=None, parent=None):
    meshes = [obj for obj in objects if obj is not None and obj.type == "MESH"]
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
        parent_keep_world(joined, parent)
    return joined


def create_fur_tuft_coat(name, tuft_specs, material, parent=None):
    vertices = []
    faces = []

    for center, normal, length, width in tuft_specs:
        center_v = Vector(center)
        normal_v = Vector(normal).normalized()

        tangent = normal_v.cross(Vector((0.0, 0.0, 1.0)))
        if tangent.length < 0.0001:
            tangent = normal_v.cross(Vector((0.0, 1.0, 0.0)))
        tangent.normalize()
        bitangent = normal_v.cross(tangent).normalized()

        half_w = width * 0.5
        half_b = width * 0.34
        base_index = len(vertices)
        vertices.extend(
            [
                tuple(center_v + tangent * half_w + bitangent * half_b),
                tuple(center_v - tangent * half_w + bitangent * half_b),
                tuple(center_v - tangent * half_w - bitangent * half_b),
                tuple(center_v + tangent * half_w - bitangent * half_b),
                tuple(center_v + normal_v * length),
            ]
        )
        faces.extend(
            [
                (base_index + 0, base_index + 1, base_index + 4),
                (base_index + 1, base_index + 2, base_index + 4),
                (base_index + 2, base_index + 3, base_index + 4),
                (base_index + 3, base_index + 0, base_index + 4),
                (base_index + 0, base_index + 3, base_index + 2, base_index + 1),
            ]
        )

    obj = mesh_object_from_data(name, vertices, faces, material, parent=parent, smooth=True)
    return obj


def configure_principled(material, values):
    if material is None or not material.use_nodes or material.node_tree is None:
        return
    principled = material.node_tree.nodes.get("Principled BSDF")
    if principled is None:
        return
    for input_name, value in values.items():
        socket = principled.inputs.get(input_name)
        if socket is not None:
            socket.default_value = value


# -----------------------------------------------------------------------------
# Semantic material slots
# -----------------------------------------------------------------------------

myway_print_progress("creating semantic materials")

orange_fur = myway_material_slot(
    "orange_fur",
    fallback_color=(0.580, 0.153, 0.018, 1.0),
    metallic=0.0,
    roughness=0.81,
)
cream_fur = myway_material_slot(
    "cream_fur",
    fallback_color=(0.896, 0.680, 0.386, 1.0),
    metallic=0.0,
    roughness=0.84,
)
ear_nose_pink = myway_material_slot(
    "ear_nose_pink",
    fallback_color=(0.584, 0.223, 0.223, 1.0),
    metallic=0.0,
    roughness=0.52,
)
green_eye = myway_material_slot(
    "green_eye",
    fallback_color=(0.138, 0.371, 0.107, 1.0),
    metallic=0.0,
    roughness=0.15,
)
dark_pupil = myway_material_slot(
    "dark_pupil",
    fallback_color=(0.005, 0.007, 0.004, 1.0),
    metallic=0.0,
    roughness=0.20,
)
whisker_ivory = myway_material_slot(
    "whisker_ivory",
    fallback_color=(0.815, 0.730, 0.584, 1.0),
    metallic=0.0,
    roughness=0.46,
)

configure_principled(
    orange_fur,
    {
        "Subsurface Weight": 0.05,
    },
)
configure_principled(
    cream_fur,
    {
        "Subsurface Weight": 0.04,
    },
)
configure_principled(
    ear_nose_pink,
    {
        "Subsurface Weight": 0.09,
    },
)
configure_principled(
    green_eye,
    {
        "IOR": 1.36,
        "Coat Weight": 0.18,
        "Coat Roughness": 0.08,
    },
)


# -----------------------------------------------------------------------------
# Root hierarchy
# -----------------------------------------------------------------------------

root = add_empty("fluffy_orange_cat_seated_root", location=(0.0, 0.0, 0.0))


# -----------------------------------------------------------------------------
# Primary seated masses
# -----------------------------------------------------------------------------

myway_print_progress("creating primary seated body masses")

cat_body = add_ellipsoid(
    "cat_body",
    dimensions=(0.42, 0.38, 0.55),
    location=(0.0, 0.055, 0.39),
    rotation_degrees=(-4.0, 0.0, 0.0),
    material=orange_fur,
    parent=root,
    segments=48,
    rings=32,
)

neck_bridge = add_ellipsoid(
    "neck_bridge",
    dimensions=(0.26, 0.25, 0.24),
    location=(0.0, -0.005, 0.555),
    rotation_degrees=(-2.0, 0.0, 0.0),
    material=orange_fur,
    parent=cat_body,
    segments=36,
    rings=24,
)

left_hind_haunch = add_ellipsoid(
    "left_hind_haunch",
    dimensions=(0.29, 0.34, 0.36),
    location=(-0.18, 0.09, 0.22),
    rotation_degrees=(0.0, 0.0, -6.0),
    material=orange_fur,
    parent=cat_body,
    segments=40,
    rings=26,
)

right_hind_haunch = add_ellipsoid(
    "right_hind_haunch",
    dimensions=(0.29, 0.34, 0.36),
    location=(0.18, 0.09, 0.22),
    rotation_degrees=(0.0, 0.0, 6.0),
    material=orange_fur,
    parent=cat_body,
    segments=40,
    rings=26,
)

head = add_ellipsoid(
    "head",
    dimensions=(HEAD_WIDTH, 0.30, HEAD_HEIGHT),
    location=(0.0, -0.085, 0.655),
    rotation_degrees=(2.0, 0.0, 0.0),
    material=orange_fur,
    parent=cat_body,
    segments=48,
    rings=32,
)


# -----------------------------------------------------------------------------
# Ears and inner ear regions
# -----------------------------------------------------------------------------

myway_print_progress("forming ears and facial structure")

left_ear = add_triangular_prism(
    "left_ear",
    width=0.13,
    depth=0.09,
    height=EAR_HEIGHT,
    location=(-0.112, -0.075, 0.785),
    material=orange_fur,
    rotation_degrees=(-3.0, -5.0, -6.0),
    tip_shift_x=-0.008,
    parent=head,
    bevel=0.008,
)

right_ear = add_triangular_prism(
    "right_ear",
    width=0.13,
    depth=0.09,
    height=EAR_HEIGHT,
    location=(0.112, -0.075, 0.785),
    material=orange_fur,
    rotation_degrees=(-3.0, 5.0, 6.0),
    tip_shift_x=0.008,
    parent=head,
    bevel=0.008,
)

left_inner_ear_region = add_triangular_prism(
    "left_inner_ear_region",
    width=0.076,
    depth=0.008,
    height=0.115,
    location=(-0.112, -0.123, 0.785),
    material=ear_nose_pink,
    rotation_degrees=(-3.0, -5.0, -6.0),
    tip_shift_x=-0.005,
    parent=left_ear,
    bevel=0.002,
)

right_inner_ear_region = add_triangular_prism(
    "right_inner_ear_region",
    width=0.076,
    depth=0.008,
    height=0.115,
    location=(0.112, -0.123, 0.785),
    material=ear_nose_pink,
    rotation_degrees=(-3.0, 5.0, 6.0),
    tip_shift_x=0.005,
    parent=right_ear,
    bevel=0.002,
)


# -----------------------------------------------------------------------------
# Eyes, pupils, muzzle, nose
# -----------------------------------------------------------------------------

left_eye = add_ellipsoid(
    "left_eye",
    dimensions=(0.064, 0.032, 0.072),
    location=(-0.074, -0.213, 0.66),
    rotation_degrees=(0.0, 0.0, -4.0),
    material=green_eye,
    parent=head,
    segments=32,
    rings=20,
)

right_eye = add_ellipsoid(
    "right_eye",
    dimensions=(0.064, 0.032, 0.072),
    location=(0.074, -0.213, 0.66),
    rotation_degrees=(0.0, 0.0, 4.0),
    material=green_eye,
    parent=head,
    segments=32,
    rings=20,
)

left_pupil_region = add_ellipsoid(
    "left_pupil_region",
    dimensions=(0.018, 0.009, 0.048),
    location=(-0.074, -0.232, 0.66),
    rotation_degrees=(0.0, 0.0, -4.0),
    material=dark_pupil,
    parent=left_eye,
    segments=24,
    rings=16,
)

right_pupil_region = add_ellipsoid(
    "right_pupil_region",
    dimensions=(0.018, 0.009, 0.048),
    location=(0.074, -0.232, 0.66),
    rotation_degrees=(0.0, 0.0, 4.0),
    material=dark_pupil,
    parent=right_eye,
    segments=24,
    rings=16,
)

muzzle = add_empty(
    "muzzle",
    location=(0.0, -0.225, 0.595),
    parent=head,
    display_type="CIRCLE",
)

muzzle_left_lobe = add_ellipsoid(
    "muzzle_left_lobe",
    dimensions=(0.125, 0.105, 0.095),
    location=(-0.052, -0.226, 0.592),
    rotation_degrees=(0.0, 0.0, 3.0),
    material=cream_fur,
    parent=muzzle,
    segments=32,
    rings=20,
)

muzzle_right_lobe = add_ellipsoid(
    "muzzle_right_lobe",
    dimensions=(0.125, 0.105, 0.095),
    location=(0.052, -0.226, 0.592),
    rotation_degrees=(0.0, 0.0, -3.0),
    material=cream_fur,
    parent=muzzle,
    segments=32,
    rings=20,
)

nose = add_inverted_triangle_prism(
    "nose",
    width=0.052,
    depth=0.032,
    height=0.038,
    location=(0.0, -0.255, 0.615),
    material=ear_nose_pink,
    parent=muzzle,
    bevel=0.006,
)


# -----------------------------------------------------------------------------
# Chest ruff, front legs, paws
# -----------------------------------------------------------------------------

myway_print_progress("building chest ruff, front legs, and grounded paws")

chest_ruff = add_ellipsoid(
    "chest_ruff",
    dimensions=(0.32, 0.13, 0.30),
    location=(0.0, -0.175, 0.445),
    rotation_degrees=(-3.0, 0.0, 0.0),
    material=cream_fur,
    parent=cat_body,
    segments=40,
    rings=26,
)

ruff_tufts = []
for index, x_value in enumerate((-0.105, -0.070, -0.035, 0.0, 0.035, 0.070, 0.105), start=1):
    lower = 0.318 - 0.018 * abs(index - 4)
    tuft = add_inverted_triangle_prism(
        f"chest_ruff_tuft_{index:02d}",
        width=0.060 if index in (3, 4, 5) else 0.050,
        depth=0.045,
        height=0.115 if index in (3, 4, 5) else 0.090,
        location=(x_value, -0.232, lower),
        material=cream_fur,
        parent=chest_ruff,
        bevel=0.004,
    )
    ruff_tufts.append(tuft)

left_front_leg = add_ellipsoid(
    "left_front_leg",
    dimensions=(0.105, 0.12, 0.34),
    location=(-0.105, -0.17, 0.215),
    rotation_degrees=(1.0, 0.0, -2.0),
    material=orange_fur,
    parent=cat_body,
    segments=32,
    rings=22,
)

right_front_leg = add_ellipsoid(
    "right_front_leg",
    dimensions=(0.105, 0.12, 0.34),
    location=(0.105, -0.17, 0.215),
    rotation_degrees=(1.0, 0.0, 2.0),
    material=orange_fur,
    parent=cat_body,
    segments=32,
    rings=22,
)

left_front_paw = add_ellipsoid(
    "left_front_paw",
    dimensions=(0.16, 0.19, 0.11),
    location=(-0.11, -0.245, 0.055),
    rotation_degrees=(0.0, 0.0, -3.0),
    material=orange_fur,
    parent=left_front_leg,
    segments=32,
    rings=20,
)

right_front_paw = add_ellipsoid(
    "right_front_paw",
    dimensions=(0.16, 0.19, 0.11),
    location=(0.11, -0.245, 0.055),
    rotation_degrees=(0.0, 0.0, 3.0),
    material=orange_fur,
    parent=right_front_leg,
    segments=32,
    rings=20,
)

# Shallow toe shaping creates readable paw fronts without separate floating toes.
for paw, sign in ((left_front_paw, -1.0), (right_front_paw, 1.0)):
    for toe_index, x_offset in enumerate((-0.035, 0.0, 0.035), start=1):
        toe = add_ellipsoid(
            f"{paw.name}_toe_{toe_index:02d}",
            dimensions=(0.050, 0.048, 0.030),
            location=(
                paw.matrix_world.translation.x + x_offset,
                -0.326,
                0.050,
            ),
            rotation_degrees=(0.0, 0.0, sign * 2.0),
            material=orange_fur,
            parent=paw,
            segments=20,
            rings=14,
        )


# -----------------------------------------------------------------------------
# Tail curl
# -----------------------------------------------------------------------------

myway_print_progress("sweeping the thick curled tail around the paws")

tail_points = [
    (0.235, 0.125, 0.310),
    (0.300, 0.090, 0.260),
    (0.335, 0.020, 0.195),
    (0.345, -0.075, 0.135),
    (0.325, -0.165, 0.095),
    (0.270, -0.280, 0.075),
    (0.120, -0.355, 0.065),
    (-0.080, -0.365, 0.060),
    (-0.240, -0.315, 0.060),
    (-0.310, -0.225, 0.065),
    (-0.290, -0.145, 0.070),
    (-0.220, -0.110, 0.073),
    (-0.155, -0.150, 0.075),
    (-0.120, -0.215, 0.075),
]
tail_radii = [
    0.058,
    0.058,
    0.056,
    0.054,
    0.052,
    0.049,
    0.046,
    0.043,
    0.040,
    0.037,
    0.034,
    0.031,
    0.028,
    0.024,
]

tail = create_tapered_tube(
    "tail",
    tail_points,
    tail_radii,
    orange_fur,
    parent=cat_body,
    radial_segments=20,
)


# -----------------------------------------------------------------------------
# Exportable fluffy coat
# -----------------------------------------------------------------------------

myway_print_progress("adding exportable fluffy silhouette clumps")

tuft_specs = []

# Cheek and head-outline tufts.
for side in (-1.0, 1.0):
    for index, z_value in enumerate((0.595, 0.630, 0.670, 0.710)):
        x_value = side * (0.166 + 0.010 * index)
        y_value = -0.105 + 0.008 * index
        normal = (side, -0.22, 0.05 + 0.04 * index)
        tuft_specs.append(
            ((x_value, y_value, z_value), normal, 0.030 + 0.004 * index, 0.027)
        )

# Ear-tip tufts.
tuft_specs.extend(
    [
        ((-0.120, -0.075, 0.873), (-0.20, -0.05, 1.0), 0.042, 0.026),
        ((0.120, -0.075, 0.873), (0.20, -0.05, 1.0), 0.042, 0.026),
        ((-0.086, -0.070, 0.850), (0.10, -0.08, 1.0), 0.030, 0.020),
        ((0.086, -0.070, 0.850), (-0.10, -0.08, 1.0), 0.030, 0.020),
    ]
)

# Shoulder and torso-side tufts.
for side in (-1.0, 1.0):
    for z_value, x_abs, length in (
        (0.520, 0.205, 0.030),
        (0.455, 0.220, 0.034),
        (0.385, 0.226, 0.036),
        (0.315, 0.235, 0.038),
    ):
        tuft_specs.append(
            ((side * x_abs, 0.020, z_value), (side, 0.02, 0.08), length, 0.030)
        )

# Haunch-outline tufts.
for side in (-1.0, 1.0):
    for index, (y_value, z_value) in enumerate(
        ((0.170, 0.285), (0.120, 0.220), (0.050, 0.165), (-0.020, 0.125))
    ):
        tuft_specs.append(
            (
                (side * (0.300 + index * 0.004), y_value, z_value),
                (side, 0.10 - index * 0.03, -0.02),
                0.035 + index * 0.003,
                0.032,
            )
        )

# Small tufts along the outer front-leg edges.
for side in (-1.0, 1.0):
    for z_value in (0.165, 0.230, 0.295):
        tuft_specs.append(
            (
                (side * 0.160, -0.180, z_value),
                (side, -0.10, 0.0),
                0.024,
                0.021,
            )
        )

# Tail-edge tufts sampled along the curl.
for index in (1, 3, 5, 6, 7, 8, 9, 10, 12):
    point = Vector(tail_points[index])
    previous_point = Vector(tail_points[max(0, index - 1)])
    next_point = Vector(tail_points[min(len(tail_points) - 1, index + 1)])
    tangent = (next_point - previous_point).normalized()
    planar_normal = Vector((-tangent.y, tangent.x, 0.25)).normalized()
    tuft_specs.append(
        (
            tuple(point + planar_normal * tail_radii[index] * 0.78),
            tuple(planar_normal),
            0.025 + 0.002 * (index % 3),
            0.022,
        )
    )

fluffy_fur_coat = create_fur_tuft_coat(
    "fluffy_fur_coat",
    tuft_specs,
    orange_fur,
    parent=cat_body,
)


# -----------------------------------------------------------------------------
# Whisker curves converted to exportable mesh
# -----------------------------------------------------------------------------

myway_print_progress("creating facial whiskers and final semantic details")

whisker_parts = []
for side in (-1.0, 1.0):
    base_x = side * 0.075
    for index, z_offset in enumerate((-0.035, -0.012, 0.012, 0.035), start=1):
        start = Vector((base_x, -0.266, 0.592 + z_offset))
        middle = Vector((side * 0.155, -0.304, 0.598 + z_offset * 1.25))
        end = Vector((side * (0.235 + 0.012 * index), -0.315, 0.605 + z_offset * 1.55))
        whisker = create_tapered_tube(
            f"whisker_{'left' if side < 0 else 'right'}_{index:02d}",
            [tuple(start), tuple(middle), tuple(end)],
            [0.00145, 0.00110, 0.00035],
            whisker_ivory,
            parent=None,
            radial_segments=6,
        )
        whisker_parts.append(whisker)

whisker_set = join_mesh_objects(
    whisker_parts,
    "whisker_set",
    material=whisker_ivory,
    parent=muzzle,
)


# -----------------------------------------------------------------------------
# Semantic anchors
# -----------------------------------------------------------------------------

ground_origin = add_empty(
    "ground_origin",
    location=(0.0, 0.0, 0.0),
    parent=root,
    display_type="PLAIN_AXES",
)
head_center = add_empty(
    "head_center",
    location=(0.0, -0.085, 0.655),
    parent=head,
    display_type="SPHERE",
)
nose_tip = add_empty(
    "nose_tip",
    location=(0.0, -0.255, 0.615),
    parent=nose,
    display_type="SPHERE",
)
tail_base = add_empty(
    "tail_base",
    location=(0.235, 0.125, 0.310),
    parent=tail,
    display_type="CIRCLE",
)
tail_tip = add_empty(
    "tail_tip",
    location=(-0.120, -0.215, 0.075),
    parent=tail,
    display_type="CIRCLE",
)
left_paw_contact = add_empty(
    "left_paw_contact",
    location=(-0.110, -0.245, 0.0),
    parent=left_front_paw,
    display_type="PLAIN_AXES",
)
right_paw_contact = add_empty(
    "right_paw_contact",
    location=(0.110, -0.245, 0.0),
    parent=right_front_paw,
    display_type="PLAIN_AXES",
)


# -----------------------------------------------------------------------------
# Final geometry hygiene
# -----------------------------------------------------------------------------

myway_print_progress("finalizing organic geometry and hierarchy")

for obj in list(bpy.context.scene.objects):
    if obj.type == "MESH":
        set_smooth(obj)
        # Store semantic provenance without affecting export geometry.
        obj["myway_asset_id"] = "fluffy_orange_cat_seated"
        obj["myway_default_state"] = "seated_tail_curled"

root["myway_schema_version"] = "myway_visual_asset_spec_v2"
root["myway_overall_height_m"] = OVERALL_HEIGHT
root["myway_overall_width_m"] = OVERALL_WIDTH
root["myway_head_width_to_body_height"] = HEAD_WIDTH_TO_BODY_HEIGHT
root["myway_tail_curl_to_overall_width"] = TAIL_CURL_TO_OVERALL_WIDTH
root["myway_tail_paw_clearance_m"] = TAIL_PAW_CLEARANCE

myway_print_progress("normalizing completed fluffy orange cat")
myway_normalize_extent(2.0, root)