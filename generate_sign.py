import bpy, bmesh, math, struct

# Clear scene
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

# Set units to millimeters
scene = bpy.context.scene
scene.unit_settings.scale_length = 0.001
scene.unit_settings.system = 'METRIC'

# ----------------------------
# MAIN BODY: Triangular sign
# ----------------------------
S = 120.0  # Side length (mm)
H = (math.sqrt(3)/2) * S  # Triangle height (~103.923mm)

# Create triangle mesh properly
mesh = bpy.data.meshes.new("MainBodyMesh")
main_obj = bpy.data.objects.new("MainBody", mesh)
bpy.context.collection.objects.link(main_obj)

bm = bmesh.new()
v1 = bm.verts.new((-S/2, -H/3, 0))
v2 = bm.verts.new((S/2, -H/3, 0))
v3 = bm.verts.new((0, 2*H/3, 0))
bm.faces.new([v1, v2, v3])
bm.to_mesh(mesh)
bm.free()

# Extrude 8mm depth
bpy.context.view_layer.objects.active = main_obj
bpy.ops.object.mode_set(mode='EDIT')
bm = bmesh.from_edit_mesh(mesh)
bm.faces.ensure_lookup_table()
face = bm.faces[0]
extrude = bmesh.ops.extrude_face_region(bm, geom=[face])
extruded_face = [g for g in extrude['geom'] if isinstance(g, bmesh.types.BMFace)][0]
bmesh.ops.translate(bm, verts=extruded_face.verts, vec=(0,0,8))
bmesh.ops.delete(bm, geom=[face])
bmesh.update_edit_mesh(mesh)
bpy.ops.object.mode_set(mode='OBJECT')

# Bevel vertical edges (6mm rounded corners)
bpy.context.view_layer.objects.active = main_obj
bpy.ops.object.mode_set(mode='EDIT')
bm = bmesh.from_edit_mesh(mesh)
bm.edges.ensure_lookup_table()
vertical_edges = [e for e in bm.edges if {e.verts[0].co.z, e.verts[1].co.z} == {0.0, 8.0}]
if vertical_edges:
    bmesh.ops.bevel(bm, geom=vertical_edges, offset=6.0, segments=8, profile=0.5)
bmesh.update_edit_mesh(mesh)
bpy.ops.object.mode_set(mode='OBJECT')

# Inset 3mm border/groove (4mm inside edges, 1mm deep)
bpy.context.view_layer.objects.active = main_obj
bpy.ops.object.mode_set(mode='EDIT')
bm = bmesh.from_edit_mesh(mesh)
bm.faces.ensure_lookup_table()
top_faces = [f for f in bm.faces if all(v.co.z == 8.0 for v in f.verts)]
if top_faces:
    top_face = top_faces[0]
    ret = bmesh.ops.inset_region(bm, faces=[top_face], thickness=4.0, depth=0)
    bm.faces.ensure_lookup_table()
    for f in bm.faces:
        if f.select:
            extrude = bmesh.ops.extrude_face_region(bm, geom=[f])
            extruded = [g for g in extrude['geom'] if isinstance(g, bmesh.types.BMFace)][0]
            bmesh.ops.translate(bm, verts=extruded.verts, vec=(0,0,-1))
            bmesh.ops.delete(bm, geom=[f])
            break
bmesh.update_edit_mesh(mesh)
bpy.ops.object.mode_set(mode='OBJECT')

# ----------------------------
# Helper: create cube with bevel
# ----------------------------
def create_beveled_cube(name, dims, loc, bevel_width=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    cube = bpy.context.active_object
    cube.name = name
    cube.scale = (dims[0], dims[1], dims[2])
    if bevel_width > 0:
        bpy.context.view_layer.objects.active = cube
        bpy.ops.object.modifier_add(type='BEVEL')
        mod = cube.modifiers[-1]
        mod.width = bevel_width
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return cube

# ----------------------------
# ICON: Sleeping person in bed (embossed 2mm above triangle)
# ----------------------------
icon_z = 10.0  # 2mm above triangle top (z=8)

# Bed base (55×18×4mm)
bed = create_beveled_cube("BedBase", (55, 18, 4), (0, 40, icon_z + 2))
# Headboard (10×22×4mm)
headboard = create_beveled_cube("Headboard", (10, 22, 4), (-55/2 + 5, 40, icon_z + 2))
# Pillow (14×10×3mm, beveled)
pillow = create_beveled_cube("Pillow", (14, 10, 3), (-55/2 + 7, 40 - 9 + 5, icon_z + 1.5), bevel_width=2.0)
# Person body (36×10×5mm, beveled)
body = create_beveled_cube("PersonBody", (36, 10, 5), (0, 40, icon_z + 2.5), bevel_width=2.0)
# Head (10mm diameter, 5mm tall cylinder)
bpy.ops.mesh.primitive_cylinder_add(
    radius=5, depth=5,
    location=(-55/2 -5, 40, icon_z + 2.5),
    rotation=(math.pi/2, 0, 0)
)
head = bpy.context.active_object
head.name = "PersonHead"

# ZZZ text (6/8/10mm, staircase pattern)
def create_text(name, char, size, loc, extrude=2.0):
    bpy.ops.object.text_add(location=loc)
    txt = bpy.context.active_object
    txt.name = name
    txt.data.body = char
    txt.data.size = size
    txt.data.extrude = extrude
    bpy.ops.object.select_all(action='DESELECT')
    txt.select_set(True)
    bpy.ops.object.convert(target='MESH')
    return bpy.context.active_object

z1 = create_text("Z1", "z", 6, (20, 50, icon_z + 1))
z2 = create_text("Z2", "z", 8, (20, 58, icon_z + 1))
z3 = create_text("Z3", "Z", 10, (20, 68, icon_z + 1))

# ----------------------------
# TEXT: CAUTION / WE SLEEP HERE
# ----------------------------
caution = create_text("CautionText", "CAUTION", 14, (0, -20, icon_z + 1))
sleep = create_text("SleepText", "WE SLEEP HERE", 10, (0, -36, icon_z + 1))

# ----------------------------
# BOOLEAN UNION ALL PARTS
# ----------------------------
main_obj = bpy.data.objects["MainBody"]
parts = [bed, headboard, pillow, body, head, z1, z2, z3, caution, sleep]

for part in parts:
    if part and part.name in bpy.data.objects:
        bool_mod = main_obj.modifiers.new(f"Bool_{part.name}", 'BOOLEAN')
        bool_mod.operation = 'UNION'
        bool_mod.object = part
        bpy.ops.object.modifier_apply(modifier=bool_mod.name)
        bpy.data.objects.remove(part, do_unlink=True)

# Apply transforms and clean mesh
bpy.context.view_layer.objects.active = main_obj
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bpy.ops.object.mode_set(mode='EDIT')
bm = bmesh.from_edit_mesh(main_obj.data)
bm.verts.ensure_lookup_table()
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.1)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bmesh.update_edit_mesh(main_obj.data)
bpy.ops.object.mode_set(mode='OBJECT')

# ----------------------------
# EXPORT STL (Simplified - using bmesh triangulation)
# ----------------------------
def export_stl_binary(filepath, obj):
    """Export mesh to binary STL format using bmesh for triangulation"""
    # Get mesh data
    mesh = obj.data
    
    # Use bmesh to triangulate
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    
    with open(filepath, 'wb') as f:
        # Header (80 bytes)
        header = b"Generated by Blender Python Script"
        f.write(header + b" " * (80 - len(header)))
        
        # Number of triangles
        num_triangles = len(bm.faces)
        f.write(struct.pack('<I', num_triangles))
        
        # Write each triangle
        for face in bm.faces:
            # Calculate face normal
            normal = face.normal
            
            # Write normal
            f.write(struct.pack('<3f', normal.x, normal.y, normal.z))
            
            # Write vertices (bmesh verts have co attribute)
            for i in range(3):
                v = face.verts[i]
                f.write(struct.pack('<3f', v.co.x, v.co.y, v.co.z))
            
            # Attribute byte count
            f.write(struct.pack('<H', 0))
        
        print(f"Exported {num_triangles} triangles")
    
    bm.free()

output_path = "/Users/daniele/Downloads/Documents/opencode/LLMWiki/caution_sleep_sign.stl"
export_stl_binary(output_path, main_obj)
print(f"Exported: {output_path}")
print("Recommended print settings: 0.2mm layer height, no supports if printed flat side down.")