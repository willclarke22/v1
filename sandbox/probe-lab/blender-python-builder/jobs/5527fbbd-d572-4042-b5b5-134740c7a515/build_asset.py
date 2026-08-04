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
    display_type="CROSS",
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
    display_type="CROSS",
)
right_paw_contact = add_empty(
    "right_paw_contact",
    location=(0.110, -0.245, 0.0),
    parent=right_front_paw,
    display_type="CROSS",
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
