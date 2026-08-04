export const FOUNDRY_HELPER_LIBRARY_VERSION =
  "myway_blender_foundry_helpers_v3_0" as const;

export function buildTrustedBlenderHelperPrelude() {
  return String.raw`
# ---------------------------------------------------------------------------
# Trusted MyWay Blender Asset Foundry helper library.
# Version: myway_blender_foundry_helpers_v3_0
# Generated or manually pasted scripts may call these helpers. MyWay owns the
# resource manifest, validation, export and inspection footer.
# ---------------------------------------------------------------------------
import math as _myway_helper_math
import os as _myway_helper_os
import json as _myway_helper_json
import bmesh as _myway_helper_bmesh

_MYWAY_MATERIAL_CACHE = {}
_MYWAY_RESOURCE_MANIFEST = {
    "material_slots": {},
    "part_material_slots": {},
    "environment": {
        "source": "trusted_studio",
        "environment_path": None,
        "strength": 0.8,
        "rotation_degrees": 0.0,
        "exposure": 0.0,
        "background_visible": False,
        "fallback_light_energy_scale": 1.0,
    },
}

def _myway_load_resource_manifest():
    path = _myway_helper_os.environ.get("MYWAY_BLENDER_RESOURCE_MANIFEST", "")
    if not path or not _myway_helper_os.path.isfile(path):
        return
    try:
        with open(path, "r", encoding="utf-8") as handle:
            value = _myway_helper_json.load(handle)
        if isinstance(value, dict):
            _MYWAY_RESOURCE_MANIFEST.clear()
            _MYWAY_RESOURCE_MANIFEST.update(value)
    except Exception as error:
        print("MYWAY_RESOURCE_WARNING:" + repr(error))

_myway_load_resource_manifest()

def _myway_node_input(node, *names):
    for name in names:
        socket = node.inputs.get(name)
        if socket is not None:
            return socket
    return None

def _myway_safe_image(path, colorspace="Non-Color"):
    if not path or not _myway_helper_os.path.isfile(path):
        return None
    image = bpy.data.images.load(path, check_existing=True)
    try:
        image.colorspace_settings.name = colorspace
    except Exception:
        pass
    return image

def myway_reset_scene():
    if bpy.context.object is not None and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    _MYWAY_MATERIAL_CACHE.clear()
    for collection in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for block in list(collection):
            if block.users == 0:
                collection.remove(block)

def myway_activate(obj):
    if obj is None:
        return None
    if bpy.context.object is not None and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    return obj

def myway_material(name, color=(0.5, 0.5, 0.5, 1.0), metallic=0.0, roughness=0.65):
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name=name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    principled = nodes.get("Principled BSDF")
    if principled is not None:
        base = _myway_node_input(principled, "Base Color")
        metal = _myway_node_input(principled, "Metallic")
        rough = _myway_node_input(principled, "Roughness")
        if base is not None:
            base.default_value = color
        if metal is not None:
            metal.default_value = max(0.0, min(1.0, metallic))
        if rough is not None:
            rough.default_value = max(0.0, min(1.0, roughness))
    material.diffuse_color = color
    return material

def _myway_float(value, fallback, minimum=None, maximum=None):
    try:
        parsed = float(value)
    except Exception:
        parsed = float(fallback)
    if minimum is not None:
        parsed = max(float(minimum), parsed)
    if maximum is not None:
        parsed = min(float(maximum), parsed)
    return parsed


def _myway_pair(value, fallback=(1.0, 1.0)):
    if not isinstance(value, (list, tuple)) or len(value) < 2:
        return (float(fallback[0]), float(fallback[1]))
    return (
        _myway_float(value[0], fallback[0]),
        _myway_float(value[1], fallback[1]),
    )


def _myway_material_look(slot, part_id=None):
    look = dict(slot.get("look") or {})
    if "physical_scale_m" not in look:
        look["physical_scale_m"] = slot.get("texture_scale_m")
    part_overrides = look.get("part_overrides") or {}
    if part_id and isinstance(part_overrides, dict):
        override = part_overrides.get(str(part_id))
        if isinstance(override, dict):
            look.update(override)
    look.pop("part_overrides", None)
    return look


def _myway_build_pbr_material(slot_id, slot, part_id=None):
    look = _myway_material_look(slot, part_id)
    fallback = slot.get("fallback") or {}
    color = tuple(fallback.get("color_rgba") or (0.5, 0.5, 0.5, 1.0))
    metallic = _myway_float(fallback.get("metallic"), 0.0, 0.0, 1.0)
    roughness_factor = _myway_float(
        look.get("roughness_factor"), 1.0, 0.0, 2.0
    )
    roughness = _myway_float(
        fallback.get("roughness"), 0.55, 0.0, 1.0
    ) * roughness_factor
    material_suffix = "__" + str(part_id) if part_id else ""
    material = myway_material(
        "MyWaySlot_" + str(slot_id) + material_suffix,
        color=color,
        metallic=metallic,
        roughness=max(0.0, min(1.0, roughness)),
    )
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    principled = nodes.get("Principled BSDF")
    if principled is None:
        return material

    maps = slot.get("maps") or {}
    if not isinstance(maps, dict) or not maps:
        return material

    mapping_mode = str(look.get("mapping_mode") or "uv")
    if mapping_mode not in ("uv", "object_box"):
        mapping_mode = "uv"
    texcoord = nodes.new("ShaderNodeTexCoord")
    texcoord.name = "MyWayTextureCoordinates"
    mapping = nodes.new("ShaderNodeMapping")
    mapping.name = "MyWayTextureTransform"

    physical_scale_m = look.get("physical_scale_m")
    base_scale = 1.0
    try:
        if physical_scale_m is not None and float(physical_scale_m) > 0.000001:
            base_scale = 1.0 / float(physical_scale_m)
    except Exception:
        base_scale = 1.0
    repeat = _myway_pair(look.get("uv_repeat"), (1.0, 1.0))
    offset = _myway_pair(look.get("offset"), (0.0, 0.0))
    average_repeat = max(0.05, (abs(repeat[0]) + abs(repeat[1])) * 0.5)
    mapping.inputs["Scale"].default_value = (
        base_scale * max(0.05, repeat[0]),
        base_scale * max(0.05, repeat[1]),
        base_scale * average_repeat,
    )
    mapping.inputs["Location"].default_value = (offset[0], offset[1], 0.0)
    mapping.inputs["Rotation"].default_value[2] = _myway_helper_math.radians(
        _myway_float(look.get("rotation_degrees"), 0.0)
    )
    source_socket = (
        texcoord.outputs.get("Object")
        if mapping_mode == "object_box"
        else texcoord.outputs.get("UV")
    )
    if source_socket is None:
        source_socket = texcoord.outputs[0]
    links.new(source_socket, mapping.inputs["Vector"])

    texture_nodes = {}
    for role, image_path in maps.items():
        if not image_path:
            continue
        colorspace = "sRGB" if role in ("base_color", "emission") else "Non-Color"
        image = _myway_safe_image(image_path, colorspace)
        if image is None:
            continue
        node = nodes.new("ShaderNodeTexImage")
        node.name = "MyWay_" + str(role)
        node.label = str(role)
        node.image = image
        node.interpolation = "Linear"
        node.extension = "REPEAT"
        if mapping_mode == "object_box":
            node.projection = "BOX"
            node.projection_blend = 0.22
        links.new(mapping.outputs["Vector"], node.inputs["Vector"])
        texture_nodes[role] = node

    base_color = texture_nodes.get("base_color")
    ao = texture_nodes.get("ambient_occlusion")
    if base_color is not None and ao is not None:
        multiply = nodes.new("ShaderNodeMixRGB")
        multiply.blend_type = "MULTIPLY"
        multiply.inputs[0].default_value = 1.0
        links.new(base_color.outputs["Color"], multiply.inputs[1])
        links.new(ao.outputs["Color"], multiply.inputs[2])
        target = _myway_node_input(principled, "Base Color")
        if target is not None:
            links.new(multiply.outputs["Color"], target)
    elif base_color is not None:
        target = _myway_node_input(principled, "Base Color")
        if target is not None:
            links.new(base_color.outputs["Color"], target)

    rough = texture_nodes.get("roughness")
    if rough is not None:
        target = _myway_node_input(principled, "Roughness")
        if target is not None:
            if abs(roughness_factor - 1.0) > 0.0001:
                rough_multiply = nodes.new("ShaderNodeMath")
                rough_multiply.operation = "MULTIPLY"
                rough_multiply.use_clamp = True
                rough_multiply.inputs[1].default_value = roughness_factor
                links.new(rough.outputs["Color"], rough_multiply.inputs[0])
                links.new(rough_multiply.outputs[0], target)
            else:
                links.new(rough.outputs["Color"], target)

    metal = texture_nodes.get("metallic")
    if metal is not None:
        target = _myway_node_input(principled, "Metallic")
        if target is not None:
            links.new(metal.outputs["Color"], target)

    normal_gl = texture_nodes.get("normal_gl")
    normal_dx = texture_nodes.get("normal_dx")
    normal_socket = normal_gl.outputs["Color"] if normal_gl is not None else None
    if normal_socket is None and normal_dx is not None:
        try:
            separate = nodes.new("ShaderNodeSeparateColor")
            combine = nodes.new("ShaderNodeCombineColor")
            separate.mode = "RGB"
            combine.mode = "RGB"
            red_output = separate.outputs.get("Red")
            green_output = separate.outputs.get("Green")
            blue_output = separate.outputs.get("Blue")
            red_input = combine.inputs.get("Red")
            green_input = combine.inputs.get("Green")
            blue_input = combine.inputs.get("Blue")
        except Exception:
            separate = nodes.new("ShaderNodeSeparateRGB")
            combine = nodes.new("ShaderNodeCombineRGB")
            red_output = separate.outputs.get("R")
            green_output = separate.outputs.get("G")
            blue_output = separate.outputs.get("B")
            red_input = combine.inputs.get("R")
            green_input = combine.inputs.get("G")
            blue_input = combine.inputs.get("B")
        invert_green = nodes.new("ShaderNodeMath")
        invert_green.operation = "SUBTRACT"
        invert_green.inputs[0].default_value = 1.0
        links.new(normal_dx.outputs["Color"], separate.inputs[0])
        if red_output is not None and red_input is not None:
            links.new(red_output, red_input)
        if green_output is not None:
            links.new(green_output, invert_green.inputs[1])
        if green_input is not None:
            links.new(invert_green.outputs[0], green_input)
        if blue_output is not None and blue_input is not None:
            links.new(blue_output, blue_input)
        normal_socket = combine.outputs[0]
    if normal_socket is not None:
        normal_map = nodes.new("ShaderNodeNormalMap")
        normal_map.space = "TANGENT"
        normal_map.inputs["Strength"].default_value = _myway_float(
            look.get("normal_strength"), 1.0, 0.0, 4.0
        )
        links.new(normal_socket, normal_map.inputs["Color"])
        target = _myway_node_input(principled, "Normal")
        if target is not None:
            links.new(normal_map.outputs["Normal"], target)

    height = texture_nodes.get("height")
    if height is not None:
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = _myway_float(
            look.get("height_strength"), 0.18, 0.0, 1.0
        )
        bump.inputs["Distance"].default_value = 0.08
        links.new(height.outputs["Color"], bump.inputs["Height"])
        target = _myway_node_input(principled, "Normal")
        if target is not None:
            if target.is_linked:
                existing = target.links[0].from_socket
                links.remove(target.links[0])
                links.new(existing, bump.inputs["Normal"])
            links.new(bump.outputs["Normal"], target)

    opacity = texture_nodes.get("opacity")
    if opacity is not None:
        target = _myway_node_input(principled, "Alpha")
        if target is not None:
            links.new(opacity.outputs["Color"], target)
        try:
            material.surface_render_method = "DITHERED"
        except Exception:
            try:
                material.blend_method = "HASHED"
            except Exception:
                pass

    emission = texture_nodes.get("emission")
    if emission is not None:
        target = _myway_node_input(principled, "Emission Color", "Emission")
        if target is not None:
            links.new(emission.outputs["Color"], target)

    return material


def myway_material_slot(slot_id, fallback_color=(0.5, 0.5, 0.5, 1.0), metallic=0.0, roughness=0.55, part_id=None):
    cache_key = str(slot_id) + ("::" + str(part_id) if part_id else "")
    if cache_key in _MYWAY_MATERIAL_CACHE:
        return _MYWAY_MATERIAL_CACHE[cache_key]
    slots = _MYWAY_RESOURCE_MANIFEST.get("material_slots") or {}
    slot = slots.get(slot_id)
    if isinstance(slot, dict):
        material = _myway_build_pbr_material(slot_id, slot, part_id=part_id)
    else:
        material = myway_material(
            "MyWaySlot_" + str(slot_id) + ("__" + str(part_id) if part_id else ""),
            color=fallback_color,
            metallic=metallic,
            roughness=roughness,
        )
    _MYWAY_MATERIAL_CACHE[cache_key] = material
    return material


def myway_assign_material(obj, material):
    if obj is None:
        return obj
    data = getattr(obj, "data", None)
    materials = getattr(data, "materials", None)
    if materials is None:
        return obj
    if len(materials) == 0:
        materials.append(material)
    else:
        materials[0] = material
    return obj

def myway_assign_material_slot(obj, slot_id, fallback_color=(0.5, 0.5, 0.5, 1.0), metallic=0.0, roughness=0.55, part_id=None):
    resolved_part_id = part_id or (obj.name if obj is not None else None)
    return myway_assign_material(
        obj,
        myway_material_slot(
            slot_id,
            fallback_color,
            metallic,
            roughness,
            part_id=resolved_part_id,
        ),
    )

def myway_auto_assign_foundry_materials():
    mapping = _MYWAY_RESOURCE_MANIFEST.get("part_material_slots") or {}
    if not isinstance(mapping, dict):
        return
    for object_name, slot_id in mapping.items():
        obj = bpy.data.objects.get(object_name)
        if obj is not None:
            myway_assign_material_slot(obj, str(slot_id), part_id=str(object_name))

def myway_apply_foundry_environment():
    environment = _MYWAY_RESOURCE_MANIFEST.get("environment") or {}
    world = bpy.context.scene.world
    if world is None:
        world = bpy.data.worlds.new("MyWayFoundryWorld")
        bpy.context.scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputWorld")
    background = nodes.new("ShaderNodeBackground")
    background.inputs["Strength"].default_value = max(
        0.0,
        float(environment.get("strength") or 0.8),
    )
    try:
        bpy.context.scene.view_settings.exposure = _myway_float(
            environment.get("exposure"), 0.0, -8.0, 8.0
        )
    except Exception:
        pass
    path = environment.get("environment_path")
    if path and _myway_helper_os.path.isfile(path):
        texture = nodes.new("ShaderNodeTexEnvironment")
        texture.image = _myway_safe_image(path, "Linear")
        texture.projection = "EQUIRECTANGULAR"
        texcoord = nodes.new("ShaderNodeTexCoord")
        mapping = nodes.new("ShaderNodeMapping")
        mapping.inputs["Rotation"].default_value[2] = _myway_helper_math.radians(
            float(environment.get("rotation_degrees") or 0.0)
        )
        links.new(texcoord.outputs["Generated"], mapping.inputs["Vector"])
        links.new(mapping.outputs["Vector"], texture.inputs["Vector"])
        links.new(texture.outputs["Color"], background.inputs["Color"])
    else:
        background.inputs["Color"].default_value = (0.055, 0.065, 0.09, 1.0)
    links.new(background.outputs["Background"], output.inputs["Surface"])
    return world

def myway_apply_transform(obj, location=False, rotation=False, scale=True):
    myway_activate(obj)
    bpy.ops.object.transform_apply(
        location=location,
        rotation=rotation,
        scale=scale,
    )
    return obj

def myway_apply_modifiers(obj):
    if obj is None or obj.type != "MESH":
        return obj
    for modifier in list(obj.modifiers):
        myway_activate(obj)
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return obj

def myway_bevel(obj, width=0.04, segments=3):
    if obj is None or obj.type != "MESH":
        return obj
    modifier = obj.modifiers.new(name="MyWayBevel", type="BEVEL")
    modifier.width = max(0.0001, width)
    modifier.segments = max(1, int(segments))
    modifier.limit_method = "ANGLE"
    myway_activate(obj)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    return obj

def myway_bevel_relative(obj, fraction=0.015, segments=3, maximum=None):
    if obj is None:
        return obj
    extent = max(float(value) for value in obj.dimensions)
    width = extent * max(0.0001, float(fraction))
    if maximum is not None:
        width = min(width, float(maximum))
    return myway_bevel(obj, width, segments)

def myway_smooth(obj, auto_smooth_angle_degrees=50.0):
    if obj is None or obj.type != "MESH":
        return obj
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    try:
        modifier = obj.modifiers.new(name="MyWayWeightedNormals", type="WEIGHTED_NORMAL")
        modifier.keep_sharp = True
        myway_activate(obj)
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    except Exception:
        pass
    return obj

def myway_solidify(obj, thickness=0.02, offset=0.0, apply=True):
    modifier = obj.modifiers.new(name="MyWaySolidify", type="SOLIDIFY")
    modifier.thickness = float(thickness)
    modifier.offset = float(offset)
    if apply:
        myway_activate(obj)
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return obj

def myway_subdivide(obj, levels=1, render_levels=None, apply=True):
    modifier = obj.modifiers.new(name="MyWaySubdivision", type="SUBSURF")
    modifier.levels = max(0, int(levels))
    modifier.render_levels = max(0, int(render_levels if render_levels is not None else levels))
    if apply:
        myway_activate(obj)
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return obj

def myway_mirror(obj, axis="X", bisect=False, apply=True):
    modifier = obj.modifiers.new(name="MyWayMirror", type="MIRROR")
    modifier.use_axis = (axis.upper() == "X", axis.upper() == "Y", axis.upper() == "Z")
    modifier.use_bisect_axis = (
        bisect and axis.upper() == "X",
        bisect and axis.upper() == "Y",
        bisect and axis.upper() == "Z",
    )
    if apply:
        myway_activate(obj)
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return obj

def myway_array(obj, count=2, offset=(1.0, 0.0, 0.0), apply=True):
    modifier = obj.modifiers.new(name="MyWayArray", type="ARRAY")
    modifier.count = max(1, int(count))
    modifier.use_relative_offset = False
    modifier.use_constant_offset = True
    modifier.constant_offset_displace = offset
    if apply:
        myway_activate(obj)
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return obj

def myway_boolean_union(target, cutter, apply=True):
    modifier = target.modifiers.new(name="MyWayBooleanUnion", type="BOOLEAN")
    modifier.operation = "UNION"
    modifier.solver = "EXACT"
    modifier.object = cutter
    if apply:
        myway_activate(target)
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return target

def myway_boolean_difference(target, cutter, apply=True, hide_cutter=True):
    modifier = target.modifiers.new(name="MyWayBooleanDifference", type="BOOLEAN")
    modifier.operation = "DIFFERENCE"
    modifier.solver = "EXACT"
    modifier.object = cutter
    if apply:
        myway_activate(target)
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    if hide_cutter:
        bpy.data.objects.remove(cutter, do_unlink=True)
    return target

def myway_box(name, location=(0, 0, 0), dimensions=(1, 1, 1), material=None, bevel=0.04):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    myway_apply_transform(obj, scale=True)
    if bevel > 0:
        myway_bevel(obj, bevel)
    if material is not None:
        myway_assign_material(obj, material)
    return obj

def myway_cylinder(name, location=(0, 0, 0), radius=0.5, depth=1.0, material=None, vertices=48, bevel=0.025):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=max(12, int(vertices)),
        radius=max(0.001, radius),
        depth=max(0.001, depth),
        location=location,
    )
    obj = bpy.context.object
    obj.name = name
    if bevel > 0:
        myway_bevel(obj, bevel)
    myway_smooth(obj)
    if material is not None:
        myway_assign_material(obj, material)
    return obj

def myway_sphere(name, location=(0, 0, 0), radius=0.5, scale=(1, 1, 1), material=None, segments=48, rings=24):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=max(12, int(segments)),
        ring_count=max(8, int(rings)),
        radius=max(0.001, radius),
        location=location,
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    myway_apply_transform(obj, scale=True)
    myway_smooth(obj)
    if material is not None:
        myway_assign_material(obj, material)
    return obj

def myway_blended_mass(name, location=(0, 0, 0), radius=0.5, scale=(1, 1, 1), material=None, subdivision=1):
    obj = myway_sphere(name, location, radius, scale, material, segments=40, rings=24)
    if subdivision > 0:
        myway_subdivide(obj, subdivision, apply=True)
    myway_smooth(obj)
    return obj

def myway_torus(name, location=(0, 0, 0), major_radius=0.5, minor_radius=0.12, material=None, major_segments=64, minor_segments=20):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=max(0.002, major_radius),
        minor_radius=max(0.001, minor_radius),
        major_segments=max(12, int(major_segments)),
        minor_segments=max(6, int(minor_segments)),
        location=location,
    )
    obj = bpy.context.object
    obj.name = name
    myway_smooth(obj)
    if material is not None:
        myway_assign_material(obj, material)
    return obj

def myway_cone(name, location=(0, 0, 0), radius1=0.5, radius2=0.0, depth=1.0, material=None, vertices=48, bevel=0.02):
    bpy.ops.mesh.primitive_cone_add(
        vertices=max(12, int(vertices)),
        radius1=max(0.001, radius1),
        radius2=max(0.0, radius2),
        depth=max(0.001, depth),
        location=location,
    )
    obj = bpy.context.object
    obj.name = name
    if bevel > 0:
        myway_bevel(obj, bevel)
    myway_smooth(obj)
    if material is not None:
        myway_assign_material(obj, material)
    return obj

def myway_curve_tube(name, points, bevel_depth=0.04, material=None, cyclic=False, resolution=12):
    curve_data = bpy.data.curves.new(name=name + "_curve", type="CURVE")
    curve_data.dimensions = "3D"
    curve_data.resolution_u = max(1, int(resolution))
    curve_data.bevel_depth = max(0.0005, bevel_depth)
    curve_data.bevel_resolution = 4
    spline = curve_data.splines.new(type="BEZIER")
    spline.bezier_points.add(max(0, len(points) - 1))
    for point, coordinates in zip(spline.bezier_points, points):
        point.co = coordinates
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    spline.use_cyclic_u = bool(cyclic)
    obj = bpy.data.objects.new(name, curve_data)
    bpy.context.collection.objects.link(obj)
    if material is not None:
        curve_data.materials.append(material)
    return obj

def myway_tube_between_points(name, start, end, radius=0.04, material=None, vertices=32):
    start_vector = mathutils.Vector(start)
    end_vector = mathutils.Vector(end)
    direction = end_vector - start_vector
    depth = max(direction.length, 0.0001)
    midpoint = (start_vector + end_vector) * 0.5
    obj = myway_cylinder(
        name,
        location=midpoint,
        radius=radius,
        depth=depth,
        material=material,
        vertices=vertices,
        bevel=min(radius * 0.35, depth * 0.08),
    )
    obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    myway_apply_transform(obj, rotation=True, scale=True)
    return obj

def myway_mesh_from_vertices_faces(name, vertices, faces, material=None):
    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update(calc_edges=True)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    if material is not None:
        mesh.materials.append(material)
    return obj

def myway_extrude_profile(name, profile, depth=0.2, axis="Y", material=None, bevel=0.0):
    half = float(depth) * 0.5
    vertices = []
    for coordinate in (-half, half):
        for a, b in profile:
            if axis.upper() == "X":
                vertices.append((coordinate, a, b))
            elif axis.upper() == "Z":
                vertices.append((a, b, coordinate))
            else:
                vertices.append((a, coordinate, b))
    count = len(profile)
    faces = []
    faces.append(tuple(range(count - 1, -1, -1)))
    faces.append(tuple(range(count, count * 2)))
    for index in range(count):
        following = (index + 1) % count
        faces.append((index, following, count + following, count + index))
    obj = myway_mesh_from_vertices_faces(name, vertices, faces, material)
    if bevel > 0:
        myway_bevel(obj, bevel)
    return obj

def myway_lathe_profile(name, profile, segments=64, material=None):
    segments = max(12, int(segments))
    vertices = []
    for segment in range(segments):
        angle = 2.0 * _myway_helper_math.pi * segment / segments
        cosine = _myway_helper_math.cos(angle)
        sine = _myway_helper_math.sin(angle)
        for radius, height in profile:
            vertices.append((radius * cosine, radius * sine, height))
    rows = len(profile)
    faces = []
    for segment in range(segments):
        following = (segment + 1) % segments
        for row in range(rows - 1):
            a = segment * rows + row
            b = following * rows + row
            faces.append((a, b, b + 1, a + 1))
    obj = myway_mesh_from_vertices_faces(name, vertices, faces, material)
    myway_smooth(obj)
    return obj

def myway_loft_sections(name, sections, material=None, cyclic=True):
    vertices = []
    section_size = None
    for section in sections:
        points = list(section)
        if section_size is None:
            section_size = len(points)
        if len(points) != section_size:
            raise ValueError("All loft sections must contain the same number of points.")
        vertices.extend(points)
    faces = []
    section_count = len(sections)
    for section_index in range(section_count - 1):
        start = section_index * section_size
        following = (section_index + 1) * section_size
        limit = section_size if cyclic else section_size - 1
        for point_index in range(limit):
            next_point = (point_index + 1) % section_size
            faces.append((
                start + point_index,
                start + next_point,
                following + next_point,
                following + point_index,
            ))
    obj = myway_mesh_from_vertices_faces(name, vertices, faces, material)
    myway_smooth(obj)
    return obj

def myway_generate_uvs(obj, island_margin=0.02):
    if obj is None or obj.type != "MESH":
        return obj
    myway_activate(obj)
    try:
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(island_margin=max(0.0, island_margin))
    finally:
        if bpy.context.object is not None and bpy.context.object.mode != "OBJECT":
            bpy.ops.object.mode_set(mode="OBJECT")
    return obj

def myway_box_uv(obj, island_margin=0.02):
    return myway_generate_uvs(obj, island_margin)

def myway_cylindrical_uv(obj, island_margin=0.02):
    if obj is None or obj.type != "MESH":
        return obj
    myway_activate(obj)
    try:
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.cylinder_project(direction="ALIGN_TO_OBJECT")
        bpy.ops.uv.pack_islands(margin=max(0.0, island_margin))
    finally:
        if bpy.context.object is not None and bpy.context.object.mode != "OBJECT":
            bpy.ops.object.mode_set(mode="OBJECT")
    return obj

def myway_duplicate_radial(source, count, radius, axis="Z", name_prefix=None):
    copies = []
    count = max(1, int(count))
    prefix = name_prefix or source.name
    for index in range(count):
        angle = (2.0 * _myway_helper_math.pi * index) / count
        clone = source.copy()
        if source.data is not None:
            clone.data = source.data.copy()
        clone.name = f"{prefix}_{index + 1:02d}"
        bpy.context.collection.objects.link(clone)
        if axis == "X":
            clone.location = (source.location.x, radius * _myway_helper_math.cos(angle), radius * _myway_helper_math.sin(angle))
            clone.rotation_euler.x += angle
        elif axis == "Y":
            clone.location = (radius * _myway_helper_math.cos(angle), source.location.y, radius * _myway_helper_math.sin(angle))
            clone.rotation_euler.y += angle
        else:
            clone.location = (radius * _myway_helper_math.cos(angle), radius * _myway_helper_math.sin(angle), source.location.z)
            clone.rotation_euler.z += angle
        copies.append(clone)
    return copies

def myway_repeat_along_curve(source, points, count, name_prefix=None):
    points = [mathutils.Vector(point) for point in points]
    if len(points) < 2:
        return []
    distances = []
    total = 0.0
    for index in range(len(points) - 1):
        distance = (points[index + 1] - points[index]).length
        distances.append(distance)
        total += distance
    copies = []
    for item_index in range(max(1, int(count))):
        target_distance = total * (item_index / max(1, count - 1))
        accumulated = 0.0
        position = points[-1]
        tangent = points[-1] - points[-2]
        for segment_index, distance in enumerate(distances):
            if accumulated + distance >= target_distance:
                ratio = (target_distance - accumulated) / max(distance, 0.000001)
                position = points[segment_index].lerp(points[segment_index + 1], ratio)
                tangent = points[segment_index + 1] - points[segment_index]
                break
            accumulated += distance
        clone = source.copy()
        if source.data is not None:
            clone.data = source.data.copy()
        clone.name = f"{name_prefix or source.name}_{item_index + 1:02d}"
        clone.location = position
        if tangent.length > 0.000001:
            clone.rotation_euler = tangent.to_track_quat("X", "Z").to_euler()
        bpy.context.collection.objects.link(clone)
        copies.append(clone)
    return copies

def myway_join(objects, name):
    mesh_objects = [obj for obj in objects if obj is not None and obj.type == "MESH"]
    if not mesh_objects:
        return None
    bpy.ops.object.select_all(action="DESELECT")
    for obj in mesh_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = mesh_objects[0]
    bpy.ops.object.join()
    joined = bpy.context.object
    joined.name = name
    return joined

def myway_parent(child, parent):
    child.parent = parent
    child.matrix_parent_inverse = parent.matrix_world.inverted()
    return child

def myway_parent_keep_transform(child, parent):
    world = child.matrix_world.copy()
    child.parent = parent
    child.matrix_world = world
    return child

def myway_origin_to_geometry(obj):
    myway_activate(obj)
    bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
    return obj

def myway_pivot_at(obj, location):
    world = obj.matrix_world.copy()
    cursor = bpy.context.scene.cursor.location.copy()
    bpy.context.scene.cursor.location = location
    myway_activate(obj)
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR", center="MEDIAN")
    obj.matrix_world = world
    bpy.context.scene.cursor.location = cursor
    return obj

def myway_hinge(obj, pivot_location, parent=None):
    myway_pivot_at(obj, pivot_location)
    if parent is not None:
        myway_parent_keep_transform(obj, parent)
    return obj

def myway_align_between_points(obj, start, end, local_axis="Z"):
    start_vector = mathutils.Vector(start)
    end_vector = mathutils.Vector(end)
    direction = end_vector - start_vector
    obj.location = (start_vector + end_vector) * 0.5
    if direction.length > 0.000001:
        obj.rotation_euler = direction.to_track_quat(local_axis, "Y").to_euler()
    return obj

def myway_look_at(obj, target, track_axis="-Z", up_axis="Y"):
    direction = mathutils.Vector(target) - obj.location
    if direction.length > 0.000001:
        obj.rotation_euler = direction.to_track_quat(track_axis, up_axis).to_euler()
    return obj

_MYWAY_BOUNDABLE_TYPES = {"MESH", "CURVE", "SURFACE", "META", "FONT"}

def _myway_is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)

def _myway_collect_object_targets(value=None):
    if value is None:
        seeds = [
            obj
            for obj in bpy.context.scene.objects
            if obj.type in _MYWAY_BOUNDABLE_TYPES
        ]
    elif isinstance(value, bpy.types.Object):
        seeds = [value]
    else:
        try:
            seeds = list(value)
        except TypeError:
            seeds = [value]

    targets = []
    seen = set()

    def visit(obj):
        if not isinstance(obj, bpy.types.Object):
            return
        object_key = id(obj)
        if object_key in seen:
            return
        seen.add(object_key)
        targets.append(obj)
        for child in obj.children:
            visit(child)

    for seed in seeds:
        visit(seed)

    return targets

def _myway_boundable_targets(targets):
    return [
        obj
        for obj in targets
        if obj.type in _MYWAY_BOUNDABLE_TYPES and getattr(obj, "bound_box", None)
    ]

def _myway_transform_roots(targets):
    target_keys = {id(obj) for obj in targets}
    roots = []
    for obj in targets:
        ancestor = obj.parent
        selected_ancestor = False
        while ancestor is not None:
            if id(ancestor) in target_keys:
                selected_ancestor = True
                break
            ancestor = ancestor.parent
        if not selected_ancestor:
            roots.append(obj)
    return roots

def _myway_world_bounds(targets):
    minimum = [float("inf")] * 3
    maximum = [float("-inf")] * 3
    found = False
    for obj in _myway_boundable_targets(targets):
        for corner in obj.bound_box:
            world = obj.matrix_world @ mathutils.Vector(corner)
            found = True
            for index in range(3):
                minimum[index] = min(minimum[index], world[index])
                maximum[index] = max(maximum[index], world[index])
    if not found:
        return None
    return minimum, maximum

def myway_ground_asset(objects=None):
    """Ground a single Blender Object, an object hierarchy, or an iterable."""
    targets = _myway_collect_object_targets(objects)
    bounds = _myway_world_bounds(targets)
    if bounds is None:
        return targets
    minimum, _maximum = bounds
    lowest = minimum[2]
    if lowest != float("inf"):
        for obj in _myway_transform_roots(targets):
            obj.location.z -= lowest
    bpy.context.view_layer.update()
    return targets

def _myway_normalize_extent_arguments(args, kwargs):
    options = dict(kwargs)
    objects = options.pop("objects", options.pop("object", None))
    target_extent = options.pop(
        "target_extent",
        options.pop("extent", None),
    )
    if options:
        unexpected = ", ".join(sorted(options.keys()))
        raise TypeError(
            "myway_normalize_extent received unexpected keyword arguments: "
            + unexpected
        )

    for value in args:
        if _myway_is_number(value) and target_extent is None:
            target_extent = value
        elif objects is None:
            objects = value
        else:
            raise TypeError(
                "myway_normalize_extent accepts one extent and one object or iterable"
            )

    if target_extent is None:
        raise TypeError(
            "myway_normalize_extent requires a numeric target extent"
        )
    if not _myway_is_number(target_extent):
        raise TypeError(
            "myway_normalize_extent target extent must be numeric"
        )
    if float(target_extent) <= 0.0:
        raise ValueError(
            "myway_normalize_extent target extent must be greater than zero"
        )

    return float(target_extent), objects

def myway_normalize_extent(*args, **kwargs):
    """Normalize a hierarchy.

    Canonical: myway_normalize_extent(2.0, root)
    Compatibility: myway_normalize_extent(root, 2.0)
    """
    target_extent, objects = _myway_normalize_extent_arguments(args, kwargs)
    targets = _myway_collect_object_targets(objects)
    bounds = _myway_world_bounds(targets)
    if bounds is None:
        return targets
    minimum, maximum = bounds
    extent = max(maximum[index] - minimum[index] for index in range(3))
    if extent <= 0.000001:
        return targets
    scale = target_extent / extent
    roots = _myway_transform_roots(targets)
    for obj in roots:
        obj.scale *= scale
    bpy.context.view_layer.update()
    for obj in roots:
        myway_apply_transform(obj, scale=True)
    bpy.context.view_layer.update()
    myway_ground_asset(targets)
    return targets

def myway_print_progress(message):
    print("MYWAY_PROGRESS:" + str(message))
`;
}
