export type Project = {
	name: string;
	description: string;
	tech: string[];
	url: `https://github.com/${string}`;
};

export type TimelineSection = {
	title: string;
	tech?: string[];
	description: string;
	projects: Project[];
};

export type TimelineEntry = {
	year: string;
	suffix?: string;
	sections: TimelineSection[];
};

export const projectTimeline: TimelineEntry[] = [
	{
		year: "2026",
		sections: [
			{
				title: "AI 与 MCP",
				description: "把 AI 编程、通知和生活服务能力接入日常工作流。",
				projects: [
					{
						name: "CodeBuddy2API",
						description: "兼容 OpenAI 与 Anthropic API 的 CodeBuddy 代理",
						tech: [
							"icon:simple-icons:typescript",
							"icon:fa6-brands:docker",
							"icon:simple-icons:openai",
							"icon:simple-icons:anthropic",
						],
						url: "https://github.com/orangeboyChen/codebuddy2api",
					},
					{
						name: "NewAPI Mobile",
						description: "NewAPI 的移动端客户端",
						tech: [
							"icon:simple-icons:typescript",
							"icon:material-symbols:phone-android",
						],
						url: "https://github.com/orangeboyChen/new-api-mobile",
					},
					{
						name: "美团生活助手",
						description: "从 WorkBuddy 移植，让云端 Agent 也能调用美团生活助手。",
						tech: ["icon:fa6-brands:js"],
						url: "https://github.com/orangeboyChen/meituan-living-assistant",
					},
					{
						name: "Notification MCP",
						description: "将 Telegram、邮件与 Bark 接入 MCP",
						tech: [
							"icon:fa6-brands:golang",
							"icon:simple-icons:modelcontextprotocol",
							"icon:fa6-brands:docker",
						],
						url: "https://github.com/orangeboyChen/notification-mcp",
					},
					{
						name: "Luckin Extended MCP",
						description:
							"提供瑞幸优惠券、余额和支付能力的 MCP 服务，支持自动支付与 AI 自动买咖啡。",
						tech: [
							"icon:fa6-brands:golang",
							"icon:simple-icons:modelcontextprotocol",
							"icon:fa6-brands:android",
							"icon:fa6-brands:html5",
						],
						url: "https://github.com/orangeboyChen/luckin-extended-mcp",
					},
					{
						name: "Portfolio Insight MCP",
						description:
							"连接 Wealthfolio 持仓数据与 AI Agent，让 AI 了解投资组合。",
						tech: [
							"icon:fa6-brands:golang",
							"icon:simple-icons:modelcontextprotocol",
							"icon:fa6-brands:telegram",
						],
						url: "https://github.com/orangeboyChen/portfolio-insight-mcp",
					},
				],
			},
			{
				title: "智能家居",
				description: "为真实生活设备和服务补齐自动化能力。",
				projects: [
					{
						name: "美团外卖Home Assistant 集成",
						description: "订单、配送状态与通知的 Home Assistant 集成",
						tech: ["icon:fa6-brands:python", "icon:simple-icons:homeassistant"],
						url: "https://github.com/orangeboyChen/ha-meituan-delivery",
					},
					{
						name: "万和热水器 Home Assistant 集成",
						description: "万和热水器 Home Assistant 自定义集成",
						tech: ["icon:fa6-brands:python", "icon:simple-icons:homeassistant"],
						url: "https://github.com/orangeboyChen/ha-vanward-water-heater",
					},
					{
						name: "京东智能空调 Home Assistant 集成",
						description: "空调控制、状态与令牌刷新集成",
						tech: ["icon:fa6-brands:python", "icon:simple-icons:homeassistant"],
						url: "https://github.com/orangeboyChen/ha-jd-smart",
					},
				],
			},
			{
				title: "自托管与兴趣项目",
				description: "从个人财务同步，到 Minecraft 服务器可观测性。",
				projects: [
					{
						name: "Market Crawl",
						description:
							"为 Wealthfolio 提供基金及产品净值数据查询服务。",
						tech: [
							"icon:fa6-brands:golang",
							"icon:fa6-brands:docker",
							"icon:material-symbols:api",
						],
						url: "https://github.com/orangeboyChen/market-crawl",
					},
					{
						name: "Wealthfolio Connect Self-Hosted",
						description: "Wealthfolio Web 版的自托管同步服务",
						tech: [
							"icon:fa6-brands:golang",
							"icon:fa6-brands:docker",
							"icon:material-symbols:dns",
						],
						url: "https://github.com/orangeboyChen/wealthfolio-connect-self-hosted",
					},
					{
						name: "Server Enhanced Mod",
						description: "为 Minecraft 提供 Prometheus 指标和自定义指令。",
						tech: ["icon:simple-icons:kotlin", "icon:simple-icons:prometheus"],
						url: "https://github.com/orangeboyChen/mc-server-enhanced-mod",
					},
					{
						name: "WechatPay Cli",
						description: "从 WorkBuddy 移植，探索云端 Agent 使用微信支付的方式。",
						tech: ["icon:fa6-brands:js", "icon:material-symbols:terminal"],
						url: "https://github.com/orangeboyChen/wechatpay-cli",
					},
				],
			},
			{
				title: "Ham 开放平台与自动化运维",
				description: "武汉大学生活助手的开放接口、后台管理和运行保障。",
				projects: [
					{
						name: "Ham Workspace",
						description:
							"Ham 后端、客户端与 API 协议的协作工作区，支持 AI 协助前后端联合开发。",
						tech: [],
						url: "https://github.com/whu-ham/ham-workspace",
					},
					{
						name: "Ham Admin Console",
						description: "Ham 的后台管理控制台",
						tech: ["icon:fa6-brands:vuejs"],
						url: "https://github.com/whu-ham/ham-admin-console",
					},
					{
						name: "Ham API Status",
						description: "基于 UptimeRobot API 的服务状态面板",
						tech: ["icon:fa6-brands:vuejs"],
						url: "https://github.com/whu-ham/ham-api-status",
					},
					{
						name: "Ham Backend Autoscaler Worker",
						description: "基于 Grafana 指标的自动扩缩容与 GitOps 部署 Worker",
						tech: [
							"icon:simple-icons:typescript",
							"icon:simple-icons:cloudflare",
						],
						url: "https://github.com/whu-ham/ham-backend-autoscaler-worker",
					},
					{
						name: "Ham Proto",
						description: "Ham 服务与客户端共享的 Protocol Buffers 定义",
						tech: ["icon:devicon:grpc"],
						url: "https://github.com/whu-ham/ham-proto",
					},
				],
			},
		],
	},
	{
		year: "2025",
		sections: [
			{
				title: "Ham 继续探索",
				description:
					"包含 Ham Web、Rust 与 WebAssembly 的尝试，以及多协议 Go 后端的实践。",
				projects: [
					{
						name: "Ham Web",
						description: "Ham 的 Web 客户端",
						tech: ["icon:simple-icons:typescript"],
						url: "https://github.com/whu-ham/ham-web",
					},
					{
						name: "Ham Web WASM",
						description: "为 Ham Web 增添 Rust 与 WebAssembly 能力",
						tech: ["icon:fa6-brands:rust", "icon:material-symbols:web"],
						url: "https://github.com/whu-ham/ham-web-wasm",
					},
					{
						name: "Ham Backend Go",
						description:
							"Ham 的多协议 Go 后端，覆盖 gRPC、HTTP 与 MCP。相较老版客户端，内存占用下降 90%，并发能力显著增强；同时通过单元测试覆盖率要求提升代码质量。",
						tech: ["icon:fa6-brands:golang"],
						url: "https://github.com/whu-ham/ham-backend-go",
					},
				],
			},
		],
	},
	{
		year: "2024",
		sections: [
			{
				title: "Ham 动态化能力探索",
				description:
					"为 Ham 客户端探索动态化能力，尝试 React Native，以减少频繁发布新版本的成本。",
				projects: [
					{
						name: "Ham React Native",
						description: "Ham React Native 组件 Monorepo",
						tech: ["icon:simple-icons:typescript", "icon:fa6-brands:react"],
						url: "https://github.com/whu-ham/ham-rn",
					},
					{
						name: "Ham Score Calculator",
						description: "成绩计算算法",
						tech: ["icon:fa6-brands:js"],
						url: "https://github.com/whu-ham/ham-score-calculator",
					},
				],
			},
		],
	},
	{
		year: "2023",
		sections: [
			{
				title: "Minecraft 监控器",
				description:
					"为自建 Minecraft 提供在线监控功能，涵盖服务器状态、指标和玩家信息。",
				projects: [
					{
						name: "MC Monitor",
						description: "Minecraft 服务器状态与指标仪表盘",
						tech: [
							"icon:simple-icons:nextdotjs",
							"icon:simple-icons:prometheus",
							"icon:material-symbols:translate",
						],
						url: "https://github.com/orangeboyChen/mc-monitor",
					},
				],
			},
		],
	},
	{
		year: "2022",
		sections: [
			{
				title: "把校园项目做得更完整",
				description: "继续探索全栈协作，并将服务端能力用于具体产品。",
				projects: [
					{
						name: "电动车小程序后端",
						description:
							"尝试解决校内电动车充电桩数量不足的问题，让同学们有序充电；基于 Spring Boot、Redis 与 Kotlin Gradle 构建。",
						tech: [
							"icon:simple-icons:spring",
							"icon:simple-icons:mysql",
							"icon:simple-icons:redis",
							"icon:simple-icons:kotlin",
						],
						url: "https://github.com/orangeboyChen/zq_electric_scooter_backend",
					},
				],
			},
			{
				title: "厨方",
				description: "菜谱服务的移动端与服务端实践。",
				projects: [
					{
						name: "厨方 iOS",
						description: "厨方的 SwiftUI 客户端。",
						tech: ["icon:fa6-brands:apple", "icon:fa6-brands:swift"],
						url: "https://github.com/orangeboyChen/cooking_frontend",
					},
					{
						name: "厨方服务端",
						description: "基于 Go、Gin、Gorm 与 Elasticsearch 的菜谱服务",
						tech: [
							"icon:fa6-brands:golang",
							"icon:simple-icons:gin",
							"icon:simple-icons:elasticsearch",
						],
						url: "https://github.com/orangeboyChen/cooking-backend-go",
					},
				],
			},
			{
				title: "服创比赛 · 秒杀系统",
				description: "服创比赛项目，负责秒杀系统后端的开发与维护。",
				projects: [
					{
						name: "SeckillSystem",
						description:
							"包含 Spring Cloud、Go 秒杀服务、Redis、RabbitMQ 与 Nacos 的秒杀系统实践。",
						tech: [
							"icon:fa6-brands:java",
							"icon:fa6-brands:golang",
							"icon:simple-icons:spring",
							"icon:simple-icons:redis",
							"icon:simple-icons:rabbitmq",
						],
						url: "https://github.com/ZaoMengJia/SeckillSystem",
					},
				],
			},
		],
	},
	{
		year: "2021",
		sections: [
			{
				title: "Ham · 武汉大学生活助手",
				description:
					"服务武大学生的校园生活助手，涵盖课表、成绩、图书馆、体育场馆预约等其他便捷应用。",
				projects: [
					{
						name: "Ham 文档站",
						description: "面向用户和开发者的多语言文档",
						tech: [
							"icon:simple-icons:typescript",
							"icon:simple-icons:vitepress",
							"icon:material-symbols:translate",
						],
						url: "https://github.com/whu-ham/whu-ham.github.io",
					},
					{
						name: "Ham iOS",
						description:
							"混合 iOS 客户端，覆盖 iOS 与 watchOS；动态部分由 React Native 实现，其余部分由 SwiftUI 与 Swift 实现。",
						tech: [
							"icon:fa6-brands:apple",
							"icon:fa6-brands:react",
							"icon:fa6-brands:swift",
						],
						url: "https://github.com/whu-ham/ham-ios",
					},
					{
						name: "Ham Android",
						description:
							"混合 Android 客户端：动态部分由 React Native 实现，其余部分采用原生 Android；早期使用 Java 与 Android XML，后期逐步迁移至 Kotlin 与 Jetpack Compose。",
						tech: ["icon:fa6-brands:android", "icon:simple-icons:kotlin"],
						url: "https://github.com/whu-ham/ham-android",
					},
					{
						name: "Ham Backend",
						description:
							"早期服务端，基于 Spring Boot 与 MyBatis 构建 HTTP Java 服务，后期逐步迁移至 gRPC 与 Kotlin。",
						tech: ["icon:simple-icons:kotlin"],
						url: "https://github.com/orangeboyChen/Ham-backend",
					},
				],
			},
			{
				title: "基础课程学习",
				description: "在校内基础课程中完成的部分课程项目。",
				projects: [
					{
						name: "手写操作系统",
						description:
							"操作系统课程项目，使用 C 语言和汇编语言实现简单操作系统，支持窗口折叠、透明布局，并提供 API 供第三方应用接入。",
						tech: ["icon:material-symbols:memory"],
						url: "https://github.com/orangeboyChen/handmade_operating_system",
					},
					{
						name: "新闻查看器",
						description: "iOS App，移动编程课程期末项目。",
						tech: ["icon:fa6-brands:apple", "icon:fa6-brands:swift"],
						url: "https://github.com/orangeboyChen/WHU_iOS_exam_news",
					},
				],
			},
		],
	},
	{
		year: "2020",
		sections: [
			{
				title: "汉姆 · Ham 的前身",
				description:
					"武汉大学生活助手 Ham 的前身，涵盖跑步计划、图书馆预约和体育场馆预约。",
				projects: [
					{
						name: "汉姆 Android",
						description: "跑步计划制定工具",
						tech: ["icon:fa6-brands:android", "icon:fa6-brands:java"],
						url: "https://github.com/orangeboyChen/Hanmu_android",
					},
					{
						name: "汉姆 iOS",
						description: "跑步计划与图书馆预约应用",
						tech: ["icon:fa6-brands:apple", "icon:fa6-brands:swift"],
						url: "https://github.com/orangeboyChen/Hanmu_ios",
					},
				],
			},
			{
				title: "竞赛的初次尝试",
				description: "2020 年服创比赛项目。",
				projects: [
					{
						name: "服创路线规划",
						description: "车辆路线规划方向的服创项目",
						tech: ["icon:fa6-brands:java", "icon:material-symbols:map"],
						url: "https://github.com/orangeboyChen/fuchuang",
					},
				],
			},
			{
				title: "解决预订公共场所困难问题",
				description: "在罗湖文体通的场馆预约中实现自动化预约工具。",
				projects: [
					{
						name: "Volleyball",
						description: "罗湖文体通排球场预订工具。",
						tech: ["icon:fa6-brands:android", "icon:fa6-brands:java"],
						url: "https://github.com/orangeboyChen/volleyball",
					},
				],
			},
			{
				title: "穿戴设备开发首次尝试",
				description: "在小米手表上实现翻译功能，探索穿戴设备的交互方式。",
				projects: [
					{
						name: "Nowcent Translate",
						description: "面向 Wear OS 的翻译客户端，支持语音输入与在线翻译。",
						tech: ["icon:material-symbols:watch", "icon:fa6-brands:android"],
						url: "https://github.com/orangeboyChen/NowcentTranslate_frontend",
					},
					{
						name: "Nowcent Translate Backend",
						description:
							"为翻译客户端提供加密凭据下发接口的 Spring Boot 服务。",
						tech: ["icon:fa6-brands:java", "icon:simple-icons:spring"],
						url: "https://github.com/orangeboyChen/NowcentTranslate_backend",
					},
				],
			},
		],
	},
	{
		year: "2019",
		sections: [
			{
				title: "青年大学习提交系统",
				description: `每周的青年大学习，总少不了团支书在群里一遍遍提醒、逐张收截图、再对着名单核对。这个项目想把这些琐碎的事简单化：同学完成学习后上传截图，团支书在后台集中查看和整理记录。
少一点催促和翻找，也让每一次学习都有迹可循。`,
				projects: [
					{
						name: "青年大学习提交系统前端",
						description:
							"提交系统的 Web 端：早期使用原生 JavaScript 与 Bootstrap 构建，后期迁移至 Vue 2。",
						tech: ["icon:fa6-brands:vuejs", "icon:fa6-brands:js"],
						url: "https://github.com/orangeboyChen/qndxx_front",
					},
					{
						name: "青年大学习提交系统服务端 v2",
						description:
							"提交系统后期的服务端重构，使用 Spring MVC、MyBatis 与 SQL Server。",
						tech: [
							"icon:fa6-brands:java",
							"icon:simple-icons:spring",
							"icon:simple-icons:mysql",
						],
						url: "https://github.com/orangeboyChen/qndxx_spring",
					},
					{
						name: "青年大学习提交系统服务端 v1",
						description: "提交系统早期的服务端尝试，基于 Java Servlet 与 JSP。",
						tech: ["icon:fa6-brands:java"],
						url: "https://github.com/orangeboyChen/qndxx",
					},
				],
			},
			{
				title: "从第一个在线 App 开始",
				description: "在高考后完成最早的独立软件项目。这也是本站域名的由来。",
				projects: [
					{
						name: "Nowcent",
						description:
							"基于 TCP 的即时通讯应用，支持一对一、一对多通信和表情发送。",
						tech: ["icon:fa6-brands:android", "icon:fa6-brands:java"],
						url: "https://github.com/orangeboyChen/nowcent",
					},
				],
			},
		],
	},
	{
		year: "2018",
		suffix: "及以前",
		sections: [
			{
				title: "从兴趣开始",
				tech: [
					"icon:simple-icons:visualbasic",
					"icon:devicon:c",
					"icon:simple-icons:csharp",
					"icon:fa6-brands:android",
					"icon:simple-icons:adobedreamweaver",
				],
				description:
					"从 Visual Basic 到 C、C#，再到 Android 开发。早期还做过 Dreamweaver 老裴肉串 Web、点名器和点按钮游戏；这些小作品是我开始持续写代码的起点。",
				projects: [],
			},
		],
	},
];
