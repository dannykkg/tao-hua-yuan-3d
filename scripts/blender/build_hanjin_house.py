import bpy, bmesh, math, os
from mathutils import Vector, Matrix

OUT_DIR = os.path.abspath("public/assets/models")
os.makedirs(OUT_DIR, exist_ok=True)
MATS = {}

def clear():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for col in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for b in list(col):
            if b.users == 0:
                col.remove(b)
    MATS.clear()

def mat(name, rgba):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.diffuse_color = rgba
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = rgba
        bsdf.inputs["Roughness"].default_value = 0.85
    MATS[name] = m
    return m

def cube(name, sx, sy, sz, loc, material, bevel=0.035, seg=1):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    ob = bpy.context.object
    ob.name = name
    ob.scale = (sx, sy, sz)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        mod = ob.modifiers.new("Bevel", 'BEVEL')
        mod.width = bevel
        mod.segments = seg
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_apply(modifier=mod.name)
    ob.data.materials.append(material)
    return ob

def cyl(name, radius, depth, loc, material, rot=(0,0,0), vertices=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rot)
    ob = bpy.context.object
    ob.name = name
    ob.data.materials.append(material)
    return ob

def plane_panel(name, w, h, loc, material, rot=(0,0,0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    ob = bpy.context.object
    ob.name = name
    ob.scale = (w, 0.035, h)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    ob.data.materials.append(material)
    return ob

def make_roof(name, width, depth, eave_z, rise, overhang, material, thickness=0.16, ridge=True):
    w = width / 2 + overhang
    d = depth / 2 + overhang
    rx = width * 0.24
    verts = [
        (-w, -d, eave_z + 0.08), (w, -d, eave_z + 0.08),
        (w, d, eave_z + 0.08), (-w, d, eave_z + 0.08),
        (-rx, 0, eave_z + rise), (rx, 0, eave_z + rise),
    ]
    faces = [
        (0, 1, 5, 4), (2, 3, 4, 5), (1, 2, 5), (3, 0, 4),
    ]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(ob)
    ob.data.materials.append(material)
    sol = ob.modifiers.new("Solidify", 'SOLIDIFY')
    sol.thickness = thickness
    sol.offset = -1
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier=sol.name)
    # eave fascia
    beam = mat("DarkWood", (0.12, 0.07, 0.035, 1))
    cube(name+"_eaveF", 2*w+0.12, 0.14, 0.18, (0, -d, eave_z+0.03), beam, 0.02)
    cube(name+"_eaveB", 2*w+0.12, 0.14, 0.18, (0, d, eave_z+0.03), beam, 0.02)
    if ridge:
        cyl(name+"_ridge", 0.11, rx*2, (0, 0, eave_z+rise), beam, rot=(0, math.pi/2, 0), vertices=10)
        # hip ridges
        for sx in (-1, 1):
            for sy in (-1, 1):
                x0, y0 = sx*rx, 0
                x1, y1 = sx*w, sy*d
                p0 = Vector((x0, y0, eave_z+rise))
                p1 = Vector((x1, y1, eave_z+0.08))
                mid = (p0+p1)*0.5
                dvec = p1-p0
                length = dvec.length
                bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.065, depth=length, location=mid)
                hip = bpy.context.object
                hip.rotation_mode = 'QUATERNION'
                hip.rotation_quaternion = Vector((0,0,1)).rotation_difference(dvec.normalized())
                hip.data.materials.append(beam)
    return ob

def build_house(roof_kind):
    clear()
    plaster = mat("Plaster", (0.72,0.66,0.54,1))
    plaster_warm = mat("PlasterWarm", (0.63,0.55,0.42,1))
    wood = mat("Wood", (0.18,0.11,0.055,1))
    wood_light = mat("WoodLight", (0.32,0.20,0.10,1))
    dark = mat("DarkWood", (0.09,0.052,0.024,1))
    stone = mat("Stone", (0.34,0.33,0.29,1))
    stone_light = mat("StoneLight", (0.51,0.48,0.40,1))
    earth = mat("Earth", (0.30,0.23,0.14,1))
    plants = mat("Plants", (0.16,0.24,0.08,1))
    tile = mat("Tile", (0.22,0.24,0.22,1))
    thatch = mat("Thatch", (0.52,0.42,0.23,1))
    lattice = mat("Lattice", (0.21,0.15,0.08,1))
    paper = mat("Paper", (0.70,0.60,0.38,1))
    red = mat("Red", (0.42,0.08,0.04,1))

    objs = []
    # stone plinth for main hall
    objs.append(cube("Plinth", 7.2, 5.2, 0.36, (0, 0.6, 0.18), stone, 0.035))
    objs.append(cube("PlinthTop", 6.9, 4.9, 0.08, (0, 0.6, 0.40), stone_light, 0.02))
    # main hall walls
    W, D, H = 6.2, 4.2, 2.4
    cy = 0.6
    objs.append(cube("HallWalls", W, D, H, (0, cy, 1.60), plaster, 0.03))
    # timber frame columns
    for sx in (-1,1):
        for sy in (-1,1):
            objs.append(cyl("Col", 0.12, H+0.15, (sx*(W/2-0.08), cy+sy*(D/2-0.08), 1.62), wood, vertices=8))
        objs.append(cyl("MidCol", 0.09, H, (sx*(W/2-0.08), cy, 1.6), wood, vertices=8))
    for z in (0.44, 1.22, 2.72):
        objs.append(cube("Beam", W+0.22, 0.13, 0.14, (0, cy-D/2-0.02, z), wood, 0.015))
        objs.append(cube("Beam", W+0.22, 0.13, 0.14, (0, cy+D/2+0.02, z), wood, 0.015))
    # door and windows on front (-Y)
    front_y = cy - D/2 - 0.035
    objs.append(plane_panel("Door", 1.28, 1.95, (0, front_y, 1.35), dark))
    objs.append(cube("DoorFrameL", 0.15, 0.10, 2.15, (-0.72, front_y-0.02, 1.38), wood, 0.01))
    objs.append(cube("DoorFrameR", 0.15, 0.10, 2.15, (0.72, front_y-0.02, 1.38), wood, 0.01))
    objs.append(cube("DoorFrameT", 1.58, 0.10, 0.15, (0, front_y-0.02, 2.36), wood, 0.01))
    for sx in (-1,1):
        objs.append(plane_panel("Window", 1.3, 1.0, (sx*2.0, front_y, 1.65), lattice))
        objs.append(cube("WinFrameH", 1.5, 0.09, 0.10, (sx*2.0, front_y-0.02, 2.2), wood, 0.01))
        objs.append(cube("WinFrameH2", 1.5, 0.09, 0.10, (sx*2.0, front_y-0.02, 1.1), wood, 0.01))
    # porch deck and columns
    objs.append(cube("Porch", 6.8, 1.2, 0.16, (0, cy-D/2-0.6, 0.44), wood_light, 0.02))
    for sx in (-1,1):
        objs.append(cyl("PorchCol", 0.10, 2.25, (sx*2.9, cy-D/2-1.0, 1.55), wood, vertices=8))
        objs.append(cube("PorchColBase", 0.30,0.30,0.18, (sx*2.9, cy-D/2-1.0, 0.50), stone_light, 0.02))
    # main roof
    roof_main = thatch if roof_kind == "thatch" else tile
    make_roof("MainRoof", W, D, 2.78, 1.85, 0.95, roof_main, 0.20)
    # side wing / kitchen
    kx, ky = -4.6, 1.0
    objs.append(cube("Kitchen", 3.2, 3.6, 2.0, (kx, ky, 1.35), plaster_warm, 0.03))
    for sx in (-1,1):
        for sy in (-1,1):
            objs.append(cyl("KitchenCol", 0.09, 2.0, (kx+sx*1.5, ky+sy*1.7, 1.35), wood, vertices=7))
    objs.append(make_roof("KitchenRoof", 3.2, 3.6, 2.34, 0.95, 0.6, thatch, 0.14, False))
    objs.append(cube("Chimney", 0.45,0.45,1.65, (kx-1.1,ky-1.0,2.65), stone, 0.03))
    # courtyard walls
    cw, cd = 10.5, 9.0
    wallH = 1.12
    back_y = cd/2
    front_yc = -cd/2
    for sx in (-1,1):
        objs.append(cube("CourtWall", 0.26, cd, wallH, (sx*cw/2, 0, wallH/2), earth, 0.02))
        objs.append(cube("WallCoping", 0.38, cd+0.1, 0.10, (sx*cw/2, 0, wallH+0.08), stone_light, 0.015))
    objs.append(cube("CourtWallBack", cw, 0.26, wallH, (0, back_y, wallH/2), earth, 0.02))
    objs.append(cube("WallCopingBack", cw+0.1, 0.38, 0.10, (0, back_y, wallH+0.08), stone_light, 0.015))
    gate_w = 2.2
    seg = (cw-gate_w)/2
    for sx in (-1,1):
        objs.append(cube("CourtWallFront", seg, 0.26, wallH, (sx*(gate_w/2+seg/2), front_yc, wallH/2), earth, 0.02))
        objs.append(cube("GatePost", 0.22,0.30,2.05, (sx*gate_w/2, front_yc, 1.02), wood, 0.02))
        objs.append(cube("GatePostBase", 0.34,0.42,0.24, (sx*gate_w/2, front_yc, 0.12), stone_light, 0.02))
    objs.append(cube("GateDoor", gate_w-0.15, 0.12, 1.55, (0, front_yc, 0.90), dark, 0.02))
    make_roof("GateRoof", 2.6, 0.9, 2.02, 0.5, 0.25, thatch, 0.12, False)
    for sx in (-1,1):
        objs.append(cyl("GateRoofPost", 0.06, 0.6, (sx*1.2, front_yc, 1.95), wood, vertices=6))
    # courtyard path
    for i in range(5):
        objs.append(cube("PathStone", 1.05, 0.62, 0.07, (0, front_yc+1.0+i*0.72, 0.10), stone_light, 0.02))
    # garden beds along right wall
    for i in range(4):
        objs.append(cube("GardenBed", 1.8, 0.5, 0.12, (3.4, front_yc+1.4+i*0.8, 0.10), earth, 0.01))
        objs.append(cube("GardenGreen", 1.55, 0.35, 0.12, (3.4, front_yc+1.4+i*0.8, 0.20), plants, 0.01))
    # jars by the door
    for sx in (-1,1):
        cyl("Jar", 0.24, 0.55, (sx*2.8, cy-D/2-0.7, 0.36), earth, vertices=10)
    # small gate lantern
    bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=7, radius=0.16, location=(0, front_yc+0.25, 1.9))
    lan = bpy.context.object
    lan.name = "Lantern"
    lan.data.materials.append(red)
    objs.append(lan)

    # join every mesh in the scene (roofs, ridges and eaves included)
    bpy.ops.object.select_all(action='DESELECT')
    mesh_objects = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    for ob in mesh_objects:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = mesh_objects[0]
    bpy.ops.object.join()
    house = bpy.context.object
    house.name = "HanjinHouse_" + roof_kind
    # UV unwrap the merged mesh
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=1.1519, island_margin=0.015)
    bpy.ops.object.mode_set(mode='OBJECT')
    # origin at compound ground center
    house.location = (0, 0, 0)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.select_all(action='DESELECT')
    house.select_set(True)
    bpy.context.view_layer.objects.active = house
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(OUT_DIR, f"hanjin_house_{roof_kind}.glb"),
        export_format='GLB', use_selection=True, export_apply=True,
        export_yup=True, export_materials='EXPORT', export_texcoords=True,
        export_normals=True,
    )
    print("EXPORTED", roof_kind, len(house.data.materials), "materials", len(house.data.polygons), "faces")

for kind in ("tile", "thatch"):
    build_house(kind)
print("DONE")
