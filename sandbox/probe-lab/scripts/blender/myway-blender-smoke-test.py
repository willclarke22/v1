import bpy
import math
import os
import sys

# Clear scene
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete()

# Output path from argv, or default
output_path = sys.argv[-1] if len(sys.argv) > 1 else "public/sandbox/generated-video-renders/blender-smoke-test.png"
output_path = os.path.abspath(output_path)

# Camera
bpy.ops.object.camera_add(location=(4, -6, 4), rotation=(math.radians(60), 0, math.radians(38)))
bpy.context.scene.camera = bpy.context.object

# Light
bpy.ops.object.light_add(type="AREA", location=(0, -4, 6))
light = bpy.context.object
light.name = "MyWay softbox"
light.data.energy = 650
light.data.size = 5

# Create saddle surface manually as mesh
size = 5
subdivisions = 80
vertices = []
faces = []

for row in range(subdivisions + 1):
    y = -size / 2 + size * row / subdivisions
    for col in range(subdivisions + 1):
        x = -size / 2 + size * col / subdivisions
        z = 0.18 * (x * x - y * y)
        vertices.append((x, y, z))

for row in range(subdivisions):
    for col in range(subdivisions):
        a = row * (subdivisions + 1) + col
        b = a + 1
        c = a + (subdivisions + 1)
        d = c + 1
        faces.append((a, c, b))
        faces.append((b, c, d))

mesh = bpy.data.meshes.new("MyWay saddle mesh")
mesh.from_pydata(vertices, [], faces)
mesh.update()

surface = bpy.data.objects.new("MyWay test saddle surface", mesh)
bpy.context.collection.objects.link(surface)

mat = bpy.data.materials.new("MyWay purple surface")
mat.diffuse_color = (0.55, 0.25, 1.0, 0.72)
surface.data.materials.append(mat)

# Add wireframe modifier for explanatory look
wire = surface.modifiers.new("MyWay wire overlay", "WIREFRAME")
wire.thickness = 0.012
wire.use_even_offset = True

# Text label
font_curve = bpy.data.curves.new("MyWay label curve", type="FONT")
font_curve.body = "MyWay Blender smoke test"
font_curve.align_x = "CENTER"
font_curve.size = 0.24

text_obj = bpy.data.objects.new("MyWay label", font_curve)
text_obj.location = (0, -2.8, 1.35)
text_obj.rotation_euler = (math.radians(68), 0, 0)
bpy.context.collection.objects.link(text_obj)

# Add a small origin marker
bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=0.09, location=(0, 0, 0))
origin = bpy.context.object
origin.name = "Origin marker"
origin_mat = bpy.data.materials.new("Origin white")
origin_mat.diffuse_color = (1, 1, 1, 1)
origin.data.materials.append(origin_mat)

# Render settings
scene = bpy.context.scene
scene.frame_start = 1
scene.frame_end = 1
scene.frame_set(1)

scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1280
scene.render.resolution_y = 720
scene.render.fps = 24

scene.render.image_settings.file_format = "PNG"
scene.render.filepath = output_path

# Transparent-ish studio background
world = scene.world or bpy.data.worlds.new("MyWay World")
scene.world = world
world.color = (0.02, 0.0, 0.05)

bpy.ops.render.render(write_still=True)

print(f"MYWAY_BLENDER_SMOKE_OUTPUT={output_path}")