import bpy

# Export as STL
output_path = "/Users/daniele/Downloads/Documents/opencode/LLMWiki/qui_si_dorme_sign_professional.stl"

# Select all mesh objects
bpy.ops.object.select_all(action='DESELECT')
for obj in bpy.data.objects:
    if obj.type == 'MESH':
        obj.select_set(True)

# Export to STL
bpy.ops.export_mesh.stl(filepath=output_path, use_selection=True)

print(f"STL exported to: {output_path}")
print(f"Selected objects: {[obj.name for obj in bpy.data.objects if obj.select_get()]}")
