# 掩体之间 · 场景原型

本地 Web 3D 原型，使用 TypeScript、Babylon.js 和 Vite。无需 Blender 或外部素材即可运行。

## 启动

Windows 上直接双击项目目录中的 `start-game.bat`。脚本会检查 Node.js/npm，在缺少 Vite 时安装项目依赖，然后启动服务并自动打开默认浏览器。启动窗口需要保持打开，结束时在窗口中按 Ctrl+C。若提示端口 5173 已被占用，可以先访问现有服务，或关闭旧服务后重试。

也可以手动启动：

安装 Node.js 22.12+ 或 24 LTS 后，在本目录执行（Windows PowerShell 使用 npm.cmd）：

```powershell
npm.cmd install
npm.cmd run dev
```

在运行服务的 Windows 上打开 http://127.0.0.1:5173 。Mac 的 localhost 不指向 Windows；远程桌面中打开 Windows 浏览器可以查看。开发服务器仅监听主机回环地址，未发布到互联网。

## 操作

- WASD：地面移动，斜向速度与直行一致。
- 鼠标悬浮：瞄准对应地面位置，角色朝向随之改变。
- 数字键 1／2／3 或右上角按钮切换手枪／剑／火箭炮，鼠标左键使用当前武器。无换弹、无限弹药；不同武器冷却独立，切换不会重置冷却。
- 手枪：单次点击发射，间隔 0.1 秒、弹速 36 单位/秒、射程 28 单位。固定枪口高度 0.9，直线弹道；穿过灌木，碰到其他方块停止。逐帧扫描完整飞行线段，避免高速穿墙。
- 剑：前方 120°、半径 2.8 的扇形挥砍，间隔 0.55 秒。挥动期间显示剑刃和扇形区域；每次挥砍对每块木块只计一次伤害，三剑打碎木块，大理石挡剑。伤害在挥砍启动时结算；挥动持续 0.12 秒，期间锁住角色移动和朝向，结束后恢复移动，剑刃和扇形区域同时消失。
- 火箭炮：弹速 8 单位/秒、间隔 2.5 秒，碰到实体方块或飞行满 3 秒爆炸；碰到灌木被吸收，不爆炸；爆炸半径 3 单位，触及范围的木块与大理石一次摧毁。显示炮弹、尾焰、爆炸光球和扩散圆环。当前仅做环境破坏，无玩家伤害和爆炸遮挡计算。
- R 或页面按钮：重置角色、方块、地面、惯性和武器效果。
- 固定斜俯透视相机（50° 视野），窗口变窄时自动拉远以容纳地图；无跳跃，基础重力让角色保持贴地。
- 相机俯角约 37°；移动计算兼容 Babylon Vector3 坐标属性。

## 当前范围

- 30 × 30 场地由 625 个 1.2 × 1.2 地块组成；玩家缩放为原来的 80%，碰撞半径 0.344；共 38 个掩体，包含地图下方 z=-12 的混合测试排及外围新增的成对掩体。
- 障碍物统一为 1.2 × 1.2 正方形底面、高 1.8 的长方体，位置对齐 1.2 单位网格。
- 圆形玩家碰撞与墙面滑动，地图边界限制。
- 卡通分档光照，程序化地面网格。
- 视线遮挡使用 16 点固定采样柔化边界（地面半径 0.25、方块表面半径 0.10 世界单位）；未探索区域为黑色，已探索遮挡区保留约 24% 亮度的历史状态。立方体使用 0.12 单位视觉倒角，碰撞尺寸不变；FXAA 平滑轮廓锯齿，卡通光照色阶使用柔和过渡。
- 360 度障碍物视线遮挡：使用眼高 1.04 到表面真实三维坐标的射线与方块体积相交，区分当前视野与历史记忆。不是由光源方向生成的普通阴影。
- 木块、石块和灌木遮挡视线，水箱不遮挡视线。按玩家完整碰撞半径判断进入：部分进入时观察点留在灌木边界外，不能看穿对面；完全进入后仅灌木内部可见，外界遮挡。相连灌木作为同一区域，内部接缝不触发视野切换。没有视距限制或视锥角度；已加入本局探索记忆。方块表面逐像素判断可见性，只显示真正进入视野的部分；柔化采样限制在自身方块范围内，避免跨入相邻方块。地面继续逐点计算柔化遮挡，水箱不参与遮挡。
- 同高、紧邻的直排方块仅在自身表面遮挡计算中忽略互相投影，避免接缝斜切；外部障碍仍逐像素遮挡该排方块，地面遮挡仍使用全部实体。透明方块只绘制朝向相机的一层表面，避免前后面叠加。
- 棕色方块为木块，累计三次手枪命中后碎裂消失，并立即解除碰撞、子弹阻挡和视线遮挡；白色方块为大理石，暂不受手枪破坏。碎块约 0.75 秒后消失，无碰撞。R 或重置按钮恢复全部方块与命中计数。
- 已有手枪、剑、火箭炮和环境破坏；已加入本地随机移动敌对测试靶与命中闪烁，尚无生命值、死亡、反击、联机或怒气。

## 验证与构建

### 本地敌对测试靶与听觉提示

- 红色 pawn 随机移动、停顿和换向，遵守地图边界、实体碰撞和地形减速／水面惯性。R 重置敌人、命中数和声音提示。
- 手枪扫掠弹道命中玩家圆形碰撞；剑按前方扇形和掩体阻挡判定；火箭碰到敌人爆炸，范围内角色收到一次命中。当前爆炸延续环境原型规则，不计算爆炸遮挡。
- 命中时敌人闪白约 0.4 秒，武器栏显示累计命中数；无生命值和死亡，可反复测试。敌人不反击，无联网通信。
- 敌人仅在实时视线中显示，不进入战争迷雾记忆。不可见且实际移动时，在 12 单位听觉范围内产生脚步声；停住、卡墙、超出范围或已可见时不提示。
- 脚步提示为黄色漂浮感叹号，约 1.1 秒消失；位置按 3 单位区域取整并随机偏移，是事件发生时的大致位置，不持续追踪。每次提示最少间隔 0.65 秒。
- 脚步音通过 Web Audio 合成，首次键盘／鼠标操作后启用；有左右方向和距离衰减，音频不可用时仍保留视觉提示。

### 战争迷雾与探索记录

- 未见区域黑色；当前视野正常显示；曾见但被遮挡的地块与方块显示暗色历史轮廓。
- 探索记忆按完整地块和方块保存，不保留旧视线的黑色阴影形状；已知物体在视野外统一暗色显示。实时视野仍按局部遮挡计算，不会因一角可见而整块亮起。
- 探索纹理为 150×150（每格 0.2 世界单位），地面与方块表面分开记录。视野逐帧更新，记忆每 0.1 秒采样，破坏时立即请求更新。
- 地块种类和方块存亡仅在重新看见后更新；视野外的破坏不提前泄露。动态子弹、爆炸、碎片不进入历史记忆。
- 灌木内部仍限制实时视野，但已探索的外部地形保留暗色记忆。记录限本局；R 或刷新页面清除。
- `src/fog.ts` 管理三维视线、相邻表面规则和历史快照；`src/visibility.ts` 负责实时与记忆着色。

### 移速与地形原型参数

- 手枪移速 5 单位/秒；剑 6.25（125%）；火箭炮 3.75（75%）。界面显示当前武器在所在地块的目标移速。
- 灌木可穿行，阻挡视线，手枪子弹穿透；仅三次近战可清除。吸收火箭弹后火箭消失且不爆炸，灌木保留；范围爆炸也不清除灌木。
- 水箱透明但阻挡移动、子弹和火箭；三次手枪／剑攻击或一次爆炸摧毁。碎裂时产生水滴效果，所在及周围 3×3 地块变为水面。
- 普通地块不影响移动；灌木地块保留 35% 移速，清除后恢复普通地块；木块和大理石碎裂后所在及周围 3×3 地块变为残渣，保留 60% 移速。
- 水面具有加速、转向和松键滑行惯性；离开水面恢复即时控制，碰撞仍有效。挥剑锁定立即清除惯性，恢复移动时无旧惯性残留。
- 地面效果持续至重置；水和残渣重叠时以最后一次破坏覆盖，活灌木优先显示灌木效果。范围在地图边缘裁切，不生成地图外地块。

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run preview
```

`src/world.ts`：场景布局、碰撞和 CPU 视线规则。
`src/visibility.ts`：逐像素 GPU 视线遮挡及卡通着色。
`src/main.ts`：场景、输入、角色与循环。
`GAME_DESIGN.md`：长期玩法讨论记录，未确认的建议不代表已实现。


## 榴弹、油箱和燃烧（2026-10-18）
- 1 手枪、2 剑、3 火箭炮、4 榴弹；左键发射，R 重置地图、探索和角色状态。
- 火箭弹初速 2，加速度 30，上限 54（手枪子弹 36）；仍然碰撞或 3 秒自爆。
- 榴弹以点击的地面位置为目标，抛物线飞行，可越过障碍，途中碰撞或落地爆炸；冷却 1.8 秒，移速与手枪相同。火箭炮与榴弹爆炸半径均为 3。接触灌木体积时吸收，不引爆。
- 新增 5 个黑色油箱，左前方有连续油箱便于测试。手枪/剑一击打破，铺出 3×3 石油地块；爆炸引爆油箱，半径 3，连锁引爆附近油箱并摧毁其他方块和灌木，留下红色火焰。
- 石油比水更滑，进入后易燃；未燃烧时进入灌木清除易燃。爆炸点燃范围内的石油。
- 易燃角色遇爆炸或火焰会持续燃烧闪烁，进入水面灭火并清除易燃。任何角色站在火焰上都会持续闪烁。
- 燃烧角色进入灌木时，只清除与角色碰撞圆重叠的灌木，不触发爆炸、不扩散火焰，自身燃烧和易燃状态保持不变。角色在灌木中受到武器爆炸时，仍触发半径 1.8 的二次爆炸。双方 pawn 共用此规则。
- 当前无生命值，伤害用闪烁代替；二次爆炸以额外爆炸范围和闪烁反馈表示。火焰暂不自动熄灭；水箱释放的水可灭火，水地块优先于火焰。爆炸范围暂不计算墙体阻挡。


### 大理石残骸更新
大理石破坏后只在原地留下一个高 0.3、底面与地块一致的矮长方体，不向附近扩散残渣。残骸阻挡双方角色移动，但不遮挡视线；水、石油、火焰及其他残渣不能覆盖它，后续爆炸也不会清除它。探索记忆记录其状态，R 重置恢复原场景。


### 状态反馈与石油点燃
易燃时角色白色闪烁，点燃后红色闪烁（优先于易燃和受击白闪），双方角色一致。燃烧角色走进石油地块时，只将脚下石油转为火焰，不产生爆炸或自动扩散到相邻地块；水面灭火后不再点燃石油。


### 30×30 地块与单排测试墙
地图保持 30×30 世界单位，使用 30×30（900 格），单格边长 1。玩家大小、移动及武器参数不变，方块高度 1.8。移除三排厚墙，增加 6 组单排测试墙，每组 5 格，包括木头、大理石、灌木和水箱，分布于地图两侧及上下方，保留绕行空间。每格独立破坏，原有地形、燃烧及探索记忆规则继续生效。


### 生命、弹药与怒气技能
双方生命值 100；生命归零结束本轮，显示胜负或同归于尽，R 恢复生命、怒气、地图与弹药。敌方仍为随机移动测试靶，不主动攻击，眩晕时停止运动。敌方血量仅在可见时显示。

| 武器 | 单次伤害 | 攻击间隔 | 容量 | 补满时间 |
| --- | --- | --- | --- | --- |
| 手枪 | 12 | 0.1 秒 | 10 | 2 秒 |
| 剑 | 25 | 0.55 秒 | 无限 | 无，受攻击恢复限制 |
| 火箭炮 | 45 | 2.5 秒 | 1 | 4 秒 |
| 榴弹 | 40 | 1.8 秒 | 2 | 3 秒 |

空弹自动开始补充，F 可以提前补满；补充期间该武器不能攻击，切换武器时补充在后台继续，不重置计时。攻击间隔与补充独立计时，必须同时满足。备用弹药暂无限。
怒气上限 100，存活每秒 +5，对敌人实际造成 1 点伤害 +0.5 怒气；自伤、破坏方块和鞭尸不给怒气。两种终极技能共用怒气，每次消耗 100，按 Q 使用。
- 剑：破阵冲锋，固定方向蓄力 0.35 秒后冲刺 4 单位（速度 16）。摧毁沿途木箱，穿灌木；大理石、水箱、油箱、残骸阻挡。命中敌人造成 15 伤害和 0.6 秒眩晕，冲锋停止；结束恢复 0.15 秒后可接火箭炮/手枪。期间不能移动、转向、切武器或普通攻击。
- 榴弹：燃油榴弹，向鼠标地面位置抛射，落地铺 3×3 石油，不直接造成爆炸伤害，也不消耗普通榴弹。水面、大理石残骸、现有火焰不被覆盖；接触灌木被吸收。技能施放恢复 0.15 秒，可接手枪逼位、火箭炮点燃。
油箱爆炸伤害 60，灌木二次爆炸 15；燃烧或站在火焰每秒扣 8 血，二者不重复叠加。爆炸会自伤；水面灭火。状态仍用白色易燃、红色燃烧闪烁。

## 联机版本（2026-10-20）

首页现在是 1v1 房间大厅。双击 `start-game.bat` 同时启动网页和战斗后端，打开两个浏览器标签，输入相同房间号即可测试。房间号支持 1–16 位英文字母、数字、下划线和短横线，不区分大小写。第一人创建房间，第二人加入，三秒倒计时后开战；第三人会收到房间已满提示。刷新或关闭页面会退出，战斗中断线判负；两人均按 R 才开始下一局。单人训练入口保留。

- `server/network.ts`：同源 `/ws` WebSocket、双人房间、消息校验、心跳和空房间清理。
- `server/room.ts`：30 Hz 固定步长模拟，15 Hz 状态同步。客户端只发送移动、瞄准、切换武器和攻击意图；服务端判断碰撞、伤害、血量、怒气、技能、弹药补充、环境连锁与胜负。
- `server/map.ts`：使用随机种子生成 30×30 地图，随机摆放六段单层墙体及散落方块，保留五种材质和安全出生区。新房间及每次重开都使用新种子，双方接收同一结果。
- `src/main.ts`：房间大厅；`src/online.ts`：联机渲染与输入；`src/training.ts`：原有本地训练；`src/protocol.ts`：消息协议。
- 服务端不给客户端发送视野外敌人的位置和血量，而是提供粗略脚步提示。地形探索记忆仍由客户端显示，地图数据目前完整下发，尚未实现隐藏地图数据的防作弊。
- 生命 100；手枪 10 发、补充 2 秒；火箭炮 1 发、补充 4 秒；榴弹 2 发、补充 3 秒；剑不限次数。F 主动补充，空弹后自动补充。Q 释放当前武器已实现的怒气技能（剑突进、榴弹燃油技能），消耗共享怒气。
- 当前是内存房间原型，没有账号、数据库、断线恢复、网络预测或延迟补偿。服务重启会清空房间。默认仅本机访问，尚未部署公网。

运行 `npm test` 验证战斗与 WebSocket 集成；`npm run build` 检查类型并打包。`npm run preview` 可在 4173 端口预览构建，仍会启动同一战斗后端；单独托管 `dist` 静态文件不能进行联机。

上文历史记录中“无限弹药”“无玩家伤害”和旧网格尺寸已过时，以本节和当前代码为准。

## 随机地图更新
训练场每次进入和按 R 重置都会重新生成地图；联机双方准备下一局时也会换图。保留 73 个方块及原有材质数量，墙体为单格厚，墙与其他掩体之间留通路。测试验证了 100 个种子的布局各不相同、网格对齐、出生点安全且全部可行走地块连通。随机地图仍需后续进行对战平衡调优。


## 新武器：霰弹炮（2026-10-21）

按 **5** 或武器栏“霰弹炮”切换，左键发射。训练场与房间联机共用攻击判定，联机由服务端结算。

- 前方 120° 锥形范围，射程 5 格（剑为 2.8 格），每个命中玩家受到一次 30 点伤害。
- 击退最多 2.5 格，撞墙、低矮大理石残骸或地图边界会停止；附带 0.2 秒硬直并打断剑突进。
- 单发容量，射后自动装填 3.5 秒；切换武器不会清除装填时间。持有时移速 4.5。
- 一发摧毁命中的木块，也能打碎水箱和油箱；无法破坏大理石，穿过灌木。油箱仅破裂流油，不触发爆炸。
- 点燃锥形范围内已有的、无遮挡的石油地块。水面保持不变，不会隔墙点火；同一发不会穿透刚打碎的掩体继续伤害后方目标。
- 攻击时短暂显示橙色范围闪光，显示范围会在实体掩体前截断。此武器暂未添加专属怒气技能。

新增 5 项武器测试，完整测试合计 70 项通过；本次浏览器视觉验收因访问策略拒绝而未完成。

## 连续攻击与五种怒气技能（2026-10-24）

以下规则替代上文旧的榴弹燃油技能和“霰弹炮暂无怒气技能”说明。

按住鼠标左键持续使用当前武器；仍遵守攻击冷却、弹药及自动装填。松开、鼠标离开画布、窗口失焦、进入后台或联机输入超时停止攻击。数字 1–5 切换武器，满 100 共享怒气后按 Q 使用当前武器技能；技能不消耗普通弹药。

| 武器 | Q 技能 |
| --- | --- |
| 手枪 | 强化 6 秒，射击间隔从 0.1 秒缩短到 0.05 秒，弹速从 36 提升到 60；装填仍需要时间。 |
| 剑 | 朝瞄准方向蓄力突刺，破坏路径木块、命中眩晕；结束后移速提升 40%，持续约 4 秒。 |
| 火箭炮 | 同时发射三发，分别朝正前方与左右 20°，保留加速弹道。 |
| 榴弹 | 投掷大炸弹，爆炸半径从 3 格提高到 6 格；仍可被灌木吸收。 |
| 霰弹炮 | 攻击范围扩大到前方 180°、7 格，摧毁范围内五种方块并击退敌人；保留大理石残骸。 |

双方生命分别显示在左上角和右上角。敌人不在视野内时显示“视野外”，不会泄露实时血量。视野外的敌方射击和爆炸会出现短暂浮动“枪声 / 爆炸声”提示，位置按约 3 格区域粗略显示，不跟踪敌人；视野内不重复提示。原有模糊脚步提示保留。训练假人保持随机移动，开火提示可通过同房间双客户端验证。

训练与联机共用技能实现，联机由服务器结算。自动化测试涵盖持续攻击、松开停火、输入超时、装填后继续攻击、五种怒气技能、提示的遮挡过滤与过期。浏览器视觉验收未完成。

## 道具、有限弹药与随机出生（2026-10-24）

- 每 8 秒随机刷新一个道具，场上最多 9 个。只在可站立的普通、石油、水面、普通残骸地块生成，避开玩家脚下、实体方块、灌木、火焰和不可通行的大理石残骸。道具所在地变为不安全地面时清除。
- 走近自动拾取：绿色「+」血包回复 35 血；金色「AM」弹药包补满所有武器弹匣和备用弹药并完成装填；紫色「Q」激素增加 35 怒气。血量、怒气均不超过 100。视野外不显示道具。
- 普通攻击初始总弹药（含弹匣）：火箭炮 4 发、榴弹 6 发、霰弹炮 8 发。保留原装填时间，装填从备用弹药转移至弹匣，不再凭空增加总量；耗尽后只能拾取弹药包恢复。手枪保留无限备用弹药，剑不受弹药限制。怒气技能仍单独消耗怒气，不消耗普通弹药。
- 手枪普通射击间隔 0.075 秒，怒气强化时 0.0375 秒；实际射击频率受模拟步长约束。
- 训练初始/重置、联机新房间/下一局均随机选择出生位置。双方至少相距 10 格，并从双方视角检查对方身体范围的视线遮挡；不会退回相互可见的固定出生点。
- 道具生成、拾取、治疗、补弹和怒气增加在联机中由服务器处理，客户端只显示视野内道具。

## 技能轨迹与道具调整（最新规则）

- 攻击改回一次左键点击释放一次，按住不会连发。
- 火箭炮 Q 中间一发朝鼠标目标，侧弹沿玩家到目标半径 2 格圆的两条切线。距离越远夹角越小；目标距离不超过 2 格时无两条实切线，采用左右各 90° 的边界处理。
- 霰弹炮 Q 保持普通攻击的 120° 锥角，仅把半径从 5 格扩大到 7 格，仍摧毁锥形范围内方块。
- 剑 Q 前摇 0.35 秒，锁定施放时鼠标位置，逐段突刺到目标；破坏沿途方块、拾取道具。大理石破坏后留下的残骸会阻挡突刺；不引爆油箱。保留命中一次伤害/眩晕和突刺后加速。
- 道具边长从 0.55 放大至 0.85 格：血包亮绿色、弹药包黄铜色、怒气深蓝色；保留 + / AM / Q 标记。每次刷新概率分别为 55% / 15% / 30%。

## 火箭齐射与霰弹炮最新参数
- 火箭炮 Q 一次消耗满怒气，立即发射第一轮，间隔 0.35 秒追加两轮，共 9 枚。每轮从玩家当前位置发射，保留施放时鼠标目标圆的切线算法。重置或死亡取消未发射的轮次，不消耗普通弹药。
- 霰弹炮普通半径 7 格，Q 半径 9 格，统一锥角 90°。视觉范围、伤害范围和环境交互使用相同参数。
- 霰弹炮弹匣 4 发、备用 4 发，总量仍为 8 发；打空后装填 3.5 秒，全部耗尽需弹药包补充。

## Interface refresh (2026-10-25)
- All player-facing copy is English, including lobby, HUD, match results, accessibility labels and server errors.
- The lobby includes room entry, a training link, core rules, terrain interactions, weapon ultimates, pickup effects and keyboard controls. The layout stacks and scrolls on smaller screens.
- The match HUD uses large HP, rage and ammunition values, health/rage bars, a compact weapon selector, reserve count and reload timing. Hidden opponent health remains hidden. The old verbose terrain/speed readout is removed.

## Netlify release preparation (2026-10-25)

See `NETLIFY-DEPLOY.md` for upload steps and verification limits. `netlify-ready-game.zip` is the source project for logged-in Netlify Drop builds. It includes frontend source, the single game Function, shared game logic, configuration and lockfile; dependencies and local caches are excluded.

Production uses direct `/.netlify/functions/game` HTTP requests and strongly consistent Blobs with conditional writes. Room state is saved between invocations, including active projectiles and skill timers. The original local WebSocket mode remains available. A match now contains exactly three rounds; round wins award one point and the final score determines the winner (or a draw).

The Netlify build command is `npm run build:netlify`. The official function packaging check is `npm run check:function`. The packaged-function smoke tool uses a local storage emulator and is not a cloud performance test. Public upload, visibility settings and two-device cloud playtesting remain to be completed in the user's Netlify account.

## Netlify movement presentation (2026-10-28)

The published HTTP transport showed high frame rates but choppy motion. An isolated two-client cloud probe measured 135–482 ms per poll (median 333 ms); this is one short sample, not a service guarantee. Player-reported sync was about 130 ms. Both clients still commit to the same strong-consistency room blob.

HTTP clients now predict their own ordinary movement each frame with shared collision, weapon speed and terrain friction rules. Each server snapshot restores the authoritative position and velocity, replays at most 200 ms of recent local input using estimated one-way delay, and smooths small visual corrections. Prediction stops after 300 ms without an update. This is bounded presentation prediction, not exact sequence-based reconciliation; large delays and abrupt server corrections can still be visible. Damage, dash destruction, pickups, fog exploration and match results remain authoritative. Opponents and persistent projectile effects interpolate between received states, and hidden opponents disappear immediately.

This preserves all-Netlify hosting. It does not remove HTTP/storage latency or make hit confirmation instant. Visual two-browser verification is still required after uploading the updated source ZIP.

### Follow-up: input coalescing and latency spikes (2026-10-28)

Supersedes the timing limits above: HTTP rooms now catch up at most 1.5 seconds (45 ticks), with a 45-tick stale-input timeout; local WebSocket rooms retain their original 15-tick timeout. Client prediction stops after 1.2 seconds without updates. Responses include state age and server elapsed time so prediction does not assume half the whole function duration is network travel.

Each authenticated player writes a bounded input mailbox isolated by room generation and identity. A simulation request reads both mailboxes, applies inputs using server arrival times, and records consumed IDs atomically with room state. A losing concurrent request can return the already-committed snapshot without another room write. Inputs never supply positions or damage. Duplicate/retried requests remain idempotent. The new reads/writes may increase baseline storage overhead; reduced room contention is verified in tests, not yet measured in the deployed service. Input blobs are not automatically garbage-collected.

101 automated tests pass, including one shared commit for two simultaneous polls, a 950 ms server gap without lost movement ticks, and a 950 ms client gap without the previous 300 ms freeze. Cloud latency and visual playtesting remain unverified for this revision.
