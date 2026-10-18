# M1 · 垂直切片验收

验收范围：以「照片级写实方向」为目标的 M1 垂直切片，人物按此前确认的**中远景电影感**口径验收；不包含近景照片级人脸/布料。

## 1. 场景与固定机位

所有截图均为 1440×900 桌面视口，纯净 UI 的游戏视角（移动端除外）。

| 场景 | 机位 | 截图 |
|---|---|---|
| 桃花林 | 第一折沿线，面向山口 | [m1-peach.png](preview/m1-peach.png) |
| 洞口 | 第二折，距山口约 35m | [m1-cave.png](preview/m1-cave.png) |
| 村中广场 | 第七折，面向水井与村舍 | [m1-village.png](preview/m1-village.png) |
| 美池 | 池塘北岸，面向反射水面与村舍 | [m1-pond.png](preview/m1-pond.png) |
| 溪口起点 | 武陵溪沿线 | [m1-start.png](preview/m1-start.png) |
| 移动端 | 390×844 移动视口，桃花林 | [m1-mobile.png](preview/m1-mobile.png) |

## 2. 功能检查

- [x] 便携 Blender 4.5.14 LTS 安装
- [x] CC0 Poly Haven HDRI + 8 组 PBR 材质
- [x] GLB 资产管线与 Three.js 实例化加载
- [x] 桃树高/低 LOD 与移动端强制低 LOD
- [x] Blender 桃树、汉晋院落、洞口石拱资产
- [x] HDRI/PMREM 环境光、Neutral 色彩管理
- [x] 过滤版半分辨率 GTAO（排除天空/Sprite/透明花卡）
- [x] SMAA、Bloom、PCF 阴影、雾、曝光
- [x] 池塘 Reflector 平面反射与自定义水体 shader
- [x] 移动端画质降级（无 GTAO/Bloom/SMAA、像素比 1.0、1024 阴影）
- [x] 中远景人物比例与衣袍层级升级
- [x] 自动导览、游记、史注与热点交互保持可用

## 3. 性能

headless Chrome，Apple M2 Mac mini，1440×900，DPR 1。

| 场景 | FPS |
|---|---:|
| 溪口起点 | 39.7 |
| 桃花林 | 36.3 |
| 洞口 | 41.7 |
| 村中广场 | 52.0 |
| 美池 | 60.0 |
| 移动视口桃花林（390×844，DPR 1.0） | 60.3 |

- 首次加载：桌面约 2.8s，移动视口约 3.2s（本地开发服务器，非 CDN）
- 控制台错误：无
- 原始数据：[m1-metrics.json](preview/m1-metrics.json)

## 4. 资产预算与工具链

- Blender 4.5.14 LTS，headless Python 脚本生成
- 贴图约 83MB（2K JPG + normal/roughness）
- 模型：桃树高/低 LOD 各 3 个、汉晋院落 2 种、洞口石拱 1 个
- Three.js 0.186、Vite 7、EffectComposer/SMAA/GTAO/Reflector
- 资源许可见 [public/assets/CREDITS.md](public/assets/CREDITS.md)

## 5. 已知限制

1. **人物近景不足**：目前为中远景程序化角色，脸、手、头发、衣褶不足以做照片级近景。角色基础人体许可与服装资产已调研，推荐后续使用 MPFB2 + 手工汉晋衣袍 + Quaternius CC0 动作。
2. **洞口**是 PBR 崖面 + Blender 石拱组合，不是完整雕凿山体。
3. **贴图未压缩为 KTX2**，仍使用 83MB JPG；首屏加载和带宽不达生产标准。
4. **移动端只做了 headless 视口验证**，未做真机温度/续航/触控体验验收。
5. **LOD 切换**在极端视角可能有轻微 pop；桌面端仍受花卡 overdraw 与 GTAO 影响，最低约 36fps。
6. 汉晋历史细节属于文学化合理想象，不是考古复原。

## 6. 复现

```bash
npm install
npm run dev
# 打开 http://127.0.0.1:5173
```

生产构建：

```bash
npm run build
```

M1 验收日期：2026-10-18。
