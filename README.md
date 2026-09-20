# X 评论垃圾过滤（TypeSafe/Jev）

一个油猴（Tampermonkey）脚本：用 [TypeSafe](https://docs.typesafe.ai) 的 **Jev** 模型对 X（Twitter）评论区做**语义级垃圾评论过滤**。

不再依赖屏蔽词列表——形近字变体（如"我福不黑"类）、乱码拼凑、营销号昵称都能识别。

## 原理

对每条评论提取 **昵称 + @用户名 + 正文**（附主帖上下文），一次请求并行问 Jev 两个判断：

- `is_spam`：是否垃圾信息（引流广告、色情/赌博/加密推广、线下报名类营销、刷屏蹭热度；昵称含营销词/符号、随机用户名也算特征）
- `is_gibberish`：是否无意义内容（乱码、形近字拼凑、纯表情无信息量回复）

两者概率取最大值 ≥ 阈值（默认 0.85）即判定为垃圾评论。

## 功能

- 两种处理模式可随时切换：**直接隐藏** / **折叠成占位条**（可点开查看，误杀可找回）
- 页面右下角 🛡 按钮打开设置面板：API key、阈值、生效范围、处理模式、统计、清缓存
- 判定结果本地缓存（刷新页面不重复扣费）
- 429/529 自动退避重试；API 失败时放行不隐藏（保守策略）
- 默认只在帖子详情页（`/status/`）生效，首页时间线不动

## 安装

1. Chrome / Edge 安装 [Tampermonkey](https://www.tampermonkey.net/)
2. 安装脚本：点油猴图标 → 管理面板 → 实用工具 → 导入文件，选择本仓库的 [`x-comment-filter.user.js`](./x-comment-filter.user.js)
3. 打开 x.com，点右下角 🛡 → 填入你的 TypeSafe API key → 保存

## 使用建议

- 先设阈值 **0.95**，按 F12 在 Console 观察每条的 `spam=` / `gib=` 概率，确认误判可接受再降到 0.85
- 每条评论约消耗 300–400 输入 tokens，面板里可看累计用量
- 需要 TypeSafe API key：<https://docs.typesafe.ai>

## 隐私

API key 仅存储在本地浏览器（Tampermonkey 存储）。评论内容会发送到 TypeSafe API 进行判断，不会发送到任何其他服务器。

## License

MIT
