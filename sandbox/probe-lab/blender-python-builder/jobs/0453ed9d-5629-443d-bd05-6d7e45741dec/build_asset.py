import bpy
import mathutils

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

import bpy
import math
from mathutils import Vector

# =============================================================================
# MyWay reference-build test: stylized mechanical desk fan
# Reference intent:
# - 380 mm overall height
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

HEAD_Z = 0.230
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
COLUMN_TOP_Z = 0.105

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
    (-0.160, 0.008, 0.188),
    (-0.140, 0.008, 0.142),
    (-0.092, 0.008, 0.112),
    (-0.038, 0.008, 0.100),
    (0.000, 0.008, 0.098),
    (0.038, 0.008, 0.100),
    (0.092, 0.008, 0.112),
    (0.140, 0.008, 0.142),
    (0.160, 0.008, 0.188),
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

# ---------------------------------------------------------------------------
# Trusted MyWay export, validation and benchmark inspection footer.
# Version: myway_blender_foundry_inspection_v4
# ---------------------------------------------------------------------------
import os as _myway_os
import math as _myway_math
import json as _myway_json
import hashlib as _myway_hashlib
import bmesh as _myway_bmesh

_myway_output_dir = _myway_os.environ["MYWAY_BLENDER_OUTPUT_DIR"]
_myway_asset_name = _myway_os.environ.get("MYWAY_BLENDER_ASSET_NAME", "generated_asset")
_myway_design_brief_path = _myway_os.environ.get("MYWAY_BLENDER_DESIGN_BRIEF", "")
_myway_os.makedirs(_myway_output_dir, exist_ok=True)

def _myway_read_json(path, fallback):
    if not path or not _myway_os.path.isfile(path):
        return fallback
    try:
        with open(path, "r", encoding="utf-8") as handle:
            value = _myway_json.load(handle)
        return value
    except Exception as error:
        print("MYWAY_JSON_WARNING:" + repr(error))
        return fallback

_myway_design_brief = _myway_read_json(_myway_design_brief_path, {})
myway_auto_assign_foundry_materials()

def _myway_scene_meshes():
    return [
        obj for obj in bpy.context.scene.objects
        if obj.type == "MESH"
    ]

_myway_meshes = _myway_scene_meshes()
if not _myway_meshes:
    raise RuntimeError("The script completed without creating any mesh objects.")

for _myway_obj in _myway_meshes:
    if len(_myway_obj.data.uv_layers) == 0:
        try:
            myway_generate_uvs(_myway_obj)
        except Exception as _myway_uv_error:
            print("MYWAY_UV_WARNING:" + _myway_obj.name + ":" + repr(_myway_uv_error))

myway_ground_asset(_myway_meshes)
myway_apply_foundry_environment()
_myway_environment_settings = _MYWAY_RESOURCE_MANIFEST.get("environment") or {}
try:
    bpy.context.scene.render.film_transparent = not bool(
        _myway_environment_settings.get("background_visible", False)
    )
except Exception:
    pass

_myway_glb_path = _myway_os.path.join(
    _myway_output_dir,
    _myway_asset_name + ".glb",
)
_myway_blend_path = _myway_os.path.join(
    _myway_output_dir,
    _myway_asset_name + ".blend",
)
_myway_validation_path = _myway_os.path.join(
    _myway_output_dir,
    "validation.json",
)
_myway_quality_path = _myway_os.path.join(
    _myway_output_dir,
    "quality.json",
)

def _myway_bounds(objects):
    minimum = [float("inf"), float("inf"), float("inf")]
    maximum = [float("-inf"), float("-inf"), float("-inf")]
    for obj in objects:
        for corner in obj.bound_box:
            world = obj.matrix_world @ mathutils.Vector(corner)
            for index in range(3):
                minimum[index] = min(minimum[index], world[index])
                maximum[index] = max(maximum[index], world[index])
    center = mathutils.Vector((
        (minimum[0] + maximum[0]) * 0.5,
        (minimum[1] + maximum[1]) * 0.5,
        (minimum[2] + maximum[2]) * 0.5,
    ))
    dimensions = [
        maximum[index] - minimum[index]
        for index in range(3)
    ]
    # Use the actual asset size. The former 0.5 m floor made compact
    # objects such as cameras appear tiny in every inspection render.
    extent = max(dimensions + [0.001])
    return minimum, maximum, center, dimensions, extent

_myway_min, _myway_max, _myway_center, _myway_dimensions, _myway_extent = _myway_bounds(_myway_meshes)
_myway_radius = max(
    0.5 * _myway_math.sqrt(sum(value * value for value in _myway_dimensions)),
    _myway_extent * 0.5,
    0.001,
)

def _myway_mesh_topology(obj):
    mesh = obj.data
    bm = _myway_bmesh.new()
    try:
        bm.from_mesh(mesh)
        bm.verts.ensure_lookup_table()
        bm.edges.ensure_lookup_table()
        bm.faces.ensure_lookup_table()
        non_manifold = sum(1 for edge in bm.edges if not edge.is_manifold)
        loose_edges = sum(1 for edge in bm.edges if len(edge.link_faces) == 0)
        loose_vertices = sum(1 for vertex in bm.verts if len(vertex.link_edges) == 0)
        degenerate_faces = sum(1 for face in bm.faces if face.calc_area() < 0.0000000001)

        visited = set()
        component_count = 0
        for vertex in bm.verts:
            if vertex.index in visited:
                continue
            component_count += 1
            stack = [vertex]
            while stack:
                current = stack.pop()
                if current.index in visited:
                    continue
                visited.add(current.index)
                for edge in current.link_edges:
                    other = edge.other_vert(current)
                    if other.index not in visited:
                        stack.append(other)

        return {
            "non_manifold_edges": non_manifold,
            "loose_edges": loose_edges,
            "loose_vertices": loose_vertices,
            "degenerate_faces": degenerate_faces,
            "connected_components": component_count,
        }
    finally:
        bm.free()

_myway_triangle_count = 0
_myway_material_slots = 0
_myway_uv_missing = []
_myway_zero_scale = []
_myway_negative_scale = []
_myway_object_names = []
_myway_objects = []
_myway_topology_totals = {
    "non_manifold_edges": 0,
    "loose_edges": 0,
    "loose_vertices": 0,
    "degenerate_faces": 0,
}
for obj in _myway_meshes:
    _myway_object_names.append(obj.name)
    _myway_material_slots += len(obj.data.materials)
    _myway_triangle_count += sum(
        max(0, len(polygon.vertices) - 2)
        for polygon in obj.data.polygons
    )
    if len(obj.data.uv_layers) == 0:
        _myway_uv_missing.append(obj.name)
    if any(abs(value) < 0.000001 for value in obj.scale):
        _myway_zero_scale.append(obj.name)
    if obj.matrix_world.to_3x3().determinant() < 0:
        _myway_negative_scale.append(obj.name)
    topology = _myway_mesh_topology(obj)
    for key in _myway_topology_totals:
        _myway_topology_totals[key] += topology[key]
    _myway_objects.append({
        "name": obj.name,
        "parent": obj.parent.name if obj.parent else None,
        "materials": [material.name for material in obj.data.materials if material],
        "dimensions": [float(value) for value in obj.dimensions],
        "location": [float(value) for value in obj.location],
        "topology": topology,
    })

_myway_validation = {
    "mesh_count": len(_myway_meshes),
    "material_slot_count": _myway_material_slots,
    "triangle_count": _myway_triangle_count,
    "object_names": sorted(_myway_object_names),
    "objects": _myway_objects,
    "uv_missing_object_names": sorted(_myway_uv_missing),
    "zero_scale_object_names": sorted(_myway_zero_scale),
    "negative_scale_object_names": sorted(_myway_negative_scale),
    "bounds_min": _myway_min,
    "bounds_max": _myway_max,
    "dimensions": _myway_dimensions,
    "ground_offset": _myway_min[2],
    "topology_totals": _myway_topology_totals,
}
with open(_myway_validation_path, "w", encoding="utf-8") as handle:
    _myway_json.dump(_myway_validation, handle, indent=2)

_myway_quality_findings = []
_myway_quality_score = 100
_myway_asset_class = str(_myway_design_brief.get("asset_class") or "general")
_myway_parts = _myway_design_brief.get("parts") or []
_myway_slots = _myway_design_brief.get("material_slots") or []
def _myway_semantic_name(value):
    return "".join(
        character.lower()
        for character in str(value or "")
        if character.lower() in "abcdefghijklmnopqrstuvwxyz0123456789"
    )

_myway_required_names = [
    str(part.get("part_id"))
    for part in _myway_parts
    if isinstance(part, dict) and part.get("required") is not False
]
_myway_object_semantic_names = {
    _myway_semantic_name(name)
    for name in _myway_object_names
}
_myway_missing_parts = [
    name for name in _myway_required_names
    if _myway_semantic_name(name) not in _myway_object_semantic_names
]
if _myway_missing_parts:
    _myway_quality_score -= min(40, len(_myway_missing_parts) * 8)
    _myway_quality_findings.append({
        "severity": "error",
        "code": "missing_required_parts",
        "message": "Missing required semantic parts: " + ", ".join(_myway_missing_parts),
    })
if _myway_topology_totals["non_manifold_edges"] > 0:
    _myway_quality_score -= min(20, _myway_topology_totals["non_manifold_edges"])
    _myway_quality_findings.append({
        "severity": "warning",
        "code": "non_manifold_geometry",
        "message": f'{_myway_topology_totals["non_manifold_edges"]} non-manifold edge(s) detected.',
    })
if _myway_topology_totals["degenerate_faces"] > 0:
    _myway_quality_score -= min(15, _myway_topology_totals["degenerate_faces"])
    _myway_quality_findings.append({
        "severity": "warning",
        "code": "degenerate_faces",
        "message": f'{_myway_topology_totals["degenerate_faces"]} degenerate face(s) detected.',
    })
if _myway_uv_missing:
    _myway_quality_score -= min(12, len(_myway_uv_missing) * 2)
    _myway_quality_findings.append({
        "severity": "warning",
        "code": "missing_uvs",
        "message": "UVs are missing on: " + ", ".join(_myway_uv_missing),
    })
if len(_myway_slots) > 1 and _myway_material_slots < len(_myway_slots):
    _myway_quality_score -= 10
    _myway_quality_findings.append({
        "severity": "warning",
        "code": "material_separation",
        "message": "The design brief defines more semantic material slots than the asset currently exposes.",
    })
if _myway_asset_class in ("hard_surface_assembly", "furniture_architecture", "mechanical_vehicle") and len(_myway_meshes) < 3:
    _myway_quality_score -= 12
    _myway_quality_findings.append({
        "severity": "warning",
        "code": "under_decomposed_assembly",
        "message": "The benchmark class normally needs several connected structural parts rather than one monolithic mesh.",
    })
if _myway_asset_class == "layered_organic" and len(_myway_meshes) < 2:
    _myway_quality_score -= 8
    _myway_quality_findings.append({
        "severity": "warning",
        "code": "organic_layering",
        "message": "The layered-organic benchmark benefits from distinct overlapping masses or ingredient layers.",
    })
if _myway_material_slots == 0:
    _myway_quality_score -= 20
    _myway_quality_findings.append({
        "severity": "warning",
        "code": "no_materials",
        "message": "No material slots were found.",
    })
if _myway_triangle_count < max(200, len(_myway_meshes) * 60):
    _myway_quality_score -= 8
    _myway_quality_findings.append({
        "severity": "info",
        "code": "very_low_geometry_detail",
        "message": "Geometry density is unusually low for the benchmark quality target; inspect silhouette and small structural features.",
    })

_myway_quality_score = max(0, min(100, _myway_quality_score))
_myway_quality = {
    "score": _myway_quality_score,
    "grade": (
        "technical_ready" if _myway_quality_score >= 90 else
        "technical_strong" if _myway_quality_score >= 78 else
        "developing" if _myway_quality_score >= 60 else
        "needs_revision"
    ),
    "asset_class": _myway_asset_class,
    "findings": _myway_quality_findings,
    "technical_only": True,
    "release_requires_visual_and_human_review": True,
    "benchmark_checks": {
        "silhouette_requires_visual_review": True,
        "proportions_require_visual_review": True,
        "connections_require_visual_review": True,
        "material_response_requires_visual_review": True,
        "semantic_parts_present": len(_myway_missing_parts) == 0,
        "topology_clean": (
            _myway_topology_totals["non_manifold_edges"] == 0 and
            _myway_topology_totals["degenerate_faces"] == 0
        ),
        "material_regions_present": _myway_material_slots > 0,
    },
}
with open(_myway_quality_path, "w", encoding="utf-8") as handle:
    _myway_json.dump(_myway_quality, handle, indent=2)

bpy.ops.wm.save_as_mainfile(filepath=_myway_blend_path)
bpy.ops.object.select_all(action="DESELECT")
for obj in _myway_meshes:
    obj.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=_myway_glb_path,
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_animations=True,
)

def _myway_available_engines():
    return {
        item.identifier
        for item in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items
    }

def _myway_set_beauty_engine():
    engines = _myway_available_engines()
    if "BLENDER_EEVEE_NEXT" in engines:
        bpy.context.scene.render.engine = "BLENDER_EEVEE_NEXT"
    elif "BLENDER_EEVEE" in engines:
        bpy.context.scene.render.engine = "BLENDER_EEVEE"
    elif "CYCLES" in engines:
        bpy.context.scene.render.engine = "CYCLES"
    elif "BLENDER_WORKBENCH" in engines:
        bpy.context.scene.render.engine = "BLENDER_WORKBENCH"

def _myway_add_preview_camera():
    bpy.ops.object.camera_add(location=(
        _myway_center.x + _myway_extent,
        _myway_center.y - _myway_extent,
        _myway_center.z + _myway_extent,
    ))
    camera = bpy.context.object
    camera.name = "MyWayInspectionCamera"
    camera.data.lens = 52
    camera.data.clip_start = max(_myway_extent * 0.002, 0.0001)
    camera.data.clip_end = max(_myway_extent * 100.0, 100.0)
    bpy.context.scene.camera = camera
    return camera

def _myway_point_camera(camera, x, y, z, margin=1.18):
    view_direction = mathutils.Vector((x, y, z))
    if view_direction.length < 0.000001:
        view_direction = mathutils.Vector((1.0, -1.0, 0.75))
    view_direction.normalize()

    half_angle = max(
        min(camera.data.angle_x, camera.data.angle_y) * 0.5,
        _myway_math.radians(5.0),
    )
    distance = (
        _myway_radius / max(_myway_math.sin(half_angle), 0.05)
    ) * margin
    camera.location = _myway_center + view_direction * distance
    direction = _myway_center - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()

def _myway_add_fallback_lights():
    environment = _MYWAY_RESOURCE_MANIFEST.get("environment") or {}
    if environment.get("environment_path"):
        return []
    try:
        energy_scale = max(
            0.0,
            float(environment.get("fallback_light_energy_scale") or 1.0),
        )
    except Exception:
        energy_scale = 1.0
    lights = []
    for location, energy, size in [
        ((_myway_center.x + _myway_extent * 1.4,
          _myway_center.y - _myway_extent * 1.2,
          _myway_center.z + _myway_extent * 2.0), 1100, _myway_extent),
        ((_myway_center.x - _myway_extent * 1.8,
          _myway_center.y - _myway_extent * 0.4,
          _myway_center.z + _myway_extent * 1.0), 700, _myway_extent * 1.2),
        ((_myway_center.x,
          _myway_center.y + _myway_extent * 1.6,
          _myway_center.z + _myway_extent * 0.8), 450, _myway_extent * 0.8),
    ]:
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.data.energy = energy * energy_scale
        light.data.shape = "DISK"
        light.data.size = size
        light.rotation_euler = (
            _myway_center - light.location
        ).to_track_quat("-Z", "Y").to_euler()
        lights.append(light)
    return lights

def _myway_render(camera, filename, x=1.8, y=-2.2, z=1.35):
    _myway_point_camera(camera, x, y, z)
    path = _myway_os.path.join(_myway_output_dir, filename)
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("MYWAY_PREVIEW_COMPLETE:" + path)
    return path

_myway_set_beauty_engine()
bpy.context.scene.render.resolution_x = 768
bpy.context.scene.render.resolution_y = 768
bpy.context.scene.render.resolution_percentage = 100
bpy.context.scene.render.image_settings.file_format = "PNG"
try:
    bpy.context.scene.view_settings.look = "AgX - Medium High Contrast"
except Exception:
    pass
_myway_camera = _myway_add_preview_camera()
_myway_lights = _myway_add_fallback_lights()

_myway_rendered_views = []
for filename, x, y, z in [
    ("preview.png", 1.8, -2.2, 1.35),
    ("preview_front.png", 0.0, -2.8, 0.85),
    ("preview_right.png", 2.8, 0.0, 0.85),
    ("preview_back.png", 0.0, 2.8, 0.85),
    ("preview_left.png", -2.8, 0.0, 0.85),
    ("preview_top.png", 0.8, -0.8, 3.2),
]:
    try:
        _myway_rendered_views.append(_myway_render(_myway_camera, filename, x, y, z))
    except Exception as error:
        print("MYWAY_PREVIEW_WARNING:" + filename + ":" + repr(error))

def _myway_restore_materials(saved):
    for obj, materials in saved:
        obj.data.materials.clear()
        for material in materials:
            obj.data.materials.append(material)

_myway_saved_materials = [
    (obj, list(obj.data.materials))
    for obj in _myway_meshes
]

# Neutral clay view: tests geometry without texture support.
try:
    clay = myway_material("MyWayInspectionClay", (0.52, 0.55, 0.6, 1.0), 0.0, 0.72)
    for obj in _myway_meshes:
        obj.data.materials.clear()
        obj.data.materials.append(clay)
    _myway_rendered_views.append(_myway_render(_myway_camera, "preview_clay.png"))
finally:
    _myway_restore_materials(_myway_saved_materials)

# Material-ID view: confirms semantic surface separation.
try:
    for obj_index, obj in enumerate(_myway_meshes):
        digest = _myway_hashlib.sha256(obj.name.encode("utf-8")).digest()
        color = (
            0.2 + (digest[0] / 255.0) * 0.75,
            0.2 + (digest[1] / 255.0) * 0.75,
            0.2 + (digest[2] / 255.0) * 0.75,
            1.0,
        )
        material = myway_material("MyWayID_" + obj.name, color, 0.0, 0.75)
        obj.data.materials.clear()
        obj.data.materials.append(material)
    _myway_rendered_views.append(_myway_render(_myway_camera, "preview_material_id.png"))
finally:
    _myway_restore_materials(_myway_saved_materials)

# World-space normal orientation view.
try:
    normal_material = bpy.data.materials.new("MyWayNormalOrientation")
    normal_material.use_nodes = True
    nodes = normal_material.node_tree.nodes
    links = normal_material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    geometry = nodes.new("ShaderNodeNewGeometry")
    multiply = nodes.new("ShaderNodeVectorMath")
    multiply.operation = "SCALE"
    multiply.inputs["Scale"].default_value = 0.5
    add = nodes.new("ShaderNodeVectorMath")
    add.operation = "ADD"
    add.inputs[1].default_value = (0.5, 0.5, 0.5)
    links.new(geometry.outputs["Normal"], multiply.inputs[0])
    links.new(multiply.outputs["Vector"], add.inputs[0])
    links.new(add.outputs["Vector"], emission.inputs["Color"])
    links.new(emission.outputs["Emission"], output.inputs["Surface"])
    for obj in _myway_meshes:
        obj.data.materials.clear()
        obj.data.materials.append(normal_material)
    _myway_rendered_views.append(_myway_render(_myway_camera, "preview_normals.png"))
finally:
    _myway_restore_materials(_myway_saved_materials)

# Wireframe diagnostic using temporary duplicates, leaving the exported asset unchanged.
_myway_wire_objects = []
try:
    wire_material = myway_material("MyWayWire", (0.02, 0.04, 0.06, 1.0), 0.0, 0.95)
    for original in _myway_meshes:
        duplicate = original.copy()
        duplicate.data = original.data.copy()
        duplicate.name = "MyWayWire_" + original.name
        bpy.context.collection.objects.link(duplicate)
        duplicate.data.materials.clear()
        duplicate.data.materials.append(wire_material)
        modifier = duplicate.modifiers.new(name="MyWayWireframe", type="WIREFRAME")
        modifier.thickness = max(_myway_extent * 0.0015, 0.0005)
        modifier.use_replace = True
        modifier.use_even_offset = True
        _myway_wire_objects.append(duplicate)
        original.hide_render = True
    _myway_rendered_views.append(_myway_render(_myway_camera, "preview_wireframe.png"))
finally:
    for original in _myway_meshes:
        original.hide_render = False
    for duplicate in _myway_wire_objects:
        bpy.data.objects.remove(duplicate, do_unlink=True)

# Bounding-box and dimensions diagnostic.
_myway_dimension_objects = []
try:
    corners = [
        (_myway_min[0], _myway_min[1], _myway_min[2]),
        (_myway_max[0], _myway_min[1], _myway_min[2]),
        (_myway_max[0], _myway_max[1], _myway_min[2]),
        (_myway_min[0], _myway_max[1], _myway_min[2]),
        (_myway_min[0], _myway_min[1], _myway_max[2]),
        (_myway_max[0], _myway_min[1], _myway_max[2]),
        (_myway_max[0], _myway_max[1], _myway_max[2]),
        (_myway_min[0], _myway_max[1], _myway_max[2]),
    ]
    edges = [
        (0,1),(1,2),(2,3),(3,0),
        (4,5),(5,6),(6,7),(7,4),
        (0,4),(1,5),(2,6),(3,7),
    ]
    dimension_material = myway_material("MyWayDimensions", (0.15, 0.85, 1.0, 1.0), 0.0, 0.3)
    for index, (start_index, end_index) in enumerate(edges):
        line = myway_curve_tube(
            f"MyWayDimensionEdge_{index:02d}",
            [corners[start_index], corners[end_index]],
            bevel_depth=max(_myway_extent * 0.002, 0.0008),
            material=dimension_material,
        )
        _myway_dimension_objects.append(line)
    for label, value, location in [
        ("X", _myway_dimensions[0], (_myway_center.x, _myway_min[1], _myway_min[2] - _myway_extent * 0.06)),
        ("Y", _myway_dimensions[1], (_myway_max[0], _myway_center.y, _myway_min[2] - _myway_extent * 0.06)),
        ("Z", _myway_dimensions[2], (_myway_max[0], _myway_min[1], _myway_center.z)),
    ]:
        bpy.ops.object.text_add(location=location)
        text_obj = bpy.context.object
        text_obj.name = "MyWayDimensionLabel_" + label
        text_obj.data.body = f"{label}: {value:.3f} m"
        text_obj.data.align_x = "CENTER"
        text_obj.data.size = max(_myway_extent * 0.035, 0.003)
        text_obj.data.extrude = max(_myway_extent * 0.0005, 0.0002)
        text_obj.data.materials.append(dimension_material)
        text_obj.rotation_euler = _myway_camera.rotation_euler
        _myway_dimension_objects.append(text_obj)
    _myway_rendered_views.append(_myway_render(_myway_camera, "preview_dimensions.png"))
finally:
    for obj in _myway_dimension_objects:
        if obj.name in bpy.data.objects:
            bpy.data.objects.remove(obj, do_unlink=True)

print("MYWAY_VALIDATION_COMPLETE:" + _myway_validation_path)
print("MYWAY_QUALITY_COMPLETE:" + _myway_quality_path)
print("MYWAY_ASSET_BUILD_COMPLETE:" + _myway_glb_path)
