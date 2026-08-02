import type {
  AssetDesignBriefV2,
} from "./asset-design-brief";

export const NATIVE_WHEELCHAIR_PROOF_REQUEST =
  "Create a high-quality stylized modern manual wheelchair in native Blender Python with a connected tubular frame, two large spoked rear wheels, hand rims, front caster assemblies, fabric seat and backrest, push handles, armrests, brakes, folding cross braces, and separate footrests. Use automatically selected AmbientCG materials and a studio HDRI, preserve meaningful semantic names and wheel/caster pivots, and produce a clean browser-ready GLB.";

export const NATIVE_WHEELCHAIR_PROOF_BRIEF = {
  schema_version:
    "myway_asset_design_brief_v2",
  asset_id:
    "native_stylized_wheelchair_proof",
  concept:
    NATIVE_WHEELCHAIR_PROOF_REQUEST,
  asset_class:
    "hard_surface_assembly",
  intended_use: [
    "browser-ready educational and healthcare scene asset",
    "close three-quarter product view",
    "reference build for comparing human-authored and GLM-generated Blender Python",
  ],
  target_extent_m: 1.12,
  axis_dimensions_m: [
    0.76,
    0.94,
    1.02,
  ],
  max_triangles: 95_000,
  quality_mode:
    "standard",
  realism:
    "stylized",
  style_tags: [
    "high quality",
    "stylized realism",
    "modern manual wheelchair",
    "clean tubular construction",
    "product visualization",
  ],
  silhouette: {
    primary_shapes: [
      "two large circular rear wheels defining the side silhouette",
      "compact fabric seat and upright backrest",
      "connected tubular frame tapering toward two small front casters",
    ],
    identifying_features: [
      "large spoked rear wheels with separate hand rims",
      "small swivel caster assemblies at the front",
      "fabric seat and backrest suspended inside a metal frame",
      "push handles, arm pads, brakes, cross braces, and twin footrests",
    ],
    important_negative_spaces: [
      "open spoke spaces in both rear wheels",
      "clear gap below the seat around the folding cross braces",
      "open space between each caster fork and wheel",
      "separation between the footrests",
    ],
    camera_readability: [
      "front three-quarter hero view",
      "side view showing wheel and frame connections",
      "rear view showing push handles and backrest",
      "top view showing seat and armrest layout",
    ],
  },
  proportions: [
    "rear wheel diameter is a little more than half the total wheelchair height",
    "seat width remains slightly narrower than the rear-wheel outer width",
    "front casters are visibly smaller than rear wheels",
    "backrest rises well above the seat but remains below the push-handle grips",
    "footrests project forward without making the chair excessively long",
  ],
  parts: [
    {
      part_id: "WheelchairFrame",
      semantic_role: "primary connected tubular chassis",
      geometry_strategy: [
        "native cylinders aligned between structural points",
        "crossbars, side rails, risers, and diagonals",
      ],
      parent_part_id: null,
      connection_strategy: "Central frame joins seat rails, back posts, axle, front risers, casters, and footrest supports.",
      material_slot_id: "tubular_frame_metal",
      animation_role: "static structural root",
      pivot_requirement: "Root origin centered between the rear wheels at ground level.",
      required: true,
      identifying_features: [
        "continuous readable tube network",
        "clear axle and caster connections",
      ],
    },
    {
      part_id: "SeatCushion",
      semantic_role: "main upholstered seat",
      geometry_strategy: [
        "thin rounded box",
        "separate woven fabric material region",
      ],
      parent_part_id: "WheelchairFrame",
      connection_strategy: "Sits on the two side seat rails and between the arm supports.",
      material_slot_id: "seat_upholstery_fabric",
      animation_role: null,
      pivot_requirement: null,
      required: true,
      identifying_features: [
        "dark durable fabric",
        "slightly softened edge profile",
      ],
    },
    {
      part_id: "Backrest",
      semantic_role: "upright upholstered back support",
      geometry_strategy: [
        "rounded box with slight recline",
        "shared upholstery material",
      ],
      parent_part_id: "WheelchairFrame",
      connection_strategy: "Mounted between the two rear back posts below the push handles.",
      material_slot_id: "seat_upholstery_fabric",
      animation_role: null,
      pivot_requirement: null,
      required: true,
      identifying_features: [
        "broad vertical fabric panel",
        "slight rearward recline",
      ],
    },
    {
      part_id: "RearWheel_L",
      semantic_role: "left large rear mobility wheel",
      geometry_strategy: [
        "native torus tire and rim",
        "hub and repeated radial spokes",
        "separate outer hand rim",
      ],
      parent_part_id: "WheelchairFrame",
      connection_strategy: "Mounted to the left end of the rear axle and visually joined by a hub collar.",
      material_slot_id: "wheelchair_tire_rubber",
      animation_role: "rotating wheel",
      pivot_requirement: "Axle-centered pivot along the X axis.",
      required: true,
      identifying_features: [
        "large black tire",
        "open radial spokes",
        "separate metal hand rim",
      ],
    },
    {
      part_id: "RearWheel_R",
      semantic_role: "right large rear mobility wheel",
      geometry_strategy: [
        "mirrored native torus tire and rim",
        "hub and repeated radial spokes",
        "separate outer hand rim",
      ],
      parent_part_id: "WheelchairFrame",
      connection_strategy: "Mounted to the right end of the rear axle and visually joined by a hub collar.",
      material_slot_id: "wheelchair_tire_rubber",
      animation_role: "rotating wheel",
      pivot_requirement: "Axle-centered pivot along the X axis.",
      required: true,
      identifying_features: [
        "large black tire",
        "open radial spokes",
        "separate metal hand rim",
      ],
    },
    {
      part_id: "CasterAssembly_L",
      semantic_role: "left front swivel caster",
      geometry_strategy: [
        "vertical swivel stem",
        "two fork arms",
        "small torus wheel and axle hub",
      ],
      parent_part_id: "WheelchairFrame",
      connection_strategy: "Joins the left lower frame rail through a vertical swivel stem.",
      material_slot_id: "tubular_frame_metal",
      animation_role: "steering swivel and rotating wheel",
      pivot_requirement: "Vertical stem pivot plus wheel axle pivot.",
      required: true,
      identifying_features: [
        "small front wheel",
        "open fork around the wheel",
      ],
    },
    {
      part_id: "CasterAssembly_R",
      semantic_role: "right front swivel caster",
      geometry_strategy: [
        "mirrored vertical swivel stem",
        "two fork arms",
        "small torus wheel and axle hub",
      ],
      parent_part_id: "WheelchairFrame",
      connection_strategy: "Joins the right lower frame rail through a vertical swivel stem.",
      material_slot_id: "tubular_frame_metal",
      animation_role: "steering swivel and rotating wheel",
      pivot_requirement: "Vertical stem pivot plus wheel axle pivot.",
      required: true,
      identifying_features: [
        "small front wheel",
        "open fork around the wheel",
      ],
    },
    {
      part_id: "Footrest_L",
      semantic_role: "left foot support plate",
      geometry_strategy: [
        "thin beveled plate",
        "connected hanger and support tube",
      ],
      parent_part_id: "WheelchairFrame",
      connection_strategy: "Projects forward from the left front seat rail on a tubular hanger.",
      material_slot_id: "molded_black_plastic",
      animation_role: "swing-away footrest",
      pivot_requirement: "Hanger pivot near the front seat rail.",
      required: true,
      identifying_features: [
        "separate left plate",
        "slight upward angle",
      ],
    },
    {
      part_id: "Footrest_R",
      semantic_role: "right foot support plate",
      geometry_strategy: [
        "mirrored thin beveled plate",
        "connected hanger and support tube",
      ],
      parent_part_id: "WheelchairFrame",
      connection_strategy: "Projects forward from the right front seat rail on a tubular hanger.",
      material_slot_id: "molded_black_plastic",
      animation_role: "swing-away footrest",
      pivot_requirement: "Hanger pivot near the front seat rail.",
      required: true,
      identifying_features: [
        "separate right plate",
        "slight upward angle",
      ],
    },
    {
      part_id: "PushHandle_L",
      semantic_role: "left caregiver push grip",
      geometry_strategy: [
        "rubber-coated native cylinder aligned to handle stem",
      ],
      parent_part_id: "WheelchairFrame",
      connection_strategy: "Extends rearward from the left back post.",
      material_slot_id: "wheelchair_tire_rubber",
      animation_role: null,
      pivot_requirement: null,
      required: true,
      identifying_features: [
        "thick black grip",
      ],
    },
    {
      part_id: "PushHandle_R",
      semantic_role: "right caregiver push grip",
      geometry_strategy: [
        "mirrored rubber-coated native cylinder aligned to handle stem",
      ],
      parent_part_id: "WheelchairFrame",
      connection_strategy: "Extends rearward from the right back post.",
      material_slot_id: "wheelchair_tire_rubber",
      animation_role: null,
      pivot_requirement: null,
      required: true,
      identifying_features: [
        "thick black grip",
      ],
    },
  ],
  material_slots: [
    {
      slot_id: "tubular_frame_metal",
      display_name: "Brushed Tubular Wheelchair Metal",
      assigned_part_ids: [
        "WheelchairFrame",
        "CasterAssembly_L",
        "CasterAssembly_R",
      ],
      material_family: "metal",
      intent: "Clean brushed or satin aluminum suitable for small-diameter wheelchair tubing, with restrained directional grain and no heavy rust or industrial damage.",
      semantic_tags: [
        "metal",
        "aluminum",
        "brushed",
        "satin",
        "silver",
        "tubular frame",
        "wheelchair",
      ],
      color_hint: "cool silver gray",
      roughness_hint: "low-medium satin",
      metallic_hint: "high",
      physical_scale_m: 0.08,
      required_maps: [
        "base_color",
        "roughness",
        "normal_gl",
        "metallic",
      ],
      procedural_fallback: {
        color_rgba: [0.34, 0.39, 0.45, 1],
        metallic: 0.92,
        roughness: 0.28,
      },
    },
    {
      slot_id: "seat_upholstery_fabric",
      display_name: "Dark Durable Wheelchair Upholstery",
      assigned_part_ids: [
        "SeatCushion",
        "Backrest",
      ],
      material_family: "fabric",
      intent: "Dark navy or charcoal tightly woven durable upholstery appropriate to a wheelchair seat and backrest, with small-scale weave and no oversized furniture pattern.",
      semantic_tags: [
        "fabric",
        "upholstery",
        "woven",
        "dark navy",
        "charcoal",
        "durable",
        "fine weave",
      ],
      color_hint: "very dark navy charcoal",
      roughness_hint: "soft matte",
      metallic_hint: "nonmetal",
      physical_scale_m: 0.055,
      required_maps: [
        "base_color",
        "roughness",
        "normal_gl",
      ],
      procedural_fallback: {
        color_rgba: [0.035, 0.07, 0.12, 1],
        metallic: 0,
        roughness: 0.78,
      },
    },
    {
      slot_id: "wheelchair_tire_rubber",
      display_name: "Fine Matte Wheelchair Rubber",
      assigned_part_ids: [
        "RearWheel_L",
        "RearWheel_R",
        "PushHandle_L",
        "PushHandle_R",
      ],
      material_family: "rubber",
      intent: "Fine matte black rubber suitable for wheelchair tires and push grips, with subtle microtexture and no aggressive automotive tire tread.",
      semantic_tags: [
        "rubber",
        "black",
        "matte",
        "fine grain",
        "wheelchair tire",
        "grip",
      ],
      color_hint: "black",
      roughness_hint: "high matte",
      metallic_hint: "nonmetal",
      physical_scale_m: 0.035,
      required_maps: [
        "base_color",
        "roughness",
        "normal_gl",
      ],
      procedural_fallback: {
        color_rgba: [0.012, 0.014, 0.018, 1],
        metallic: 0,
        roughness: 0.86,
      },
    },
    {
      slot_id: "polished_handrim_metal",
      display_name: "Polished Aluminum Hand Rims and Spokes",
      assigned_part_ids: [
        "RearWheel_L",
        "RearWheel_R",
      ],
      material_family: "metal",
      intent: "Clean polished or lightly brushed aluminum for wheelchair hand rims, spokes, and small hubs, bright enough to separate from the satin structural frame.",
      semantic_tags: [
        "metal",
        "aluminum",
        "polished",
        "silver",
        "hand rim",
        "spokes",
      ],
      color_hint: "bright silver",
      roughness_hint: "low",
      metallic_hint: "high",
      physical_scale_m: 0.045,
      required_maps: [
        "base_color",
        "roughness",
        "metallic",
      ],
      procedural_fallback: {
        color_rgba: [0.62, 0.68, 0.74, 1],
        metallic: 1,
        roughness: 0.18,
      },
    },
    {
      slot_id: "molded_black_plastic",
      display_name: "Molded Black Wheelchair Plastic",
      assigned_part_ids: [
        "Footrest_L",
        "Footrest_R",
      ],
      material_family: "plastic",
      intent: "Clean molded matte black plastic appropriate for arm pads, caster caps, footplates, brake blocks, and hub caps, with subtle molded surface variation.",
      semantic_tags: [
        "plastic",
        "molded",
        "black",
        "matte",
        "wheelchair components",
      ],
      color_hint: "charcoal black",
      roughness_hint: "medium-high",
      metallic_hint: "nonmetal",
      physical_scale_m: 0.05,
      required_maps: [
        "base_color",
        "roughness",
        "normal_gl",
      ],
      procedural_fallback: {
        color_rgba: [0.025, 0.03, 0.038, 1],
        metallic: 0,
        roughness: 0.58,
      },
    },
  ],
  environment: {
    intent: "Soft neutral product-photography studio HDRI with broad reflections that reveal metal tubing, spoke structure, rubber tires, and dark woven upholstery.",
    semantic_tags: [
      "studio",
      "product",
      "softbox",
      "neutral",
      "indoor",
      "medical equipment",
    ],
    preferred_environment_class: "studio",
    strength: 0.88,
    rotation_degrees: 32,
    background_visible: false,
  },
  requirements: {
    uv_required: true,
    rig_required: false,
    collision_required: false,
    ground_contact_required: true,
    animation_ready: true,
    movable_part_ids: [
      "RearWheel_L",
      "RearWheel_R",
      "CasterAssembly_L",
      "CasterAssembly_R",
      "Footrest_L",
      "Footrest_R",
    ],
  },
  acceptance_criteria: [
    "The object reads immediately as a modern manual wheelchair from a three-quarter view.",
    "Both large rear wheels include tires, rims, hubs, repeated radial spokes, and separate hand rims.",
    "Both front caster assemblies visibly connect to the lower frame and contain wheel, fork, hub, and swivel stem components.",
    "Seat, backrest, frame metal, polished wheel metal, rubber, and molded plastic remain visually distinct.",
    "Tube intersections and component connections look intentional rather than floating.",
    "Rear wheels, casters, and footrests retain useful pivots and separate semantic object names for later animation.",
    "The exported GLB stays within the requested triangle budget and contains valid UVs.",
  ],
  benchmark_priorities: [
    "large-wheel silhouette and proportions",
    "spoke repetition and wheel layering",
    "connected tube-frame construction",
    "caster and footrest articulation readability",
    "material separation at normal browser viewing distance",
  ],
} satisfies AssetDesignBriefV2;

export const NATIVE_WHEELCHAIR_PROOF_CODE = String.raw`import bpy
import math
from mathutils import Vector

# Native bpy wheelchair reference build.
# MyWay supplies trusted semantic materials/HDRI hydration, validation,
# inspection views, .blend saving, and GLB export around this script.

myway_reset_scene()
myway_print_progress("building native stylized wheelchair")

# -----------------------------------------------------------------------------
# Semantic material slots resolved by the Foundry resource plan.
# -----------------------------------------------------------------------------
frame_mat = myway_material_slot(
    "tubular_frame_metal",
    fallback_color=(0.34, 0.39, 0.45, 1.0),
    metallic=0.92,
    roughness=0.28,
)
fabric_mat = myway_material_slot(
    "seat_upholstery_fabric",
    fallback_color=(0.035, 0.07, 0.12, 1.0),
    metallic=0.0,
    roughness=0.78,
)
rubber_mat = myway_material_slot(
    "wheelchair_tire_rubber",
    fallback_color=(0.012, 0.014, 0.018, 1.0),
    metallic=0.0,
    roughness=0.86,
)
handrim_mat = myway_material_slot(
    "polished_handrim_metal",
    fallback_color=(0.62, 0.68, 0.74, 1.0),
    metallic=1.0,
    roughness=0.18,
)
plastic_mat = myway_material_slot(
    "molded_black_plastic",
    fallback_color=(0.025, 0.03, 0.038, 1.0),
    metallic=0.0,
    roughness=0.58,
)


def native_material(name, color, metallic=0.0, roughness=0.5):
    material = bpy.data.materials.new(name=name)
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    if principled is not None:
        principled.inputs["Base Color"].default_value = color
        principled.inputs["Metallic"].default_value = metallic
        principled.inputs["Roughness"].default_value = roughness
    material.diffuse_color = color
    return material


accent_mat = native_material(
    "WheelchairBrakeAccent",
    (0.55, 0.055, 0.025, 1.0),
    metallic=0.15,
    roughness=0.34,
)

# -----------------------------------------------------------------------------
# General helpers.
# -----------------------------------------------------------------------------
root = bpy.data.objects.new("Wheelchair_Root", None)
bpy.context.scene.collection.objects.link(root)
root.empty_display_type = "PLAIN_AXES"


def parent_keep_transform(child, parent=root):
    world = child.matrix_world.copy()
    child.parent = parent
    child.matrix_world = world
    return child


def activate(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def apply_scale(obj):
    activate(obj)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return obj


def assign(obj, material):
    if obj is not None and obj.type == "MESH":
        obj.data.materials.clear()
        obj.data.materials.append(material)
    return obj


def finish_mesh(obj, bevel=0.0, smooth=False):
    if bevel > 0.0:
        modifier = obj.modifiers.new(name="NativeBevel", type="BEVEL")
        modifier.width = bevel
        modifier.segments = 3
        modifier.limit_method = "ANGLE"
    if smooth and obj.type == "MESH":
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    try:
        weighted = obj.modifiers.new(name="NativeWeightedNormals", type="WEIGHTED_NORMAL")
        weighted.keep_sharp = True
    except Exception:
        pass
    return obj


def rounded_box(name, size, location, material, bevel=0.008, rotation=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (size[0] * 0.5, size[1] * 0.5, size[2] * 0.5)
    apply_scale(obj)
    assign(obj, material)
    finish_mesh(obj, bevel=bevel, smooth=False)
    parent_keep_transform(obj)
    return obj


def cylinder_x(name, radius, depth, location, material, vertices=32, bevel=0.002):
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
    parent_keep_transform(obj)
    return obj


def cylinder_z(name, radius, depth, location, material, vertices=32, bevel=0.002):
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
    parent_keep_transform(obj)
    return obj


def torus_x(name, major_radius, minor_radius, location, material, major_segments=48, minor_segments=12):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=major_segments,
        minor_segments=minor_segments,
        location=location,
        rotation=(0.0, math.radians(90.0), 0.0),
    )
    obj = bpy.context.object
    obj.name = name
    assign(obj, material)
    finish_mesh(obj, smooth=True)
    parent_keep_transform(obj)
    return obj


def tube_between(name, start, end, radius, material, vertices=16, bevel=0.0015):
    a = Vector(start)
    b = Vector(end)
    direction = b - a
    length = direction.length
    if length <= 1e-6:
        raise ValueError("Tube endpoints must be different")
    midpoint = (a + b) * 0.5
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=length,
        location=midpoint,
    )
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    assign(obj, material)
    finish_mesh(obj, bevel=bevel, smooth=True)
    parent_keep_transform(obj)
    return obj


def add_spoked_rear_wheel(side, x_value):
    suffix = "L" if side < 0 else "R"
    center = Vector((x_value, 0.055, 0.315))

    # The tire mesh carries the semantic required-part name.
    tire = torus_x(
        "RearWheel_" + suffix,
        0.278,
        0.024,
        center,
        rubber_mat,
        major_segments=64,
        minor_segments=14,
    )
    torus_x(
        "RearWheelRim_" + suffix,
        0.252,
        0.0075,
        center,
        frame_mat,
        major_segments=64,
        minor_segments=10,
    )

    outside_x = x_value + side * 0.038
    torus_x(
        "HandRim_" + suffix,
        0.238,
        0.0060,
        (outside_x, center.y, center.z),
        handrim_mat,
        major_segments=64,
        minor_segments=10,
    )

    hub = cylinder_x(
        "RearHub_" + suffix,
        0.026,
        0.082,
        center,
        frame_mat,
        vertices=32,
        bevel=0.0018,
    )
    cylinder_x(
        "RearHubCap_" + suffix,
        0.015,
        0.088,
        center,
        plastic_mat,
        vertices=28,
        bevel=0.0012,
    )

    spoke_radius = 0.00225
    spoke_ring_radius = 0.238
    for index in range(18):
        angle = (math.tau * index / 18.0) + (0.045 if side > 0 else 0.0)
        endpoint = Vector((
            x_value,
            center.y + math.cos(angle) * spoke_ring_radius,
            center.z + math.sin(angle) * spoke_ring_radius,
        ))
        tube_between(
            f"RearSpoke_{suffix}_{index + 1:02d}",
            center,
            endpoint,
            spoke_radius,
            handrim_mat,
            vertices=10,
            bevel=0.00035,
        )

    # A small axle collar visually joins the hub to the frame.
    cylinder_x(
        "RearAxleCollar_" + suffix,
        0.034,
        0.026,
        (x_value - side * 0.052, center.y, center.z),
        plastic_mat,
        vertices=28,
        bevel=0.0015,
    )
    return tire, hub


def add_front_caster(side, x_value):
    suffix = "L" if side < 0 else "R"
    stem_y = -0.365
    wheel_center = Vector((x_value, -0.405, 0.095))

    # Required semantic assembly marker is an actual mesh, not an empty.
    stem = cylinder_z(
        "CasterAssembly_" + suffix,
        0.017,
        0.120,
        (x_value, stem_y, 0.285),
        frame_mat,
        vertices=28,
        bevel=0.0015,
    )
    cylinder_z(
        "CasterSwivelCap_" + suffix,
        0.028,
        0.024,
        (x_value, stem_y, 0.345),
        plastic_mat,
        vertices=32,
        bevel=0.002,
    )

    fork_top = Vector((x_value, stem_y, 0.245))
    for fork_side in (-1.0, 1.0):
        fork_x = x_value + fork_side * 0.023
        tube_between(
            f"CasterFork_{suffix}_{'A' if fork_side < 0 else 'B'}",
            (fork_x, fork_top.y, fork_top.z),
            (fork_x, wheel_center.y, wheel_center.z),
            0.008,
            frame_mat,
            vertices=14,
            bevel=0.0010,
        )

    torus_x(
        "CasterWheel_" + suffix,
        0.067,
        0.014,
        wheel_center,
        rubber_mat,
        major_segments=48,
        minor_segments=12,
    )
    cylinder_x(
        "CasterHub_" + suffix,
        0.014,
        0.064,
        wheel_center,
        handrim_mat,
        vertices=24,
        bevel=0.0010,
    )
    return stem


# -----------------------------------------------------------------------------
# Main dimensions and primary components.
# Travel direction is -Y. Width is X. Z is up.
# -----------------------------------------------------------------------------
FRAME_X = 0.245
SEAT_Z = 0.485
SEAT_FRONT_Y = -0.235
SEAT_REAR_Y = 0.165

# Main seating surfaces.
seat = rounded_box(
    "SeatCushion",
    (0.470, 0.405, 0.038),
    (0.0, -0.035, SEAT_Z),
    fabric_mat,
    bevel=0.010,
)
backrest = rounded_box(
    "Backrest",
    (0.465, 0.040, 0.405),
    (0.0, 0.186, 0.725),
    fabric_mat,
    bevel=0.010,
    rotation=(math.radians(-7.0), 0.0, 0.0),
)

# Rear wheel assemblies.
add_spoked_rear_wheel(-1, -0.335)
add_spoked_rear_wheel(1, 0.335)

# Core frame rails. WheelchairFrame is one of the cross tubes and is required.
tube_between(
    "WheelchairFrame",
    (-FRAME_X, SEAT_REAR_Y, 0.445),
    (FRAME_X, SEAT_REAR_Y, 0.445),
    0.016,
    frame_mat,
    vertices=20,
    bevel=0.0018,
)
tube_between(
    "FrontSeatCrossbar",
    (-FRAME_X, SEAT_FRONT_Y, 0.445),
    (FRAME_X, SEAT_FRONT_Y, 0.445),
    0.016,
    frame_mat,
    vertices=20,
    bevel=0.0018,
)
tube_between(
    "RearAxleCrossbar",
    (-0.285, 0.055, 0.315),
    (0.285, 0.055, 0.315),
    0.017,
    frame_mat,
    vertices=20,
    bevel=0.0018,
)

for side, x_value in ((-1, -FRAME_X), (1, FRAME_X)):
    suffix = "L" if side < 0 else "R"
    # Seat rails and lower frame rails.
    tube_between(
        "SeatRail_" + suffix,
        (x_value, SEAT_REAR_Y, 0.455),
        (x_value, SEAT_FRONT_Y, 0.455),
        0.017,
        frame_mat,
        vertices=20,
        bevel=0.0018,
    )
    tube_between(
        "LowerFrameRail_" + suffix,
        (x_value, 0.115, 0.300),
        (x_value, -0.345, 0.265),
        0.016,
        frame_mat,
        vertices=20,
        bevel=0.0018,
    )
    tube_between(
        "FrontFrameRiser_" + suffix,
        (x_value, SEAT_FRONT_Y, 0.455),
        (x_value, -0.345, 0.265),
        0.016,
        frame_mat,
        vertices=20,
        bevel=0.0018,
    )
    tube_between(
        "RearFrameDiagonal_" + suffix,
        (x_value, 0.115, 0.300),
        (x_value, SEAT_REAR_Y, 0.455),
        0.016,
        frame_mat,
        vertices=20,
        bevel=0.0018,
    )

    # Back post and push handle structure.
    tube_between(
        "BackPost_" + suffix,
        (x_value, 0.135, 0.330),
        (x_value, 0.205, 0.955),
        0.017,
        frame_mat,
        vertices=20,
        bevel=0.0018,
    )
    tube_between(
        "PushHandleStem_" + suffix,
        (x_value, 0.205, 0.955),
        (x_value, 0.315, 0.985),
        0.015,
        frame_mat,
        vertices=18,
        bevel=0.0015,
    )
    tube_between(
        "PushHandle_" + suffix,
        (x_value, 0.285, 0.977),
        (x_value, 0.390, 1.005),
        0.021,
        rubber_mat,
        vertices=20,
        bevel=0.0016,
    )

    # Arm support and upholstered pad.
    tube_between(
        "ArmSupportFront_" + suffix,
        (x_value, -0.180, 0.470),
        (x_value, -0.160, 0.720),
        0.013,
        frame_mat,
        vertices=18,
        bevel=0.0015,
    )
    tube_between(
        "ArmSupportRear_" + suffix,
        (x_value, 0.120, 0.470),
        (x_value, 0.120, 0.720),
        0.013,
        frame_mat,
        vertices=18,
        bevel=0.0015,
    )
    rounded_box(
        "ArmPad_" + suffix,
        (0.066, 0.315, 0.038),
        (x_value, -0.020, 0.742),
        plastic_mat,
        bevel=0.009,
    )

    # Brake block and bright lever for readability.
    rounded_box(
        "WheelBrakeBlock_" + suffix,
        (0.045, 0.055, 0.035),
        (x_value + side * 0.025, -0.040, 0.495),
        plastic_mat,
        bevel=0.006,
    )
    tube_between(
        "WheelBrakeLever_" + suffix,
        (x_value + side * 0.030, -0.045, 0.510),
        (x_value + side * 0.052, -0.105, 0.580),
        0.008,
        accent_mat,
        vertices=14,
        bevel=0.0008,
    )

# Cross-brace folding mechanism beneath the seat.
tube_between(
    "CrossBrace_A",
    (-FRAME_X, SEAT_FRONT_Y + 0.020, 0.425),
    (FRAME_X, SEAT_REAR_Y - 0.020, 0.265),
    0.012,
    frame_mat,
    vertices=16,
    bevel=0.0012,
)
tube_between(
    "CrossBrace_B",
    (FRAME_X, SEAT_FRONT_Y + 0.020, 0.425),
    (-FRAME_X, SEAT_REAR_Y - 0.020, 0.265),
    0.012,
    frame_mat,
    vertices=16,
    bevel=0.0012,
)
cylinder_x(
    "CrossBracePivot",
    0.022,
    0.090,
    (0.0, -0.035, 0.345),
    plastic_mat,
    vertices=28,
    bevel=0.0015,
)

# Front caster assemblies.
add_front_caster(-1, -0.215)
add_front_caster(1, 0.215)

# Footrest supports and plates.
for side, x_value in ((-1, -0.145), (1, 0.145)):
    suffix = "L" if side < 0 else "R"
    tube_between(
        "FootrestSupport_" + suffix,
        (x_value, -0.225, 0.425),
        (x_value, -0.470, 0.205),
        0.014,
        frame_mat,
        vertices=18,
        bevel=0.0015,
    )
    tube_between(
        "FootrestHanger_" + suffix,
        (x_value, -0.470, 0.205),
        (x_value, -0.520, 0.165),
        0.012,
        frame_mat,
        vertices=16,
        bevel=0.0012,
    )
    rounded_box(
        "Footrest_" + suffix,
        (0.170, 0.145, 0.025),
        (x_value, -0.535, 0.145),
        plastic_mat,
        bevel=0.007,
        rotation=(math.radians(-4.0), 0.0, 0.0),
    )

# A modest product-view rotation keeps the silhouette readable while preserving
# world-up pivots for wheels and casters.
root.rotation_euler[2] = math.radians(-3.0)

myway_print_progress("native stylized wheelchair geometry complete")
`;

export const NATIVE_WHEELCHAIR_PROOF = {
  request:
    NATIVE_WHEELCHAIR_PROOF_REQUEST,
  asset_name:
    NATIVE_WHEELCHAIR_PROOF_BRIEF.asset_id,
  style:
    "high-quality stylized healthcare product asset",
  quality_mode:
    "standard" as const,
  target_extent_m:
    NATIVE_WHEELCHAIR_PROOF_BRIEF.target_extent_m,
  max_triangles:
    NATIVE_WHEELCHAIR_PROOF_BRIEF.max_triangles,
  animation_ready: true,
  design_brief:
    NATIVE_WHEELCHAIR_PROOF_BRIEF,
  code:
    NATIVE_WHEELCHAIR_PROOF_CODE,
};
