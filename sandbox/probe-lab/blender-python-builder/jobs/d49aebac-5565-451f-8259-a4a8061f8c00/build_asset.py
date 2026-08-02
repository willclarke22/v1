import bpy
import mathutils

# ---------------------------------------------------------------------------
# Trusted MyWay Blender Asset Foundry helper library.
# Version: myway_blender_foundry_helpers_v2
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

def myway_ground_asset(objects=None):
    targets = objects or [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not targets:
        return targets
    lowest = float("inf")
    for obj in targets:
        for corner in obj.bound_box:
            world = obj.matrix_world @ mathutils.Vector(corner)
            lowest = min(lowest, world.z)
    if lowest != float("inf"):
        for obj in targets:
            if obj.parent is None:
                obj.location.z -= lowest
    return targets

def myway_normalize_extent(target_extent, objects=None):
    targets = objects or [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not targets:
        return targets
    minimum = [float("inf")] * 3
    maximum = [float("-inf")] * 3
    for obj in targets:
        for corner in obj.bound_box:
            world = obj.matrix_world @ mathutils.Vector(corner)
            for index in range(3):
                minimum[index] = min(minimum[index], world[index])
                maximum[index] = max(maximum[index], world[index])
    extent = max(maximum[index] - minimum[index] for index in range(3))
    if extent <= 0.000001:
        return targets
    scale = float(target_extent) / extent
    for obj in targets:
        if obj.parent is None:
            obj.scale *= scale
    for obj in targets:
        myway_apply_transform(obj, scale=True)
    myway_ground_asset(targets)
    return targets

def myway_print_progress(message):
    print("MYWAY_PROGRESS:" + str(message))

"""
Treasure Chest — Stylized Wooden Chest with Curved Lid, Metal Bands, Hardware
Asset: treasure_chest_stylized_001
Target extent: 2m (1.6 x 1.0 x 1.2)
"""

import bpy
import bmesh
import math
from mathutils import Vector, Matrix

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')

def _deselect_all():
    bpy.ops.object.select_all(action='DESELECT')

def _select_active(obj):
    _deselect_all()
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

def _apply_all_modifiers(obj):
    _ensure_object_mode()
    _select_active(obj)
    for m in list(obj.modifiers):
        try:
            bpy.ops.object.modifier_apply(modifier=m.name)
        except Exception:
            pass

def _join_objects(target, sources):
    _ensure_object_mode()
    _deselect_all()
    for s in sources:
        if s and s.name in bpy.data.objects:
            s.select_set(True)
    if target and target.name in bpy.data.objects:
        target.select_set(True)
        bpy.context.view_layer.objects.active = target
    else:
        if sources:
            bpy.context.view_layer.objects.active = sources[0]
    bpy.ops.object.join()

def _set_origin(obj, location):
    _ensure_object_mode()
    _select_active(obj)
    obj.location = location

def _set_pivot(obj, pivot_world):
    """Set object origin to a world-space pivot by translating geometry."""
    _ensure_object_mode()
    _select_active(obj)
    cur_loc = obj.matrix_world.translation.copy()
    delta = Vector(pivot_world) - cur_loc
    obj.location = Vector(pivot_world)
    # Move mesh data in opposite direction
    mesh = obj.data
    for v in mesh.vertices:
        v.co += obj.matrix_world.inverted() @ (cur_loc - Vector(pivot_world))

def _make_box(name, size, location=(0,0,0)):
    sx, sy, sz = size
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (sx, sy, sz)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return obj

def _make_cylinder(name, radius, depth, location=(0,0,0), rotation=(0,0,0), verts=32):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=verts, radius=radius, depth=depth,
        location=location, rotation=rotation
    )
    obj = bpy.context.active_object
    obj.name = name
    return obj

def _make_torus(name, major_r, minor_r, location=(0,0,0), rotation=(0,0,0),
                major_seg=24, minor_seg=12):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_r, minor_radius=minor_r,
        major_segments=major_seg, minor_segments=minor_seg,
        location=location, rotation=rotation
    )
    obj = bpy.context.active_object
    obj.name = name
    return obj

def _bevel_object(obj, width=0.015, segments=2):
    _ensure_object_mode()
    _select_active(obj)
    mod = obj.modifiers.new(name="Bevel", type='BEVEL')
    mod.width = width
    mod.segments = segments
    mod.limit_method = 'ANGLE'
    mod.angle_limit = math.radians(35)
    _apply_all_modifiers(obj)

def _shade_smooth(obj):
    _ensure_object_mode()
    _select_active(obj)
    bpy.ops.object.shade_smooth()

def _shade_flat(obj):
    _ensure_object_mode()
    _select_active(obj)
    bpy.ops.object.shade_flat()

def _assign_mat(obj, slot_id):
    myway_assign_material_slot(obj, slot_id)

def _generate_uvs(obj):
    myway_generate_uvs(obj)

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

myway_reset_scene()

# Material slots
myway_material_slot("wood_primary")
myway_material_slot("metal_dark")
myway_material_slot("metal_hardware")

# Dimensions (meters)
CHEST_W = 1.6    # X
CHEST_D = 1.0    # Y
BASE_H = 0.55    # Z base height
LID_R = 0.45     # lid radius (half-cylinder)
LID_LEN = CHEST_W  # lid spans full width
WALL_T = 0.05    # wall thickness

# Pivot at back top edge of base
PIVOT_X = 0.0
PIVOT_Y = -CHEST_D / 2
PIVOT_Z = BASE_H

myway_print_progress("Building chest_base...")

# === CHEST BASE ===
# Outer shell
base_outer = _make_box("chest_base", (CHEST_W, CHEST_D, BASE_H), (0, 0, BASE_H/2))

# Hollow interior via boolean
inner = _make_box("_inner_void",
                  (CHEST_W - 2*WALL_T, CHEST_D - 2*WALL_T, BASE_H - WALL_T),
                  (0, 0, WALL_T + (BASE_H - WALL_T)/2 + 0.01))

_ensure_object_mode()
_select_active(base_outer)
bool_mod = base_outer.modifiers.new(name="Hollow", type='BOOLEAN')
bool_mod.operation = 'DIFFERENCE'
bool_mod.object = inner
_apply_all_modifiers(base_outer)
bpy.data.objects.remove(inner, do_unlink=True)

# Recessed top lip — cut a shallow inset on top
lip_cutter = _make_box("_lip_cutter",
                       (CHEST_W - 2*WALL_T, CHEST_D - 2*WALL_T, 0.04),
                       (0, 0, BASE_H - 0.02))
_select_active(base_outer)
bool_mod = base_outer.modifiers.new(name="LipRecess", type='BOOLEAN')
bool_mod.operation = 'DIFFERENCE'
bool_mod.object = lip_cutter
_apply_all_modifiers(base_outer)
bpy.data.objects.remove(lip_cutter, do_unlink=True)

# Plank seams — create thin inset grooves on front and back
for sign in [1, -1]:
    for i in range(1, 4):
        y_pos = sign * (CHEST_D/2 + 0.001)
        z_pos = BASE_H * i / 4
        seam = _make_box(f"_seam_{sign}_{i}", (CHEST_W - 0.1, 0.008, 0.004),
                        (0, y_pos, z_pos))
        _select_active(base_outer)
        bm = base_outer.modifiers.new(name=f"Seam{sign}{i}", type='BOOLEAN')
        bm.operation = 'DIFFERENCE'
        bm.object = seam
        _apply_all_modifiers(base_outer)
        bpy.data.objects.remove(seam, do_unlink=True)

_bevel_object(base_outer, width=0.012, segments=2)
_assign_mat(base_outer, "wood_primary")
_generate_uvs(base_outer)
myway_print_progress("chest_base complete")

# === LID SHELL ===
myway_print_progress("Building lid_shell...")

# Build lid as a half-cylinder shell
# Create full cylinder then cut to half
bpy.ops.mesh.primitive_cylinder_add(
    vertices=48, radius=LID_R, depth=LID_LEN,
    location=(0, 0, 0), rotation=(0, math.radians(90), 0)
)
lid_full = bpy.context.active_object
lid_full.name = "lid_shell"

# Cut bottom half away (keep upper half)
cutter = _make_box("_lid_cutter", (LID_LEN + 0.2, CHEST_D + 0.2, LID_R * 2),
                   (0, 0, -LID_R))
_select_active(lid_full)
bm = lid_full.modifiers.new(name="HalfCut", type='BOOLEAN')
bm.operation = 'DIFFERENCE'
bm.object = cutter
_apply_all_modifiers(lid_full)
bpy.data.objects.remove(cutter, do_unlink=True)

# Hollow the lid shell
lid_inner = _make_cylinder("_lid_inner_void", LID_R - WALL_T, LID_LEN - 0.02,
                           rotation=(0, math.radians(90), 0), verts=48)
_select_active(lid_full)
bm = lid_full.modifiers.new(name="LidHollow", type='BOOLEAN')
bm.operation = 'DIFFERENCE'
bm.object = lid_inner
_apply_all_modifiers(lid_full)
bpy.data.objects.remove(lid_inner, do_unlink=True)

# Flatten the back face (flat back per spec)
back_cutter = _make_box("_back_cut", (0.1, 0.15, LID_R * 2 + 0.1),
                        (0, -CHEST_D/2 - 0.05, 0))
_select_active(lid_full)
bm = lid_full.modifiers.new(name="FlatBack", type='BOOLEAN')
bm.operation = 'DIFFERENCE'
bm.object = back_cutter
_apply_all_modifiers(lid_full)
bpy.data.objects.remove(back_cutter, do_unlink=True)

# Overhanging front edge — extend front slightly
front_ext = _make_box("_front_ext", (LID_LEN, 0.04, 0.06),
                      (0, CHEST_D/2 + 0.02, -0.02))
_select_active(lid_full)
bm = lid_full.modifiers.new(name="FrontExt", type='BOOLEAN')
bm.operation = 'UNION'
bm.object = front_ext
_apply_all_modifiers(lid_full)
bpy.data.objects.remove(front_ext, do_unlink=True)

# Position lid: pivot at back top edge of base
# The lid's flat bottom should sit at z=BASE_H, back at y=-CHEST_D/2
# Currently lid centered at origin with flat side down
# Move so flat bottom is at z=BASE_H and back edge at y=-CHEST_D/2
lid_full.location = (0, -CHEST_D/2 + 0.0, BASE_H)
bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)

# Now set pivot to back top edge
_set_pivot(lid_full, (PIVOT_X, PIVOT_Y, PIVOT_Z))

_bevel_object(lid_full, width=0.01, segments=2)
_shade_smooth(lid_full)
_assign_mat(lid_full, "wood_primary")
_generate_uvs(lid_full)
myway_print_progress("lid_shell complete")

# === METAL BANDS BASE ===
myway_print_progress("Building metal_bands_base...")
band_parts = []

# Two horizontal wrapping bands on the base
for z_frac in [0.25, 0.75]:
    z_pos = z_frac * BASE_H
    # Front band segment
    band_front = _make_box(f"_band_f_{z_frac}",
                           (CHEST_W + 0.02, 0.06, 0.08),
                           (0, CHEST_D/2 + 0.005, z_pos))
    band_parts.append(band_front)
    # Back band segment
    band_back = _make_box(f"_band_b_{z_frac}",
                          (CHEST_W + 0.02, 0.06, 0.08),
                          (0, -CHEST_D/2 - 0.005, z_pos))
    band_parts.append(band_back)
    # Side band segments
    for sx in [1, -1]:
        band_side = _make_box(f"_band_s_{z_frac}_{sx}",
                              (0.06, CHEST_D + 0.02, 0.08),
                              (sx * CHEST_W/2 + 0.005 * sx, 0, z_pos))
        band_parts.append(band_side)

# Rivets along bands
rivet_objs = []
for z_frac in [0.25, 0.75]:
    z_pos = z_frac * BASE_H
    for x in [-0.7, -0.35, 0, 0.35, 0.7]:
        for sy in [1, -1]:
            riv = _make_cylinder(f"_rivet_b_{z_frac}_{x}_{sy}",
                                0.018, 0.025,
                                location=(x, sy * (CHEST_D/2 + 0.04), z_pos),
                                rotation=(math.radians(90), 0, 0),
                                verts=12)
            rivet_objs.append(riv)

# Join all band parts
if band_parts:
    _join_objects(band_parts[0], band_parts[1:])
    metal_bands_base = band_parts[0]
    metal_bands_base.name = "metal_bands_base"
else:
    metal_bands_base = _make_box("metal_bands_base", (0.01, 0.01, 0.01))

# Join rivets into bands
if rivet_objs:
    _join_objects(metal_bands_base, rivet_objs)

_bevel_object(metal_bands_base, width=0.004, segments=1)
_assign_mat(metal_bands_base, "metal_dark")
_generate_uvs(metal_bands_base)
myway_print_progress("metal_bands_base complete")

# === METAL BANDS LID ===
myway_print_progress("Building metal_bands_lid...")
lid_band_parts = []

# Vertical bands wrapping the curved lid — 3 bands
for x_pos in [-0.5, 0.0, 0.5]:
    # Create a curved band following the lid radius
    # Use a thin torus segment or curved strip
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=32, radius=LID_R + 0.005, depth=0.08,
        location=(x_pos, 0, 0), rotation=(0, math.radians(90), 0)
    )
    band = bpy.context.active_object
    band.name = f"_lid_band_{x_pos}"
    
    # Cut to half (upper)
    cutter = _make_box(f"_lbc_{x_pos}", (0.2, CHEST_D + 0.2, LID_R * 2),
                       (x_pos, 0, -LID_R))
    _select_active(band)
    bm = band.modifiers.new(name="HalfCut", type='BOOLEAN')
    bm.operation = 'DIFFERENCE'
    bm.object = cutter
    _apply_all_modifiers(band)
    bpy.data.objects.remove(cutter, do_unlink=True)
    
    # Cut to lid width (trim ends)
    end_cut = _make_box(f"_lec_{x_pos}", (0.2, 0.2, LID_R * 2 + 0.2),
                        (x_pos, CHEST_D/2 + 0.05, 0))
    _select_active(band)
    bm = band.modifiers.new(name="EndCut1", type='BOOLEAN')
    bm.operation = 'DIFFERENCE'
    bm.object = end_cut
    _apply_all_modifiers(band)
    bpy.data.objects.remove(end_cut, do_unlink=True)
    
    end_cut2 = _make_box(f"_lec2_{x_pos}", (0.2, 0.2, LID_R * 2 + 0.2),
                         (x_pos, -CHEST_D/2 - 0.15, 0))
    _select_active(band)
    bm = band.modifiers.new(name="EndCut2", type='BOOLEAN')
    bm.operation = 'DIFFERENCE'
    bm.object = end_cut2
    _apply_all_modifiers(band)
    bpy.data.objects.remove(end_cut2, do_unlink=True)
    
    # Position relative to lid pivot
    band.location = (x_pos, -CHEST_D/2, BASE_H)
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
    _set_pivot(band, (PIVOT_X, PIVOT_Y, PIVOT_Z))
    lid_band_parts.append(band)

# Rivets on lid bands
lid_rivets = []
for x_pos in [-0.5, 0.0, 0.5]:
    for angle_frac in [0.2, 0.5, 0.8]:
        angle = math.pi * angle_frac  # 0 to pi for upper half
        ry = -math.cos(angle) * (LID_R + 0.02)
        rz = math.sin(angle) * (LID_R + 0.02)
        for sy_sign in [1, -1]:
            riv = _make_cylinder(f"_lriv_{x_pos}_{angle_frac}_{sy_sign}",
                                 0.015, 0.02,
                                 location=(x_pos, sy_sign * (CHEST_D/2 + 0.01) + ry * 0, BASE_H + rz),
                                 rotation=(math.radians(90), 0, 0),
                                 verts=10)
            # Reposition to follow curve on front/back
            riv.location = (x_pos, sy_sign * (CHEST_D/2 - 0.02) + ry, BASE_H + rz)
            _set_pivot(riv, (PIVOT_X, PIVOT_Y, PIVOT_Z))
            lid_rivets.append(riv)

if lid_band_parts:
    _join_objects(lid_band_parts[0], lid_band_parts[1:])
    metal_bands_lid = lid_band_parts[0]
    metal_bands_lid.name = "metal_bands_lid"
    if lid_rivets:
        _join_objects(metal_bands_lid, lid_rivets)
else:
    metal_bands_lid = _make_box("metal_bands_lid", (0.01, 0.01, 0.01))
    _set_pivot(metal_bands_lid, (PIVOT_X, PIVOT_Y, PIVOT_Z))

_bevel_object(metal_bands_lid, width=0.003, segments=1)
_assign_mat(metal_bands_lid, "metal_dark")
_generate_uvs(metal_bands_lid)
myway_print_progress("metal_bands_lid complete")

# === CORNER BRACKETS ===
myway_print_progress("Building corner_brackets...")
bracket_parts = []

# L-shaped corner brackets at 4 bottom corners
for sx in [1, -1]:
    for sy in [1, -1]:
        # Horizontal leg
        h_leg = _make_box(f"_bh_{sx}_{sy}",
                          (0.18, 0.06, 0.04),
                          (sx * (CHEST_W/2 - 0.09), sy * (CHEST_D/2 + 0.005), 0.02))
        bracket_parts.append(h_leg)
        # Vertical leg
        v_leg = _make_box(f"_bv_{sx}_{sy}",
                          (0.06, 0.18, 0.04),
                          (sx * (CHEST_W/2 + 0.005), sy * (CHEST_D/2 - 0.09), 0.02))
        bracket_parts.append(v_leg)
        # Corner connector
        corner = _make_box(f"_bc_{sx}_{sy}",
                           (0.06, 0.06, 0.12),
                           (sx * (CHEST_W/2 + 0.005), sy * (CHEST_D/2 + 0.005), 0.06))
        bracket_parts.append(corner)
        
        # Large rivets on corner
        for rz in [0.02, 0.08]:
            riv = _make_cylinder(f"_criv_{sx}_{sy}_{rz}",
                                 0.022, 0.03,
                                 location=(sx * (CHEST_W/2 + 0.015), sy * (CHEST_D/2 + 0.015), rz),
                                 verts=12)
            bracket_parts.append(riv)

if bracket_parts:
    _join_objects(bracket_parts[0], bracket_parts[1:])
    corner_brackets = bracket_parts[0]
    corner_brackets.name = "corner_brackets"
else:
    corner_brackets = _make_box("corner_brackets", (0.01, 0.01, 0.01))

_bevel_object(corner_brackets, width=0.005, segments=2)
_assign_mat(corner_brackets, "metal_dark")
_generate_uvs(corner_brackets)
myway_print_progress("corner_brackets complete")

# === HINGES ===
myway_print_progress("Building hinges...")
hinge_parts_base = []
hinge_parts_lid = []
pin_parts = []

for x_off in [-0.55, 0.55]:
    hx = x_off
    hy = -CHEST_D / 2 - 0.01
    hz = BASE_H
    
    # Base knuckles (3 knuckles on base side)
    for i, frac in enumerate([0.0, 0.4, 0.8]):
        knuckle = _make_cylinder(f"_hbk_{x_off}_{i}",
                                  0.025, 0.04,
                                  location=(hx + frac * 0.06, hy - 0.01, hz),
                                  rotation=(0, math.radians(90), 0),
                                  verts=16)
        hinge_parts_base.append(knuckle)
    
    # Lid knuckles (2 knuckles, offset)
    for i, frac in enumerate([0.2, 0.6]):
        knuckle = _make_cylinder(f"_hlk_{x_off}_{i}",
                                 0.025, 0.04,
                                 location=(hx + frac * 0.06, hy - 0.01, hz),
                                 rotation=(0, math.radians(90), 0),
                                 verts=16)
        _set_pivot(knuckle, (PIVOT_X, PIVOT_Y, PIVOT_Z))
        hinge_parts_lid.append(knuckle)
    
    # Hinge pin
    pin = _make_cylinder(f"_hpin_{x_off}",
                         0.008, 0.14,
                         location=(hx + 0.03, hy - 0.01, hz),
                         rotation=(0, math.radians(90), 0),
                         verts=10)
    pin_parts.append(pin)
    
    # Hinge mounting plates on base
    plate_b = _make_box(f"_hpb_{x_off}",
                        (0.12, 0.03, 0.06),
                        (hx + 0.03, hy - 0.02, hz - 0.04))
    hinge_parts_base.append(plate_b)
    
    # Hinge mounting plates on lid
    plate_l = _make_box(f"_hpl_{x_off}",
                        (0.12, 0.03, 0.06),
                        (hx + 0.03, hy - 0.02, hz + 0.04))
    _set_pivot(plate_l, (PIVOT_X, PIVOT_Y, PIVOT_Z))
    hinge_parts_lid.append(plate_l)

# Join base hinge parts
if hinge_parts_base:
    _join_objects(hinge_parts_base[0], hinge_parts_base[1:])
    hinges_base = hinge_parts_base[0]
else:
    hinges_base = _make_box("hinges_base", (0.01, 0.01, 0.01))

# Join lid hinge parts
if hinge_parts_lid:
    _join_objects(hinge_parts_lid[0], hinge_parts_lid[1:])
    hinges_lid = hinge_parts_lid[0]
else:
    hinges_lid = _make_box("hinges_lid", (0.01, 0.01, 0.01))
    _set_pivot(hinges_lid, (PIVOT_X, PIVOT_Y, PIVOT_Z))

# Join pins into base hinges
if pin_parts:
    _join_objects(hinges_base, pin_parts)

# Combine into single "hinges" object — base portion is the main object
# Lid portion gets parented to lid
hinges_base.name = "hinges"
_bevel_object(hinges_base, width=0.003, segments=1)
_assign_mat(hinges_base, "metal_hardware")
_generate_uvs(hinges_base)

_bevel_object(hinges_lid, width=0.003, segments=1)
_assign_mat(hinges_lid, "metal_hardware")
_generate_uvs(hinges_lid)
hinges_lid.name = "hinges_lid_part"
myway_print_progress("hinges complete")

# === SIDE HANDLES ===
myway_print_progress("Building side_handles...")
handle_parts = []

for sx in [1, -1]:
    # Bracket plate
    bracket = _make_box(f"_hb_{sx}",
                        (0.04, 0.18, 0.12),
                        (sx * (CHEST_W/2 + 0.005), 0, BASE_H * 0.5))
    handle_parts.append(bracket)
    
    # Bracket rivets
    for ry in [-0.06, 0.06]:
        riv = _make_cylinder(f"_hriv_{sx}_{ry}",
                             0.015, 0.02,
                             location=(sx * (CHEST_W/2 + 0.02), ry, BASE_H * 0.5),
                             rotation=(0, math.radians(90), 0),
                             verts=10)
        handle_parts.append(riv)
    
    # Handle loop (torus)
    loop = _make_torus(f"_hl_{sx}",
                       0.06, 0.012,
                       location=(sx * (CHEST_W/2 + 0.05), 0, BASE_H * 0.5),
                       rotation=(0, math.radians(90), 0),
                       major_seg=20, minor_seg=8)
    handle_parts.append(loop)

if handle_parts:
    _join_objects(handle_parts[0], handle_parts[1:])
    side_handles = handle_parts[0]
    side_handles.name = "side_handles"
else:
    side_handles = _make_box("side_handles", (0.01, 0.01, 0.01))

_bevel_object(side_handles, width=0.004, segments=2)
_shade_smooth(side_handles)
_assign_mat(side_handles, "metal_hardware")
_generate_uvs(side_handles)
myway_print_progress("side_handles complete")

# === LOCK PLATE ===
myway_print_progress("Building lock_plate...")
lock_parts = []

# Main plate
plate = _make_box("_lp_main",
                  (0.28, 0.04, 0.35),
                  (0, CHEST_D/2 + 0.006, BASE_H * 0.45))
lock_parts.append(plate)

# Ornamental border (slightly larger, thinner)
border = _make_box("_lp_border",
                   (0.32, 0.02, 0.39),
                   (0, CHEST_D/2 + 0.003, BASE_H * 0.45))
lock_parts.append(border)

# Keyhole — cut a hole
keyhole_cutter = _make_cylinder("_kh_cutter",
                                0.025, 0.1,
                                location=(0, CHEST_D/2 + 0.01, BASE_H * 0.45),
                                rotation=(math.radians(90), 0, 0),
                                verts=16)
# Keyhole slot below
keyhole_slot = _make_box("_kh_slot",
                         (0.012, 0.1, 0.04),
                         (0, CHEST_D/2 + 0.01, BASE_H * 0.45 - 0.04))

# Join plate and border first
_join_objects(lock_parts[0], lock_parts[1:])
lock_plate = lock_parts[0]
lock_plate.name = "lock_plate"

# Cut keyhole
_select_active(lock_plate)
bm = lock_plate.modifiers.new(name="KH1", type='BOOLEAN')
bm.operation = 'DIFFERENCE'
bm.object = keyhole_cutter
_apply_all_modifiers(lock_plate)
bpy.data.objects.remove(keyhole_cutter, do_unlink=True)

_select_active(lock_plate)
bm = lock_plate.modifiers.new(name="KH2", type='BOOLEAN')
bm.operation = 'DIFFERENCE'
bm.object = keyhole_slot
_apply_all_modifiers(lock_plate)
bpy.data.objects.remove(keyhole_slot, do_unlink=True)

# Rivets on lock plate
for rz in [BASE_H * 0.45 + 0.12, BASE_H * 0.45 - 0.12]:
    for rx in [-0.1, 0.1]:
        riv = _make_cylinder(f"_lpr_{rx}_{rz}",
                             0.012, 0.015,
                             location=(rx, CHEST_D/2 + 0.015, rz),
                             rotation=(math.radians(90), 0, 0),
                             verts=10)
        _join_objects(lock_plate, [riv])

_bevel_object(lock_plate, width=0.004, segments=2)
_assign_mat(lock_plate, "metal_hardware")
_generate_uvs(lock_plate)
myway_print_progress("lock_plate complete")

# === LOCK HASP ===
myway_print_progress("Building lock_hasp...")
hasp_parts = []

# Hinged strap — curved bar
hasp_bar = _make_box("_hasp_bar",
                    (0.08, 0.04, 0.22),
                    (0, CHEST_D/2 + 0.01, 0))
hasp_parts.append(hasp_bar)

# Padlock hole
hasp_hole = _make_cylinder("_hasp_hole",
                           0.018, 0.06,
                           location=(0, CHEST_D/2 + 0.02, -0.08),
                           rotation=(math.radians(90), 0, 0),
                           verts=16)

# Rivets on hasp
for rz in [0.06, 0.0]:
    riv = _make_cylinder(f"_hasp_riv_{rz}",
                         0.012, 0.015,
                         location=(0, CHEST_D/2 + 0.025, rz),
                         rotation=(math.radians(90), 0, 0),
                         verts=10)
    hasp_parts.append(riv)

# Top attachment ring
hasp_ring = _make_torus("_hasp_ring",
                        0.025, 0.008,
                        location=(0, CHEST_D/2 + 0.02, 0.12),
                        rotation=(math.radians(90), 0, 0),
                        major_seg=16, minor_seg=8)
hasp_parts.append(hasp_ring)

_join_objects(hasp_parts[0], hasp_parts[1:])
lock_hasp = hasp_parts[0]
lock_hasp.name = "lock_hasp"

# Cut padlock hole
_select_active(lock_hasp)
bm = lock_hasp.modifiers.new(name="HaspHole", type='BOOLEAN')
bm.operation = 'DIFFERENCE'
bm.object = hasp_hole
_apply_all_modifiers(lock_hasp)
bpy.data.objects.remove(hasp_hole, do_unlink=True)

# Position hasp on lid front
# Lid front edge is at approximately y = CHEST_D/2, z = BASE_H (when closed)
# Hasp hangs down from lid front
hasp_attach_z = BASE_H + 0.05  # slightly above base top, on lid front
lock_hasp.location = (0, CHEST_D/2 - 0.02, hasp_attach_z)
bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)

# Set pivot at top attachment point on lid front
hasp_pivot = (0, CHEST_D/2 - 0.02, hasp_attach_z + 0.1)
_set_pivot(lock_hasp, hasp_pivot)

_bevel_object(lock_hasp, width=0.004, segments=2)
_assign_mat(lock_hasp, "metal_hardware")
_generate_uvs(lock_hasp)
myway_print_progress("lock_hasp complete")

# === PARENTING ===
myway_print_progress("Setting up hierarchy...")

# Parent lid to base
myway_parent(lid_full, base_outer)

# Parent lid-mounted parts to lid
myway_parent(metal_bands_lid, lid_full)
myway_parent(hinges_lid, lid_full)
myway_parent(lock_hasp, lid_full)

# Parent base-mounted parts to base
myway_parent(metal_bands_base, base_outer)
myway_parent(corner_brackets, base_outer)
myway_parent(hinges_base, base_outer)
myway_parent(side_handles, base_outer)
myway_parent(lock_plate, base_outer)

myway_print_progress("Hierarchy complete")

# === GROUND AND NORMALIZE ===
myway_print_progress("Grounding and normalizing...")
myway_ground_asset(base_outer)
myway_normalize_extent(base_outer, 2.0)

myway_print_progress("Treasure chest build complete!")
myway_print_progress(f"Parts: {[o.name for o in bpy.data.objects if o.type == 'MESH']}")

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
