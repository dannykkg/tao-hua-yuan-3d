# Asset credits

All runtime environment textures and HDRIs below are **CC0 1.0** (public domain), downloaded from [Poly Haven](https://polyhaven.com/license). Attribution is not required, but is recorded here for provenance.

## HDRI
- **Kloofendal 28d Misty** — Greg Zaal, Jenelle van Heerden — CC0 — https://polyhaven.com/a/kloofendal_28d_misty

## PBR textures (2K JPG diffuse / OpenGL normal / roughness)
- **Mossy Rock** — Rob Tuytel — https://polyhaven.com/a/mossy_rock
- **Dirt** — Charlotte Baglioni — https://polyhaven.com/a/dirt
- **Leafy Grass** — Charlotte Baglioni — https://polyhaven.com/a/leafy_grass
- **Dark Planks** — Rob Tuytel — https://polyhaven.com/a/dark_planks
- **Worn Plaster Wall** — Dimitrios Savva — https://polyhaven.com/a/worn_plaster_wall
- **Grey Roof Tiles** — Rob Tuytel — https://polyhaven.com/a/grey_roof_tiles
- **Thatch Roof Angled** — Rob Tuytel, Dimitrios Savva — https://polyhaven.com/a/thatch_roof_angled
- **Rough Linen** — colormass, Rico Cilliers — https://polyhaven.com/a/rough_linen

## Generated assets
- `public/assets/models/peach_tree_{0,1,2}.glb` and `peach_tree_lod_{0,1,2}.glb` — generated in Blender 4.5.14 LTS with `scripts/blender/build_peach_trees.py`; bark uses the CC0 rock set, blossom cards use a runtime-generated atlas in `src/world/vegetation.js`.
- `public/assets/models/cave_portal.glb` — generated with `scripts/blender/build_cave_portal.py`; displaced stone portal around the cave opening.
- `public/assets/models/hanjin_house_{tile,thatch}.glb` — generated in Blender 4.5.14 LTS with `scripts/blender/build_hanjin_house.py`; geometry uses the CC0 PBR sets at runtime.
- `public/assets/models/cave_portal.glb` — generated in Blender 4.5.14 LTS with `scripts/blender/build_cave_portal.py`; displaced rock cluster around the entrance, uses the CC0 rock PBR set at runtime.
- Terrain, village geometry, characters, animals and the surrounding landscape remain procedurally generated in Three.js.

## Tools
- Blender 4.5.14 LTS (portable) — https://www.blender.org/download/lts/ — used offline to author/export the peach-tree GLBs.
