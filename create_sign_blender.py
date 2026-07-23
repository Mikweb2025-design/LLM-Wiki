import bpy
import math

# Clear existing objects
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

# === CREATE SIGN BACKBOARD ===
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
sign = bpy.context.active_object
sign.scale = (2.0, 0.1, 1.2)
sign.name = "SignBackboard"

# Add blue material to backboard
blue_mat = bpy.data.materials.new(name="BlueBackground")
blue_mat.use_nodes = True
nodes = blue_mat.node_tree.nodes
nodes.clear()
bsdf = nodes.new(type='ShaderNodeBsdfPrincipled')
output = nodes.new(type='ShaderNodeOutputMaterial')
bsdf.inputs['Base Color'].default_value = (0.1, 0.3, 0.8, 1)  # Blue
bsdf.inputs['Roughness'].default_value = 0.7
blue_mat.node_tree.links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])
sign.data.materials.append(blue_mat)

# === CREATE MOUNTING BRACKETS ===
for x_pos in [-1.9, 1.9]:
    bpy.ops.mesh.primitive_cube_add(size=0.1, location=(x_pos, 0, 0.5))
    bracket = bpy.context.active_object
    bracket.scale = (0.3, 0.1, 0.5)
    bracket.name = f"MountBracket_{'L' if x_pos < 0 else 'R'}"

# === CREATE CRESCENT MOON ===
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.3, location=(-1.2, 0.11, 0.8))
moon = bpy.context.active_object
moon.scale = (1, 1, 0.2)
moon.name = "Moon"

# Cut out part of moon to make crescent
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.25, location=(-1.0, 0.11, 0.8))
cutter = bpy.context.active_object
cutter.scale = (1, 1, 0.3)
bpy.ops.object.select_all(action='DESELECT')
moon.select_set(True)
cutter.select_set(True)
bpy.context.view_layer.objects.active = moon
bpy.ops.object.modifier_add(type='BOOLEAN')
mod = moon.modifiers[-1]
mod.operation = 'DIFFERENCE'
mod.object = cutter
bpy.ops.object.modifier_apply(modifier=mod.name)
bpy.data.objects.remove(cutter, do_unlink=True)

# Moon material (yellow)
yellow_mat = bpy.data.materials.new(name="YellowMoon")
yellow_mat.use_nodes = True
nodes = yellow_mat.node_tree.nodes
nodes.clear()
bsdf = nodes.new(type='ShaderNodeBsdfPrincipled')
output = nodes.new(type='ShaderNodeOutputMaterial')
bsdf.inputs['Base Color'].default_value = (1.0, 0.9, 0.2, 1)  # Yellow
bsdf.inputs['Roughness'].default_value = 0.5
yellow_mat.node_tree.links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])
moon.data.materials.append(yellow_mat)

# === CREATE STARS ===
for i, (x, z) in enumerate([(-0.8, 1.0), (-0.6, 1.1), (-1.0, 1.1)]):
    bpy.ops.mesh.primitive_ico_sphere_add(radius=0.08, location=(x, 0.11, z))
    star = bpy.context.active_object
    star.name = f"Star_{i}"
    star.data.materials.append(yellow_mat)

# === CREATE TEXT "QUI SI DORME" ===
text_string = "QUI SI DORME"
start_x = -1.7
y_pos = 0.11
z_pos = 0.6

# Create each letter as 3D text
for i, char in enumerate(text_string):
    if char == ' ':
        continue
    bpy.ops.object.text_add(location=(start_x + i * 0.35, y_pos, z_pos))
    text_obj = bpy.context.active_object
    text_obj.data.body = char
    text_obj.data.extrude = 0.05
    text_obj.data.size = 0.4
    text_obj.name = f"Text_{char}"
    
    # White material for text
    white_mat = bpy.data.materials.new(name=f"WhiteText_{char}")
    white_mat.use_nodes = True
    nodes = white_mat.node_tree.nodes
    nodes.clear()
    bsdf = nodes.new(type='ShaderNodeBsdfPrincipled')
    output = nodes.new(type='ShaderNodeOutputMaterial')
    bsdf.inputs['Base Color'].default_value = (1.0, 1.0, 1.0, 1)  # White
    bsdf.inputs['Roughness'].default_value = 0.4
    white_mat.node_tree.links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])
    text_obj.data.materials.append(white_mat)

# === CREATE DECORATIVE BORDER ===
# Top border
bpy.ops.mesh.primitive_cube_add(size=0.1, location=(0, 0.11, 1.25))
border_top = bpy.context.active_object
border_top.scale = (2.1, 0.02, 0.05)
border_top.name = "BorderTop"

# Bottom border
bpy.ops.mesh.primitive_cube_add(size=0.1, location=(0, 0.11, -0.05))
border_bottom = bpy.context.active_object
border_bottom.scale = (2.1, 0.02, 0.05)
border_bottom.name = "BorderBottom"

# Left border
bpy.ops.mesh.primitive_cube_add(size=0.1, location=(-2.0, 0.11, 0.6))
border_left = bpy.context.active_object
border_left.scale = (0.02, 0.02, 1.3)
border_left.name = "BorderLeft"

# Right border
bpy.ops.mesh.primitive_cube_add(size=0.1, location=(2.0, 0.11, 0.6))
border_right = bpy.context.active_object
border_right.scale = (0.02, 0.02, 1.3)
border_right.name = "BorderRight"

# Border material (white/yellow)
for border in [border_top, border_bottom, border_left, border_right]:
    border.data.materials.append(yellow_mat)

# === POSITION CAMERA ===
bpy.ops.object.camera_add(location=(0, -5, 2))
camera = bpy.context.active_object
camera.rotation_euler = (math.radians(75), 0, 0)
bpy.context.scene.camera = camera

# === ADD LIGHT ===
bpy.ops.object.light_add(type='SUN', location=(0, -3, 5))
light = bpy.context.active_object
light.data.energy = 3

print("Sign model created successfully!")
print("Objects in scene:", [obj.name for obj in bpy.data.objects])
