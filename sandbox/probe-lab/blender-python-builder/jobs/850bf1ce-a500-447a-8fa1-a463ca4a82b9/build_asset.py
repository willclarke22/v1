import bpy
import mathutils

# ---------------------------------------------------------------------------
# Trusted MyWay Blender Asset Foundry helper library.
# Version: myway_blender_foundry_helpers_v2_1
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
        "background_visible": False,
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

def _myway_build_pbr_material(slot_id, slot):
    fallback = slot.get("fallback") or {}
    color = tuple(fallback.get("color_rgba") or (0.5, 0.5, 0.5, 1.0))
    metallic = float(fallback.get("metallic") or 0.0)
    roughness = float(fallback.get("roughness") or 0.55)
    material = myway_material(
        "MyWaySlot_" + slot_id,
        color=color,
        metallic=metallic,
        roughness=roughness,
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

    texcoord = nodes.new("ShaderNodeTexCoord")
    texcoord.name = "MyWayTextureCoordinates"
    mapping = nodes.new("ShaderNodeMapping")
    mapping.name = "MyWayTextureScale"
    texture_scale_m = slot.get("texture_scale_m")
    scale = 1.0
    try:
        if texture_scale_m is not None and float(texture_scale_m) > 0.000001:
            scale = 1.0 / float(texture_scale_m)
    except Exception:
        scale = 1.0
    mapping.inputs["Scale"].default_value = (scale, scale, scale)
    links.new(texcoord.outputs["UV"], mapping.inputs["Vector"])

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
            links.new(rough.outputs["Color"], target)

    metal = texture_nodes.get("metallic")
    if metal is not None:
        target = _myway_node_input(principled, "Metallic")
        if target is not None:
            links.new(metal.outputs["Color"], target)

    normal = texture_nodes.get("normal_gl") or texture_nodes.get("normal_dx")
    if normal is not None:
        normal_map = nodes.new("ShaderNodeNormalMap")
        normal_map.space = "TANGENT"
        links.new(normal.outputs["Color"], normal_map.inputs["Color"])
        target = _myway_node_input(principled, "Normal")
        if target is not None:
            links.new(normal_map.outputs["Normal"], target)

    height = texture_nodes.get("height")
    if height is not None:
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.18
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

def myway_material_slot(slot_id, fallback_color=(0.5, 0.5, 0.5, 1.0), metallic=0.0, roughness=0.55):
    if slot_id in _MYWAY_MATERIAL_CACHE:
        return _MYWAY_MATERIAL_CACHE[slot_id]
    slots = _MYWAY_RESOURCE_MANIFEST.get("material_slots") or {}
    slot = slots.get(slot_id)
    if isinstance(slot, dict):
        material = _myway_build_pbr_material(slot_id, slot)
    else:
        material = myway_material(
            "MyWaySlot_" + str(slot_id),
            color=fallback_color,
            metallic=metallic,
            roughness=roughness,
        )
    _MYWAY_MATERIAL_CACHE[slot_id] = material
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

def myway_assign_material_slot(obj, slot_id, fallback_color=(0.5, 0.5, 0.5, 1.0), metallic=0.0, roughness=0.55):
    return myway_assign_material(
        obj,
        myway_material_slot(slot_id, fallback_color, metallic, roughness),
    )

def myway_auto_assign_foundry_materials():
    mapping = _MYWAY_RESOURCE_MANIFEST.get("part_material_slots") or {}
    if not isinstance(mapping, dict):
        return
    for object_name, slot_id in mapping.items():
        obj = bpy.data.objects.get(object_name)
        if obj is not None:
            myway_assign_material_slot(obj, str(slot_id))

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

"""
Treasure Chest — high-quality stylized wooden treasure chest with curved lid,
dark iron bands, hinges, corner hardware, side handles, front lock, and
softened manufactured edges. Animation-ready pivots for lid and hasp.
"""
import bpy
import math
from mathutils import Vector, Matrix

# ---------------------------------------------------------------------------
# Constants (chest designed in a ~1.0m unit space, normalized to 2.0m at end)
# ---------------------------------------------------------------------------
CHEST_W = 1.0       # X width
CHEST_D = 1.0       # Y depth
BASE_H = 0.70       # Z height of base body
WALL_T = 0.05       # wall thickness

LID_RADIUS = 0.42   # curved lid dome radius
LID_HALF_W = CHEST_W / 2.0
LID_FRONT_LIP_H = 0.15
LID_BACK_WALL_H = 0.06

HINGE_Y = -0.50
HINGE_Z = 0.70
HINGE_X = 0.48

BEVEL_WOOD = 0.015
BEVEL_METAL = 0.008

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')

def _select_only(obj):
    _ensure_object_mode()
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

def _apply_all_modifiers(obj):
    _select_only(obj)
    for m in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)

def _bevel_object(obj, width=0.01, segments=2):
    _select_only(obj)
    mod = obj.modifiers.new(name="Bevel", type='BEVEL')
    mod.width = width
    mod.segments = segments
    mod.limit_method = 'ANGLE'
    mod.angle_limit = math.radians(35)
    bpy.ops.object.modifier_apply(modifier=mod.name)

def _shade_smooth(obj):
    _select_only(obj)
    bpy.ops.object.shade_smooth()

def _set_smooth_by_angle(obj, angle_deg=40):
    _select_only(obj)
    mod = obj.modifiers.new(name="SmoothByAngle", type='WEIGHTED_NORMAL')
    mod.keep_sharp = True
    mod.weight = 50
    bpy.ops.object.modifier_apply(modifier=mod.name)

def _add_rivets(parent_obj, positions, radius=0.012, height=0.008, name_prefix="rivet"):
    """Add small hemisphere rivets as children of parent_obj."""
    rivets = []
    for i, pos in enumerate(positions):
        r = myway_sphere(radius, location=pos)
        r.name = f"{name_prefix}_{i}"
        # Flatten slightly
        r.scale.z = 0.5
        myway_apply_transform(r)
        _bevel_object(r, width=0.003, segments=1)
        myway_assign_material_slot(r, "slot_metal_dark_iron")
        myway_parent(r, parent_obj)
        rivets.append(r)
    return rivets

def _make_band_strip(name, length, height, depth, bevel_w=BEVEL_METAL):
    """Create a thin metal band strip centered at origin."""
    band = myway_box(length, height, depth, name=name)
    _bevel_object(band, width=bevel_w, segments=2)
    myway_assign_material_slot(band, "slot_metal_dark_iron")
    return band

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

myway_reset_scene()
myway_print_progress("Building treasure chest...")

# Material slots
myway_material_slot("slot_wood_warm")
myway_material_slot("slot_metal_dark_iron")

# === CHEST BASE BODY ===
myway_print_progress("Creating chest_base_body...")

# Outer shell
base_outer = myway_box(CHEST_W, CHEST_D, BASE_H, name="chest_base_body")
base_outer.location = (0, 0, BASE_H / 2.0)
myway_apply_transform(base_outer)

# Hollow interior using boolean
inner = myway_box(
    CHEST_W - 2 * WALL_T,
    CHEST_D - 2 * WALL_T,
    BASE_H - WALL_T,
    name="_inner_cavity"
)
inner.location = (0, 0, WALL_T + (BASE_H - WALL_T) / 2.0)
myway_apply_transform(inner)

_select_only(base_outer)
bool_mod = base_outer.modifiers.new(name="Hollow", type='BOOLEAN')
bool_mod.operation = 'DIFFERENCE'
bool_mod.object = inner
bpy.ops.object.modifier_apply(modifier=bool_mod.name)
bpy.data.objects.remove(inner, do_unlink=True)

# Slight outward bow on front/back faces using simple deform
_select_only(base_outer)
bow_mod = base_outer.modifiers.new(name="Bow", type='SIMPLE_DEFORM')
bow_mod.deform_method = 'BEND'
bow_mod.deform_axis = 'X'
bow_mod.angle = math.radians(2.5)
bpy.ops.object.modifier_apply(modifier=bow_mod.name)

# Bevel exterior edges
_bevel_object(base_outer, width=BEVEL_WOOD, segments=3)
myway_assign_material_slot(base_outer, "slot_wood_warm")
myway_generate_uvs(base_outer)
_shade_smooth(base_outer)
_set_smooth_by_angle(base_outer)

# === WOOD PLANK SEAMS ===
myway_print_progress("Creating wood_plank_seams...")

seam_objs = []
seam_depth = 0.004
seam_width = 0.006

# Front face plank seams (3 planks => 2 seams)
front_y = CHEST_D / 2.0 + 0.001
for i in range(2):
    z = BASE_H * (i + 1) / 3.0
    s = myway_box(CHEST_W * 0.96, seam_width, seam_depth, name=f"seam_front_{i}")
    s.location = (0, front_y, z)
    myway_apply_transform(s)
    seam_objs.append(s)

# Back face plank seams
back_y = -CHEST_D / 2.0 - 0.001
for i in range(2):
    z = BASE_H * (i + 1) / 3.0
    s = myway_box(CHEST_W * 0.96, seam_width, seam_depth, name=f"seam_back_{i}")
    s.location = (0, back_y, z)
    myway_apply_transform(s)
    seam_objs.append(s)

# Side face plank seams (2 planks => 1 seam each side)
for side_x in [CHEST_W / 2.0 + 0.001, -CHEST_W / 2.0 - 0.001]:
    s = myway_box(seam_width, CHEST_D * 0.96, seam_depth, name=f"seam_side_{side_x:.2f}")
    s.location = (side_x, 0, BASE_H / 2.0)
    myway_apply_transform(s)
    seam_objs.append(s)

# Join all seams into one object
if seam_objs:
    _select_only(seam_objs[0])
    for s in seam_objs[1:]:
        s.select_set(True)
    bpy.context.view_layer.objects.active = seam_objs[0]
    bpy.ops.object.join()
    wood_plank_seams = bpy.context.view_layer.objects.active
    wood_plank_seams.name = "wood_plank_seams"
    myway_assign_material_slot(wood_plank_seams, "slot_wood_warm")
    myway_generate_uvs(wood_plank_seams)
    myway_parent(wood_plank_seams, base_outer)

# === CHEST LID SHELL ===
myway_print_progress("Creating chest_lid_shell...")

# Build lid as a half-cylinder cap + front lip + back wall
# The lid pivots at (0, HINGE_Y, HINGE_Z) = (0, -0.5, 0.70)
# We build geometry in lid-local space then set origin to pivot.

lid_parts = []

# Curved dome: half cylinder oriented so axis = X, dome opens downward
# Use a cylinder rotated 90° about X, then cut bottom half
dome = myway_cylinder(LID_RADIUS, LID_HALF_W * 2, name="_lid_dome", segments=32)
dome.rotation_euler = (0, math.radians(90), 0)
dome.location = (0, 0, 0)
myway_apply_transform(dome)

# Cut bottom half away (keep only top semicircle)
# The cylinder is centered at origin, axis along X after rotation
# We need to remove vertices with Z < 0 (bottom half)
_select_only(dome)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='DESELECT')
bpy.ops.object.mode_set(mode='OBJECT')

mesh = dome.data
for v in mesh.vertices:
    v.select = v.co.z < -0.001

_select_only(dome)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.delete(type='VERT')
bpy.ops.object.mode_set(mode='OBJECT')

# Now we have a top half-cylinder shell. Add front lip and back wall.
# The dome spans Y from -LID_RADIUS to +LID_RADIUS, Z from 0 to LID_RADIUS
# Front lip: vertical plate at Y = +LID_RADIUS, from Z=0 to Z=LID_FRONT_LIP_H
# Back wall: vertical plate at Y = -LID_RADIUS, from Z=0 to Z=LID_BACK_WALL_H

# Front lip
front_lip = myway_box(
    CHEST_W * 0.98,
    WALL_T,
    LID_FRONT_LIP_H,
    name="_lid_front_lip"
)
front_lip.location = (0, LID_RADIUS, LID_FRONT_LIP_H / 2.0)
myway_apply_transform(front_lip)

# Back wall
back_wall = myway_box(
    CHEST_W * 0.98,
    WALL_T,
    LID_BACK_WALL_H,
    name="_lid_back_wall"
)
back_wall.location = (0, -LID_RADIUS, LID_BACK_WALL_H / 2.0)
myway_apply_transform(back_wall)

# End caps for the dome (close the semicircle ends)
for x_sign in [1, -1]:
    # Create semicircle end cap via mesh from vertices
    verts = []
    faces = []
    n_seg = 16
    for i in range(n_seg + 1):
        angle = math.pi * i / n_seg  # 0 to pi (top half)
        y = LID_RADIUS * math.cos(angle)
        z = LID_RADIUS * math.sin(angle)
        verts.append((x_sign * LID_HALF_W, y, z))
    # Add bottom edge vertices
    verts.append((x_sign * LID_HALF_W, LID_RADIUS, 0))
    verts.append((x_sign * LID_HALF_W, -LID_RADIUS, 0))
    # Face: fan from first vertex (top center)
    # Actually create a strip of quads
    for i in range(n_seg):
        faces.append((i, i + 1, n_seg + 2, n_seg + 1))
    # Close bottom
    faces.append((n_seg, n_seg + 2, n_seg + 1, n_seg + 1))  # degenerate, skip
    
    # Simpler: just make a filled semicircle
    verts2 = []
    for i in range(n_seg + 1):
        angle = math.pi * i / n_seg
        y = LID_RADIUS * math.cos(angle)
        z = LID_RADIUS * math.sin(angle)
        verts2.append((x_sign * LID_HALF_W, y, z))
    # Center vertex
    verts2.append((x_sign * LID_HALF_W, 0, LID_RADIUS * 0.5))
    center_idx = len(verts2) - 1
    faces2 = []
    for i in range(n_seg):
        faces2.append((i, i + 1, center_idx))
    
    cap = myway_mesh_from_vertices_faces(verts2, faces2, name=f"_lid_cap_{x_sign}")
    myway_apply_transform(cap)
    lid_parts.append(cap)

# Join dome + front_lip + back_wall + caps
lid_parts.extend([dome, front_lip, back_wall])

_select_only(lid_parts[0])
for p in lid_parts[1:]:
    p.select_set(True)
bpy.context.view_layer.objects.active = lid_parts[0]
bpy.ops.object.join()
lid_shell = bpy.context.view_layer.objects.active
lid_shell.name = "chest_lid_shell"

# The lid geometry is built around (0,0,0) with dome center at origin
# We need to position it so the hinge edge (back-bottom of dome) is at
# the pivot point (0, HINGE_Y, HINGE_Z) in world space.
# Currently the back-bottom of the dome is at Y=-LID_RADIUS, Z=0 in local.
# We want that at Y=HINGE_Y, Z=HINGE_Z.
# Offset: Y = HINGE_Y - (-LID_RADIUS) = HINGE_Y + LID_RADIUS
#         Z = HINGE_Z - 0 = HINGE_Z
lid_offset_y = HINGE_Y + LID_RADIUS  # = -0.5 + 0.42 = -0.08
lid_offset_z = HINGE_Z               # = 0.70

# Move geometry into position
_select_only(lid_shell)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.transform.translate(value=(0, lid_offset_y, lid_offset_z))
bpy.ops.object.mode_set(mode='OBJECT')

# Set origin to hinge pivot point
myway_pivot_at(lid_shell, (0, HINGE_Y, HINGE_Z))

# Bevel and material
_bevel_object(lid_shell, width=BEVEL_WOOD, segments=3)
myway_assign_material_slot(lid_shell, "slot_wood_warm")
myway_generate_uvs(lid_shell)
_shade_smooth(lid_shell)
_set_smooth_by_angle(lid_shell)

# Parent lid to base
myway_parent(lid_shell, base_outer)

# === HORIZONTAL BANDS (FRONT & BACK) ===
myway_print_progress("Creating horizontal bands...")

band_height = 0.05
band_depth = 0.025  # protrusion from surface
band_wrap = 0.12   # how far band wraps onto sides
band_gap = 0.005   # gap from wood surface

band_z_positions = [0.08, 0.28, 0.48, 0.68]

# Front bands
front_bands = []
for i, z in enumerate(band_z_positions):
    # Main front strip
    band = _make_band_strip(
        f"band_front_{i}",
        CHEST_W - 2 * band_wrap + 0.02,
        band_height,
        band_depth
    )
    band.location = (0, CHEST_D / 2.0 + band_gap, z)
    myway_apply_transform(band)
    front_bands.append(band)
    
    # Left wrap
    lw = _make_band_strip(
        f"band_front_lw_{i}",
        band_wrap,
        band_height,
        band_depth
    )
    lw.location = (-CHEST_W / 2.0 + band_wrap / 2.0, CHEST_D / 2.0 + band_gap, z)
    myway_apply_transform(lw)
    front_bands.append(lw)
    
    # Right wrap
    rw = _make_band_strip(
        f"band_front_rw_{i}",
        band_wrap,
        band_height,
        band_depth
    )
    rw.location = (CHEST_W / 2.0 - band_wrap / 2.0, CHEST_D / 2.0 + band_gap, z)
    myway_apply_transform(rw)
    front_bands.append(rw)

# Join front bands
_select_only(front_bands[0])
for b in front_bands[1:]:
    b.select_set(True)
bpy.context.view_layer.objects.active = front_bands[0]
bpy.ops.object.join()
band_front = bpy.context.view_layer.objects.active
band_front.name = "band_horizontal_front"

# Add rivets to front bands
rivet_positions_front = []
for z in band_z_positions:
    for x in [-0.40, -0.20, 0.0, 0.20, 0.40]:
        rivet_positions_front.append((x, CHEST_D / 2.0 + band_gap + band_depth, z))
_add_rivets(band_front, rivet_positions_front, radius=0.01, height=0.006, name_prefix="f_rivet")
myway_parent(band_front, base_outer)

# Back bands
back_bands = []
for i, z in enumerate(band_z_positions):
    band = _make_band_strip(
        f"band_back_{i}",
        CHEST_W - 2 * band_wrap + 0.02,
        band_height,
        band_depth
    )
    band.location = (0, -CHEST_D / 2.0 - band_gap, z)
    myway_apply_transform(band)
    back_bands.append(band)
    
    lw = _make_band_strip(
        f"band_back_lw_{i}",
        band_wrap,
        band_height,
        band_depth
    )
    lw.location = (-CHEST_W / 2.0 + band_wrap / 2.0, -CHEST_D / 2.0 - band_gap, z)
    myway_apply_transform(lw)
    back_bands.append(lw)
    
    rw = _make_band_strip(
        f"band_back_rw_{i}",
        band_wrap,
        band_height,
        band_depth
    )
    rw.location = (CHEST_W / 2.0 - band_wrap / 2.0, -CHEST_D / 2.0 - band_gap, z)
    myway_apply_transform(rw)
    back_bands.append(rw)

_select_only(back_bands[0])
for b in back_bands[1:]:
    b.select_set(True)
bpy.context.view_layer.objects.active = back_bands[0]
bpy.ops.object.join()
band_back = bpy.context.view_layer.objects.active
band_back.name = "band_horizontal_back"

rivet_positions_back = []
for z in band_z_positions:
    for x in [-0.40, -0.20, 0.0, 0.20, 0.40]:
        rivet_positions_back.append((x, -CHEST_D / 2.0 - band_gap - band_depth, z))
_add_rivets(band_back, rivet_positions_back, radius=0.01, height=0.006, name_prefix="b_rivet")
myway_parent(band_back, base_outer)

# === LID CURVED BANDS ===
myway_print_progress("Creating band_lid_curved...")

# Two curved bands at X = ±0.48, conforming to lid dome radius
# The lid dome center (in world space before pivot offset) is at:
#   Y = lid_offset_y = -0.08, Z = lid_offset_z = 0.70
# The dome radius is LID_RADIUS = 0.42
# A band at X = ±0.48 wraps from front (Y = center_y + R) to back (Y = center_y - R)
# along the semicircular top of the dome.

lid_band_parts = []
lid_dome_center_y = lid_offset_y  # -0.08
lid_dome_center_z = lid_offset_z  # 0.70

for x_sign, band_name in [(-1, "lid_band_l"), (1, "lid_band_r")]:
    x_pos = x_sign * 0.48
    # Create a half-torus arc following the dome curve
    # Torus major radius = LID_RADIUS, minor radius = 0.025 (band thickness)
    # Orient so the torus axis is along X, and we take the top half
    
    band = myway_torus(
        major_radius=LID_RADIUS,
        minor_radius=0.025,
        major_segments=24,
        minor_segments=8,
        name=band_name
    )
    band.rotation_euler = (0, math.radians(90), 0)
    band.location = (x_pos, lid_dome_center_y, lid_dome_center_z)
    myway_apply_transform(band)
    
    # Remove bottom half of torus (keep Z > center)
    _select_only(band)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='DESELECT')
    bpy.ops.object.mode_set(mode='OBJECT')
    
    for v in band.data.vertices:
        world_z = band.matrix_world @ v.co
        if world_z.z < lid_dome_center_z - 0.01:
            v.select = True
    
    _select_only(band)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.delete(type='VERT')
    bpy.ops.object.mode_set(mode='OBJECT')
    
    # Flatten the band to be a strip, not a full torus tube
    band.scale = (1.0, 1.0, 0.4)
    myway_apply_transform(band)
    
    _bevel_object(band, width=0.004, segments=2)
    myway_assign_material_slot(band, "slot_metal_dark_iron")
    lid_band_parts.append(band)

# Join lid bands
_select_only(lid_band_parts[0])
for b in lid_band_parts[1:]:
    b.select_set(True)
bpy.context.view_layer.objects.active = lid_band_parts[0]
bpy.ops.object.join()
band_lid = bpy.context.view_layer.objects.active
band_lid.name = "band_lid_curved"

# Add rivets along the lid bands
rivet_positions_lid = []
n_rivets = 5
for x_pos in [-0.48, 0.48]:
    for i in range(n_rivets):
        angle = math.pi * i / (n_rivets - 1)  # 0 to pi
        y = lid_dome_center_y + LID_RADIUS * math.cos(angle)
        z = lid_dome_center_z + LID_RADIUS * math.sin(angle) + 0.03
        rivet_positions_lid.append((x_pos, y, z))
_add_rivets(band_lid, rivet_positions_lid, radius=0.01, height=0.006, name_prefix="l_rivet")

# Parent to lid
myway_parent(band_lid, lid_shell)

# === HINGES ===
myway_print_progress("Creating hinges...")

def make_hinge(name, x_pos):
    """Create a hinge at the back-top edge of the base."""
    parts = []
    
    # Base knuckle (fixed to base)
    base_knuckle = myway_cylinder(
        radius=0.035,
        depth=0.12,
        name=f"{name}_base_knuckle"
    )
    base_knuckle.rotation_euler = (0, math.radians(90), 0)
    base_knuckle.location = (x_pos, HINGE_Y, HINGE_Z)
    myway_apply_transform(base_knuckle)
    _bevel_object(base_knuckle, width=0.005, segments=2)
    myway_assign_material_slot(base_knuckle, "slot_metal_dark_iron")
    parts.append(base_knuckle)
    
    # Lid knuckle (fixed to lid) - offset along Y toward front
    lid_knuckle = myway_cylinder(
        radius=0.035,
        depth=0.12,
        name=f"{name}_lid_knuckle"
    )
    lid_knuckle.rotation_euler = (0, math.radians(90), 0)
    lid_knuckle.location = (x_pos, HINGE_Y + 0.07, HINGE_Z)
    myway_apply_transform(lid_knuckle)
    _bevel_object(lid_knuckle, width=0.005, segments=2)
    myway_assign_material_slot(lid_knuckle, "slot_metal_dark_iron")
    parts.append(lid_knuckle)
    
    # Pin rod through both knuckles
    pin = myway_cylinder(
        radius=0.012,
        depth=0.28,
        name=f"{name}_pin"
    )
    pin.rotation_euler = (0, math.radians(90), 0)
    pin.location = (x_pos, HINGE_Y + 0.035, HINGE_Z)
    myway_apply_transform(pin)
    myway_assign_material_slot(pin, "slot_metal_dark_iron")
    parts.append(pin)
    
    # Mounting plates
    # Base mount plate
    base_plate = myway_box(0.14, 0.04, 0.06, name=f"{name}_base_plate")
    base_plate.location = (x_pos, HINGE_Y - 0.02, HINGE_Z - 0.04)
    myway_apply_transform(base_plate)
    _bevel_object(base_plate, width=0.004, segments=2)
    myway_assign_material_slot(base_plate, "slot_metal_dark_iron")
    parts.append(base_plate)
    
    # Lid mount plate
    lid_plate = myway_box(0.14, 0.04, 0.06, name=f"{name}_lid_plate")
    lid_plate.location = (x_pos, HINGE_Y + 0.09, HINGE_Z + 0.04)
    myway_apply_transform(lid_plate)
    _bevel_object(lid_plate, width=0.004, segments=2)
    myway_assign_material_slot(lid_plate, "slot_metal_dark_iron")
    parts.append(lid_plate)
    
    # Join all hinge parts
    _select_only(parts[0])
    for p in parts[1:]:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    hinge = bpy.context.view_layer.objects.active
    hinge.name = name
    
    # Add rivets to mount plates
    rivets = []
    for dx in [-0.04, 0.04]:
        for dz in [-0.015, 0.015]:
            rivets.append((x_pos + dx, HINGE_Y - 0.04, HINGE_Z - 0.04 + dz))
            rivets.append((x_pos + dx, HINGE_Y + 0.11, HINGE_Z + 0.04 + dz))
    _add_rivets(hinge, rivets, radius=0.008, height=0.005, name_prefix=f"{name}_r")
    
    return hinge

hinge_left = make_hinge("hinge_left", -HINGE_X)
myway_parent(hinge_left, base_outer)

hinge_right = make_hinge("hinge_right", HINGE_X)
myway_parent(hinge_right, base_outer)

# === LOCK PLATE FRONT ===
myway_print_progress("Creating lock_plate_front...")

lock_plate = myway_box(0.22, 0.015, 0.28, name="lock_plate_front")
lock_plate.location = (0, CHEST_D / 2.0 + 0.005, 0.35)
myway_apply_transform(lock_plate)
_bevel_object(lock_plate, width=0.006, segments=3)
myway_assign_material_slot(lock_plate, "slot_metal_dark_iron")

# Keyhole cutout using boolean
keyhole_cutter = myway_cylinder(0.018, 0.05, name="_keyhole_circle")
keyhole_cutter.rotation_euler = (math.radians(90), 0, 0)
keyhole_cutter.location = (0, CHEST_D / 2.0 + 0.005, 0.38)
myway_apply_transform(keyhole_cutter)

keyhole_rect = myway_box(0.008, 0.05, 0.04, name="_keyhole_rect")
keyhole_rect.location = (0, CHEST_D / 2.0 + 0.005, 0.32)
myway_apply_transform(keyhole_rect)

# Join cutters
_select_only(keyhole_cutter)
keyhole_rect.select_set(True)
bpy.context.view_layer.objects.active = keyhole_cutter
bpy.ops.object.join()
keyhole = bpy.context.view_layer.objects.active

_select_only(lock_plate)
bool_mod = lock_plate.modifiers.new(name="Keyhole", type='BOOLEAN')
bool_mod.operation = 'DIFFERENCE'
bool_mod.object = keyhole
bpy.ops.object.modifier_apply(modifier=bool_mod.name)
bpy.data.objects.remove(keyhole, do_unlink=True)

# Ornamental scrollwork relief (small bumps)
scroll_rivets = []
for dx in [-0.07, 0.07]:
    scroll_rivets.append((dx, CHEST_D / 2.0 + 0.02, 0.48))
    scroll_rivets.append((dx, CHEST_D / 2.0 + 0.02, 0.22))
_add_rivets(lock_plate, scroll_rivets, radius=0.01, height=0.005, name_prefix="lock_r")

myway_parent(lock_plate, base_outer)

# === LOCK HASP ===
myway_print_progress("Creating lock_hasp...")

# Hasp: curved arm that pivots from top of lid front lip
# Pivot at (0, front_of_lid, top_of_front_lip) in world space
# The lid front lip is at Y = lid_offset_y + LID_RADIUS = -0.08 + 0.42 = 0.34
# Top of front lip Z = lid_offset_z + LID_FRONT_LIP_H = 0.70 + 0.15 = 0.85
hasp_pivot_y = lid_offset_y + LID_RADIUS  # 0.34
hasp_pivot_z = lid_offset_z + LID_FRONT_LIP_H  # 0.85

# Build hasp geometry in local space around pivot
hasp_parts = []

# Main hasp arm: curved plate
hasp_arm = myway_box(0.08, 0.012, 0.22, name="_hasp_arm")
hasp_arm.location = (0, 0, -0.11)  # hangs down from pivot
myway_apply_transform(hasp_arm)

# Bend it slightly
_select_only(hasp_arm)
bend = hasp_arm.modifiers.new(name="Bend", type='SIMPLE_DEFORM')
bend.deform_method = 'BEND'
bend.deform_axis = 'X'
bend.angle = math.radians(-15)
bpy.ops.object.modifier_apply(modifier=bend.name)
_bevel_object(hasp_arm, width=0.004, segments=2)
myway_assign_material_slot(hasp_arm, "slot_metal_dark_iron")
hasp_parts.append(hasp_arm)

# Padlock hole at bottom
padlock_hole = myway_torus(0.015, 0.004, major_segments=12, minor_segments=6, name="_hasp_ring")
padlock_hole.location = (0, 0, -0.22)
myway_apply_transform(padlock_hole)
myway_assign_material_slot(padlock_hole, "slot_metal_dark_iron")
hasp_parts.append(padlock_hole)

# Top mounting bracket
hasp_bracket = myway_box(0.1, 0.015, 0.04, name="_hasp_bracket")
hasp_bracket.location = (0, 0, 0.0)
myway_apply_transform(hasp_bracket)
_bevel_object(hasp_bracket, width=0.003, segments=2)
myway_assign_material_slot(hasp_bracket, "slot_metal_dark_iron")
hasp_parts.append(hasp_bracket)

# Join hasp parts
_select_only(hasp_parts[0])
for p in hasp_parts[1:]:
    p.select_set(True)
bpy.context.view_layer.objects.active = hasp_parts[0]
bpy.ops.object.join()
hasp = bpy.context.view_layer.objects.active
hasp.name = "lock_hasp"

# Position hasp at pivot point
hasp.location = (0, hasp_pivot_y + 0.02, hasp_pivot_z)
myway_apply_transform(hasp)

# Set pivot to top of hasp (hinge point)
myway_pivot_at(hasp, (0, hasp_pivot_y + 0.02, hasp_pivot_z))

# Parent to lid
myway_parent(hasp, lid_shell)

# === SIDE HANDLES ===
myway_print_progress("Creating handles...")

def make_handle(name, x_pos):
    """Create a D-shaped side handle with mounting plate."""
    parts = []
    
    # Mounting plate
    plate = myway_box(0.04, 0.14, 0.1, name=f"{name}_plate")
    plate.location = (x_pos, 0, 0.35)
    myway_apply_transform(plate)
    _bevel_object(plate, width=0.004, segments=2)
    myway_assign_material_slot(plate, "slot_metal_dark_iron")
    parts.append(plate)
    
    # D-shaped handle loop using torus
    handle_loop = myway_torus(
        major_radius=0.06,
        minor_radius=0.01,
        major_segments=16,
        minor_segments=6,
        name=f"{name}_loop"
    )
    # Orient torus so the flat side is against the plate, loop protrudes outward
    handle_loop.rotation_euler = (math.radians(90), 0, 0)
    # Position: protrude 0.12m from side, centered on plate
    protrude = 0.12
    handle_loop.location = (x_pos + (protrude * (1 if x_pos > 0 else -1)) * 0.5, 0, 0.35)
    myway_apply_transform(handle_loop)
    
    # Cut the torus in half (keep the outer half - the D loop)
    _select_only(handle_loop)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='DESELECT')
    bpy.ops.object.mode_set(mode='OBJECT')
    
    for v in handle_loop.data.vertices:
        world_x = handle_loop.matrix_world @ v.co
        if (x_pos > 0 and world_x.x < x_pos + 0.01) or (x_pos < 0 and world_x.x > x_pos - 0.01):
            v.select = True
    
    _select_only(handle_loop)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.delete(type='VERT')
    bpy.ops.object.mode_set(mode='OBJECT')
    
    _bevel_object(handle_loop, width=0.003, segments=2)
    myway_assign_material_slot(handle_loop, "slot_metal_dark_iron")
    parts.append(handle_loop)
    
    # Mounting posts (2 short cylinders connecting loop to plate)
    for y_off in [-0.05, 0.05]:
        post = myway_cylinder(0.008, 0.04, name=f"{name}_post_{y_off}")
        post.rotation_euler = (0, math.radians(90), 0)
        post.location = (x_pos + (0.02 if x_pos > 0 else -0.02), y_off, 0.35)
        myway_apply_transform(post)
        myway_assign_material_slot(post, "slot_metal_dark_iron")
        parts.append(post)
    
    # Join
    _select_only(parts[0])
    for p in parts[1:]:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    handle = bpy.context.view_layer.objects.active
    handle.name = name
    
    # Corner rivets on plate
    rivets = []
    for y_off in [-0.05, 0.05]:
        for z_off in [-0.035, 0.035]:
            rivets.append((x_pos + (0.015 if x_pos > 0 else -0.015), y_off, 0.35 + z_off))
    _add_rivets(handle, rivets, radius=0.007, height=0.004, name_prefix=f"{name}_r")
    
    return handle

handle_left = make_handle("handle_left", -CHEST_W / 2.0)
myway_parent(handle_left, base_outer)

handle_right = make_handle("handle_right", CHEST_W / 2.0)
myway_parent(handle_right, base_outer)

# === CORNER BRACKETS ===
myway_print_progress("Creating corner brackets...")

def make_corner_bracket(name, x_sign, y_sign):
    """Create an L-shaped corner bracket at bottom corners."""
    parts = []
    
    bracket_height = 0.18
    bracket_leg = 0.06  # width of each leg
    bracket_thickness = 0.02
    
    x_face = x_sign * CHEST_W / 2.0
    y_face = y_sign * CHEST_D / 2.0
    
    # Leg 1: on front/back face
    leg1 = myway_box(bracket_leg, bracket_thickness, bracket_height, name=f"{name}_leg1")
    leg1.location = (x_face - x_sign * bracket_leg / 2.0, y_face + y_sign * 0.005, bracket_height / 2.0)
    myway_apply_transform(leg1)
    _bevel_object(leg1, width=0.004, segments=2)
    myway_assign_material_slot(leg1, "slot_metal_dark_iron")
    parts.append(leg1)
    
    # Leg 2: on side face
    leg2 = myway_box(bracket_thickness, bracket_leg, bracket_height, name=f"{name}_leg2")
    leg2.location = (x_face + x_sign * 0.005, y_face - y_sign * bracket_leg / 2.0, bracket_height / 2.0)
    myway_apply_transform(leg2)
    _bevel_object(leg2, width=0.004, segments=2)
    myway_assign_material_slot(leg2, "slot_metal_dark_iron")
    parts.append(leg2)
    
    # Join
    _select_only(parts[0])
    for p in parts[1:]:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    bracket = bpy.context.view_layer.objects.active
    bracket.name = name
    
    # Rivets: two per leg
    rivets = []
    for z in [0.04, 0.14]:
        rivets.append((x_face - x_sign * bracket_leg / 2.0, y_face + y_sign * 0.015, z))
        rivets.append((x_face + x_sign * 0.015, y_face - y_sign * bracket_leg / 2.0, z))
    _add_rivets(bracket, rivets, radius=0.008, height=0.005, name_prefix=f"{name}_r")
    
    return bracket

corner_bracket_fl = make_corner_bracket("corner_bracket_fl", -1, 1)
myway_parent(corner_bracket_fl, base_outer)

corner_bracket_fr = make_corner_bracket("corner_bracket_fr", 1, 1)
myway_parent(corner_bracket_fr, base_outer)

corner_bracket_bl = make_corner_bracket("corner_bracket_bl", -1, -1)
myway_parent(corner_bracket_bl, base_outer)

corner_bracket_br = make_corner_bracket("corner_bracket_br", 1, -1)
myway_parent(corner_bracket_br, base_outer)

# === LID TOP ORNAMENT ===
myway_print_progress("Creating lid_top_ornament...")

# Position at lid apex: top of dome
# Dome center: (0, lid_dome_center_y, lid_dome_center_z)
# Apex: (0, lid_dome_center_y, lid_dome_center_z + LID_RADIUS)
apex_y = lid_dome_center_y
apex_z = lid_dome_center_z + LID_RADIUS

ornament_parts = []

# Central dome boss
boss = myway_sphere(0.04, name="_ornament_boss")
boss.location = (0, apex_y, apex_z + 0.02)
myway_apply_transform(boss)
boss.scale.z = 0.5
myway_apply_transform(boss)
_bevel_object(boss, width=0.003, segments=2)
myway_assign_material_slot(boss, "slot_metal_dark_iron")
ornament_parts.append(boss)

# Base plate for ornament
orn_plate = myway_cylinder(0.06, 0.015, name="_ornament_plate")
orn_plate.rotation_euler = (math.radians(90), 0, 0)
orn_plate.location = (0, apex_y, apex_z + 0.005)
myway_apply_transform(orn_plate)
_bevel_object(orn_plate, width=0.003, segments=2)
myway_assign_material_slot(orn_plate, "slot_metal_dark_iron")
ornament_parts.append(orn_plate)

# Four surrounding rivets in square pattern
for dx in [-0.05, 0.05]:
    for dy in [-0.05, 0.05]:
        r = myway_sphere(0.012, name=f"_orn_rivet_{dx}_{dy}")
        r.location = (dx, apex_y + dy, apex_z + 0.01)
        myway_apply_transform(r)
        r.scale.z = 0.5
        myway_apply_transform(r)
        _bevel_object(r, width=0.002, segments=1)
        myway_assign_material_slot(r, "slot_metal_dark_iron")
        ornament_parts.append(r)

# Join
_select_only(ornament_parts[0])
for p in ornament_parts[1:]:
    p.select_set(True)
bpy.context.view_layer.objects.active = ornament_parts[0]
bpy.ops.object.join()
ornament = bpy.context.view_layer.objects.active
ornament.name = "lid_top_ornament"

myway_parent(ornament, lid_shell)

# === FINALIZE ===
myway_print_progress("Grounding and normalizing...")

# Ground the asset
myway_ground_asset(base_outer)

# Normalize to 2.0m target extent
myway_normalize_extent(2.0, base_outer)

# Set chest_base_body as the root parent for clean hierarchy
# (all other parts are already parented to base_outer or lid_shell)

myway_print_progress("Treasure chest build complete.")
myway_print_progress(f"Parts created: {len(bpy.data.objects)} objects")

# ---------------------------------------------------------------------------
# Trusted MyWay export, validation and benchmark inspection footer.
# Version: myway_blender_foundry_inspection_v2
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
    extent = max(dimensions + [0.5])
    return minimum, maximum, center, dimensions, extent

_myway_min, _myway_max, _myway_center, _myway_dimensions, _myway_extent = _myway_bounds(_myway_meshes)

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
_myway_required_names = [
    str(part.get("part_id"))
    for part in _myway_parts
    if isinstance(part, dict) and part.get("required") is not False
]
_myway_missing_parts = [
    name for name in _myway_required_names
    if name not in _myway_object_names
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
        "benchmark_ready" if _myway_quality_score >= 90 else
        "strong" if _myway_quality_score >= 78 else
        "developing" if _myway_quality_score >= 60 else
        "needs_revision"
    ),
    "asset_class": _myway_asset_class,
    "findings": _myway_quality_findings,
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
        _myway_center.x + _myway_extent * 1.8,
        _myway_center.y - _myway_extent * 2.2,
        _myway_center.z + _myway_extent * 1.35,
    ))
    camera = bpy.context.object
    camera.name = "MyWayInspectionCamera"
    camera.data.lens = 52
    bpy.context.scene.camera = camera
    return camera

def _myway_point_camera(camera, x, y, z):
    camera.location = (
        _myway_center.x + _myway_extent * x,
        _myway_center.y + _myway_extent * y,
        _myway_center.z + _myway_extent * z,
    )
    direction = _myway_center - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()

def _myway_add_fallback_lights():
    environment = _MYWAY_RESOURCE_MANIFEST.get("environment") or {}
    if environment.get("environment_path"):
        return []
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
        light.data.energy = energy
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
        text_obj.data.size = max(_myway_extent * 0.035, 0.02)
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
