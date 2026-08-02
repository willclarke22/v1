import type {
  AssetDesignBriefV2,
} from "./asset-design-brief";

export const NATIVE_VINTAGE_CAMERA_PROOF_REQUEST =
  "Create a high-quality stylized vintage camera in native Blender Python with a layered lens, rounded manufactured body, leather grip panels, aged metal controls, fine rubber focus grip, studio HDRI lighting, and browser-ready export.";

export const NATIVE_VINTAGE_CAMERA_PROOF_BRIEF = {
  schema_version:
    "myway_asset_design_brief_v2",
  asset_id:
    "native_vintage_camera_cloud_proof",
  concept:
    NATIVE_VINTAGE_CAMERA_PROOF_REQUEST,
  asset_class:
    "hard_surface_assembly",
  intended_use: [
    "browser-ready educational scene asset",
    "close three-quarter product view",
    "proof of automatic AmbientCG selection and R2 hydration",
  ],
  target_extent_m: 0.22,
  axis_dimensions_m: [
    0.18,
    0.14,
    0.14,
  ],
  max_triangles: 60_000,
  quality_mode:
    "standard",
  realism:
    "stylized",
  style_tags: [
    "high quality",
    "stylized realism",
    "vintage camera",
    "clean hard surface",
    "product visualization",
  ],
  silhouette: {
    primary_shapes: [
      "compact rounded rectangular camera body",
      "layered circular lens projecting from the front",
      "low top housing with two readable control dials",
    ],
    identifying_features: [
      "large concentric lens assembly",
      "brown leather grip panels",
      "aged brass trim and controls",
      "front viewfinder and meter windows",
      "strap lugs on both sides",
    ],
    important_negative_spaces: [
      "clear gap between lens rings",
      "separation between top dials and top housing",
      "open centers in side strap lugs",
    ],
    camera_readability: [
      "front three-quarter hero view",
      "front orthographic inspection",
      "top inspection",
    ],
  },
  proportions: [
    "body width is about 1.7 times body height",
    "main lens diameter is about two thirds of body height",
    "lens projects far enough to read in silhouette without overwhelming the body",
    "top housing remains subordinate to the main body",
  ],
  parts: [
    {
      part_id:
        "CameraBody",
      semantic_role:
        "primary camera chassis",
      geometry_strategy: [
        "native bpy rounded box",
        "bevel modifier",
        "weighted normals",
      ],
      parent_part_id: null,
      connection_strategy:
        "Root structural body supporting every camera component.",
      material_slot_id:
        "camera_body_paint",
      animation_role:
        "static root",
      pivot_requirement:
        "Origin centered on the camera body.",
      required: true,
      identifying_features: [
        "rounded manufactured edges",
        "compact black body",
      ],
    },
    {
      part_id:
        "FrontLeatherPanel",
      semantic_role:
        "front leather grip panel",
      geometry_strategy: [
        "thin rounded box",
        "separate material region",
      ],
      parent_part_id:
        "CameraBody",
      connection_strategy:
        "Sits slightly proud of the front body surface around the lens.",
      material_slot_id:
        "leather_grip",
      animation_role: null,
      pivot_requirement: null,
      required: true,
      identifying_features: [
        "warm brown fine-grain leather",
      ],
    },
    {
      part_id:
        "LensBarrelOuter",
      semantic_role:
        "main lens barrel",
      geometry_strategy: [
        "stacked native cylinders",
        "concentric rings",
      ],
      parent_part_id:
        "CameraBody",
      connection_strategy:
        "Centered on the front body and layered from mount to front glass.",
      material_slot_id:
        "dark_metal",
      animation_role:
        "optional focus rotation",
      pivot_requirement:
        "Lens optical axis through its center.",
      required: true,
      identifying_features: [
        "concentric stepped silhouette",
        "recessed glass",
      ],
    },
    {
      part_id:
        "FocusRing",
      semantic_role:
        "rubber focus grip",
      geometry_strategy: [
        "wide cylinder ring",
        "subtle textured material",
      ],
      parent_part_id:
        "LensBarrelOuter",
      connection_strategy:
        "Wraps the central lens barrel.",
      material_slot_id:
        "matte_rubber",
      animation_role:
        "rotating control",
      pivot_requirement:
        "Lens optical axis.",
      required: true,
      identifying_features: [
        "wide matte black grip",
      ],
    },
    {
      part_id:
        "LensMount",
      semantic_role:
        "aged metal lens mount",
      geometry_strategy: [
        "beveled cylinder",
        "decorative ring",
      ],
      parent_part_id:
        "CameraBody",
      connection_strategy:
        "Bridges the lens barrel and camera body.",
      material_slot_id:
        "aged_brass",
      animation_role: null,
      pivot_requirement: null,
      required: true,
      identifying_features: [
        "warm aged brass accent",
      ],
    },
    {
      part_id:
        "ShutterDial",
      semantic_role:
        "top mechanical control",
      geometry_strategy: [
        "stacked cylinders",
        "beveled control edges",
      ],
      parent_part_id:
        "CameraBody",
      connection_strategy:
        "Mounted on the top housing.",
      material_slot_id:
        "aged_brass",
      animation_role:
        "rotating control",
      pivot_requirement:
        "Vertical dial axis.",
      required: true,
      identifying_features: [
        "readable top dial silhouette",
      ],
    },
    {
      part_id:
        "ViewfinderFrame",
      semantic_role:
        "front viewfinder window",
      geometry_strategy: [
        "layered rounded frame and glass insert",
      ],
      parent_part_id:
        "CameraBody",
      connection_strategy:
        "Recessed into the upper front body.",
      material_slot_id:
        "aged_brass",
      animation_role: null,
      pivot_requirement: null,
      required: true,
      identifying_features: [
        "small reflective window",
      ],
    },
  ],
  material_slots: [
    {
      slot_id:
        "camera_body_paint",
      display_name:
        "Black Painted Camera Metal",
      assigned_part_ids: [
        "CameraBody",
      ],
      material_family:
        "metal",
      intent:
        "Subtle black painted or powder-coated metal suitable for a vintage camera body; clean enough for a stylized product asset, with restrained micro-surface variation.",
      semantic_tags: [
        "metal",
        "painted metal",
        "black",
        "dark",
        "coated",
        "camera body",
      ],
      color_hint:
        "black",
      roughness_hint:
        "medium satin",
      metallic_hint:
        "metal beneath paint",
      physical_scale_m: 0.08,
      required_maps: [
        "base_color",
        "roughness",
        "normal_gl",
        "metallic",
      ],
      procedural_fallback: {
        color_rgba: [
          0.035,
          0.04,
          0.05,
          1,
        ],
        metallic: 0.55,
        roughness: 0.38,
      },
    },
    {
      slot_id:
        "leather_grip",
      display_name:
        "Fine Brown Vintage Leather",
      assigned_part_ids: [
        "FrontLeatherPanel",
      ],
      material_family:
        "leather",
      intent:
        "Warm medium-dark brown leather with fine grain appropriate to a handheld camera, not oversized furniture grain and not heavily damaged.",
      semantic_tags: [
        "leather",
        "brown",
        "fine grain",
        "warm",
        "vintage",
        "handheld",
      ],
      color_hint:
        "warm brown",
      roughness_hint:
        "soft matte",
      metallic_hint:
        "nonmetal",
      physical_scale_m: 0.045,
      required_maps: [
        "base_color",
        "roughness",
        "normal_gl",
      ],
      procedural_fallback: {
        color_rgba: [
          0.19,
          0.085,
          0.032,
          1,
        ],
        metallic: 0,
        roughness: 0.7,
      },
    },
    {
      slot_id:
        "aged_brass",
      display_name:
        "Aged Brass Camera Hardware",
      assigned_part_ids: [
        "LensMount",
        "ShutterDial",
        "ViewfinderFrame",
      ],
      material_family:
        "metal",
      intent:
        "Warm aged brass or bronze mechanical hardware with controlled patina and readable highlights; not rusty structural steel.",
      semantic_tags: [
        "metal",
        "brass",
        "bronze",
        "aged",
        "warm",
        "hardware",
      ],
      color_hint:
        "warm brass",
      roughness_hint:
        "semi-polished worn",
      metallic_hint:
        "high",
      physical_scale_m: 0.035,
      required_maps: [
        "base_color",
        "roughness",
        "normal_gl",
        "metallic",
      ],
      procedural_fallback: {
        color_rgba: [
          0.58,
          0.36,
          0.09,
          1,
        ],
        metallic: 1,
        roughness: 0.3,
      },
    },
    {
      slot_id:
        "matte_rubber",
      display_name:
        "Fine Matte Black Rubber",
      assigned_part_ids: [
        "FocusRing",
      ],
      material_family:
        "rubber",
      intent:
        "Fine-grain matte black rubber appropriate to a camera focus ring, with restrained normal detail and no tire tread.",
      semantic_tags: [
        "rubber",
        "black",
        "matte",
        "fine grain",
        "camera grip",
      ],
      color_hint:
        "black",
      roughness_hint:
        "high",
      metallic_hint:
        "nonmetal",
      physical_scale_m: 0.025,
      required_maps: [
        "base_color",
        "roughness",
        "normal_gl",
      ],
      procedural_fallback: {
        color_rgba: [
          0.018,
          0.02,
          0.024,
          1,
        ],
        metallic: 0,
        roughness: 0.78,
      },
    },
    {
      slot_id:
        "dark_metal",
      display_name:
        "Dark Camera Barrel Metal",
      assigned_part_ids: [
        "LensBarrelOuter",
      ],
      material_family:
        "metal",
      intent:
        "Dark coated metal for the lens barrel and small structural camera parts, slightly more metallic than the painted body and without obvious large scratches.",
      semantic_tags: [
        "metal",
        "dark",
        "black",
        "coated",
        "lens barrel",
      ],
      color_hint:
        "charcoal black",
      roughness_hint:
        "medium",
      metallic_hint:
        "high",
      physical_scale_m: 0.04,
      required_maps: [
        "base_color",
        "roughness",
        "normal_gl",
        "metallic",
      ],
      procedural_fallback: {
        color_rgba: [
          0.04,
          0.045,
          0.055,
          1,
        ],
        metallic: 0.9,
        roughness: 0.34,
      },
    },
  ],
  environment: {
    intent:
      "Soft neutral product-photography studio HDRI with broad highlights that reveal black paint, leather grain, brass, and lens glass.",
    semantic_tags: [
      "studio",
      "product",
      "softbox",
      "neutral",
      "indoor",
    ],
    preferred_environment_class:
      "studio",
    strength: 0.85,
    rotation_degrees: 28,
    background_visible: false,
  },
  requirements: {
    uv_required: true,
    rig_required: false,
    collision_required: false,
    ground_contact_required: true,
    animation_ready: true,
    movable_part_ids: [
      "FocusRing",
      "ShutterDial",
    ],
  },
  acceptance_criteria: [
    "The camera reads immediately from the front three-quarter silhouette.",
    "The lens contains at least five visibly stepped layers and recessed glass.",
    "Leather, painted body metal, brass hardware, rubber, dark barrel metal, and glass remain visually distinct.",
    "Manufactured edges are softened without making the camera toy-like.",
    "The body and lens remain clean enough for browser export and inspection.",
    "AmbientCG choices are selected automatically from semantic slot descriptions and prepared to R2 before Blender hydration.",
  ],
  benchmark_priorities: [
    "silhouette and proportions",
    "layered lens construction",
    "material scale appropriate to a small handheld object",
    "clean part connections",
    "strong three-quarter product render",
  ],
} satisfies AssetDesignBriefV2;

export const NATIVE_VINTAGE_CAMERA_PROOF_CODE = String.raw`import bpy
import math
from mathutils import Vector

# Native bpy geometry proof.
# MyWay is used only for trusted semantic material slots, HDRI hydration,
# validation, inspection, .blend save, and GLB export.

myway_reset_scene()
myway_print_progress("building native vintage camera")

BODY_W = 0.180
BODY_D = 0.070
BODY_H = 0.105
BODY_Z = BODY_H * 0.5

body_mat = myway_material_slot(
    "camera_body_paint",
    fallback_color=(0.035, 0.04, 0.05, 1.0),
    metallic=0.55,
    roughness=0.38,
)
leather_mat = myway_material_slot(
    "leather_grip",
    fallback_color=(0.19, 0.085, 0.032, 1.0),
    metallic=0.0,
    roughness=0.70,
)
brass_mat = myway_material_slot(
    "aged_brass",
    fallback_color=(0.58, 0.36, 0.09, 1.0),
    metallic=1.0,
    roughness=0.30,
)
rubber_mat = myway_material_slot(
    "matte_rubber",
    fallback_color=(0.018, 0.02, 0.024, 1.0),
    metallic=0.0,
    roughness=0.78,
)
dark_metal_mat = myway_material_slot(
    "dark_metal",
    fallback_color=(0.04, 0.045, 0.055, 1.0),
    metallic=0.9,
    roughness=0.34,
)


def native_material(name, color, metallic=0.0, roughness=0.5, transmission=0.0, ior=1.45):
    material = bpy.data.materials.new(name=name)
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    if principled is not None:
        principled.inputs["Base Color"].default_value = color
        principled.inputs["Metallic"].default_value = metallic
        principled.inputs["Roughness"].default_value = roughness
        if principled.inputs.get("Transmission Weight") is not None:
            principled.inputs["Transmission Weight"].default_value = transmission
        if principled.inputs.get("IOR") is not None:
            principled.inputs["IOR"].default_value = ior
    material.diffuse_color = color
    return material


glass_mat = native_material(
    "CameraLensGlass",
    (0.12, 0.22, 0.32, 1.0),
    metallic=0.0,
    roughness=0.08,
    transmission=0.72,
    ior=1.46,
)
red_mat = native_material(
    "CameraIndicatorRed",
    (0.48, 0.015, 0.01, 1.0),
    metallic=0.0,
    roughness=0.30,
)


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


def finish_mesh(obj, bevel=0.0, smooth=False):
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


def rounded_box(name, size, location, material, bevel=0.0025):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (size[0] * 0.5, size[1] * 0.5, size[2] * 0.5)
    apply_scale(obj)
    assign(obj, material)
    finish_mesh(obj, bevel=bevel, smooth=False)
    return obj


def cylinder_y(name, radius, depth, location, material, vertices=64, bevel=0.0010):
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


def cylinder_z(name, radius, depth, location, material, vertices=48, bevel=0.0008):
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


def torus_y(name, major_radius, minor_radius, location, material):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=64,
        minor_segments=16,
        location=location,
        rotation=(math.radians(90.0), 0.0, 0.0),
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


root = bpy.data.objects.new("VintageCamera_Root", None)
bpy.context.scene.collection.objects.link(root)
root.empty_display_type = "PLAIN_AXES"

body = rounded_box(
    "CameraBody",
    (BODY_W, BODY_D, BODY_H),
    (0.0, 0.0, BODY_Z),
    body_mat,
    bevel=0.0045,
)
parent_keep_transform(body, root)

top_housing = rounded_box(
    "TopHousing",
    (0.122, 0.050, 0.025),
    (0.0, -0.001, BODY_H + 0.0095),
    body_mat,
    bevel=0.0030,
)
parent_keep_transform(top_housing, root)

front_panel = rounded_box(
    "FrontLeatherPanel",
    (0.150, 0.007, 0.071),
    (0.0, -BODY_D * 0.5 - 0.0030, 0.054),
    leather_mat,
    bevel=0.0018,
)
parent_keep_transform(front_panel, root)

back_panel = rounded_box(
    "BackLeatherPanel",
    (0.148, 0.006, 0.064),
    (0.0, BODY_D * 0.5 + 0.0026, 0.054),
    leather_mat,
    bevel=0.0017,
)
parent_keep_transform(back_panel, root)

for side, x_value in (("L", -BODY_W * 0.5 - 0.0025), ("R", BODY_W * 0.5 + 0.0025)):
    panel = rounded_box(
        "SideLeather_" + side,
        (0.006, 0.043, 0.064),
        (x_value, 0.0, 0.054),
        leather_mat,
        bevel=0.0015,
    )
    parent_keep_transform(panel, root)

lens_center_y = -BODY_D * 0.5
lens_z = 0.057
lens_parts = []
lens_parts.append(cylinder_y(
    "LensMount",
    0.0375,
    0.010,
    (0.0, lens_center_y - 0.004, lens_z),
    brass_mat,
    bevel=0.0014,
))
lens_parts.append(cylinder_y(
    "LensBarrelOuter",
    0.0325,
    0.026,
    (0.0, lens_center_y - 0.020, lens_z),
    dark_metal_mat,
    bevel=0.0015,
))
lens_parts.append(cylinder_y(
    "FocusRing",
    0.0350,
    0.015,
    (0.0, lens_center_y - 0.037, lens_z),
    rubber_mat,
    bevel=0.0012,
))
lens_parts.append(cylinder_y(
    "LensBrassRing",
    0.0330,
    0.0045,
    (0.0, lens_center_y - 0.0470, lens_z),
    brass_mat,
    bevel=0.0007,
))
lens_parts.append(cylinder_y(
    "FrontLensBarrel",
    0.0285,
    0.015,
    (0.0, lens_center_y - 0.0560, lens_z),
    dark_metal_mat,
    bevel=0.0010,
))
lens_parts.append(cylinder_y(
    "FrontGlassHousing",
    0.0235,
    0.0040,
    (0.0, lens_center_y - 0.0650, lens_z),
    brass_mat,
    bevel=0.0006,
))
lens_parts.append(cylinder_y(
    "FrontGlass",
    0.0190,
    0.0030,
    (0.0, lens_center_y - 0.0680, lens_z),
    glass_mat,
    bevel=0.0005,
))
lens_parts.append(cylinder_y(
    "InnerLensGlass",
    0.0135,
    0.0022,
    (0.0, lens_center_y - 0.0640, lens_z),
    glass_mat,
    bevel=0.0004,
))

for index, y_offset in enumerate((-0.026, -0.031, -0.051)):
    ring = torus_y(
        "LensDetailRing_" + str(index + 1),
        0.0315,
        0.0008,
        (0.0, lens_center_y + y_offset, lens_z),
        brass_mat if index != 1 else dark_metal_mat,
    )
    lens_parts.append(ring)

for item in lens_parts:
    parent_keep_transform(item, root)

viewfinder_frame = rounded_box(
    "ViewfinderFrame",
    (0.029, 0.009, 0.021),
    (0.050, -BODY_D * 0.5 - 0.0040, 0.091),
    brass_mat,
    bevel=0.0013,
)
parent_keep_transform(viewfinder_frame, root)
viewfinder_glass = rounded_box(
    "ViewfinderGlass",
    (0.022, 0.0030, 0.014),
    (0.050, -BODY_D * 0.5 - 0.0090, 0.091),
    glass_mat,
    bevel=0.0007,
)
parent_keep_transform(viewfinder_glass, root)

meter_frame = rounded_box(
    "MeterFrame",
    (0.021, 0.008, 0.015),
    (-0.050, -BODY_D * 0.5 - 0.0035, 0.088),
    brass_mat,
    bevel=0.0011,
)
parent_keep_transform(meter_frame, root)
meter_glass = rounded_box(
    "MeterGlass",
    (0.015, 0.003, 0.0095),
    (-0.050, -BODY_D * 0.5 - 0.0080, 0.088),
    glass_mat,
    bevel=0.0006,
)
parent_keep_transform(meter_glass, root)

for name, x_value, radius in (
    ("RewindKnob", -0.059, 0.0120),
    ("ShutterDial", 0.050, 0.0140),
):
    dial = cylinder_z(
        name,
        radius,
        0.010,
        (x_value, 0.0, BODY_H + 0.018),
        brass_mat,
        bevel=0.0010,
    )
    dial_ring = cylinder_z(
        name + "_Inset",
        radius * 0.78,
        0.0025,
        (x_value, 0.0, BODY_H + 0.0235),
        dark_metal_mat,
        bevel=0.0005,
    )
    parent_keep_transform(dial, root)
    parent_keep_transform(dial_ring, root)

shutter_button = cylinder_z(
    "ShutterButton",
    0.0055,
    0.008,
    (0.077, -0.010, BODY_H + 0.018),
    brass_mat,
    vertices=32,
    bevel=0.0007,
)
parent_keep_transform(shutter_button, root)

hot_shoe = rounded_box(
    "HotShoe",
    (0.033, 0.014, 0.004),
    (0.0, 0.0, BODY_H + 0.019),
    dark_metal_mat,
    bevel=0.0007,
)
parent_keep_transform(hot_shoe, root)

advance_lever = rounded_box(
    "AdvanceLever",
    (0.031, 0.006, 0.0035),
    (0.073, -0.020, BODY_H + 0.021),
    dark_metal_mat,
    bevel=0.0007,
)
advance_lever.rotation_euler[2] = math.radians(-24.0)
parent_keep_transform(advance_lever, root)

name_plate = rounded_box(
    "CameraNamePlate",
    (0.043, 0.0035, 0.010),
    (0.0, -BODY_D * 0.5 - 0.0080, 0.023),
    brass_mat,
    bevel=0.0005,
)
parent_keep_transform(name_plate, root)

indicator = cylinder_y(
    "SelfTimerIndicator",
    0.0035,
    0.0028,
    (-0.068, -BODY_D * 0.5 - 0.0085, 0.055),
    red_mat,
    vertices=32,
    bevel=0.0003,
)
parent_keep_transform(indicator, root)

for side, x_value in (("L", -BODY_W * 0.5 - 0.004), ("R", BODY_W * 0.5 + 0.004)):
    lug = torus_y(
        "StrapLug_" + side,
        0.0095,
        0.0017,
        (x_value, 0.0, 0.083),
        dark_metal_mat,
    )
    lug.scale = (1.0, 0.78, 1.18)
    apply_scale(lug)
    parent_keep_transform(lug, root)

tripod_mount = cylinder_z(
    "TripodMount",
    0.0050,
    0.0030,
    (0.0, 0.0, 0.0015),
    brass_mat,
    vertices=32,
    bevel=0.0004,
)
parent_keep_transform(tripod_mount, root)

for x_value in (-0.058, 0.058):
    for y_value in (-0.022, 0.022):
        bpy.ops.mesh.primitive_uv_sphere_add(
            segments=24,
            ring_count=12,
            radius=0.0040,
            location=(x_value, y_value, 0.0030),
        )
        foot = bpy.context.object
        foot.name = "RubberFoot"
        foot.scale = (1.0, 1.0, 0.55)
        apply_scale(foot)
        assign(foot, rubber_mat)
        finish_mesh(foot, smooth=True)
        parent_keep_transform(foot, root)

# A small, controlled lean gives the hero render a less mechanical presentation
# while keeping the model grounded by the trusted footer.
root.rotation_euler[2] = math.radians(-2.0)

myway_print_progress("native vintage camera geometry complete")
`;

export const NATIVE_VINTAGE_CAMERA_PROOF = {
  request:
    NATIVE_VINTAGE_CAMERA_PROOF_REQUEST,
  asset_name:
    NATIVE_VINTAGE_CAMERA_PROOF_BRIEF.asset_id,
  style:
    "high-quality stylized product asset",
  quality_mode:
    "standard" as const,
  target_extent_m:
    NATIVE_VINTAGE_CAMERA_PROOF_BRIEF.target_extent_m,
  max_triangles:
    NATIVE_VINTAGE_CAMERA_PROOF_BRIEF.max_triangles,
  animation_ready: true,
  design_brief:
    NATIVE_VINTAGE_CAMERA_PROOF_BRIEF,
  code:
    NATIVE_VINTAGE_CAMERA_PROOF_CODE,
};
