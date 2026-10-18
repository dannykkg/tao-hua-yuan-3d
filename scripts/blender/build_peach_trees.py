import bpy, bmesh, math, random, sys, os
from mathutils import Vector, Matrix

OUT_DIR = os.path.abspath("public/assets/models")
os.makedirs(OUT_DIR, exist_ok=True)
LOW = os.environ.get("PEACH_LOD") == "low"


def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for collection in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for block in list(collection):
            if block.users == 0:
                collection.remove(block)


def add_cone(bm, p0, p1, r0, r1, segments=7):
    d = p1 - p0
    length = d.length
    if length < 1e-4:
        return
    mid = (p0 + p1) * 0.5
    rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix().to_4x4()
    mat = Matrix.Translation(mid) @ rot
    bmesh.ops.create_cone(
        bm, cap_ends=True, cap_tris=False, segments=segments,
        radius1=r0, radius2=r1, depth=length, matrix=mat,
    )


def add_card(bm, uv_layer, center, size, cell, rand):
    # random plane basis, slightly tilted upward
    a = rand.random() * math.tau
    tilt = (rand.random() - 0.5) * 0.8
    u = Vector((math.cos(a), math.sin(tilt) * 0.35, math.sin(a))).normalized()
    n = Vector((rand.random() - 0.5, 1.0, rand.random() - 0.5)).normalized()
    v = n.cross(u).normalized()
    u = v.cross(n).normalized()
    w = size * (0.78 + rand.random() * 0.44)
    h = size * (0.82 + rand.random() * 0.36)
    pts = [center - u * w * 0.5 - v * h * 0.5,
           center + u * w * 0.5 - v * h * 0.5,
           center + u * w * 0.5 + v * h * 0.5,
           center - u * w * 0.5 + v * h * 0.5]
    verts = [bm.verts.new(p) for p in pts]
    face = bm.faces.new(verts)
    cx = cell % 2
    cy = cell // 2
    pad = 0.012
    u0 = cx * 0.5 + pad
    u1 = (cx + 1) * 0.5 - pad
    v0 = cy * 0.5 + pad
    v1 = (cy + 1) * 0.5 - pad
    uvs = [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]
    for loop, uv in zip(face.loops, uvs):
        loop[uv_layer].uv = uv


def grow_tree(seed):
    rand = random.Random(seed)
    bark = bmesh.new()
    cards = bmesh.new()
    card_uv = cards.loops.layers.uv.new("UVMap")
    tips = []

    # trunk: a few gently curved segments
    h = 3.1 + rand.random() * 0.8
    p = Vector((0, 0, 0))
    direction = Vector((0, 1, 0))
    trunk_segments = 5
    for i in range(trunk_segments):
        length = h / trunk_segments
        direction = (direction + Vector((rand.uniform(-0.08, 0.08), 0.12, rand.uniform(-0.08, 0.08)))).normalized()
        end = p + direction * length
        r0 = 0.22 * (1.0 - i / trunk_segments * 0.58)
        r1 = 0.22 * (1.0 - (i + 1) / trunk_segments * 0.58)
        add_cone(bark, p, end, r0, r1, 8)
        p = end
    trunk_top = p.copy()

    def branch(base, direction, length, radius, depth, angle_seed):
        r = random.Random(angle_seed)
        end = base + direction * length
        add_cone(bark, base, end, radius, radius * (0.55 + r.random() * 0.16), 6 if depth > 1 else 5)
        if depth == 0:
            tips.append((end, direction))
            return
        count = 2 if depth > 2 else 2
        if r.random() > 0.45:
            count += 1
        for i in range(count):
            a = r.random() * math.tau
            spread = 0.5 + r.random() * 0.65
            side = Vector((math.cos(a) * math.sin(spread), math.cos(spread) * 0.9, math.sin(a) * math.sin(spread))).normalized()
            new_dir = (direction * (0.55 + r.random() * 0.25) + side * (0.5 + r.random() * 0.35))
            new_dir.y += 0.06
            new_dir.normalize()
            branch(
                end, new_dir,
                length * (0.58 + r.random() * 0.15),
                radius * (0.55 + r.random() * 0.12),
                depth - 1, angle_seed * 7919 + i * 131 + 17,
            )

    # main limbs from the upper trunk
    limb_count = 5 + int(rand.random() * 3)
    for i in range(limb_count):
        a = (i / limb_count) * math.tau + rand.uniform(-0.35, 0.35)
        spread = 0.42 + rand.random() * 0.3
        base = trunk_top.lerp(p, 0.12 + rand.random() * 0.25)
        side = Vector((math.cos(a) * math.sin(spread), math.cos(spread), math.sin(a) * math.sin(spread))).normalized()
        branch(base, side, 1.55 + rand.random() * 0.75, 0.08 + rand.random() * 0.04, 3, seed * 31 + i)

    # blossom cards around terminal tips and along the outer canopy
    card_count = 0
    for idx, (tip, d) in enumerate(tips):
        step = 4 if LOW else 2
        if idx % step != 0:
            continue
        center = tip + Vector((rand.uniform(-0.9, 0.9), rand.uniform(-0.35, 0.9), rand.uniform(-0.9, 0.9)))
        cell = (idx + seed) % 4
        size = (2.35 + rand.random() * 1.3) if LOW else (1.55 + rand.random() * 1.05)
        add_card(cards, card_uv, center, size, cell, rand)
        card_count += 1
    # extra inner canopy cards to fill silhouette
    for k in range(5 if LOW else 10):
        ang = rand.random() * math.tau
        rr = 0.4 + rand.random() * 2.4
        center = Vector((math.cos(ang) * rr, 3.0 + rand.random() * 3.1, math.sin(ang) * rr))
        add_card(cards, card_uv, center, 2.0 + rand.random() * 1.2 if LOW else 1.4 + rand.random() * 1.0, (k + seed) % 4, rand)
        card_count += 1

    # finalize meshes
    bark_mesh = bpy.data.meshes.new("PeachBark")
    bark.to_mesh(bark_mesh)
    bark.free()
    bark_obj = bpy.data.objects.new("PeachBark", bark_mesh)
    bpy.context.collection.objects.link(bark_obj)

    card_mesh = bpy.data.meshes.new("PeachBlossoms")
    cards.to_mesh(card_mesh)
    cards.free()
    card_obj = bpy.data.objects.new("PeachBlossoms", card_mesh)
    bpy.context.collection.objects.link(card_obj)

    bark_mat = bpy.data.materials.new("Bark")
    bark_mat.diffuse_color = (0.16, 0.09, 0.055, 1)
    bark_mesh.materials.append(bark_mat)

    blossom_mat = bpy.data.materials.new("Blossoms")
    blossom_mat.diffuse_color = (0.95, 0.62, 0.68, 1)
    blossom_mat.use_nodes = True
    bsdf = blossom_mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (0.95, 0.62, 0.68, 1)
        bsdf.inputs["Alpha"].default_value = 0.65
    blossom_mat.blend_method = 'CLIP'
    card_mesh.materials.append(blossom_mat)

    return bark_obj, card_obj, len(tips), card_count


def export_variant(seed, name):
    clear_scene()
    bark_obj, card_obj, tips, cards = grow_tree(seed)
    bpy.ops.object.select_all(action='DESELECT')
    bark_obj.select_set(True)
    card_obj.select_set(True)
    bpy.context.view_layer.objects.active = bark_obj
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(OUT_DIR, name),
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_materials='EXPORT',
        export_texcoords=True,
        export_normals=True,
    )
    print(f"EXPORTED {name}: tips={tips}, cards={cards}")


for i in range(3):
    suffix = "lod_" if LOW else ""
    export_variant(2024 + i * 1117, f"peach_tree_{suffix}{i}.glb")

print("DONE", sorted(os.listdir(OUT_DIR)))
