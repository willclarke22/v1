export const FOUNDRY_HELPER_CONTRACT_VERSION =
  "myway_blender_helper_contract_v1" as const;

export type FoundryHelperContractEntry = {
  signature: string;
  positional: string[];
  required: string[];
  keywords: string[];
  name_first?: boolean;
};

export const FOUNDRY_HELPER_CONTRACT: Record<
  string,
  FoundryHelperContractEntry
> = {
  myway_reset_scene: {
    signature: "myway_reset_scene()",
    positional: [],
    required: [],
    keywords: [],
  },
  myway_activate: {
    signature: "myway_activate(obj)",
    positional: ["obj"],
    required: ["obj"],
    keywords: ["obj"],
  },
  myway_material: {
    signature:
      "myway_material(name, color=(0.5, 0.5, 0.5, 1.0), metallic=0.0, roughness=0.65)",
    positional: ["name", "color", "metallic", "roughness"],
    required: ["name"],
    keywords: ["name", "color", "metallic", "roughness"],
    name_first: true,
  },
  myway_material_slot: {
    signature:
      "myway_material_slot(slot_id, fallback_color=(0.5, 0.5, 0.5, 1.0), metallic=0.0, roughness=0.55, part_id=None)",
    positional: ["slot_id", "fallback_color", "metallic", "roughness", "part_id"],
    required: ["slot_id"],
    keywords: ["slot_id", "fallback_color", "metallic", "roughness", "part_id"],
  },
  myway_assign_material: {
    signature: "myway_assign_material(obj, material)",
    positional: ["obj", "material"],
    required: ["obj", "material"],
    keywords: ["obj", "material"],
  },
  myway_assign_material_slot: {
    signature:
      "myway_assign_material_slot(obj, slot_id, fallback_color=(0.5, 0.5, 0.5, 1.0), metallic=0.0, roughness=0.55, part_id=None)",
    positional: ["obj", "slot_id", "fallback_color", "metallic", "roughness", "part_id"],
    required: ["obj", "slot_id"],
    keywords: ["obj", "slot_id", "fallback_color", "metallic", "roughness", "part_id"],
  },
  myway_auto_assign_foundry_materials: {
    signature: "myway_auto_assign_foundry_materials()",
    positional: [],
    required: [],
    keywords: [],
  },
  myway_apply_foundry_environment: {
    signature: "myway_apply_foundry_environment()",
    positional: [],
    required: [],
    keywords: [],
  },
  myway_apply_transform: {
    signature:
      "myway_apply_transform(obj, location=False, rotation=False, scale=True)",
    positional: ["obj", "location", "rotation", "scale"],
    required: ["obj"],
    keywords: ["obj", "location", "rotation", "scale"],
  },
  myway_apply_modifiers: {
    signature: "myway_apply_modifiers(obj)",
    positional: ["obj"],
    required: ["obj"],
    keywords: ["obj"],
  },
  myway_bevel: {
    signature: "myway_bevel(obj, width=0.04, segments=3)",
    positional: ["obj", "width", "segments"],
    required: ["obj"],
    keywords: ["obj", "width", "segments"],
  },
  myway_bevel_relative: {
    signature:
      "myway_bevel_relative(obj, fraction=0.015, segments=3, maximum=None)",
    positional: ["obj", "fraction", "segments", "maximum"],
    required: ["obj"],
    keywords: ["obj", "fraction", "segments", "maximum"],
  },
  myway_smooth: {
    signature: "myway_smooth(obj, auto_smooth_angle_degrees=50.0)",
    positional: ["obj", "auto_smooth_angle_degrees"],
    required: ["obj"],
    keywords: ["obj", "auto_smooth_angle_degrees"],
  },
  myway_solidify: {
    signature:
      "myway_solidify(obj, thickness=0.02, offset=0.0, apply=True)",
    positional: ["obj", "thickness", "offset", "apply"],
    required: ["obj"],
    keywords: ["obj", "thickness", "offset", "apply"],
  },
  myway_subdivide: {
    signature:
      "myway_subdivide(obj, levels=1, render_levels=None, apply=True)",
    positional: ["obj", "levels", "render_levels", "apply"],
    required: ["obj"],
    keywords: ["obj", "levels", "render_levels", "apply"],
  },
  myway_mirror: {
    signature: "myway_mirror(obj, axis=\"X\", bisect=False, apply=True)",
    positional: ["obj", "axis", "bisect", "apply"],
    required: ["obj"],
    keywords: ["obj", "axis", "bisect", "apply"],
  },
  myway_array: {
    signature:
      "myway_array(obj, count=2, offset=(1.0, 0.0, 0.0), apply=True)",
    positional: ["obj", "count", "offset", "apply"],
    required: ["obj"],
    keywords: ["obj", "count", "offset", "apply"],
  },
  myway_boolean_union: {
    signature: "myway_boolean_union(target, cutter, apply=True)",
    positional: ["target", "cutter", "apply"],
    required: ["target", "cutter"],
    keywords: ["target", "cutter", "apply"],
  },
  myway_boolean_difference: {
    signature:
      "myway_boolean_difference(target, cutter, apply=True, hide_cutter=True)",
    positional: ["target", "cutter", "apply", "hide_cutter"],
    required: ["target", "cutter"],
    keywords: ["target", "cutter", "apply", "hide_cutter"],
  },
  myway_box: {
    signature:
      "myway_box(name, location=(0, 0, 0), dimensions=(1, 1, 1), material=None, bevel=0.04)",
    positional: ["name", "location", "dimensions", "material", "bevel"],
    required: ["name"],
    keywords: ["name", "location", "dimensions", "material", "bevel"],
    name_first: true,
  },
  myway_cylinder: {
    signature:
      "myway_cylinder(name, location=(0, 0, 0), radius=0.5, depth=1.0, material=None, vertices=48, bevel=0.025)",
    positional: ["name", "location", "radius", "depth", "material", "vertices", "bevel"],
    required: ["name"],
    keywords: ["name", "location", "radius", "depth", "material", "vertices", "bevel"],
    name_first: true,
  },
  myway_sphere: {
    signature:
      "myway_sphere(name, location=(0, 0, 0), radius=0.5, scale=(1, 1, 1), material=None, segments=48, rings=24)",
    positional: ["name", "location", "radius", "scale", "material", "segments", "rings"],
    required: ["name"],
    keywords: ["name", "location", "radius", "scale", "material", "segments", "rings"],
    name_first: true,
  },
  myway_blended_mass: {
    signature:
      "myway_blended_mass(name, location=(0, 0, 0), radius=0.5, scale=(1, 1, 1), material=None, subdivision=1)",
    positional: ["name", "location", "radius", "scale", "material", "subdivision"],
    required: ["name"],
    keywords: ["name", "location", "radius", "scale", "material", "subdivision"],
    name_first: true,
  },
  myway_torus: {
    signature:
      "myway_torus(name, location=(0, 0, 0), major_radius=0.5, minor_radius=0.12, material=None, major_segments=64, minor_segments=20)",
    positional: ["name", "location", "major_radius", "minor_radius", "material", "major_segments", "minor_segments"],
    required: ["name"],
    keywords: ["name", "location", "major_radius", "minor_radius", "material", "major_segments", "minor_segments"],
    name_first: true,
  },
  myway_cone: {
    signature:
      "myway_cone(name, location=(0, 0, 0), radius1=0.5, radius2=0.0, depth=1.0, material=None, vertices=48, bevel=0.02)",
    positional: ["name", "location", "radius1", "radius2", "depth", "material", "vertices", "bevel"],
    required: ["name"],
    keywords: ["name", "location", "radius1", "radius2", "depth", "material", "vertices", "bevel"],
    name_first: true,
  },
  myway_curve_tube: {
    signature:
      "myway_curve_tube(name, points, bevel_depth=0.04, material=None, cyclic=False, resolution=12)",
    positional: ["name", "points", "bevel_depth", "material", "cyclic", "resolution"],
    required: ["name", "points"],
    keywords: ["name", "points", "bevel_depth", "material", "cyclic", "resolution"],
    name_first: true,
  },
  myway_tube_between_points: {
    signature:
      "myway_tube_between_points(name, start, end, radius=0.04, material=None, vertices=32)",
    positional: ["name", "start", "end", "radius", "material", "vertices"],
    required: ["name", "start", "end"],
    keywords: ["name", "start", "end", "radius", "material", "vertices"],
    name_first: true,
  },
  myway_mesh_from_vertices_faces: {
    signature:
      "myway_mesh_from_vertices_faces(name, vertices, faces, material=None)",
    positional: ["name", "vertices", "faces", "material"],
    required: ["name", "vertices", "faces"],
    keywords: ["name", "vertices", "faces", "material"],
    name_first: true,
  },
  myway_extrude_profile: {
    signature:
      "myway_extrude_profile(name, profile, depth=0.2, axis=\"Y\", material=None, bevel=0.0)",
    positional: ["name", "profile", "depth", "axis", "material", "bevel"],
    required: ["name", "profile"],
    keywords: ["name", "profile", "depth", "axis", "material", "bevel"],
    name_first: true,
  },
  myway_lathe_profile: {
    signature:
      "myway_lathe_profile(name, profile, segments=64, material=None)",
    positional: ["name", "profile", "segments", "material"],
    required: ["name", "profile"],
    keywords: ["name", "profile", "segments", "material"],
    name_first: true,
  },
  myway_loft_sections: {
    signature:
      "myway_loft_sections(name, sections, material=None, cyclic=True)",
    positional: ["name", "sections", "material", "cyclic"],
    required: ["name", "sections"],
    keywords: ["name", "sections", "material", "cyclic"],
    name_first: true,
  },
  myway_generate_uvs: {
    signature: "myway_generate_uvs(obj, island_margin=0.02)",
    positional: ["obj", "island_margin"],
    required: ["obj"],
    keywords: ["obj", "island_margin"],
  },
  myway_box_uv: {
    signature: "myway_box_uv(obj, island_margin=0.02)",
    positional: ["obj", "island_margin"],
    required: ["obj"],
    keywords: ["obj", "island_margin"],
  },
  myway_cylindrical_uv: {
    signature: "myway_cylindrical_uv(obj, island_margin=0.02)",
    positional: ["obj", "island_margin"],
    required: ["obj"],
    keywords: ["obj", "island_margin"],
  },
  myway_duplicate_radial: {
    signature:
      "myway_duplicate_radial(source, count, radius, axis=\"Z\", name_prefix=None)",
    positional: ["source", "count", "radius", "axis", "name_prefix"],
    required: ["source", "count", "radius"],
    keywords: ["source", "count", "radius", "axis", "name_prefix"],
  },
  myway_repeat_along_curve: {
    signature:
      "myway_repeat_along_curve(source, points, count, name_prefix=None)",
    positional: ["source", "points", "count", "name_prefix"],
    required: ["source", "points", "count"],
    keywords: ["source", "points", "count", "name_prefix"],
  },
  myway_join: {
    signature: "myway_join(objects, name)",
    positional: ["objects", "name"],
    required: ["objects", "name"],
    keywords: ["objects", "name"],
  },
  myway_parent: {
    signature: "myway_parent(child, parent)",
    positional: ["child", "parent"],
    required: ["child", "parent"],
    keywords: ["child", "parent"],
  },
  myway_parent_keep_transform: {
    signature: "myway_parent_keep_transform(child, parent)",
    positional: ["child", "parent"],
    required: ["child", "parent"],
    keywords: ["child", "parent"],
  },
  myway_origin_to_geometry: {
    signature: "myway_origin_to_geometry(obj)",
    positional: ["obj"],
    required: ["obj"],
    keywords: ["obj"],
  },
  myway_pivot_at: {
    signature: "myway_pivot_at(obj, location)",
    positional: ["obj", "location"],
    required: ["obj", "location"],
    keywords: ["obj", "location"],
  },
  myway_hinge: {
    signature: "myway_hinge(obj, pivot_location, parent=None)",
    positional: ["obj", "pivot_location", "parent"],
    required: ["obj", "pivot_location"],
    keywords: ["obj", "pivot_location", "parent"],
  },
  myway_align_between_points: {
    signature:
      "myway_align_between_points(obj, start, end, local_axis=\"Z\")",
    positional: ["obj", "start", "end", "local_axis"],
    required: ["obj", "start", "end"],
    keywords: ["obj", "start", "end", "local_axis"],
  },
  myway_look_at: {
    signature:
      "myway_look_at(obj, target, track_axis=\"-Z\", up_axis=\"Y\")",
    positional: ["obj", "target", "track_axis", "up_axis"],
    required: ["obj", "target"],
    keywords: ["obj", "target", "track_axis", "up_axis"],
  },
  myway_ground_asset: {
    signature: "myway_ground_asset(objects=None)",
    positional: ["objects"],
    required: [],
    keywords: ["objects"],
  },
  myway_normalize_extent: {
    signature:
      "myway_normalize_extent(target_extent, root_or_iterable)",
    positional: ["target_extent", "root_or_iterable"],
    required: ["target_extent", "root_or_iterable"],
    keywords: ["target_extent", "root_or_iterable", "extent", "objects"],
  },
  myway_print_progress: {
    signature: "myway_print_progress(message)",
    positional: ["message"],
    required: ["message"],
    keywords: ["message"],
  },
};

export function buildFoundryHelperContractPrompt() {
  const signatures =
    Object.values(
      FOUNDRY_HELPER_CONTRACT,
    )
      .map((entry) =>
        `- ${entry.signature}`,
      )
      .join("\n");

  return `MyWay helper API contract (${FOUNDRY_HELPER_CONTRACT_VERSION}):
Use only these exact signatures. Do not invent positional orders, keyword names, or overloads.
Every geometry constructor starts with an object name. Use keyword arguments for location, dimensions, radii, depth, segment counts, and materials.

${signatures}

Hierarchy compatibility:
- A single bpy Object is accepted directly by myway_ground_asset and myway_normalize_extent; do not iterate a Blender Object yourself.
- myway_ground_asset also accepts an iterable of related objects when there is no single hierarchy root.
- Use the canonical extent-first normalization order: myway_normalize_extent(target_extent, root_or_iterable).

Canonical examples:

a = myway_box(
    "SeatCushion",
    location=(0.0, 0.0, 0.52),
    dimensions=(0.46, 0.42, 0.05),
)

rail = myway_tube_between_points(
    "FrameRail_L",
    start=(-0.28, -0.20, 0.48),
    end=(-0.28, 0.22, 0.48),
    radius=0.018,
    vertices=24,
)

wheel = myway_torus(
    "RearWheel_L_Tire",
    location=(-0.36, 0.04, 0.34),
    major_radius=0.30,
    minor_radius=0.025,
    major_segments=48,
    minor_segments=12,
)
# A torus is created in the XY plane with its normal along +Z.
# For a wheel whose axle is X and whose ring lies in the YZ plane, rotate around Y:
wheel.rotation_euler = (0.0, math.radians(90.0), 0.0)

hub = myway_cylinder(
    "RearWheel_L_Hub",
    location=(-0.36, 0.04, 0.34),
    radius=0.035,
    depth=0.08,
    vertices=24,
)
hub.rotation_euler = (0.0, math.radians(90.0), 0.0)

frame = myway_join(frame_parts, "WheelchairFrame")
myway_assign_material_slot(frame, "tubular_frame_metal")
myway_ground_asset(frame)
myway_normalize_extent(1.12, frame)
myway_print_progress("Building connected frame")

Critical prohibitions:
- Never call myway_tube_between_points(p1, p2, radius, resolution=...). It requires name, start, end and uses vertices, not resolution.
- Never call myway_box(width, depth, height). It requires name plus dimensions=(width, depth, height).
- Never call myway_cylinder(radius, depth, ...). It requires name plus radius= and depth=.
- Never call myway_torus(major_radius, minor_radius, ...). It requires name plus major_radius= and minor_radius=.
- Never call myway_join(first_object). It requires the full object list and the joined object name.
- Do not include the text MYWAY_PROGRESS: inside myway_print_progress; the helper adds the prefix.
- Use the approved design brief's exact target_extent_m in myway_normalize_extent.
- Use exact design-brief part_id strings as final Blender object names and exact approved material slot ids.`;
}
