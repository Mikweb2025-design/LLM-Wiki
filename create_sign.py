import bpy
import math
import os

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

bpy.context.scene.unit_settings.system = 'METRIC'
bpy.context.scene.unit_settings.scale_length = 0.01

width = 200.0
height = 80.0
thickness = 4.0

bpy.ops.mesh.primitive_cube_add(size=1)
base = bpy.context.active_object
base.name = "BasePlate"
base.dimensions = (width, thickness, height)

bevel = base.modifiers.new(name='Bevel', type='BEVEL')
bevel.width = 5.0
bevel.segments = 3
bpy.ops.object.modifier_apply(modifier='Bevel')

def create_text_mesh(text, size, extrude, loc, rotation=(0,0,0), scale=(1,1,1)):
    curve = bpy.data.curves.new(f'Curve_{text}', type='FONT')
    curve.body = text
    curve.size = size
    curve.extrude = extrude
    curve.align_x = 'CENTER'
    curve.align_y = 'CENTER'
    
    obj = bpy.data.objects.new(f'Obj_{text}', curve)
    bpy.context.collection.objects.link(obj)
    obj.rotation_euler = (math.radians(90 + rotation[0]), math.radians(rotation[1]), math.radians(rotation[2]))
    obj.scale = scale
    obj.location = loc
    
    return obj

text1 = create_text_mesh("ATTENZIONE", 8.0, 5.0, (0, thickness + 1, 10))
text2 = create_text_mesh("QUI SI DORME", 7.0, 5.0, (0, thickness + 1, -15))

z1 = create_text_mesh("Z", 6.0, 4.0, (50, thickness + 6, 25), (-10, 0, 0), (1.0, 1.0, 1.0))
z2 = create_text_mesh("Z", 7.5, 4.0, (70, thickness + 10, 35), (-15, 0, 0), (1.2, 1.2, 1.2))
z3 = create_text_mesh("Z", 9.0, 4.0, (90, thickness + 14, 45), (-20, 0, 0), (1.4, 1.4, 1.4))

all_texts = [text1, text2, z1, z2, z3]

bpy.ops.object.select_all(action='DESELECT')
for obj in all_texts:
    obj.select_set(True)

bpy.context.view_layer.objects.active = text1

depsgraph = bpy.context.evaluated_depsgraph_get()

mesh_objects = []
for obj in all_texts:
    eval_obj = obj.evaluated_get(depsgraph)
    mesh_from_curve = bpy.data.meshes.new_from_object(eval_obj)
    new_mesh_obj = bpy.data.objects.new(f"{obj.name}_mesh", mesh_from_curve)
    bpy.context.collection.objects.link(new_mesh_obj)
    mesh_objects.append(new_mesh_obj)

bpy.ops.object.select_all(action='DESELECT')
base.select_set(True)
for mesh_obj in mesh_objects:
    mesh_obj.select_set(True)

bpy.context.view_layer.objects.active = base

bpy.ops.object.join()
sign = bpy.context.active_object
sign.name = "Sign"

bpy.ops.object.select_all(action='DESELECT')
sign.select_set(True)
bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='MEDIAN')

bpy.ops.mesh.primitive_cylinder_add(radius=2.5, depth=10)
hole = bpy.context.active_object
hole.name = "Hole"
hole.location = (0, thickness/2, height/2 - 8)

bpy.ops.object.select_all(action='DESELECT')
sign.select_set(True)
hole.select_set(True)
bpy.context.view_layer.objects.active = sign

bool_mod = sign.modifiers.new(name='Boolean', type='BOOLEAN')
bool_mod.object = hole
bool_mod.operation = 'DIFFERENCE'
bpy.ops.object.modifier_apply(modifier='Boolean')

bpy.data.objects.remove(hole, do_unlink=True)

output_path = "/Users/daniele/Downloads/Documents/opencode/LLMWiki/attention_sign.stl"
os.makedirs(os.path.dirname(output_path), exist_ok=True)

bpy.ops.object.select_all(action='DESELECT')
sign.select_set(True)

bpy.ops.wm.stl_export(filepath=output_path)

print(f"Success: {output_path}")
print(f"Mesh: {len(sign.data.vertices)} verts, {len(sign.data.polygons)} faces")