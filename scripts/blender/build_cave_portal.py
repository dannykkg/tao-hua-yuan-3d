import bpy, bmesh, math, os, random
from mathutils import Vector

OUT = os.path.abspath("public/assets/models/cave_portal.glb")
random.seed(421)

def clear():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for col in (bpy.data.meshes, bpy.data.materials, bpy.data.textures, bpy.data.images):
        for b in list(col):
            if b.users == 0:
                col.remove(b)

clear()
rock_mat = bpy.data.materials.new("PortalRock")
rock_mat.use_nodes = True
bsdf = rock_mat.node_tree.nodes.get("Principled BSDF")
bsdf.inputs["Base Color"].default_value = (0.33, 0.31, 0.27, 1)
bsdf.inputs["Roughness"].default_value = 1.0

texture = bpy.data.textures.new("RockNoise", type='CLOUDS')
texture.noise_scale = 0.55
texture.noise_depth = 3

rocks = []
def add_rock(loc, scale, seed):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=1.0, location=loc)
    ob = bpy.context.object
    ob.name = f"PortalRock_{seed}"
    ob.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.ops.object.shade_smooth()
    mod = ob.modifiers.new("Displace", 'DISPLACE')
    mod.texture = texture
    mod.strength = 0.34
    mod.mid_level = 0.5
    bpy.ops.object.modifier_apply(modifier=mod.name)
    ob.data.materials.append(rock_mat)
    rocks.append(ob)

# Arrange an irregular arch around a 5.5m wide, 4.5m high opening.
layout = [
    ((0, 0.4, 7.3), (4.9, 2.4, 2.2)),      # lintel
    ((-2.8, -0.2, 6.6), (2.5, 2.1, 2.4)),
    ((3.0, 0.3, 6.4), (2.7, 2.2, 2.3)),
    ((-5.0, 0.0, 4.1), (2.7, 2.2, 3.1)),
    ((5.2, 0.4, 3.8), (2.9, 2.1, 3.0)),
    ((-5.6, 0.6, 1.3), (2.4, 1.9, 1.8)),
    ((5.5, 0.2, 1.1), (2.5, 1.8, 1.7)),
    ((-3.4, -0.4, 0.7), (1.4, 1.7, 0.8)),
    ((3.6, 0.4, 0.6), (1.5, 1.6, 0.7)),
    ((0, -0.7, 9.0), (3.8, 2.0, 1.5)),
    ((-1.4, 0.8, 8.3), (2.2, 1.5, 1.7)),
    ((1.8, -0.5, 8.4), (2.3, 1.6, 1.8)),
]
for i, (loc, sc) in enumerate(layout):
    add_rock(loc, sc, i)

# small broken stones around the base
for i in range(10):
    a = random.random() * math.tau
    r = 4.6 + random.random() * 2.4
    add_rock((math.cos(a)*r, (random.random()-0.5)*2.2, 0.35 + random.random()*0.3),
             (0.35 + random.random()*0.55, 0.4 + random.random()*0.6, 0.25 + random.random()*0.35), 20+i)

bpy.ops.object.select_all(action='DESELECT')
for ob in rocks:
    ob.select_set(True)
bpy.context.view_layer.objects.active = rocks[0]
bpy.ops.object.join()
portal = bpy.context.object
portal.name = "CavePortal"
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=1.1519, island_margin=0.015)
bpy.ops.object.mode_set(mode='OBJECT')
portal.location = (0,0,0)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bpy.ops.object.select_all(action='DESELECT')
portal.select_set(True)
bpy.context.view_layer.objects.active = portal
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True,
    export_apply=True, export_yup=True, export_materials='EXPORT',
    export_texcoords=True, export_normals=True)
print("EXPORTED", OUT, len(portal.data.polygons), "faces")
