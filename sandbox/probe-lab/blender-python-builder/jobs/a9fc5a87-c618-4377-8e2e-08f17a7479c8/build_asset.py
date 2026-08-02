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

import bpy
import math
from mathutils import Vector, Matrix

# ============================================================
# Wheelchair Asset Script
# ============================================================

myway_reset_scene()

# Material slots
myway_material_slot("mat_metal_frame")
myway_material_slot("mat_rubber_tire")
myway_material_slot("mat_metal_rim")
myway_material_slot("mat_fabric_seat")

myway_print_progress("MYWAY_PROGRESS: Materials initialized")

# ============================================================
# Helper: Tube between points
# ============================================================
def make_tube(name, p1, p2, radius, mat_slot="mat_metal_frame"):
    obj = myway_tube_between_points(p1, p2, radius, resolution=12)
    obj.name = name
    myway_assign_material_slot(obj, mat_slot)
    myway_generate_uvs(obj)
    return obj

def make_box_part(name, size, location, mat_slot="mat_metal_frame"):
    obj = myway_box(size[0], size[1], size[2])
    obj.name = name
    obj.location = location
    myway_assign_material_slot(obj, mat_slot)
    myway_generate_uvs(obj)
    return obj

def make_cyl_part(name, radius, depth, location, rotation=(0,0,0), mat_slot="mat_metal_frame", verts=16):
    obj = myway_cylinder(radius, depth, vertices=verts)
    obj.name = name
    obj.location = location
    obj.rotation_euler = rotation
    myway_assign_material_slot(obj, mat_slot)
    myway_generate_uvs(obj)
    return obj

# ============================================================
# Dimensions (meters)
# ============================================================
W = 0.42  # half width between side frames
HL = 0.55  # seat length
HB = 0.45  # backrest height
SZ = 0.50  # seat height
TR = 0.30  # rear wheel radius
CR = 0.08  # caster wheel radius
TRad = 0.025 # tube radius

# ============================================================
# Frame Main
# ============================================================
myway_print_progress("MYWAY_PROGRESS: Building frame_main")

frame_parts = []

# Seat rails (left/right)
for side, x in [("L", -W), ("R", W)]:
    rail = make_tube(f"frame_seat_rail_{side}", (x, -HL/2, SZ), (x, HL/2, SZ), TRad)
    frame_parts.append(rail)

# Backrest uprights
for side, x in [("L", -W), ("R", W)]:
    up = make_tube(f"frame_backrest_up_{side}", (x, HL/2, SZ), (x, HL/2, SZ+HB), TRad)
    frame_parts.append(up)

# Backrest top bar
top_bar = make_tube("frame_backrest_top", (-W, HL/2, SZ+HB), (W, HL/2, SZ+HB), TRad)
frame_parts.append(top_bar)

# Front uprights (caster mounts)
for side, x in [("L", -W), ("R", W)]:
    fu = make_tube(f"frame_front_up_{side}", (x, -HL/2, SZ), (x, -HL/2, SZ*0.45), TRad)
    frame_parts.append(fu)

# Rear axle uprights
for side, x in [("L", -W), ("R", W)]:
    ru = make_tube(f"frame_rear_up_{side}", (x, HL/2-0.05, SZ), (x, HL/2-0.05, TR), TRad)
    frame_parts.append(ru)

# Push handles (curved up from backrest top)
for side, x in [("L", -W), ("R", W)]:
    ph = make_tube(f"frame_push_handle_{side}", (x, HL/2, SZ+HB), (x, HL/2+0.12, SZ+HB+0.10), TRad)
    frame_parts.append(ph)
    # Handle grip cylinder
    grip = make_cyl_part(f"frame_handle_grip_{side}", 0.028, 0.12, (x, HL/2+0.12, SZ+HB+0.10), rotation=(math.radians(90),0,0), verts=12)
    frame_parts.append(grip)

# Bottom front connector
bc = make_tube("frame_bottom_front", (-W, -HL/2, SZ*0.45), (W, -HL/2, SZ*0.45), TRad*0.8)
frame_parts.append(bc)

# Bottom rear connector
brc = make_tube("frame_bottom_rear", (-W, HL/2-0.05, SZ*0.45), (W, HL/2-0.05, SZ*0.45), TRad*0.8)
frame_parts.append(brc)

# Join all frame parts into frame_main
myway_activate(frame_parts[0])
for p in frame_parts[1:]:
    p.select_set(True)
frame_main = myway_join(frame_parts[0])
frame_main.name = "frame_main"
myway_bevel_relative(frame_main, 0.02)
myway_smooth(frame_main)

# ============================================================
# Cross Braces (folding mechanism)
# ============================================================
myway_print_progress("MYWAY_PROGRESS: Building cross braces")

# Left cross brace: from front-left-bottom to rear-right-bottom
cb_l_parts = []
p1_l = Vector((-W, -HL/2+0.05, SZ*0.3))
p2_l = Vector((W, HL/2-0.1, SZ*0.3))
mid_l = (p1_l + p2_l) / 2
t1 = make_tube("cb_l_a", p1_l, mid_l, TRad*0.6)
t2 = make_tube("cb_l_b", mid_l, p2_l, TRad*0.6)
cb_l_parts.extend([t1, t2])
# Center pivot bushing
bush_l = make_cyl_part("cb_l_bush", 0.02, 0.04, mid_l, rotation=(math.radians(90),0,0), verts=12)
cb_l_parts.append(bush_l)
myway_activate(cb_l_parts[0])
for p in cb_l_parts[1:]:
    p.select_set(True)
cb_l = myway_join(cb_l_parts[0])
cb_l.name = "frame_cross_brace_left"
myway_pivot_at(cb_l, mid_l)

# Right cross brace: from front-right-bottom to rear-left-bottom
cb_r_parts = []
p1_r = Vector((W, -HL/2+0.05, SZ*0.3))
p2_r = Vector((-W, HL/2-0.1, SZ*0.3))
mid_r = (p1_r + p2_r) / 2
t3 = make_tube("cb_r_a", p1_r, mid_r, TRad*0.6)
t4 = make_tube("cb_r_b", mid_r, p2_r, TRad*0.6)
cb_r_parts.extend([t3, t4])
bush_r = make_cyl_part("cb_r_bush", 0.02, 0.04, mid_r, rotation=(math.radians(90),0,0), verts=12)
cb_r_parts.append(bush_r)
myway_activate(cb_r_parts[0])
for p in cb_r_parts[1:]:
    p.select_set(True)
cb_r = myway_join(cb_r_parts[0])
cb_r.name = "frame_cross_brace_right"
myway_pivot_at(cb_r, mid_r)

# ============================================================
# Rear Wheels
# ============================================================
myway_print_progress("MYWAY_PROGRESS: Building rear wheels")

def build_wheel(name, hub_x, tire_radius=TR):
    parts = []
    # Tire (torus)
    tire = myway_torus(tire_radius, tire_radius*0.08, major_segments=32, minor_segments=12)
    tire.name = f"{name}_tire"
    tire.location = (hub_x, 0, tire_radius)
    tire.rotation_euler = (math.radians(90), 0, 0)
    myway_assign_material_slot(tire, "mat_rubber_tire")
    myway_generate_uvs(tire)
    parts.append(tire)
    
    # Rim (inner torus)
    rim = myway_torus(tire_radius*0.92, tire_radius*0.025, major_segments=32, minor_segments=8)
    rim.name = f"{name}_rim"
    rim.location = (hub_x, 0, tire_radius)
    rim.rotation_euler = (math.radians(90), 0, 0)
    myway_assign_material_slot(rim, "mat_metal_rim")
    myway_generate_uvs(rim)
    parts.append(rim)
    
    # Hub
    hub = make_cyl_part(f"{name}_hub", 0.04, 0.06, (hub_x, 0, tire_radius), rotation=(0, math.radians(90), 0), verts=16)
    parts.append(hub)
    
    # Spokes
    n_spokes = 12
    for i in range(n_spokes):
        ang = (2 * math.pi / n_spokes) * i
        sx = math.cos(ang) * tire_radius * 0.85
        sz = math.sin(ang) * tire_radius * 0.85
        spoke = make_tube(f"{name}_spoke_{i}", (hub_x, 0, tire_radius), (hub_x, sx, tire_radius+sz), 0.005)
        parts.append(spoke)
    
    # Join into wheel object
    myway_activate(parts[0])
    for p in parts[1:]:
        p.select_set(True)
    wheel = myway_join(parts[0])
    wheel.name = name
    # Pivot at hub center
    myway_pivot_at(wheel, (hub_x, 0, tire_radius))
    return wheel

wheel_l = build_wheel("wheel_rear_left", -W - 0.04)
wheel_r = build_wheel("wheel_rear_right", W + 0.04)

# ============================================================
# Hand Rims
# ============================================================
myway_print_progress("MYWAY_PROGRESS: Building hand rims")

def build_hand_rim(name, x):
    parts = []
    # Main rim tube
    rim = myway_torus(TR*0.85, 0.012, major_segments=32, minor_segments=8)
    rim.name = f"{name}_rim"
    rim.location = (x, 0, TR)
    rim.rotation_euler = (math.radians(90), 0, 0)
    myway_assign_material_slot(rim, "mat_metal_rim")
    myway_generate_uvs(rim)
    parts.append(rim)
    
    # Standoff brackets (4 small tubes connecting rim to wheel hub plane)
    for i in range(4):
        ang = (2 * math.pi / 4) * i + math.pi/4
        sx = math.cos(ang) * TR * 0.85
        sz = math.sin(ang) * TR * 0.85
        # standoff from rim inward to wheel plane
        standoff = make_tube(f"{name}_standoff_{i}", (x, sx, TR+sz), (x - (0.04 if x < 0 else -0.04), sx, TR+sz), 0.006)
        parts.append(standoff)
    
    myway_activate(parts[0])
    for p in parts[1:]:
        p.select_set(True)
    hr = myway_join(parts[0])
    hr.name = name
    myway_pivot_at(hr, (x, 0, TR))
    return hr

hr_l = build_hand_rim("hand_rim_left", -W - 0.08)
hr_r = build_hand_rim("hand_rim_right", W + 0.08)

# ============================================================
# Caster Assemblies
# ============================================================
myway_print_progress("MYWAY_PROGRESS: Building caster assemblies")

def build_caster(name, x, y):
    parts = []
    # Swivel stem
    stem = make_cyl_part(f"{name}_stem", 0.015, 0.06, (x, y, SZ*0.45), verts=12)
    parts.append(stem)
    
    # Fork
    fork_y = y - 0.02
    fork_l = make_tube(f"{name}_fork_l", (x-0.025, fork_y, SZ*0.42), (x-0.025, fork_y, SZ*0.42 - 0.06), 0.008)
    fork_r = make_tube(f"{name}_fork_r", (x+0.025, fork_y, SZ*0.42), (x+0.025, fork_y, SZ*0.42 - 0.06), 0.008)
    parts.extend([fork_l, fork_r])
    
    # Caster wheel (small torus)
    cw_z = SZ*0.42 - 0.06 - CR
    cw = myway_torus(CR, CR*0.1, major_segments=16, minor_segments=8)
    cw.name = f"{name}_wheel"
    cw.location = (x, fork_y, cw_z)
    cw.rotation_euler = (0, math.radians(90), 0)
    myway_assign_material_slot(cw, "mat_rubber_tire")
    myway_generate_uvs(cw)
    parts.append(cw)
    
    # Caster hub
    ch = make_cyl_part(f"{name}_hub", 0.01, 0.05, (x, fork_y, cw_z), rotation=(0, math.radians(90), 0), verts=12)
    parts.append(ch)
    
    myway_activate(parts[0])
    for p in parts[1:]:
        p.select_set(True)
    caster = myway_join(parts[0])
    caster.name = name
    # Pivot at swivel stem top
    myway_pivot_at(caster, (x, y, SZ*0.45))
    return caster

caster_l = build_caster("caster_assembly_front_left", -W+0.02, -HL/2)
caster_r = build_caster("caster_assembly_front_right", W-0.02, -HL/2)

# ============================================================
# Seat Sling & Backrest Sling
# ============================================================
myway_print_progress("MYWAY_PROGRESS: Building fabric slings")

# Seat sling - slightly curved box
seat = myway_box(W*2 - 0.02, HL - 0.04, 0.01)
seat.name = "seat_sling"
seat.location = (0, 0, SZ - 0.005)
# Slight sag in middle via simple scale Z manipulation (stylized)
myway_assign_material_slot(seat, "mat_fabric_seat")
myway_generate_uvs(seat)
myway_box_uv(seat)

# Backrest sling
back = myway_box(W*2 - 0.02, 0.01, HB - 0.04)
back.name = "backrest_sling"
back.location = (0, HL/2 - 0.005, SZ + HB/2)
myway_assign_material_slot(back, "mat_fabric_seat")
myway_generate_uvs(back)
myway_box_uv(back)

# ============================================================
# Armrests
# ============================================================
myway_print_progress("MYWAY_PROGRESS: Building armrests")

def build_armrest(name, x):
    parts = []
    # Support post
    post = make_tube(f"{name}_post", (x, -HL/4, SZ), (x, -HL/4, SZ+0.20), TRad*0.7)
    parts.append(post)
    # Arm bar
    bar = make_tube(f"{name}_bar", (x, -HL/4, SZ+0.20), (x, HL/4-0.05, SZ+0.20), TRad*0.7)
    parts.append(bar)
    # Grip pad
    pad = make_box_part(f"{name}_pad", (0.04, HL/2, 0.015), (x, HL/8, SZ+0.20))
    parts.append(pad)
    
    myway_activate(parts[0])
    for p in parts[1:]:
        p.select_set(True)
    ar = myway_join(parts[0])
    ar.name = name
    return ar

arm_l = build_armrest("armrest_left", -W - 0.03)
arm_r = build_armrest("armrest_right", W + 0.03)

# ============================================================
# Footrests
# ============================================================
myway_print_progress("MYWAY_PROGRESS: Building footrests")

def build_footrest(name, x):
    parts = []
    # Swing-away arm
    arm_top = (x, -HL/2, SZ*0.45)
    arm_bot = (x, -HL/2 - 0.08, SZ*0.15)
    arm = make_tube(f"{name}_arm", arm_top, arm_bot, TRad*0.7)
    parts.append(arm)
    # Footplate
    plate = make_box_part(f"{name}_plate", (0.12, 0.10, 0.008), (x, -HL/2 - 0.14, SZ*0.15))
    parts.append(plate)
    # Support strut
    strut = make_tube(f"{name}_strut", arm_bot, (x, -HL/2 - 0.14, SZ*0.15), TRad*0.5)
    parts.append(strut)
    
    myway_activate(parts[0])
    for p in parts[1:]:
        p.select_set(True)
    fr = myway_join(parts[0])
    fr.name = name
    # Pivot at swing-away joint
    myway_pivot_at(fr, arm_top)
    return fr

foot_l = build_footrest("footrest_left", -W*0.5)
foot_r = build_footrest("footrest_right", W*0.5)

# ============================================================
# Brake Levers
# ============================================================
myway_print_progress("MYWAY_PROGRESS: Building brake levers")

def build_brake(name, x):
    parts = []
    # Mount block
    mount = make_box_part(f"{name}_mount", (0.02, 0.03, 0.02), (x, HL/4, SZ+0.02))
    parts.append(mount)
    # Lever bar
    lever = make_tube(f"{name}_lever", (x, HL/4, SZ+0.03), (x, HL/4 + 0.10, SZ+0.03), TRad*0.6)
    parts.append(lever)
    # Lever tip
    tip = make_tube(f"{name}_tip", (x, HL/4 + 0.10, SZ+0.03), (x, HL/4 + 0.10, SZ-0.02), TRad*0.6)
    parts.append(tip)
    
    myway_activate(parts[0])
    for p in parts[1:]:
        p.select_set(True)
    bl = myway_join(parts[0])
    bl.name = name
    # Pivot at lock pivot
    myway_pivot_at(bl, (x, HL/4, SZ+0.03))
    return bl

brake_l = build_brake("brake_lever_left", -W - 0.02)
brake_r = build_brake("brake_lever_right", W + 0.02)

# ============================================================
# Parenting / Hierarchy
# ============================================================
myway_print_progress("MYWAY_PROGRESS: Assembling hierarchy")

# Parent wheels to hand rims first (hand rim parented to wheel per brief)
myway_parent_keep_transform(hr_l, wheel_l)
myway_parent_keep_transform(hr_r, wheel_r)

# Parent everything to frame_main
children_of_frame = [
    cb_l, cb_r,
    wheel_l, wheel_r,
    caster_l, caster_r,
    seat, back,
    arm_l, arm_r,
    foot_l, foot_r,
    brake_l, brake_r
]

for child in children_of_frame:
    myway_parent_keep_transform(child, frame_main)

# ============================================================
# Ground & Normalize
# ============================================================
myway_print_progress("MYWAY_PROGRESS: Grounding and normalizing")

myway_ground_asset(frame_main)
myway_normalize_extent(2.0, frame_main)

myway_print_progress("MYWAY_PROGRESS: Wheelchair asset complete")

# ---------------------------------------------------------------------------
# Trusted MyWay export, validation and benchmark inspection footer.
# Version: myway_blender_foundry_inspection_v3
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
