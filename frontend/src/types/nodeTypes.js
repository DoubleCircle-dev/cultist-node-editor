import { DEFAULT_PROPERTY_LEVEL, PROPERTY_LEVELS, applyPropertyLevel, initialOptionalCount } from './nodePropertyLevels.js';
import { NODE_COLOR_KEYS, getNodeColor, nodeColorKeyOf, setNodeColor as setPaletteColor } from './nodeColors.js';

export class NodeTypeRegistry {
    /**
     * 当前生效的「属性档位」（最低 / 标准 / 全部）
     *
     * 档位只决定**建节点时初始加载多少个可选属性**（`initialOptionalCount`）；
     * 属性本身该不该进「可选属性」池由原版出现率决定，与档位无关。
     * 由 ⚙️ 设置里的「节点属性档位」经 `setPropertyLevel()` 改写，见 `nodePropertyLevels.js`。
     */
    static propertyLevel = DEFAULT_PROPERTY_LEVEL;

    /**
     * 类型键 → 已按「必要 / 非必要」重排、并带上当前配色的配置（带缓存）
     *
     * 属性划分只跟原版字段出现率有关、与档位无关；颜色是配置上的 **getter**（`_configOf` 里现取），
     * 所以改配色后缓存不用失效，新建节点直接就是新色。
     *
     * @private
     * @type {Map<string, NodeConfig>}
     */
    static _splitCache = new Map();

    /** @type {Record<string, NodeConfig>} */
    static nodeTypes = {
        blank: {
            title: '空节点',
            color: getNodeColor('blank'),
            inputs: [],
            outputs: [],
            content: `这是一个空节点`,
            icon: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
            properties: [],
        },
        test: {
            active: true,
            title: '测试节点',
            color: getNodeColor('test'),
            inputs: [
                {
                    name: 'testInputMulti',
                    type: 'port',
                    label: '测试多输入',
                    requireType: 'test',
                    multiConnect: true,
                },
                {
                    name: 'testInputSingle',
                    type: 'port',
                    label: '测试单输入',
                    requireType: 'test',
                    multiConnect: false,
                },
            ],
            outputs: [
                {
                    name: 'testOutput',
                    type: 'port',
                    label: '测试输出',
                    returnType: 'test',
                    multiConnect: true,
                },
            ],
            content: `这是一个测试节点，类型: 通用测试`,
            icon: '⚡',
            properties: [
                {
                    name: 'modSwitcher',
                    label: '选项',
                    type: 'select',
                    isModeSwitcher: true,
                    options: ['选项1', '选项2', '选项3'],
                    default: '选项1',
                },
                {
                    name: 'testTable',
                    label: '数据表格',
                    type: 'table',
                    default: [
                        { name: '项目1', value: 10, enabled: true },
                        { name: '项目2', value: 20, enabled: false },
                        { name: '项目3', value: 30, enabled: true },
                    ],
                    columns: [
                        {
                            label: '名称',
                            field: 'name',
                            type: 'text',
                            width: '40%',
                        },
                        {
                            label: '数值',
                            field: 'value',
                            type: 'number',
                            width: '30%',
                        },
                        {
                            label: '启用',
                            field: 'enabled',
                            type: 'checkbox',
                            width: '20%',
                        },
                    ],
                },
                {
                    name: 'testHub',
                    label: '属性hub',
                    type: 'hub',
                    properties: [
                        {
                            name: 'testPort',
                            label: '端口',
                            type: 'port',
                            requireType: 'test',
                            multiConnect: true,
                            connectNum: 4,
                            description: '测试属性连接端口',
                        },
                        {
                            name: 'testText',
                            label: '常驻文本输入',
                            type: 'text',
                            default: '测试常驻文本',
                            description: '测试常驻文本输入',
                        },
                    ],
                },
            ],
            modeProperties: {
                选项1: [
                    {
                        name: 'testBool',
                        label: '二择',
                        type: 'bool',
                        default: false,
                    },
                    {
                        name: 'testRange',
                        label: '数值',
                        type: 'range',
                        min: 0,
                        max: 100,
                        default: 50,
                    },
                ],
                选项2: [
                    { name: 'testSwitch', label: '开关', type: 'checkbox', default: false },
                    {
                        name: 'testNumber',
                        label: '数字',
                        type: 'number',
                        min: 0,
                        max: 100,
                        default: 50,
                    },
                ],
                选项3: [
                    {
                        name: 'testInteger',
                        label: '整数输入',
                        type: 'integer',
                        default: null,
                    },
                    { name: 'testText', label: '文本输入', type: 'text', default: '测试文本' },
                ],
            },
            exProperties: [
                {
                    name: 'testPortExtend',
                    label: '额外端口',
                    type: 'port',
                    requireType: 'test',
                    multiConnect: true,
                    description: '测试额外属性连接端口',
                },
                {
                    name: 'testTextExtend',
                    label: '额外文本输入',
                    type: 'text',
                    default: '测试额外文本',
                    description: '测试额外文本输入',
                },
            ],
        },
        legacies: {
            active: true,
            title: 'legacy',
            label: '职业',
            color: getNodeColor('legacies'),
            inputs: [],
            outputs: [],
            content: `添加独立的职业`,
            icon: '⚡',
            properties: [
                {
                    name: 'description',
                    label: '描述',
                    type: 'text',
                    default: '职业描述',
                    description: 'description: 菜单中选择职业时显示的文本',
                },
                {
                    name: 'startdescription',
                    label: '初始描述',
                    type: 'text',
                    default: '初始描述',
                    description: 'startdescription: 会显示在开始此职业的新游戏时的弹出窗口。',
                },
                {
                    name: 'startingVerbId',
                    label: '起始行动框',
                    type: 'port',
                    requireType: 'verbs',
                    multiConnect: false,
                    default: 'work',
                    description: 'startingVerbId: 游戏开始时提供给玩家的verb，你可以自创一个，也可以从已有的verb中选择一个',
                },
            ],
            exProperties: [
                {
                    name: 'startingEndingId',
                    label: '前置结局',
                    type: 'port',
                    requireType: 'endings',
                    multiConnect: false,
                    description: 'fromEnding: 在某结局后必定可选',
                },
                {
                    name: 'availableWithoutEndingMatch',
                    label: '非特定结局后续',
                    type: 'bool',
                    default: true,
                    description: 'availableWithoutEndingMatch: 表示游戏是否可以在任何其他职业的任何结束后将此职业视为有效的新开始',
                },
                {
                    name: 'newstart',
                    label: '新开始',
                    type: 'bool',
                    default: true,
                    description: 'newstart: 表示我们是否可以在第六历史菜单中手动选择此职业来开始它（就像其他DLC一样）。',
                },
                {
                    name: 'statusbarelements',
                    label: '跟踪元素',
                    type: 'port',
                    requireType: 'elements',
                    multiConnect: true,
                    connectNum: 4,
                    description:
                        'statusbarelements: 此职业中在屏幕底部跟踪的元素列表。需要恰好包含四个内容。如果你要跟踪的项目少于4个，你可以重复其中一些使其达到4个,默认重复列表的最后一个。',
                },
                {
                    name: 'tablecoverimage',
                    label: '桌面图片',
                    type: 'image-preview',
                    description: 'tablecoverimage: 决定桌面背景，如dlc流亡者中的地中海地图。(请将地图放入images/ui中)（没有该字段则使用默认桌面）',
                },
                {
                    name: 'excludesOnEnding',
                    label: '禁用后续职业列表',
                    type: 'port',
                    requireType: 'legacies',
                    multiConnect: true,
                    description: 'excludesOnEnding: 在此职业之后无法选择的其他职业列表。',
                },
            ],
        },
        endings: {
            active: true,
            title: 'ending',
            label: '结局',
            color: getNodeColor('endings'),
            inputs: [],
            outputs: [
                {
                    name: 'endings',
                    type: 'port',
                    returnType: 'endings',
                    label: '结局',
                    multiConnect: true,
                    description: 'endings: 结局',
                },
            ],
            content: `endings即游戏中原版或自定义的结局。`,
            icon: '⚡',
            properties: [
                {
                    name: 'description',
                    label: '描述',
                    type: 'text',
                    default: '在达成该结局时，游戏中显示的文本',
                    description: 'description: 在达成该结局时，游戏中显示的文本',
                },
                {
                    name: 'achievements',
                    label: '成就',
                    type: 'port',
                    requireType: 'achievements',
                    multiConnect: true,
                    default: '达成该结局时，解锁的成就',
                    description: 'achievements: 达成该结局时，解锁的成就',
                },
                {
                    name: 'image',
                    label: '图片',
                    type: 'image-preview',
                    description: 'image: 达成该结局时，在达成该结局时显示的图片',
                },
                {
                    name: 'flavour',
                    label: '类型',
                    type: 'select',
                    options: ['坏结局(Melancholy)', '胜利(Grand)', '反面胜利(Vile)'],
                    default: 0,
                    description: 'flavour: 该结局的类型，“Melancholy”代表坏结局；“Grand”代表胜利；“Vile”代表反面胜利。',
                },
                {
                    name: 'anim',
                    label: '动画',
                    type: 'select',
                    options: ['DramaticLight', 'DramaticLightCool', 'DramaticLightEvil'],
                    default: 0,
                    description:
                        'anim: 从某个recipe进入该结局时，显示的动画类型。“DramaticLight”在任何结局都可用，“DramaticLightCool”是胜利时显示的动画，“DramaticLightEvil”则是在坏结局时显示。',
                },
            ],
        },
        achievements: {
            active: true,
            title: 'achievement',
            label: '成就',
            color: getNodeColor('achievements'),
            icon: '⚡',
            inputs: [],
            outputs: [
                {
                    name: 'categories',
                    label: '成就类型',
                    type: 'port',
                    returnType: 'achievements',
                    multiConnect: true,
                    description: 'categories: 成就类型（成就类型会在主界面的成就下面新建一个类别用来显示成就）',
                },
                {
                    name: 'achievements',
                    label: '成就',
                    type: 'port',
                    returnType: 'achievements',
                    multiConnect: true,
                    description: 'achievements: 成就（同一类成就会放在一个页面）',
                },
            ],
            content: `成就(achievements)是游戏中解锁的成就/成就类型，可以在成就页面中查看。`,
            properties: [
                {
                    name: 'isCategory',
                    label: '类型',
                    type: 'select',
                    isModeSwitcher: true,
                    options: ['成就类型', '成就'],
                    default: '成就',
                    description: 'isCategory: 成就和成就类型都属于achievements,成就类型会在主界面的成就下面新建一个类别用来显示成就',
                },
                {
                    name: 'iconUnlocked',
                    label: '图标',
                    type: 'image-preview',
                    description: 'iconUnlocked: 成就/成就类型解锁后的图标',
                },
            ],
            modeProperties: {
                成就类型: [],
                成就: [
                    {
                        name: 'category',
                        label: '成就类型',
                        type: 'port',
                        requireType: 'achievements',
                        multiConnect: false,
                        description: 'category: 成就的类别（同一类成就会放在一个页面）',
                    },
                    {
                        name: 'singleDescription',
                        label: '单一描述',
                        type: 'bool',
                        default: true,
                        description: 'singleDescription: 如果为真，则解锁成就前就会显示成就描述。',
                    },
                    {
                        name: 'descriptionunlocked',
                        label: '描述',
                        type: 'text',
                        default: '成就描述',
                        description: 'descriptionunlocked: 成就解锁后的描述',
                    },
                    {
                        name: 'validateOnStorefront',
                        label: '显示成就信息',
                        type: 'bool',
                        default: true,
                        description: 'validateOnStorefront: 如果为真，则解锁成就时会在游戏内显示成就信息窗口。',
                    },
                    {
                        name: 'unlockMessage',
                        label: '解锁信息',
                        type: 'text',
                        default: '成就解锁时显示的文本',
                        description:
                            'unlockMessage: 成就解锁时显示的文本，需要validateOnStorefront为真时显示，默认为空，此时会显示成就描述descriptionunlocked的文本',
                    },
                    {
                        name: 'isHidden',
                        label: '隐藏成就',
                        type: 'bool',
                        default: false,
                        description: 'isHidden: 如果为真，则该成就未解锁前不会显示在成就页面上（会显示剩下若干隐藏成就）。',
                    },
                ],
            },
        },
        recipes: {
            active: true,
            title: 'recipe',
            label: '交互',
            color: getNodeColor('recipes'),
            inputs: [
                {
                    name: 'prerequisite',
                    type: 'port',
                    requireType: 'recipes',
                    multiConnect: true,
                    label: '前置交互',
                    description:
                        '跳转进本交互界面的入口，craftable为真时该recipe可以被玩家主动使用对应行动框触发，否则则只能通过其他方式（如其他的recipe）触发',
                },
            ],
            outputs: [
                {
                    name: 'alt',
                    type: 'port',
                    returnType: 'recipes',
                    label: '分支',
                    multiConnect: true,
                    // 反向记录（契约 `links[].reverse`）：列表写在**源** recipe 上（所以是输出端口），
                    // 但「是否跳转」由**目标 recipe 自己的定义**决定 —— 语义主体在对端。
                    reverse: true,
                    description:
                        'alt: 指向满足一定条件后会立刻取代该recipe生效的recipe，如果additional为真值则新的recipe在对应行动框中额外进行且不会立刻取代，要注意这种情况下若该行动框已创建，那么这次转换不会生效。',
                },
                {
                    name: 'linked',
                    type: 'port',
                    returnType: 'recipes',
                    label: '链接',
                    multiConnect: true,
                    reverse: true, // 同 alt：列表在源上、判定在对端
                    description: 'linked: 指向在此recipe后会概率生效的recipe，与alt类似，但需要等待当前recipe结束后才会生效。',
                },
                {
                    name: 'inductions',
                    type: 'port',
                    returnType: 'recipes',
                    label: '引入',
                    multiConnect: true,
                    reverse: true, // 同 alt：列表在源上、判定在对端
                    description:
                        'inductions: 效果类似alt中将卡牌弹出并带入新verb中recipe的功能，expulsion是过滤条件，其中包含filter标识需要的性相，limit标识最多转移个数。',
                },
            ],
            content: `交互界面(recipes)，也称配方，是使用行动与卡牌交互的一种过程，可以实现多样化的功能`,
            icon: '📖',
            properties: [
                {
                    name: 'actionId',
                    label: '使用行动',
                    type: 'port',
                    requireType: 'verbs',
                    multiConnect: false,
                    // 端口属性的值输入：未连线时可手填 id（留空 = 沿用上一个 recipe 的 verb），
                    // 连上 verb 节点后值以连线为准（只读显示目标 id）
                    valueType: 'text',
                    placeholder: '行动 id（留空则沿用上一个 recipe 的 verb）',
                    description: 'actionId: 使用的行动的id，如果此处填空则默认使用上一个recipe的verb',
                },
                {
                    name: 'startdescription',
                    label: '起始描述',
                    type: 'text',
                    placeholder: '开始和进行时行动框显示的文本',
                    description: 'startdescription: 开始和进行时行动框显示的文本',
                },
                {
                    name: 'warmup',
                    label: '持续时间',
                    type: 'number',
                    default: 0,
                    description: 'warmup: 该recipe的持续时间，单位为秒。',
                },
                {
                    name: 'description',
                    label: '描述',
                    type: 'text',
                    placeholder: '结束后显示的文本',
                    description: 'description: 结束后显示的文本',
                },
                {
                    name: 'slots',
                    label: '卡槽',
                    type: 'port',
                    requireType: 'slots',
                    multiConnect: false,
                    description: 'slots: 指定该recipe的卡槽，recipe只能拥有一个卡槽，在其进行时会出现。',
                },
                {
                    name: 'effects',
                    label: '生成元素',
                    type: 'port',
                    requireType: 'elements',
                    multiConnect: true,
                    NotSetWarning: true,
                    description:
                        'effects: 产生（正数）/销毁（负数）对应数量的卡牌。当数值为负数时，可以在卡牌id处填写性相id，表示销毁对应数量具有此性相的卡牌（若实际数量低于销毁数量，则全部销毁。）',
                },

                {
                    name: 'requirements',
                    label: '要求',
                    type: 'hub',
                    properties: [
                        {
                            name: 'requirements',
                            type: 'port',
                            requireType: 'elements',
                            multiConnect: true,
                            NotSetWarning: '该条件需要通过set设置数量，直接连接元素(elements)则默认需求数量为1',
                            label: '前置要求',
                            description: '跳转进本交互界面的要求: requirements表示为了进入此recipe，该行动框内需要满足的条件。',
                        },
                        {
                            name: 'extantreqs',
                            type: 'port',
                            requireType: 'elements',
                            multiConnect: true,
                            NotSetWarning: '该条件需要通过set设置数量，直接连接元素(elements)则默认需求数量为1',
                            label: '全局要求',
                            description: '跳转进本交互界面的要求: extantreqs与requirement类似，区别在于它检测的是整个游戏中（包括其他行动框中）的element。',
                        },
                        {
                            name: 'tablereqs',
                            type: 'port',
                            requireType: 'elements',
                            multiConnect: true,
                            NotSetWarning: '该条件需要通过set设置数量，直接连接元素(elements)则默认需求数量为1',
                            label: '桌面要求',
                            description: '跳转进本交互界面的要求: tablereqs与requirement类似，区别在于它检测的是桌面上的element。',
                        },
                    ],
                },
                {
                    name: 'craftable',
                    label: '起始点',
                    type: 'bool',
                    default: false,
                    description: 'craftable: 为真时该recipe可以被玩家主动使用对应行动框触发，否则则只能通过其他方式（如其他的recipe）触发。',
                },
                {
                    name: 'hintonly',
                    label: '仅作提示',
                    type: 'bool',
                    default: false,
                    description: 'hintonly: 为真时该recipe无法被实际执行，只做展示描述作用（多用于提示）',
                },
            ],
            exProperties: [
                {
                    name: 'mutations',
                    label: '重载属性',
                    type: 'port',
                    requireType: 'mutations',
                    multiConnect: true,
                    description:
                        'mutations: 给特定或具有特定性相的卡牌重载（additive为false时）或增加/减少（additive为true时根据level的正负）指定数量的性相，且过滤条件除了性相也可以是卡牌。mutation对性相的改变可以被继承，即使卡牌经过了xtrigger或decayto的变换，变异后的卡牌无法堆叠。',
                },
                {
                    name: 'aspects',
                    label: '性相',
                    type: 'port',
                    requireType: 'elements',
                    multiConnect: true,
                    NotSetWarning: '该条件需要通过set设置数量，直接连接元素(elements)则默认需求数量为1',
                    description: 'aspects: 此交互(recipes)的性相，本身并不显示在性相栏中，但是会参与在"induces"和"xtrigger"的作用中。',
                },
                {
                    name: 'maxexecutions',
                    label: '最大执行次数',
                    type: 'int',
                    default: 0,
                    description: 'maxexecutions: 该recipe的最大执行次数，0表示无限制。',
                },
                {
                    name: 'deckeffects',
                    label: '抽取卡牌',
                    type: 'port',
                    requireType: 'deck',
                    multiConnect: false,
                    valueType: 'number',
                    description: 'deckeffects: 从一个对应卡组中随机抽取一定数量张牌。',
                },
                {
                    name: 'internaldeck',
                    label: '内置卡池',
                    type: 'port',
                    requireType: 'deck',
                    multiConnect: false,
                    description: 'internaldeck: 在recipe中直接定义一个卡组。',
                },
                {
                    name: 'burnimage',
                    label: '特效图片',
                    type: 'image-preview',
                    description: 'burnimage: recipe开始后环绕动作框显示的图片。',
                },
                {
                    name: 'ending',
                    label: '结局',
                    type: 'port',
                    requireType: 'endings',
                    multiConnect: false,
                    description: 'ending: recipe结束后，根据条件触发结局。',
                },
                {
                    name: 'signalEndingFlavour',
                    label: '计时效果',
                    type: 'select',
                    options: ['None', 'Grand', 'Melancholy', 'Pale', 'Vile'],
                    default: 0,
                    description:
                        'signalEndingFlavour: 改变recipe进行时行动框计时圈线的颜色并播放一个音乐，Grand：黄色/Melancholy：红色/Pale：灰白色/Vile：黄绿色。',
                },
                // { label: '漫宿效果', type: 'port', requireType: 'mansus', description:'portaleffect: 进入对应的漫宿之路，这会导致配方从与门相关的每个牌组中绘制一张牌，并让您在板上从中进行选择'}
                {
                    name: 'portaleffect',
                    label: '漫宿效果',
                    type: 'select',
                    options: ['None', 'wood', 'whitedoor', 'spiderdoor', 'peacockdoor', 'tricuspidgate'],
                    default: 0,
                    description: 'portaleffect: 进入对应的漫宿之路，这会导致配方从与门相关的每个牌组中绘制一张牌，并让您在板上从中进行选择',
                },
                {
                    name: 'haltverb',
                    label: '终止行动',
                    type: 'port',
                    requireType: 'verb',
                    multiConnect: true,
                    description: 'haltverb: 强行停止一个进行中的verb，这个verb中的所有elements弹出（需要玩家“收取”才能放在桌面上）',
                },
                {
                    name: 'deleteverb',
                    label: '删除行动',
                    type: 'port',
                    requireType: 'verb',
                    multiConnect: true,
                    description: 'deleteverb: 强行删除一个进行中的verb，这个verb中的所有elements弹出（需要玩家“收取”才能放在桌面上）',
                },
                {
                    name: 'purge',
                    label: '销毁卡牌',
                    type: 'port',
                    requireType: 'elements',
                    multiConnect: true,
                    NotSetWarning: '该条件需要通过set设置数量，直接连接元素(elements)则默认需求数量为1',
                    description: 'purge: 销毁桌面对应数量的卡牌。若被处理卡牌拥有decayto，则以decay代替销毁。',
                },
                {
                    name: 'signalimportantloop',
                    label: '提示音',
                    type: 'bool',
                    default: false,
                    description: 'signalimportantloop: 这将使游戏在该recipe进行时播放一个响亮的声音，以提示有重要事情发生。',
                },
                {
                    name: 'xpans',
                    label: '全局属性',
                    type: 'port',
                    requireType: 'elements',
                    multiConnect: true,
                    NotSetWarning: '该条件需要通过set设置数量，直接连接元素(elements)则默认需求数量为1',
                    description: 'xpans: 扩展全局属性，类似aspects，但是作用于全局，可以触发桌面上的xtriggers。',
                },
                {
                    name: 'achievements',
                    label: '成就',
                    type: 'port',
                    requireType: 'achievements',
                    multiConnect: true,
                    description: 'achievements: 触发对应成就，成就会显示在主界面成就栏中。',
                },
            ],
        },
        mutations: {
            active: true,
            title: 'mutation',
            label: '重载变化',
            color: getNodeColor('mutations'),
            inputs: [],
            outputs: [
                {
                    name: 'mutations',
                    type: 'port',
                    returnType: 'mutations',
                    label: '重载变化',
                    multiConnect: true,
                    description: 'mutations: 重载变化(mutations)给特定或具有特定性相的卡牌重载或增加/减少指定数量的性相',
                },
            ],
            content: `重载变化(mutations)给特定或具有特定性相的卡牌重载或增加/减少指定数量的性相（仅在recipes内部使用）`,
            icon: '🔗',
            properties: [
                {
                    name: 'filter',
                    label: '条件',
                    type: 'port',
                    requireType: 'elements',
                    multiConnect: false,
                    description: 'filter: 过滤的条件id',
                },
                {
                    name: 'mutate',
                    label: '目标',
                    type: 'port',
                    requireType: 'elements',
                    multiConnect: false,
                    description: 'mutate: 需要改变的性相id',
                },
                {
                    name: 'level',
                    label: '变化数量',
                    type: 'number',
                    default: 0,
                    description: 'level: 需要增加/减少的数量。',
                },
                {
                    name: 'additive',
                    label: '增加/减少',
                    type: 'bool',
                    default: true,
                    description: 'additive: 增加/减少性相。',
                },
            ],
        },
        elements: {
            active: true,
            title: 'element',
            label: '元素',
            color: getNodeColor('elements'),
            inputs: [
                {
                    name: 'inherits',
                    label: '继承',
                    type: 'port',
                    requireType: 'elements',
                    multiConnect: false,
                    description: 'inherits: 该元素（卡牌）所继承的元素，该元素（卡牌）会继承继承元素的属性，但不会继承继承元素的induces, icon等。',
                },
            ],
            outputs: [
                {
                    name: 'elements',
                    type: 'port',
                    returnType: 'elements',
                    label: '元素',
                    multiConnect: true,
                    description: 'elements: 游戏中的卡牌、性相均属于elements',
                },
                {
                    // `induces`：**可能触发的 recipe 列在元素上** → 元素自己的**输出端口**
                    // ⚠️ 以前这里错写成 `requireType`（输入语义），方向与契约相反，已纠正。
                    name: 'induces',
                    label: '引发',
                    type: 'port',
                    returnType: 'recipes',
                    multiConnect: true,
                    // 反向记录（契约 `links[].reverse`）：列表在元素上，但「能否触发」由**目标 recipe 自己的定义**
                    // 决定（`additional` 时还要看它需要的行动框能否创建）→ 语义主体在**对端**。
                    reverse: true,
                    NotSetWarning: '该条件需要通过set设置几率以及排序，直接连接元素recipes则默认几率100，排序按给定id排序',
                    description:
                        'induces: 该元素（卡牌或性相）参与的任意recipe结束时，有对应几率触发induces中相应的recipe；若additional:true则此recipe所需求的行动框可以额外被创建',
                },
            ],
            content: `游戏中的卡牌、性相均属于elements`,
            icon: '📇',
            properties: [
                {
                    name: 'typeSwitcher',
                    label: '类型',
                    type: 'select',
                    isModeSwitcher: true,
                    options: ['卡牌', '性相'],
                    default: '卡牌',
                },
                {
                    name: 'description',
                    label: '描述',
                    type: 'text',
                    default: '该元素（卡牌或性相）的介绍',
                    description: 'description: 该元素（卡牌或性相）的介绍, 会显示在右上角详情中',
                },
                {
                    name: 'icon',
                    label: '图标',
                    type: 'image-icon',
                    description: 'icon: 该元素（卡牌或性相）的图标图片，默认为空，此时会寻找和id一致的文件名',
                },
            ],
            modeProperties: {
                卡牌: [
                    {
                        name: 'aspects',
                        label: '性相',
                        type: 'port',
                        requireType: 'elements',
                        multiConnect: true,
                        NotSetWarning: '该条件需要通过set设置数量，直接连接元素(elements)则默认数量为1',
                        description: 'aspects: 该元素（卡牌）所具有的性相，数值代表等级',
                    },
                    {
                        name: 'lifetime',
                        label: '持续时间',
                        type: 'number',
                        default: 0,
                        description: 'lifetime: 该元素（卡牌）的持续时间，单位为秒；默认为0，不会消逝。',
                    },
                    {
                        name: 'slots',
                        label: '卡槽',
                        type: 'port',
                        requireType: 'slots',
                        multiConnect: true,
                        description: 'slots: 该元素（卡牌）所拥有的卡槽，可以在交互(recipes)中额外生成卡槽放入卡牌',
                    },
                    {
                        name: 'unique',
                        label: '唯一性',
                        type: 'bool',
                        default: false,
                        description: 'unique: 该卡牌是/否同一时间在桌面上至多存在一张（新的卡牌会顶替旧的卡牌），默认为否。',
                    },
                    {
                        name: 'uniquenessgroup',
                        label: '唯一性组',
                        type: 'text',
                        description:
                            'uniquenessgroup: 具有相同uniquenessgroup标签的卡牌同一时间在桌面上只能存在一叠，即一张或者多张可合并的卡牌，需要与unique同时使用才能达到同种只存在一张的效果。（uniquenessgroup是特殊的一个aspect，如果没有定义isHidden就会在aspect中显示出来）默认为空。',
                    },
                    {
                        name: 'xtriggers',
                        label: '触发器',
                        type: 'port',
                        requireType: 'xtriggers',
                        multiConnect: true,
                        description: 'xtriggers: 该元素（卡牌）所拥有的触发器，该卡牌在离开具有列出的性相的行动框时会对卡牌进行的转换；默认为空，不会有变动。',
                    },
                    {
                        name: 'decayto',
                        label: '消逝转化',
                        type: 'port',
                        requireType: 'elements',
                        multiConnect: false,
                        description:
                            'decayto: 该元素（卡牌）在时间耗尽后或在burnTo未定义时被slot消耗后会变为的卡牌；特别地，如果填了自己的id，作用相当于于重置存在时间；默认为空，消逝后不会出现新的卡牌。',
                    },
                    {
                        name: 'burnto',
                        label: '消耗转化',
                        type: 'port',
                        requireType: 'elements',
                        multiConnect: false,
                        description:
                            'burnto: 该元素（卡牌）在被slot消耗后会变为的卡牌；特别地，如果填了自己的id，作用相当于于重置存在时间；默认为空，消逝后不会出现新的卡牌。',
                    },
                    {
                        name: 'animFrames',
                        label: '动画帧数',
                        type: 'integer',
                        default: null,
                        description: 'animFrames: 动画帧数，默认为空',
                    },
                    {
                        name: 'resaturate',
                        label: '复彩特效',
                        type: 'bool',
                        default: false,
                        description: 'resaturate: 决定该卡牌在倒计时时是/否会从灰色逐渐变为真实颜色，默认为否。',
                    },
                    {
                        name: 'verbicon',
                        label: '行动图像',
                        type: 'image-preview',
                        description: 'verbicon: 当该卡牌存在时，verb显示的图片。',
                    },
                    {
                        name: 'xexts',
                        label: '替换性相描述文本',
                        type: 'text',
                        description:
                            'xexts: 注意：此代码仅作为可选项收录，不建议在游戏中使用。类似于xtriggers，当此卡牌参与的recipe结束时，如果有相应的性相出现，则会在recipe的description中显示对应的描述。不支持中文。特别的，你可以使用富文本标签 "<font=NotoSansCJKsc-Regular>描述<\\font>" 来显示中文，实际测试recipe不显示口口口但也没显示正常中文，右上角正常显示。',
                    },
                ],
                性相: [
                    {
                        name: 'isHidden',
                        label: '隐藏性相',
                        type: 'bool',
                        default: false,
                        description: 'isHidden: 是否隐藏该性相，默认为否。',
                    },
                    {
                        name: 'noartneeded',
                        label: '无需图片',
                        type: 'bool',
                        default: false,
                        description: 'noartneeded: 该性相是否不需要图片，默认为否。',
                    },
                ],
            },
        },
        xtriggers: {
            active: true,
            title: 'xtrigger',
            label: '触变',
            color: getNodeColor('xtriggers'),
            inputs: [
                {
                    name: 'inherits',
                    label: '继承集合',
                    type: 'port',
                    requireType: 'xtriggers',
                    multiConnect: true,
                    description: '继承之前的xtrigger的元素，扩展成集合',
                },
            ],
            outputs: [
                {
                    name: 'xtriggers',
                    type: 'port',
                    returnType: 'xtriggers',
                    label: '触变',
                    multiConnect: true,
                    description: 'xtriggers: 触变(xtriggers)在元素（卡牌）离开具有列出的性相的行动框时会对卡牌进行的转换',
                },
            ],
            content: `触变(xtriggers)在元素（卡牌）离开具有列出的性相的行动框时会对卡牌进行的转换（仅在元素(elements)内部使用,如果定义在性相(aspects)内则会继承给具有该性相的卡牌）`,
            icon: '🔗',
            properties: [
                {
                    name: 'versionSwitcher',
                    label: '版本',
                    type: 'select',
                    isModeSwitcher: true,
                    options: ['简易', '复杂'],
                    default: 0,
                    description: '简易版本版本只能实现将该卡牌转换为指定的卡牌，并重置剩余时间；复杂版本可以实现多种变化，但编码格式较简单版本更为复杂。',
                },
                {
                    name: 'condition',
                    label: '条件',
                    type: 'port',
                    multiConnect: false,
                    requireType: 'elements',
                    // 触发的性相条件是 xtriggers 对象的「键」（如 "lantern"），数据里没有同名字段、
                    // 出现率统计拿不到它 —— 由 nodePropertyLevels.js 的 ALWAYS_ESSENTIAL 名单保持常驻。
                    description: '离开具有该性相的交互(recipes)时触发',
                },
            ],
            modeProperties: {
                0: [
                    {
                        name: 'target',
                        label: '转化目标',
                        type: 'port',
                        multiConnect: false,
                        requireType: 'elements',
                        description: '离开具有条件性相的交互(recipes)时触发，将卡牌转化目标卡牌',
                    },
                ],
                1: [
                    {
                        name: 'operands',
                        label: '操作数',
                        type: 'port',
                        requireType: 'morphEffects',
                        multiConnect: true,
                        description: '同一个条件可以触发多个效果',
                    },
                    {
                        name: 'id',
                        label: '基础目标卡牌',
                        type: 'port',
                        requireType: 'elements',
                        multiConnect: false,
                        description: 'id: 只有一个效果时使用，离开具有条件性相的交互(recipes)时触发，触发操作数',
                    },
                    {
                        name: 'morpheffect',
                        label: '基础操作数',
                        type: 'select',
                        options: ['transform', 'spawn', 'quantity', 'mutate', 'setmutaion'],
                        description:
                            'morpheffect: 只有一个效果时使用，不同操作数提供不同的功能，原版游戏提供了5个操作数。transform: 将卡牌转化为对应数目的目标卡牌；spawn: 额外创建对应数目的目标卡牌；quantity: 自增，额外创建指定数目的本体（无需目标卡牌，如果定义在aspect上则增加aspect所在卡牌）；mutate: 增加/减少对应数量的性相(aspects)；setmutation: 设置对应数量的性相(aspects)（原版文件里实际效果是设置level+1，已自动调整）',
                    },
                    {
                        name: 'level',
                        label: '基础数量',
                        type: 'number',
                        default: 1,
                        description: 'level: 只有一个效果时使用，数量，默认为1',
                    },
                ],
            },
        },
        morphEffects: {
            active: true,
            title: 'morphEffect',
            label: '操作数',
            color: getNodeColor('morphEffects'),
            icon: '🔗',
            inputs: [
                {
                    name: 'inherits',
                    label: '继承集合',
                    type: 'port',
                    requireType: 'morphEffects',
                    multiConnect: true,
                    description: '继承之前的morphEffects的元素，扩展成集合',
                },
            ],
            outputs: [
                {
                    name: 'morphEffect',
                    label: '操作数',
                    type: 'port',
                    returnType: 'morphEffects',
                    multiConnect: true,
                    description: '仅在xtriggers复杂版本中生效，同一个条件可以触发多个效果',
                },
            ],
            properties: [
                {
                    name: 'id',
                    label: '目标卡牌',
                    type: 'port',
                    requireType: 'elements',
                    multiConnect: false,
                    description: 'id: 离开具有条件性相的交互(recipes)时触发，触发操作数',
                },
                {
                    name: 'morpheffect',
                    label: '操作数',
                    type: 'select',
                    options: ['transform', 'spawn', 'quantity', 'mutate', 'setmutaion'],
                    description:
                        'morpheffect: 不同操作数提供不同的功能，原版游戏提供了5个操作数。transform: 将卡牌转化为对应数目的目标卡牌；spawn: 额外创建对应数目的目标卡牌；quantity: 自增，额外创建指定数目的本体（无需目标卡牌，如果定义在aspect上则增加aspect所在卡牌）；mutate: 增加/减少对应数量的性相(aspects)；setmutation: 设置对应数量的性相(aspects)（原版文件里实际效果是设置level+1，已自动调整）',
                },
                {
                    name: 'level',
                    label: '数量',
                    type: 'number',
                    default: 1,
                    description: 'level: 数量，默认为1',
                },
            ],
        },
        decks: {
            active: true,
            title: 'deck',
            label: '卡池',
            color: getNodeColor('decks'),
            inputs: [],
            outputs: [
                {
                    name: 'decks',
                    type: 'port',
                    returnType: 'decks',
                    label: '卡池',
                    multiConnect: true,
                    description: 'decks: mod中随机抽卡的卡池，可以写在recipe中，也可以单独写出。',
                },
            ],
            content: `decks是mod中随机抽卡的卡池，可以写在recipe中，也可以单独写出。`,
            icon: '🗃',
            properties: [
                {
                    name: 'description',
                    label: '描述',
                    type: 'text',
                    default: '该卡池的介绍',
                    description: 'description: 该卡池的介绍',
                },
                {
                    name: 'spec',
                    label: '牌组',
                    type: 'port',
                    requireType: 'elements',
                    multiConnect: true,
                    NotSetWarning: '该条件需要通过set设置数量，直接连接元素(elements)则默认数量为1',
                    description: 'spec: 卡池中随机抽取的卡牌列表',
                },
                {
                    name: 'resetonexhaustion',
                    label: '补充牌组',
                    type: 'bool',
                    default: false,
                    description: 'resetonexhaustion: 是否在卡牌抽完之后重新补充牌组',
                },
                {
                    name: 'draws',
                    label: '抽取数量',
                    type: 'number',
                    default: 1,
                    description: 'draws: 【仅存在于interaldeck】draws是一次性从卡组中抽取卡牌的数量',
                },
                {
                    name: 'defaultcard',
                    label: '默认卡牌',
                    type: 'port',
                    requireType: 'elements',
                    multiConnect: false,
                    default: 'genericrubbishbook',
                    description: '"defaultcard":  卡池里所有卡牌被抽完时默认出现的卡牌',
                },
            ],
        },
        verbs: {
            active: true,
            title: 'verb',
            label: '行动框',
            color: getNodeColor('verbs'),
            inputs: [],
            outputs: [
                {
                    name: 'verbs',
                    type: 'port',
                    returnType: 'verbs',
                    label: 'verb',
                    multiConnect: true,
                    description: 'verbs:',
                },
            ],
            content: `verbs是mod中的动词，将卡牌拖入触发交互界面(recipes)的行动框。`,
            icon: '⚡',
            properties: [
                {
                    name: 'icon',
                    label: '图标',
                    type: 'image-icon',
                    description: 'icon: verbs使用的图标图片',
                },
                {
                    name: 'description',
                    label: '描述',
                    type: 'text',
                    default: '该动词的介绍',
                    description: 'description: 该动词的介绍',
                },
                {
                    name: 'Multiple',
                    label: '可重复',
                    type: 'bool',
                    default: false,
                    description: 'Multiple: 是否允许该动词同时出现多个（默认为否）',
                },
                {
                    name: 'slot',
                    label: '初始卡槽',
                    type: 'port',
                    requireType: 'slots',
                    multiConnect: false,
                    description: 'slot: 该动词带有的唯一卡槽',
                },
            ],
        },
        slots: {
            active: true,
            title: 'slot',
            label: '卡槽',
            color: getNodeColor('slots'),
            inputs: [
                {
                    name: 'required',
                    type: 'port',
                    label: '需求',
                    requireType: 'elements',
                    multiConnect: true,
                    NotSetWarning: '该条件需要通过set设置数量，直接连接元素(elements)则默认数量为1',
                    description: `required: 卡槽可以容纳的元素（性相或卡牌），当卡牌符合或卡牌上其中一项性相数量大于等于要求时便可放入槽中。
                                    slot的required采用或逻辑，与recipe的与逻辑相反。
                                    只接受正值`,
                },
                {
                    name: 'forbidden',
                    type: 'port',
                    label: '禁止',
                    requireType: 'elements',
                    multiConnect: true,
                    NotSetWarning: '该条件需要通过set设置数量，直接连接元素(elements)则默认数量为1',
                    description: `forbidden: 卡槽不可以容纳的元素（性相或卡牌），当卡牌符合或卡牌上其中一项性相数量大于等于要求时便不可放入槽中。
                                    当卡牌同时满足required和forbidden时，拒绝进入槽。
                                    slot的forbidden采用或逻辑。
                                    只接受正值`,
                },
                {
                    name: 'essential',
                    type: 'port',
                    label: '必要',
                    requireType: 'elements',
                    multiConnect: true,
                    NotSetWarning: '该条件需要通过set设置数量，直接连接元素(elements)则默认数量为1',
                    description: `essential: 卡槽必须容纳的元素（性相或卡牌），当卡牌符合或卡牌上其中一项性相数量大于等于要求时便可放入槽中。
                                    slot的essential采用与逻辑，与recipe相同。
                                    如果存在required，则仍需要满足required中的至少一项
                                    只接受正值`,
                },
            ],
            outputs: [
                {
                    name: 'slots',
                    type: 'port',
                    returnType: 'slots',
                    label: '卡槽',
                    multiConnect: true,
                    description: 'slots: 卡槽，仅可以在交互(recipes)、卡牌(elements)或事件框(verbs)中使用。',
                },
            ],
            content: `slots: 卡槽，仅可以在交互(recipes)、卡牌(elements)或事件框(verbs)中使用。`,
            icon: '🎚️',
            properties: [
                {
                    name: 'description',
                    label: '描述',
                    type: 'text',
                    default: '玩家点开卡槽时显示的描述',
                    description: 'description: 玩家点开卡槽时显示的描述',
                },
                {
                    name: 'greedy',
                    label: '自动吸取',
                    type: 'bool',
                    default: false,
                    description: 'greedy: 代表该卡槽是否会自动吸取卡牌; 此属性在slot从属于verb时被忽略',
                },
                {
                    name: 'consumes',
                    label: '消耗卡牌',
                    type: 'bool',
                    default: false,
                    description:
                        'consumes: 代表该卡槽是否消耗卡牌; 消耗卡牌时，如果卡牌定义了burnTo，则转换为burnTo定义的卡牌。如果burnTo未定义或为空字符串，而decayTo被定义，则转换为decayTo定义的卡牌。如果burnTo与decayTo都未被定义，则卡牌被销毁',
                },
                {
                    name: 'actionId',
                    label: '行动（容纳卡牌时）',
                    type: 'port',
                    requireType: 'verb',
                    multiConnect: false,
                    default: 'work',
                    description: 'actionId: 使用的行动的id, 当卡槽写在卡牌中时，在该卡牌进入此事件框时会显示; 此属性在slot从属于recipe或verb时被忽略',
                },
                {
                    name: 'ifaspectspresent',
                    label: '显示条件',
                    type: 'port',
                    requireType: 'elements',
                    multiConnect: true,
                    description:
                        'ifaspectspresent: 定义元素条件（性相或卡牌），当给出的卡牌符合定义的条件时，将此插槽显示；反之隐藏此插槽。（注意，此代码仅用于element中的slots代码），另外官方没有使用这一条的文件（看来是不好用...）',
                },
            ],
        },
        levers: {
            active: true,
            title: '继承物品',
            color: getNodeColor('levers'),
            inputs: [],
            outputs: [
                {
                    name: 'lever',
                    type: 'port',
                    returnType: 'levers',
                    label: '继承物品',
                    multiConnect: true,
                    description: 'lever: 从上一局游戏继承的物品。',
                },
                {
                    name: 'elements',
                    type: 'port',
                    returnType: 'elements',
                    label: '继承物品(卡牌实例)',
                    multiConnect: true,
                    description: '从上一局游戏继承的物品对应的卡牌。',
                },
            ],
            content: `从上一局游戏中继承的事物。如使徒继承的教会与教徒，或是富家子弟所继承的书籍。
                        某种意义上说，这是一张卡牌，你可以通过effects等代码得到它。`,
            icon: '🎚️',
            properties: [
                {
                    name: 'onGameEnd',
                    label: 'onGameEnd',
                    type: 'bool',
                    default: false,
                    description: 'onGameEnd: 未知作用',
                },
                {
                    name: 'defaultValue',
                    label: '默认卡牌',
                    type: 'port',
                    requireType: 'elements',
                    multiConnect: false,
                    description: 'defaultValue: 默认得到的卡牌',
                },
                {
                    name: 'weights',
                    label: '权重',
                    type: 'port',
                    requireType: 'elements',
                    multiConnect: true,
                    NotSetWarning: '该条件需要通过set设置权重，直接连接元素(elements)则默认权重为1',
                    description: 'weights: 用于决定继承的性相（或卡牌）的权重，可以为负数。',
                },
                {
                    name: 'requiredScore',
                    label: '需求权重',
                    type: 'number',
                    default: 1,
                    description: 'requiredScore: 需要的权重，只有卡牌满足了权重才会被记录。有多个被记录的卡牌取权重最高者。',
                },
                //TODO: 需求是set需要一一对应
                {
                    name: 'redirects',
                    label: '重定向',
                    type: 'port',
                    requireType: 'set',
                    multiConnect: false,
                    description: 'redirects: 当卡牌符合左侧id时，会被记录为右侧的id。如欲望无论是几级，都只会记录为一级',
                },
            ],
        },
        extends: {
            active: true,
            title: '扩充对象',
            color: getNodeColor('extends'),
            icon: '🎚️',
            inputs: [],
            outputs: [],
            content: `extends: 特殊的写法，可以修改原游戏的数据，如果你不知道该如何使用，请不要使用本节点`,
            properties: [
                { name: 'undefined', label: '扩充的对象', type: 'node', default: '' },
                {
                    name: 'undefined',
                    label: '代码',
                    type: 'text-preview',
                    default: '写入新的扩充内容',
                },
            ],
        },
        copies: {
            active: true,
            title: '引用复制',
            color: getNodeColor('copies'),
            icon: '🎚️',
            inputs: [],
            outputs: [],
            content: ``,
            properties: [
                {
                    name: 'modeSwitcher',
                    label: '模式',
                    type: 'select',
                    isModeSwitcher: true,
                    default: '简洁',
                    options: ['简洁', '完整', '可编辑'],
                },
                { name: 'undefined', label: '引用的对象', type: 'node', default: '' },
            ],
            modeProperties: {
                0: [],
                1: [],
                2: [],
            },
        },
        text: {
            active: true,
            title: '文本',
            color: getNodeColor('text'),
            inputs: [],
            outputs: [
                {
                    name: 'undefined',
                    type: 'port',
                    returnType: 'text',
                    label: '文本',
                    multiConnect: true,
                },
            ],
            content: `文本常量, 输出string格式`,
            icon: '🎚️',
            properties: [
                {
                    name: 'undefined',
                    label: '文本',
                    type: 'textarea-preview',
                    default: '',
                },
            ],
        },
        number: {
            active: true,
            title: '数字',
            color: getNodeColor('number'),
            inputs: [],
            outputs: [
                {
                    name: 'undefined',
                    type: 'port',
                    returnType: 'number',
                    label: '数字',
                    multiConnect: true,
                },
            ],
            content: `数字常量，输出int格式`,
            icon: '🎚️',
            properties: [{ name: 'undefined', label: '数字', type: 'number', default: 0 }],
        },
        nodeSet: {
            active: false,
            title: '集合',
            color: getNodeColor('set'),
            inputs: [
                {
                    name: 'undefined',
                    type: 'port',
                    requireType: 'set',
                    multiConnect: true,
                    label: '继承集合',
                    description: '继承之前的集合的元素，扩展成新的集合，注意集合的元素类型必须一致',
                },
            ],
            outputs: [
                {
                    name: 'undefined',
                    type: 'port',
                    returnType: 'set',
                    label: '集合',
                    multiConnect: true,
                    description: '输出集合格式的变量',
                },
            ],
            content: `集合变量，输出参数集合，可以将多个集合链接，不允许成环`,
            icon: '🎚️',
            properties: [
                {
                    name: 'undefined',
                    label: '类型',
                    type: 'select',
                    default: '字典',
                    options: ['字典', '列表', 'xtriggers', 'mutations'],
                },
            ],
            modeProperties: {
                字典: [
                    {
                        name: 'undefined',
                        label: '字典',
                        type: 'table',
                        columns: [
                            {
                                label: '键',
                                field: 'key',
                                type: 'any',
                                width: '50%',
                            },
                            {
                                label: '值',
                                field: 'value',
                                type: 'any',
                                width: '50%',
                            },
                        ],
                        description: '键值对，项目可以是任何类型，用于',
                    },
                ],
                列表: [
                    {
                        name: 'undefined',
                        label: '列表',
                        type: 'table',
                        columns: [
                            {
                                label: '项目',
                                field: 'id',
                                type: 'any',
                                width: '100%',
                            },
                        ],
                        description: '列表，可以用于deck的spec，属性可以重复',
                    },
                ],
                xtriggers: [
                    {
                        name: 'undefined',
                        label: '版本',
                        type: 'select',
                        options: ['简易', '复杂'],
                        default: 0,
                        description: '简易版本版本只能实现将该卡牌转换为指定的卡牌，并重置剩余时间；复杂版本可以实现多种变化，但编码格式较简单版本更为复杂。',
                    },
                ],
                mutations: [
                    {
                        name: 'undefined',
                        label: '重载',
                        type: 'table',
                        columns: [
                            {
                                label: '条件',
                                field: 'filter',
                                type: 'elements',
                                width: '100%',
                            },
                            {
                                label: '目标',
                                field: 'mutate',
                                type: 'elements',
                                width: '100%',
                            },
                            {
                                label: '变化数量',
                                field: 'level',
                                type: 'number',
                                width: '100%',
                            },
                            {
                                label: '增加/减少',
                                field: 'filter',
                                type: 'bool',
                                width: '100%',
                            },
                        ],
                        description: '重载变化(mutations)给特定或具有特定性相的卡牌重载或增加/减少指定数量的性相（仅在recipes内部使用）',
                    },
                ],
            },
        },
        images: {
            active: true,
            title: '图片',
            color: getNodeColor('images'),
            inputs: [],
            outputs: [
                {
                    name: 'undefined',
                    type: 'port',
                    label: '图片',
                    returnType: 'images',
                    multiConnect: true,
                },
            ],
            content: `图片常量, 用于图标或背景等使用`,
            icon: '🎚️',
            properties: [
                {
                    name: 'undefined',
                    label: '图片',
                    type: 'image-preview',
                    default: '',
                    description: '存放在image路径下的图片',
                },
                {
                    name: 'undefined',
                    label: '图片id',
                    type: 'image-path',
                    default: '',
                    description: '存放在image路径下的图片',
                },
            ],
        },
        /**
         * 表格变量节点（变量节点的**字典形态**）
         *
         * 「额外解析」的默认产物：宿主字段的值是对象（`dict`）时，把它的键值对变成可编辑表格。
         * 模板里的 `columns` 只是一份最简默认（供手工新建时用），真正解析出来的节点会按实际值重建列。
         */
        table: {
            active: true,
            title: '表格',
            color: getNodeColor('table'),
            inputs: [
                {
                    name: 'value',
                    type: 'port',
                    label: '数据',
                    requireType: 'any',
                    multiConnect: false,
                },
            ],
            outputs: [
                {
                    name: 'value',
                    type: 'port',
                    label: '数据',
                    returnType: 'any',
                    multiConnect: true,
                },
            ],
            content: `表格变量节点（字典形）：把字段里的对象解析成可编辑的行列（键 → 值）`,
            icon: '📊',
            properties: [
                {
                    name: 'value',
                    label: '表格',
                    type: 'table',
                    default: [],
                    columns: [
                        { label: '键', field: 'key', type: 'text', width: '40%' },
                        { label: '值', field: 'value', type: 'text', width: '60%' },
                    ],
                    description: '额外解析出来的表格；改这里等于改宿主字段的值',
                },
            ],
        },
        /**
         * 列表变量节点（变量节点的**列表形态**）
         *
         * 「额外解析」的另一个产物：宿主字段的值是对象数组（`list`）时，一条占一行。
         */
        list: {
            active: true,
            title: '列表',
            color: getNodeColor('list'),
            inputs: [
                {
                    name: 'value',
                    type: 'port',
                    label: '数据',
                    requireType: 'any',
                    multiConnect: false,
                },
            ],
            outputs: [
                {
                    name: 'value',
                    type: 'port',
                    label: '数据',
                    returnType: 'any',
                    multiConnect: true,
                },
            ],
            content: `列表变量节点（列表形）：把字段里的数组摆成一行一条（对象元素自动展开成列）`,
            icon: '📋',
            properties: [
                {
                    name: 'value',
                    label: '列表',
                    type: 'table',
                    default: [],
                    columns: [{ label: '条目', field: 'value', type: 'text', width: '100%' }],
                    description: '额外解析出来的列表；改这里等于改宿主字段的值',
                },
            ],
        },
        /**
         * 容器节点（containerNode）
         *
         * 把画布上若干节点「合并」成一个大背景容器（对齐 ComfyUI 的 subgraph 容器形态）：
         * **展开态**是半透明、可缩放的背景框（只有 title 栏与右下角可交互，成员节点在框内自由摆放）；
         * **收起态**缩回普通卡片，只显示**转发端口**与**透传属性**（成员变量，设置里可开关）。
         *
         * 属性不来自模板：转发端口是 `PortProp`，透传属性是每个来源节点一个带标签的 `HubProp`，
         * 均由 `ControllerCore` 动态增删（见 `mergeToContainer` / `_refreshContainerPassthrough`）。
         */
        container: {
            active: false, // 不进「添加节点」面板：由右键「合并为容器节点」创建
            title: '容器节点',
            color: getNodeColor('container'),
            inputs: [
                {
                    name: 'in',
                    type: 'port',
                    label: '入',
                    requireType: 'any',
                    multiConnect: true,
                },
            ],
            outputs: [
                {
                    name: 'out',
                    type: 'port',
                    label: '出',
                    returnType: 'any',
                    multiConnect: true,
                },
            ],
            content: `容器节点：把多个节点合并成一个大背景容器（展开是半透明背景框，收起只留转发端口与透传属性）`,
            icon: '🗂',
            properties: [],
        },
        /**
         * 悬空端口（文件外目标的占位节点）
         *
         * 只有端口：没有标题栏 / 属性 / 图标，代表「这个引用指向画布外的目标」。
         * `active: false` —— 不进「添加节点」面板（它是数据驱动的自动产物，不是手建类型）；
         * 两侧端口都留着（同一个目标可能被 input / output 两种引用指向）。
         */
        danglingPort: {
            active: false,
            title: '悬空端口',
            color: getNodeColor('dangling'),
            inputs: [
                {
                    name: 'target',
                    type: 'port',
                    label: '目标',
                    requireType: 'any',
                    multiConnect: true,
                },
            ],
            outputs: [
                {
                    name: 'target',
                    type: 'port',
                    label: '目标',
                    returnType: 'any',
                    multiConnect: true,
                },
            ],
            content: `未实现的目标（文件外节点）`,
            icon: '',
            properties: [],
        },
        /**
         * 引用副本（reference node）
         *
         * 从画布上已有的节点复制出一份**只读副本**，专门用来布线（把端口“搬”到需要的位置，
         * 免得长线横跨整个画布）：样式与容器节点的展开态一致（虚线 + 半透明底色 + 标题栏），
         * 但**内部不可编辑、不可缩放**，只提供端口。
         *
         * 关键：副本端口上拖出的连线**落在原节点端口上**（数据里只有原节点），
         * 所以副本可以随便摆位、随便删，不影响数据；受保护来源（origin / 其他 mod）
         * 的那类连接会被直接阻止并报错。
         *
         * 端口不来自模板：由 `ControllerCore.createRefNode` 按源节点的端口动态建（端口带 `refProxy`）。
         */
        ref: {
            active: false, // 不进「添加节点」面板：由右键「创建引用副本」创建
            title: '引用副本',
            color: getNodeColor('ref'),
            inputs: [],
            outputs: [],
            content: `引用副本：某个节点的只读副本，只提供端口用于布线（连线落在原节点上）`,
            icon: '⧉',
            properties: [],
        },
    };

    /**
     * 当前档位下，建节点时初始加载多少个「可选属性」
     *
     * 最低 = 0（只显示必要属性）、标准 = 最常用的 3 个、全部 = 全加载。
     * 建节点的地方（`NodeGenerator.createExtendProps`）读它。
     *
     * @returns {number} 0 / N / Infinity
     */
    static get initialOptionalCount() {
        return initialOptionalCount(this.propertyLevel);
    }

    /**
     * 切换「属性档位」（最低 / 标准 / 全部）
     *
     * 只改此后新建节点**初始加载几个可选属性**；画布上已有节点不动（要换档请新建节点）。
     *
     * @param {string} level - 档位取值，非法值回落到默认档
     * @returns {string} 实际生效的档位
     */
    static setPropertyLevel(level) {
        this.propertyLevel = PROPERTY_LEVELS.includes(level) ? level : DEFAULT_PROPERTY_LEVEL;
        return this.propertyLevel;
    }

    /**
     * 取某个类型的、已按「必要 / 非必要」重排、并带上当前配色的配置（带缓存）
     *
     * 颜色写成 **getter**（`config.color` 每次现取）：改配色后不管走哪条路径
     * （`setNodeColor` / `resetNodeColors` / `config.json` 的出厂色），
     * 新建节点立刻用新色，缓存不需要失效。画布上**已有**节点由
     * `ControllerCore.applyNodeColors()` 重绘刷新。
     *
     * @private
     * @param {string} typeKey - 基础节点类型键
     * @returns {NodeConfig}
     */
    static _configOf(typeKey) {
        if (!this._splitCache.has(typeKey)) {
            const config = { ...applyPropertyLevel(typeKey, this.nodeTypes[typeKey]) };
            Object.defineProperty(config, 'color', {
                enumerable: true,
                configurable: true,
                get: () => this.getTypeColor(typeKey),
            });
            this._splitCache.set(typeKey, config);
        }
        return /** @type {NodeConfig} */ (this._splitCache.get(typeKey));
    }

    /**
     * 根据键获取对应的节点类型
     *
     * `properties` = 必要属性（常驻），`exProperties` = 全部非必要属性（按出现率降序的
     * 「修改可选属性」池）；没有原版数据可依据的类型保持模板原样。
     *
     * @param {string} key - 节点类型的键值
     * @returns {NodeConfig} 返回对应键的节点类型，如果不存在则返回默认的'blank'类型
     */
    static getType(key) {
        return this._configOf(this.nodeTypes[key] ? key : 'blank');
    }

    /**
     * 根据键获取对应的颜色值（配色键或端口数据类型名，未知键退回 `blank`）
     *
     * @param {string} key - 颜色的标识键
     * @returns {string} 返回对应的颜色值（`#rrggbb`）
     */
    static getColor(key) {
        return getNodeColor(key);
    }

    /**
     * 按**基础节点类型键**取色（把 `nodeSet` → `set` 这类差异抹平）
     *
     * 节点边框/图标、侧边栏列表色条等「按节点类型上色」的地方统一走它。
     *
     * @param {string} typeKey - 基础节点类型键
     * @returns {string} 返回对应的颜色值（`#rrggbb`）
     */
    static getTypeColor(typeKey) {
        return getNodeColor(nodeColorKeyOf(typeKey));
    }

    /**
     * 改一个配色项（节点类型 / 端口数据类型共用同一张配色表）
     *
     * 只改配色表；**不需要清 `_splitCache`** —— 配置里的 `color` 是现取的 getter。
     * **画布上已有节点**要刷新颜色，接着调用 `ControllerCore.applyNodeColors()`。
     * 改过的项会记进 localStorage。
     *
     * @param {string} key - 配色键（见 `nodeColors.js` 的 `NODE_COLOR_KEYS`）
     * @param {string} value - `#rgb` / `#rrggbb`
     * @returns {boolean} 是否生效（未知键或非法颜色返回 false）
     */
    static setNodeColor(key, value) {
        return setPaletteColor(key, value);
    }

    static get allTypesList() {
        return Object.entries(this.nodeTypes)
            .filter(([, config]) => config.active)
            .map(([key, config]) => ({ ...config, type: key, color: this.getTypeColor(key) }));
    }

    /** 全部配色键（节点类型 + 端口数据类型共用） */
    static get allColors() {
        return [...NODE_COLOR_KEYS];
    }
}
