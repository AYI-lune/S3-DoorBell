# S3 智能门铃 · Web 控制台

Vue 3 + Vite 写的纯前端控制台：**没有后端**，浏览器直接用 MQTT over WebSocket
连 broker，和设备（ESP32-S3）收发消息。

- 设备固件：`D:\Andruino\ESP_IDF_Project\S3_DoorBell`
- 前端目录：`D:\Andruino\Vue\S3_DoorBell`
- 公共 broker：`broker.emqx.io`（设备走 1883，网页走 8084/wss）

---

## 1. 功能

| 页面 | 内容 |
| --- | --- |
| 登录 / 注册 | 第一个注册的账号自动成为管理员；密码加盐 SHA-256 后存 localStorage |
| 概览 | 最新抓拍画面（含「家人/陌生人/未检出」标签）、温湿度/光照、WiFi/运行时长/固件/IP、事件时间线（可筛选）、家人录入与清库 |
| 账号 | 添加账号、修改角色、重置密码、删除账号（不能删自己、不能删最后一个管理员） |
| 设置 | MQTT 地址/主题前缀/命令口令、自动连接开关、连接日志、修改自己的密码、清除本地数据 |

设备控制命令：立即抓拍、远程响铃、切换 OLED 页面、录入人脸、清空特征库。

---

## 2. 本地运行

```bash
cd D:\Andruino\Vue\S3_DoorBell
npm install
npm run dev          # http://localhost:5173
```

首次打开会让你创建管理员账号（用户名 2~16 位，密码 ≥ 6 位）。
账号、事件记录、连接参数全部存在浏览器 `localStorage` 的 `s3db:*` 键下。

打包：

```bash
npm run build        # 产物在 dist/
npm run preview      # 本地预览打包结果
```

`vite.config.js` 里 `base: './'`，所以打包后的资源用相对路径引用，
可以直接放进 GitHub Pages 的子目录（`/<仓库名>/`）。

> 注意：`dist/index.html` **不能**双击用 `file://` 打开 —— 浏览器会以 CORS
> 为由拦掉 ES module。要么用 `npm run preview`，要么丢到任意静态服务器 /
> GitHub Pages 上。

---

## 3. 部署到 GitHub Pages

```bash
npm run build
cd dist
git init
git add -A
git commit -m "deploy"
git push -f git@github.com:<你的用户名>/<仓库名>.git HEAD:gh-pages
```

然后仓库 Settings → Pages → Source 选 `gh-pages` 分支 / root。

> ⚠️ GitHub Pages 是 https 页面，**必须**用 `wss://`（8084），
> 用 `ws://`（8083）会被浏览器当混合内容拦掉。

---

## 4. 和固件之间的协议

固件里的 `main/src/APP/app_protol.cpp` 定义了主题前缀和口令，两边必须一致：

| 宏（`main/include/Config.h`） | 值 | 说明 |
| --- | --- | --- |
| `MQTT_DATA_PREFIX` | `manmuweixia-S3-DoorBell-Data` | 所有**上行**主题的前缀 |
| `MQTT_CMD_TOPIC` | `manmuweixia-S3-DoorBell-Cmd` | 设备订阅的**命令**主题 |
| `CMD_KEY` | `s3db-2026` | 网页命令里的口令，不一致会被设备忽略 |
| `IMG_CHUNK` | `6144` | 图片分片大小（网页不关心，按 meta 里的片数拼） |

### 4.1 主题

| 主题 | 方向 | 载荷 |
| --- | --- | --- |
| `manmuweixia-S3-DoorBell-Data/status` | 设备 → 网页 | JSON，每 5 秒一次，`retain=true`；离线时由遗嘱消息发 `{"online":false}` |
| `manmuweixia-S3-DoorBell-Data/event` | 设备 → 网页 | JSON，每次抓拍一包元数据 |
| `manmuweixia-S3-DoorBell-Data/img/meta` | 设备 → 网页 | JSON，`{id, chunks, size, src, enrolled, count, family, face, ts}` |
| `manmuweixia-S3-DoorBell-Data/img/data/<id>/<i>` | 设备 → 网页 | **二进制** JPEG 分片，从 0 开始编号 |
| `manmuweixia-S3-DoorBell-Cmd` | 网页 → 设备 | JSON 命令 |

在 MQTT 客户端里订阅 `manmuweixia-S3-DoorBell-Data/#` 就能一次看到 status / event / 图片全部上行数据。

### 4.2 status

```json
{
  "online": true, "dev": "S3_DoorBell", "fw": "1.3.0",
  "ip": "10.168.138.55", "ssid": "满目唯霞", "rssi": -57,
  "ai": true, "enrolled": 1, "uptime": 7325,
  "bk": true, "light": false,
  "heap": 118000, "psram": 3200000,
  "temp": 26.4, "hum": 58, "lux": 342, "ts": 1794033560
}
```

`bk` = 外部 W25Q64 上的人脸库备份是否就绪；`light` = 补光灯当前状态。

网页判定「在线」= `online === true` **且** 最近 15 秒内收到过 status，
所以设备断电、断网、程序卡死都能显示成离线。

### 4.3 event

```json
{ "type": "door", "face": true, "family": true, "enrolled": false,
  "score": 0.94, "sim": 0.71, "bytes": 20480, "count": 1,
  "rssi": -57, "ts": 1794033560 }
```

`type`：`door`（门铃键）/ `pir`（人体感应）/ `snap`（远程抓拍）/
`enroll`（录入）/ `clear`（清库）/ `other`。

### 4.4 图片为什么分片、为什么不 base64

- 一张 20~60KB 的 JPEG，base64 后膨胀 33%，还要在设备上多 malloc 一份字符串；
- MQTT 载荷本身二进制安全，直接发原始字节，网页按序号拼回 `Uint8Array`；
- 分片是为了让设备端任何时刻只占 6KB 连续内存，不和摄像头/AI 抢内存。

网页侧：收到 `img/meta` 后建一个长度为 `chunks` 的数组，收齐所有分片才生成
`Blob` 并替换画面；缺片则整张丢弃（不做半张图的渲染）。

`img/meta` 里的 `src` 是这一帧的来源（`door`/`pir`/`enroll`/`snap`）。
当 `src=enroll` 且 `enrolled=true` 时，网页会把这张图按「家人`count`」
存进浏览器 localStorage —— 这就是"查看已录入家人照片"的实现方式，不需要后端。

### 4.5 命令

```json
{ "cmd": "snap", "k": "s3db-2026" }
```

| cmd | 作用 |
| --- | --- |
| `snap` | 立即抓拍（走和门铃一样的 AI + 上传流程） |
| `ring` | 蜂鸣器响三声 |
| `page` | 切换 OLED 页面 |
| `enroll` | 把当前画面里最大的脸录入为家人 |
| `clear` | 清空人脸特征库（所有人；会同步覆盖 W25Q64 备份） |
| `unlock` | 舵机转到开锁角度，3 秒后自动回位 |
| `light` | 补光灯开关，需带 `{"v": true/false}` |
| `status` | 立刻回一包 status |

---

## 4.6 硬件相关

- **人脸库备份**：`/spiffs/face.db` 会在每次录入/删除/清空后整份备份到板外 W25Q64
  （CS=14 SCK=38 MISO=39 MOSI=40）。开机时如果 SPIFFS 里没有有效人脸库，
  会自动从备份恢复 —— 重刷固件、格式化文件系统都不会丢家人。
  启动日志里 `[BACKUP] 外部 Flash 就绪 JEDEC=0xEF4017` 表示备份可用。
- **舵机（开锁）**：GPIO2，50Hz，0.5~2.5ms 脉宽。开锁角度/保持时间在
  `Config.h` 的 `SERVO_OPEN_DEG` / `SERVO_HOLD_MS`。**舵机电源要独立 5V**，
  从板子 3.3V 取电会一动作就复位。
- **补光灯**：GPIO46，高电平点亮，网页上可手动开关。真用来补光时建议放在
  摄像头正面，且只在需要时开（费电）。

## 5. 安全边界（重要）

这是一个课程/演示项目，安全模型只有「防止误操作」级别：

- **账号只在本机浏览器**：清掉浏览器数据就没了；同一台电脑换浏览器要重新注册。
- **密码哈希不是加密**：能改 `localStorage` 的人就能绕过页面。
- **公共 broker 是明文广播**：`broker.emqx.io` 上任何人都能订阅 `manmuweixia-S3-DoorBell-Data/#`，
  能看到抓拍图和传感器数据，也能发命令（虽然要口令）。
  真要用于真实门口，必须换成自建 broker + TLS + 账号密码 + 私有主题。
- **口令 `CMD_KEY`** 只是防手滑，不是认证。

---

## 6. 常见问题

**页面显示「等待设备」**
1. 设备是否上电并连上同一个 WiFi；
2. 设置页的数据主题是否和固件 `MQTT_DATA_PREFIX` 一致；
3. 两边是否连的同一个 broker（固件默认 `broker.emqx.io:1883`）。

**能收到事件但画面一直空着**
图片是分片发的，缺任意一片网页就会丢掉整张。看浏览器控制台有没有
`img/meta` 和 `img/data/...`；如果只有 meta 没有 data，多半是设备端
`PubSubClient` 缓冲不够（`setBufferSize(IMG_CHUNK + 512)`）。

**wss 连不上**
`broker.emqx.io` 的 WebSocket 端口是 8084（TLS）和 8083（明文），
不是 1883。自建 Mosquitto 需要在配置里开 `listener 9001` + `protocol websockets`。

**改了端口/前缀后要做什么**
设置页点「保存并重连」即可，网页会重新订阅 `<dataTopic>/#` 并往 `<cmdTopic>` 要一包状态。
