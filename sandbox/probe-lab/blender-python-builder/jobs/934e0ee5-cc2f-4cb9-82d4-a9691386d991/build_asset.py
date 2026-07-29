import bpy\nimport mathutils\nimport bpy
import math

# Paste Blender Python here, or ask GLM 5.2 to create it.
# MyWay appends trusted GLB export and preview-render code automatically.

print("MYWAY_PROGRESS: starting custom build")

bpy.ops.mesh.primitive_cube_add(location=(0, 0, 0.5))
obj = bpy.context.object
obj.name = "example_cube"

bevel = obj.modifiers.new(name="soft_edges", type="BEVEL")
bevel.width = 0.08
bevel.segments = 3

bpy.context.view_layer.objects.active = obj
bpy.ops.object.shade_smooth_by_angle()

material = bpy.data.materials.new("example_material")
material.diffuse_color = (0.14, 0.48, 0.9, 1.0)
material.use_nodes = True
principled = material.node_tree.nodes.get("Principled BSDF")
if principled:
    principled.inputs["Base Color"].default_value = (0.14, 0.48, 0.9, 1.0)
    principled.inputs["Roughness"].default_value = 0.38
obj.data.materials.append(material)

print("MYWAY_PROGRESS: custom build complete")


# ---------------------------------------------------------------------------
# Trusted MyWay export and preview footer.
# ---------------------------------------------------------------------------
import os as _myway_os
import math as _myway_math

_myway_output_dir = _myway_os.environ["MYWAY_BLENDER_OUTPUT_DIR"]
_myway_asset_name = _myway_os.environ.get(
    "MYWAY_BLENDER_ASSET_NAME",
    "generated_asset",
)
_myway_os.makedirs(_myway_output_dir, exist_ok=True)

def _myway_scene_meshes():
    return [
        obj for obj in bpy.context.scene.objects
        if obj.type == "MESH"
    ]

_myway_meshes = _myway_scene_meshes()
if not _myway_meshes:
    raise RuntimeError("The script completed without creating any mesh objects.")

for _myway_obj in _myway_meshes:
    _myway_obj.select_set(True)

_myway_glb_path = _myway_os.path.join(
    _myway_output_dir,
    _myway_asset_name + ".glb",
)
_myway_blend_path = _myway_os.path.join(
    _myway_output_dir,
    _myway_asset_name + ".blend",
)
_myway_preview_path = _myway_os.path.join(
    _myway_output_dir,
    "preview.png",
)

bpy.ops.wm.save_as_mainfile(filepath=_myway_blend_path)
bpy.ops.export_scene.gltf(
    filepath=_myway_glb_path,
    export_format="GLB",
    export_apply=True,
    export_animations=True,
)

# Build a simple preview camera and lights without modifying exported geometry.
_myway_min = [float("inf"), float("inf"), float("inf")]
_myway_max = [float("-inf"), float("-inf"), float("-inf")]
for _myway_obj in _myway_meshes:
    for _myway_corner in _myway_obj.bound_box:
        _myway_world = _myway_obj.matrix_world @ mathutils.Vector(_myway_corner)
        for _myway_i in range(3):
            _myway_min[_myway_i] = min(_myway_min[_myway_i], _myway_world[_myway_i])
            _myway_max[_myway_i] = max(_myway_max[_myway_i], _myway_world[_myway_i])

_myway_center = mathutils.Vector((
    (_myway_min[0] + _myway_max[0]) / 2,
    (_myway_min[1] + _myway_max[1]) / 2,
    (_myway_min[2] + _myway_max[2]) / 2,
))
_myway_extent = max(
    _myway_max[0] - _myway_min[0],
    _myway_max[1] - _myway_min[1],
    _myway_max[2] - _myway_min[2],
    0.5,
)

bpy.ops.object.camera_add(
    location=(
        _myway_center.x + _myway_extent * 1.8,
        _myway_center.y - _myway_extent * 2.2,
        _myway_center.z + _myway_extent * 1.35,
    )
)
_myway_camera = bpy.context.object
_myway_direction = _myway_center - _myway_camera.location
_myway_camera.rotation_euler = _myway_direction.to_track_quat("-Z", "Y").to_euler()
_myway_camera.data.lens = 52
bpy.context.scene.camera = _myway_camera

for _myway_location, _myway_energy, _myway_size in [
    ((_myway_center.x + _myway_extent * 1.4,
      _myway_center.y - _myway_extent * 1.2,
      _myway_center.z + _myway_extent * 2.0), 1100, _myway_extent),
    ((_myway_center.x - _myway_extent * 1.8,
      _myway_center.y - _myway_extent * 0.4,
      _myway_center.z + _myway_extent * 1.0), 700, _myway_extent * 1.2),
]:
    bpy.ops.object.light_add(type="AREA", location=_myway_location)
    _myway_light = bpy.context.object
    _myway_light.data.energy = _myway_energy
    _myway_light.data.shape = "DISK"
    _myway_light.data.size = _myway_size
    _myway_light.rotation_euler = (
        _myway_center - _myway_light.location
    ).to_track_quat("-Z", "Y").to_euler()

bpy.context.scene.render.engine = "BLENDER_EEVEE_NEXT"
bpy.context.scene.render.resolution_x = 768
bpy.context.scene.render.resolution_y = 768
bpy.context.scene.render.resolution_percentage = 100
bpy.context.scene.render.image_settings.file_format = "PNG"
bpy.context.scene.render.filepath = _myway_preview_path
bpy.context.scene.world.color = (0.035, 0.045, 0.07)
bpy.ops.render.render(write_still=True)

print("MYWAY_ASSET_BUILD_COMPLETE:" + _myway_glb_path)
