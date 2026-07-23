import bpy
import bmesh
import math
from mathutils import Vector

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

bpy.context.scene.unit_settings.scale_length = 0.001
bpy.context.scene.unit_settings.system = 'METRIC'

mm = 0.001

def create_triangular_panel():
    side = 120 * mm
    depth = 8 * mm
    bevel = 6 * mm
    
    bpy.ops.mesh.primitive_cone_add(vertices=3, radius1=side/math.sqrt(3), depth=depth)
    tri = bpy.context.object
    tri.name = "MainTriangle"
    
    mod = tri.modifiers.new(name='RoundedEdges', type='BEVEL')
    mod.width = bevel
    mod.segments = 3
    bpy.ops.object.modifier_apply(modifier="RoundedEdges")
    
    return tri

def create_inset_border():
    side = 120 * mm
    inset = 4 * mm
    width = 3 * mm
    d = 1 * mm
    depth_tri = 8 * mm
    
    inner = side - 2 * (inset + width) * 2 / math.sqrt(3)
    
    bpy.ops.mesh.primitive_cone_add(vertices=3, radius1=inner/math.sqrt(3), depth=d)
    ins = bpy.context.object
    ins.name = "InsetBorder"
    ins.location.z = -depth_tri/2 + d
    
    return ins

def create_bed():
    parts = []
    
    bpy.ops.mesh.primitive_cube_add(size=1, location=(5*mm, 20*mm, 10*mm))
    bed = bpy.context.object
    bed.name = "BedBase"
    bed.scale = (55*mm, 18*mm, 4*mm)
    bpy.ops.object.transform_apply(scale=True)
    parts.append(bed)
    
    bpy.ops.mesh.primitive_cube_add(size=1, location=(-22*mm, 20*mm, 10*mm))
    hb = bpy.context.object
    hb.name = "Headboard"
    hb.scale = (10*mm, 22*mm, 4*mm)
    bpy.ops.object.transform_apply(scale=True)
    parts.append(hb)
    
    bpy.ops.mesh.primitive_cube_add(size=1, location=(-20*mm, 20*mm, 17*mm))
    p = bpy.context.object
    p.name = "Pillow"
    p.scale = (14*mm, 10*mm, 3*mm)
    bpy.ops.object.transform_apply(scale=True)
    parts.append(p)
    
    bpy.ops.mesh.primitive_cube_add(size=1, location=(3*mm, 20*mm, 12.5*mm))
    b = bpy.context.object
    b.name = "PersonBody"
    b.scale = (36*mm, 10*mm, 5*mm)
    bpy.ops.object.transform_apply(scale=True)
    parts.append(b)
    
    bpy.ops.mesh.primitive_uv_sphere_add(radius=5*mm, location=(-15*mm, 20*mm, 15*mm))
    h = bpy.context.object
    h.name = "PersonHead"
    h.scale = (1, 1, 0.5)
    bpy.ops.object.transform_apply(scale=True)
    parts.append(h)
    
    return parts

def create_zzz():
    parts = []
    configs = [
        (28*mm, 42*mm, 6*mm, "z"),
        (33*mm, 37*mm, 8*mm, "z"),
        (38*mm, 32*mm, 10*mm, "Z")
    ]
    for x, y, s, c in configs:
        bpy.ops.object.text_add(location=(x, y, 10*mm))
        t = bpy.context.object
        t.name = f"Z_{c}"
        t.data.body = c
        t.data.size = s
        t.data.extrude = 2*mm
        parts.append(t)
    return parts

def create_warning_text():
    parts = []
    
    bpy.ops.object.text_add(location=(0, -30*mm, 10*mm))
    c = bpy.context.object
    c.name = "CAUTION"
    c.data.body = "CAUTION"
    c.data.size = 14*mm
    c.data.extrude = 2*mm
    c.data.align_x = 'CENTER'
    parts.append(c)
    
    bpy.ops.object.text_add(location=(0, -44*mm, 10*mm))
    w = bpy.context.object
    w.name = "WE_SLEEP_HERE"
    w.data.body = "WE SLEEP HERE"
    w.data.size = 10*mm
    w.data.extrude = 2*mm
    w.data.align_x = 'CENTER'
    parts.append(w)
    
    return parts

print("Creating triangular panel...")
tri = create_triangular_panel()

print("Creating inset border...")
ins = create_inset_border()

print("Creating bed assembly...")
bed = create_bed()

print("Creating ZZZ letters...")
zzz = create_zzz()

print("Creating warning text...")
txt = create_warning_text()

all_objs = [tri, ins] + bed + zzz + txt

print("Joining all meshes...")
bpy.ops.object.select_all(action='DESELECT')
for o in all_objs:
    o.select_set(True)

bpy.context.view_layer.objects.active = all_objs[0]
bpy.ops.object.join()

final = all_objs[0]
final.name = "CautionSleepSign"

print("Cleaning mesh...")
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.remove_doubles(threshold=0.0001)
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.object.mode_set(mode='OBJECT')

out = "/Users/daniele/Downloads/Documents/opencode/LLMWiki/caution_sleep_sign.stl"
print(f"Exporting: {out}")

bpy.ops.wm.stl_export(filepath=out, apply_modifiers=True)

print("SUCCESS!")