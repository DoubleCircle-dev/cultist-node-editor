
const nodeColorVars = (function () {
    const root = document.documentElement;

    const computed = getComputedStyle(root);
    const colorKeys = [
        'blank', 'test', 'legacies', 'endings', 'achievements',
        'recipes', 'mutations', 'elements', 'xtriggers', 'morphEffects',
        'decks', 'verbs', 'slots', 'levers', 'extends', 'copies',
        'text', 'number', 'set', 'images'
    ];
    const colors = {};
    colorKeys.forEach(key => {
        colors[key] = computed.getPropertyValue(`--node-${key}`).trim();
    });
    return colors;
})();

const nodeTypes = {
    blank: {
        title: '空节点',
        color: nodeColorVars.blank,
        inputs: [],
        outputs: [],
        content: `这是一个空节点`,
        icon: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
        fixedProperties: [],
        properties: []
    },
    test: {
        title: '测试节点',
        color: nodeColorVars.test,
        inputs: [
            { type: 'port', label: '测试多输入', requireType: 'test', multiConnect: true },
            { type: 'port', label: '测试单输入', requireType: 'test', multiConnect: false }
        ],
        outputs: [
            { type: 'port', label: '测试输出', multiConnect: true }
        ],
        content: `这是一个测试节点，类型: 通用测试`,
        icon: '⚡',
        fixedProperties: [
            { label: '选项', type: 'select', modeSwitcher: true, options: ['选项1', '选项2', '选项3'], default: 0 },
            {
                label: '数据表格',
                type: 'table',
                default: [
                    { name: '项目1', value: 10, enabled: true },
                    { name: '项目2', value: 20, enabled: false },
                    { name: '项目3', value: 30, enabled: true }
                ],
                columns: [
                    { label: '名称', field: 'name', type: 'text', width: '40%' },
                    { label: '数值', field: 'value', type: 'number', width: '30%' },
                    { label: '启用', field: 'enabled', type: 'checkbox', width: '20%' }
                ],
                showInNode: false,
                hasPort: false
            }
        ],
        properties: [
            { label: '端口', type: 'port', requireType: 'test', multiConnect: true, connectNum: 4, description: '测试属性连接端口' },
            { label: '常驻文本输入', type: 'text', default: '测试常驻文本' }
        ],
        exProperties: {
            0: [
                { label: '二择', type: 'bool', default: false },
                { label: '数值', type: 'range', min: 0, max: 100, default: 50 },
            ],
            1: [
                { label: '开关', type: 'checkbox', default: false },
                { label: '数字', type: 'number', min: 0, max: 100, default: 50 },
            ],
            2: [
                { label: '整数输入', type: 'int', default: 0 },
                { label: '文本输入', type: 'text', default: '测试文本' }
            ]
        }
    },
    legacies: {
        title: 'legacy',
        label: '职业(legacies)',
        color: nodeColorVars.legacies,
        inputs: [
            { type: 'port', label: '初始verb', multiConnect: false }
        ],
        outputs: [
        ],
        content: `添加独立的职业`,
        icon: '⚡',
        fixedProperties: [
            { label: '描述', type: 'text', default: '职业描述', description: 'description: 菜单中选择职业时显示的文本' },
            { label: '初始描述', type: 'text', default: '初始描述', description: 'startdescription: 会显示在开始此职业的新游戏时的弹出窗口。' },
            { label: '起始行动框', type: 'port', requireType: 'verbs', multiConnect: false, default: 'work', description: 'startingVerbId: 游戏开始时提供给玩家的verb，你可以自创一个，也可以从已有的verb中选择一个' },
        ],
        properties: [
            { label: '前置结局', type: 'port', requireType: 'endings', multiConnect: false, description: 'fromEnding: 在某结局后必定可选' },
            { label: '非特定结局后续', type: 'bool', default: true, description: 'availableWithoutEndingMatch: 表示游戏是否可以在任何其他职业的任何结束后将此职业视为有效的新开始' },
            { label: '新开始', type: 'bool', default: true, description: 'newstart: 表示我们是否可以在第六历史菜单中手动选择此职业来开始它（就像其他DLC一样）。' },
            { label: '跟踪元素', type: 'port', requireType: 'elements', multiConnect: true, connectNum: 4, description: 'statusbarelements: 此职业中在屏幕底部跟踪的元素列表。需要恰好包含四个内容。如果你要跟踪的项目少于4个，你可以重复其中一些使其达到4个,默认重复列表的最后一个。' },
            { label: '桌面图片', type: 'image', description: 'tablecoverimage: 决定桌面背景，如dlc流亡者中的地中海地图。(请将地图放入images/ui中)（没有该字段则使用默认桌面）' },
            { label: '禁用后续职业列表', type: 'port', requireType: 'legacies', multiConnect: true, description: 'excludesOnEnding: 在此职业之后无法选择的其他职业列表。' }
        ]
    },
    endings: {
        title: 'ending',
        label: '结局(endings)',
        color: nodeColorVars.endings,
        inputs: [
        ],
        outputs: [
            { type: 'port', label: '结局', multiConnect: true, description: 'endings: 结局' },
        ],
        content: `endings即游戏中原版或自定义的结局。`,
        icon: '⚡',
        fixedProperties: [
            { label: '描述', type: 'text', default: '在达成该结局时，游戏中显示的文本', description: 'description: 在达成该结局时，游戏中显示的文本' },
            { label: '成就', type: 'port', requireType: 'achievements', multiConnect: true, default: '达成该结局时，解锁的成就', description: 'achievement: 达成该结局时，解锁的成就' },
            { label: '图片', type: 'image', description: 'image: 达成该结局时，在达成该结局时显示的图片' },
        ],
        properties: [
            { label: '类型', type: 'select', options: ['坏结局(Melancholy)', '胜利(Grand)', '反面胜利(Vile)'], default: 0, description: 'flavour: 该结局的类型，“Melancholy”代表坏结局；“Grand”代表胜利；“Vile”代表反面胜利。' },
            { label: '动画', type: 'select', options: ['DramaticLight', 'DramaticLightCool', 'DramaticLightEvil'], default: 0, description: 'anim: 从某个recipe进入该结局时，显示的动画类型。“DramaticLight”在任何结局都可用，“DramaticLightCool”是胜利时显示的动画，“DramaticLightEvil”则是在坏结局时显示。' }
        ]

    },
    achievements: {
        title: 'achievement',
        label: '成就(achievements)',
        color: nodeColorVars.achievements,
        inputs: [],
        outputs: [
            { type: 'selectPort', label: ['成就类型', '成就'], multiConnect: true, description: ['categories: 成就类型（成就类型会在主界面的成就下面新建一个类别用来显示成就）', 'achievements: 成就（同一类成就会放在一个页面）'] },
        ],
        content: `成就(achievements)是游戏中解锁的成就/成就类型，可以在成就页面中查看。`,
        fixedProperties: [
            { label: '类型', type: 'select', modeSwitcher: true, options: ['成就类型', '成就'], default: 0, description: 'isCategory: 成就和成就类型都属于achievements,成就类型会在主界面的成就下面新建一个类别用来显示成就' },
        ],
        properties: [
            { label: '图标', type: 'image', description: 'iconUnlocked: 成就/成就类型解锁后的图标' },
        ],
        exProperties: {
            0: [],
            1: [
                { label: '成就类型', type: 'port', requireType: 'achievements', multiConnect: false, description: 'category: 成就的类别（同一类成就会放在一个页面）' },
                { label: '单一描述', type: 'bool', default: true, description: 'singleDescription: 如果为真，则解锁成就前就会显示成就描述。' },
                { label: '描述', type: 'text', default: '成就描述', description: 'descriptionunlocked: 成就解锁后的描述' },
                { label: '显示成就信息', type: 'bool', default: true, description: 'validateOnStorefront: 如果为真，则解锁成就时会在游戏内显示成就信息窗口。' },
                { label: '解锁信息', type: 'text', default: '成就解锁时显示的文本', description: 'unlockMessage: 成就解锁时显示的文本，需要validateOnStorefront为真时显示，默认为空，此时会显示成就描述descriptionunlocked的文本' },
                { label: '隐藏成就', type: 'bool', default: false, description: 'isHidden: 如果为真，则该成就未解锁前不会显示在成就页面上（会显示剩下若干隐藏成就）。' },
            ]
        }
    },
    recipes: {
        title: 'recipe',
        label: '交互(recipes)',
        color: nodeColorVars.recipes,
        inputs: [
            { type: 'port', requireType: 'recipes', multiConnect: true, label: '前置交互', description: '跳转进本交互界面的入口，craftable为真时该recipe可以被玩家主动使用对应行动框触发，否则则只能通过其他方式（如其他的recipe）触发' },

        ],
        outputs: [
            { type: 'port', label: '分支', multiConnect: true, description: 'alt: 指向满足一定条件后会立刻取代该recipe生效的recipe，如果additional为真值则新的recipe在对应行动框中额外进行且不会立刻取代，要注意这种情况下若该行动框已创建，那么这次转换不会生效。' },
            { type: 'port', label: '链接', multiConnect: true, description: 'linked: 指向在此recipe后会概率生效的recipe，与alt类似，但需要等待当前recipe结束后才会生效。' },
            { type: 'port', label: '引入', multiConnect: true, description: 'inductions: 效果类似alt中将卡牌弹出并带入新verb中recipe的功能，expulsion是过滤条件，其中包含filter标识需要的性相，limit标识最多转移个数。' },
        ],
        content: `交互界面(recipes)，也称配方，是使用行动与卡牌交互的一种过程，可以实现多样化的功能`,
        icon: '📖',
        fixedProperties: [
            { label: '使用行动', type: 'port', requireType: 'verbs', multiConnect: false, description: 'actionId: 使用的行动的id，如果此处填空则默认使用上一个recipe的verb' },
            { label: '起始描述', type: 'text', default: '开始和进行时行动框显示的文本', description: 'startdescription: 开始和进行时行动框显示的文本' },
            {
                label: '要求', type: 'port-hub', description: 'requirements: 跳转进本交互界面的要求: requirements表示为了进入此recipe，该行动框内需要满足的条件; extantreqs与requirement类似，区别在于它检测的是整个游戏中（包括其他行动框中）的element; tablereqs与requirement类似，区别在于它检测的是桌面上的element。'
                , innerPort: [
                    { type: 'port', requireType: 'elements', multiConnect: true, NotSetWarning: '该条件需要通过set设置数量，直接连接元素(elements)则默认需求数量为1', label: '前置要求', description: '跳转进本交互界面的要求: requirements表示为了进入此recipe，该行动框内需要满足的条件。' },
                    { type: 'port', requireType: 'elements', multiConnect: true, NotSetWarning: '该条件需要通过set设置数量，直接连接元素(elements)则默认需求数量为1', label: '全局要求', description: '跳转进本交互界面的要求: extantreqs与requirement类似，区别在于它检测的是整个游戏中（包括其他行动框中）的element。' },
                    { type: 'port', requireType: 'elements', multiConnect: true, NotSetWarning: '该条件需要通过set设置数量，直接连接元素(elements)则默认需求数量为1', label: '桌面要求', description: '跳转进本交互界面的要求: tablereqs与requirement类似，区别在于它检测的是桌面上的element。' },
                ]
            },
            { label: '起始点', type: 'bool', default: false, description: 'craftable: 为真时该recipe可以被玩家主动使用对应行动框触发，否则则只能通过其他方式（如其他的recipe）触发。' },
            { label: '仅作提示', type: 'bool', default: false, description: 'hintonly: 为真时该recipe无法被实际执行，只做展示描述作用（多用于提示）' }
        ],
        Properties: [
            { label: '持续时间', type: 'number', default: 0, description: 'warmup: 该recipe的持续时间，单位为秒。' },
            { label: '描述', type: 'text', default: '结束后显示的文本', description: 'description: 结束后显示的文本' },
            { label: '卡槽', type: 'port', requireType: 'slots', multiConnect: false, description: 'slots: 指定该recipe的卡槽，recipe只能拥有一个卡槽，在其进行时会出现。' },
            { label: '生成元素', type: 'port', requireType: 'elements', multiConnect: true, NotSetWarning: true, description: 'effects: 产生（正数）/销毁（负数）对应数量的卡牌。当数值为负数时，可以在卡牌id处填写性相id，表示销毁对应数量具有此性相的卡牌（若实际数量低于销毁数量，则全部销毁。）' },
        ],
        exProperties: {
            999: [
                { label: '重载属性', type: 'port', requireType: 'mutations', multiConnect: true, description: 'mutations: 给特定或具有特定性相的卡牌重载（additive为false时）或增加/减少（additive为true时根据level的正负）指定数量的性相，且过滤条件除了性相也可以是卡牌。mutation对性相的改变可以被继承，即使卡牌经过了xtrigger或decayto的变换，变异后的卡牌无法堆叠。' },
                { label: '性相', type: 'port', requireType: 'elements', multiConnect: true, NotSetWarning: '该条件需要通过set设置数量，直接连接元素(elements)则默认需求数量为1', description: 'aspects: 此交互(recipes)的性相，本身并不显示在性相栏中，但是会参与在"induces"和"xtrigger"的作用中。' },
                { label: '最大执行次数', type: 'int', default: 0, description: 'maxexecutions: 该recipe的最大执行次数，0表示无限制。' },
                { label: '抽取卡牌', type: 'port', requireType: 'deck', multiConnect: false, valueType: 'number', description: 'deckeffects: 从一个对应卡组中随机抽取一定数量张牌。' },
                { label: '内置卡池', type: 'port', requireType: 'deck', multiConnect: false, description: 'internaldeck: 在recipe中直接定义一个卡组。' },
                { label: '特效图片', type: 'image', description: 'burnimage: recipe开始后环绕动作框显示的图片。' },
                { label: '结局', type: 'port', requireType: 'endings', multiConnect: false, description: 'ending: recipe结束后，根据条件触发结局。' },
                { label: '计时效果', type: 'select', options: ['None', 'Grand', 'Melancholy', 'Pale', 'Vile'], default: 0, description: 'signalEndingFlavour: 改变recipe进行时行动框计时圈线的颜色并播放一个音乐，Grand：黄色/Melancholy：红色/Pale：灰白色/Vile：黄绿色。' },
                // { label: '漫宿效果', type: 'port', requireType: 'mansus', description:'portaleffect: 进入对应的漫宿之路，这会导致配方从与门相关的每个牌组中绘制一张牌，并让您在板上从中进行选择'}
                { label: '漫宿效果', type: 'select', options: ['None', 'wood', 'whitedoor', 'spiderdoor', 'peacockdoor', 'tricuspidgate'], default: 0, description: 'portaleffect: 进入对应的漫宿之路，这会导致配方从与门相关的每个牌组中绘制一张牌，并让您在板上从中进行选择' },
                { label: '终止行动', type: 'port', requireType: 'verb', multiConnect: true, description: 'haltverb: 强行停止一个进行中的verb，这个verb中的所有elements弹出（需要玩家“收取”才能放在桌面上）' },
                { label: '删除行动', type: 'port', requireType: 'verb', multiConnect: true, description: 'deleteverb: 强行删除一个进行中的verb，这个verb中的所有elements弹出（需要玩家“收取”才能放在桌面上）' },
                { label: '销毁卡牌', type: 'port', requireType: 'elements', multiConnect: true, NotSetWarning: '该条件需要通过set设置数量，直接连接元素(elements)则默认需求数量为1', description: 'purge: 销毁桌面对应数量的卡牌。若被处理卡牌拥有decayto，则以decay代替销毁。' },
                { label: '提示音', type: 'bool', default: false, description: 'signalimportantloop: 这将使游戏在该recipe进行时播放一个响亮的声音，以提示有重要事情发生。' },
                { label: '全局属性', type: 'port', requireType: 'elements', multiConnect: true, NotSetWarning: '该条件需要通过set设置数量，直接连接元素(elements)则默认需求数量为1', description: 'xpans: 扩展全局属性，类似aspects，但是作用于全局，可以触发桌面上的xtriggers。' },
                { label: '成就', type: 'port', requireType: 'achievements', multiConnect: true, description: 'achievements: 触发对应成就，成就会显示在主界面成就栏中。' },
            ]
        }
    },
    mutations: {
        title: 'mutation',
        label: '重载变化(mutations)',
        color: nodeColorVars.mutations,
        inputs: [],
        outputs: [
            { type: 'port', label: '重载变化', multiConnect: true, description: 'mutations: 重载变化(mutations)给特定或具有特定性相的卡牌重载或增加/减少指定数量的性相' }
        ],
        content: `重载变化(mutations)给特定或具有特定性相的卡牌重载或增加/减少指定数量的性相（仅在recipes内部使用）`,
        icon: '🔗',
        fixedProperties: [
            { label: '条件', type: 'port', requireType: 'elements', multiconnect: false, description: 'filter: 过滤的条件id' },
            { label: '目标', type: 'port', requireType: 'elements', multiconnect: false, description: 'mutate: 需要改变的性相id' },
            { label: '变化数量', type: 'number', default: 0, description: 'level: 需要增加/减少的数量。' },
            { label: '增加/减少', type: 'bool', default: true, description: 'additive: 增加/减少性相。' }
        ],
        properties: []
    },
    elements: {
        title: 'element',
        label: '元素(elements)',
        color: nodeColorVars.elements,
        inputs: [
            { label: '继承', type: 'port', requireType: 'elements', multiConnect: false, description: 'inherits: 该元素（卡牌）所继承的元素，该元素（卡牌）会继承继承元素的属性，但不会继承继承元素的induces, icon等。' }
        ],
        outputs: [
            { type: 'port', label: '元素', multiConnect: true, description: 'elements: 游戏中的卡牌、性相均属于elements' }
        ],
        content: `游戏中的卡牌、性相均属于elements`,
        icon: '📇',
        fixedProperties: [
            { label: '类型', type: 'select', modeSwitcher: true, options: ['卡牌', '性相'], default: 0 },
            { label: '描述', type: 'text', default: '该元素（卡牌或性相）的介绍', description: 'description: 该元素（卡牌或性相）的介绍, 会显示在右上角详情中' },
        ],
        properties: [
            { label: '图标', type: 'image', description: 'icon: 该元素（卡牌或性相）的图标图片，默认为空，此时会寻找和id一致的文件名' },
            { label: '引发', type: 'port', requireType: 'recipes', multiConnect: true, NotSetWarning: '该条件需要通过set设置几率以及排序，直接连接元素recipes则默认几率100，排序按给定id排序', description: 'induces: 该元素（卡牌或性相）参与的任意recipe结束时，有对应几率触发induces中相应的recipe；若additional:true则此recipe所需求的行动框可以额外被创建' },
        ],
        exProperties: {
            0: [
                { label: '性相', type: 'port', requireType: 'elements', multiConnect: true, NotSetWarning: '该条件需要通过set设置数量，直接连接元素(elements)则默认数量为1', description: 'aspects: 该元素（卡牌）所具有的性相，数值代表等级' },
                { label: '持续时间', type: 'number', default: 0, description: 'duration: 该元素（卡牌）的持续时间，单位为秒；默认为0，不会消逝。' },
                { label: '卡槽', type: 'port', requireType: 'slots', multiConnect: true, description: 'slots: 该元素（卡牌）所拥有的卡槽，可以在交互(recipes)中额外生成卡槽放入卡牌' },
                { label: '唯一性', type: 'bool', default: false, description: 'unique: 该卡牌是/否同一时间在桌面上至多存在一张（新的卡牌会顶替旧的卡牌），默认为否。' },
                { label: '唯一性组', type: 'text', description: 'uniquenessgroup: 具有相同uniquenessgroup标签的卡牌同一时间在桌面上只能存在一叠，即一张或者多张可合并的卡牌，需要与unique同时使用才能达到同种只存在一张的效果。（uniquenessgroup是特殊的一个aspect，如果没有定义isHidden就会在aspect中显示出来）默认为空。' },
                { label: '触发器', type: 'port', requireType: 'xtriggers', multiConnect: true, description: 'xtriggers: 该元素（卡牌）所拥有的触发器，该卡牌在离开具有列出的性相的行动框时会对卡牌进行的转换；默认为空，不会有变动。' },
                { label: '消逝转化', type: 'port', requireType: 'elements', multiConnect: false, description: 'decayto: 该元素（卡牌）在时间耗尽后或在burnTo未定义时被slot消耗后会变为的卡牌；特别地，如果填了自己的id，作用相当于于重置存在时间；默认为空，消逝后不会出现新的卡牌。' },
                { label: '消耗转化', type: 'port', requireType: 'elements', multiConnect: false, description: 'burnto: 该元素（卡牌）在被slot消耗后会变为的卡牌；特别地，如果填了自己的id，作用相当于于重置存在时间；默认为空，消逝后不会出现新的卡牌。' },
                { label: '动画帧数', type: 'int', default: null, description: 'animFrames: 动画帧数，默认为空' },
                { label: '复彩特效', type: 'bool', default: false, description: 'resaturate: 决定该卡牌在倒计时时是/否会从灰色逐渐变为真实颜色，默认为否。' },
                { label: '行动图像', type: 'image', description: 'verbicon: 当该卡牌存在时，verb显示的图片。' },
                { label: '替换性相描述文本', type: 'text', description: 'xexts: 注意：此代码仅作为收录，不建议在游戏中使用。类似于xtriggers，当此卡牌参与的recipe结束时，如果有相应的性相出现，则会增加相应性相在recipe的description中显示对应的描述。不支持中文。特别的，你可以使用富文本标签 "<font=NotoSansCJKsc-Regular>描述<\font>" 来显示中文，实际测试recipe不显示口口口但也没显示正常中文，右上角正常显示。' }
            ],
            1: [
                { label: '隐藏性相', type: 'bool', default: false, description: 'isHidden: 是否隐藏该性相，默认为否。' },
                { label: '无需图片', type: 'bool', default: false, description: 'noartneeded: 该性相是否不需要图片，默认为否。' },
            ]
        }
    },
    xtriggers: {
        title: 'xtrigger',
        label: '触变(xtriggers)',
        color: nodeColorVars.xtriggers,
        inputs: [
            { label: '继承集合', type: 'port', requireType: 'xtriggers', multiConnect: true, description: '继承之前的xtrigger的元素，扩展成集合' }
        ],
        outputs: [
            { type: 'port', label: '触变', multiConnect: true, description: 'xtriggers: 触变(xtriggers)在元素（卡牌）离开具有列出的性相的行动框时会对卡牌进行的转换' }
        ],
        content: `触变(xtriggers)在元素（卡牌）离开具有列出的性相的行动框时会对卡牌进行的转换（仅在元素(elements)内部使用,如果定义在性相(aspects)内则会继承给具有该性相的卡牌）`,
        icon: '🔗',
        fixedProperties: [
            { label: '版本', type: 'select', modeSwitcher: true, options: ['简易', '复杂'], default: 0, description: '简易版本版本只能实现将该卡牌转换为指定的卡牌，并重置剩余时间；复杂版本可以实现多种变化，但编码格式较简单版本更为复杂。' },
        ],
        properties: [
            { label: '条件', type: 'port', multiConnect: false, requireType: 'elements', description: '离开具有该性相的交互(recipes)时触发' },
        ],
        exProperties: {
            0: [
                { label: '转化目标', type: 'port', multiConnect: false, requireType: 'elements', description: '离开具有条件性相的交互(recipes)时触发，将卡牌转化目标卡牌' }
            ],
            1: [
                { label: '操作数', type: 'port', requireType: 'morphEffects', multiConnect: true, description: '同一个条件可以触发多个效果' },
                { label: '基础目标卡牌', type: 'port', requireType: 'elements', multiConnect: false, description: 'id: 只有一个效果时使用，离开具有条件性相的交互(recipes)时触发，触发操作数' },
                { label: '基础操作数', type: 'select', option: ['transform', 'spawn', 'quantity', 'mutate', 'setmutaion'], description: 'morpheffects: 只有一个效果时使用，不同操作数提供不同的功能，原版游戏提供了5个操作数。transform: 将卡牌转化为对应数目的目标卡牌；spawn: 额外创建对应数目的目标卡牌；quantity: 自增，额外创建指定数目的本体（无需目标卡牌，如果定义在aspect上则增加aspect所在卡牌）；mutate: 增加/减少对应数量的性相(aspects)；setmutation: 设置对应数量的性相(aspects)（原版文件里实际效果是设置level+1，已自动调整）' },
                { label: '基础数量', type: 'number', default: 1, description: 'level: 只有一个效果时使用，数量，默认为1' }
            ]
        }
    },
    morphEffects: {
        title: 'morphEffect',
        label: '操作数(morphEffects)',
        color: nodeColorVars.morphEffects,
        inputs: [
            { label: '继承集合', type: 'port', requireType: 'morphEffects', multiConnect: true, description: '继承之前的morphEffects的元素，扩展成集合' }
        ],
        outputs: [
            { label: '操作数', type: 'port', requireType: 'morphEffects', multiConnect: true, description: '仅在xtriggers复杂版本中生效，同一个条件可以触发多个效果' }
        ],
        fixedProperties: [
            { label: '目标卡牌', type: 'port', requireType: 'elements', multiConnect: false, description: 'id: 离开具有条件性相的交互(recipes)时触发，触发操作数' }
        ],
        properties: [
            { label: '操作数', type: 'select', option: ['transform', 'spawn', 'quantity', 'mutate', 'setmutaion'], description: 'morpheffects: 不同操作数提供不同的功能，原版游戏提供了5个操作数。transform: 将卡牌转化为对应数目的目标卡牌；spawn: 额外创建对应数目的目标卡牌；quantity: 自增，额外创建指定数目的本体（无需目标卡牌，如果定义在aspect上则增加aspect所在卡牌）；mutate: 增加/减少对应数量的性相(aspects)；setmutation: 设置对应数量的性相(aspects)（原版文件里实际效果是设置level+1，已自动调整）' },
            { label: '数量', type: 'number', default: 1, description: 'level: 数量，默认为1' }
        ]
    },
    decks: {
        title: 'deck',
        label: '卡池(decks)',
        color: nodeColorVars.decks,
        inputs: [],
        outputs: [
            { type: 'port', label: '卡池', multiConnect: true, description: 'decks: mod中随机抽卡的卡池，可以写在recipe中，也可以单独写出。' }
        ],
        content: `decks是mod中随机抽卡的卡池，可以写在recipe中，也可以单独写出。`,
        icon: '🎛️',
        fixedProperties: [
            {
                label: '描述', type: 'text', default: '该卡池的介绍', description: 'description: 该卡池的介绍'
            }
        ],
        properties: [
            {
                label: '牌组', type: 'port', requireType: 'elements', multiConnect: true, NotSetWarning: '该条件需要通过set设置数量，直接连接元素(elements)则默认数量为1', description: 'spec: 卡池中随机抽取的卡牌列表',
            },
            {
                label: '补充牌组', type: 'bool', default: false, description: 'resetonexhaustion: 是否在卡牌抽完之后重新补充牌组'
            },
            {
                label: '抽取数量', type: 'number', default: 1, description: 'draws: 【仅存在于interaldeck】draws是一次性从卡组中抽取卡牌的数量'
            },
            {
                label: '默认卡牌', type: 'port', requireType: 'elements', multiConnect: false, default: 'genericrubbishbook', description: '"defaultcard":  卡池里所有卡牌被抽完时默认出现的卡牌'
            }
        ]
    },
    verbs: {
        title: 'verb',
        label: '行动框(verbs)',
        color: nodeColorVars.verbs,
        inputs: [
        ],
        outputs: [
            { type: 'port', label: 'verb', multiConnect: true, description: 'verbs:' }
        ],
        content: `verbs是mod中的动词，将卡牌拖入触发交互界面(recipes)的行动框。`,
        icon: '⚡',
        fixedProperties: [
            { label: '描述', type: 'text', default: '该动词的介绍', description: 'description: 该动词的介绍' },
            { label: '可重复', type: 'bool', default: false, description: 'Multiple: 是否允许该动词同时出现多个（默认为否）' },
        ],
        properties: [
            { label: '初始卡槽', type: 'port', requireType: 'slots', multiConnect: false, description: 'slot: 该动词带有的唯一卡槽' }
        ]
    },
    slots: {
        title: 'slot',
        label: '卡槽(slots)',
        color: nodeColorVars.slots,
        inputs: [
            {
                type: 'port', label: '需求', requireType: 'elements', multiConnect: true, NotSetWarning: '该条件需要通过set设置数量，直接连接元素(elements)则默认数量为1',
                description: `required: 卡槽可以容纳的元素（性相或卡牌），当卡牌符合或卡牌上其中一项性相数量大于等于要求时便可放入槽中。
                                    slot的required采用或逻辑，与recipe的与逻辑相反。
                                    只接受正值`
            },
            {
                type: 'port', label: '禁止', requireType: 'elements', multiConnect: true, NotSetWarning: '该条件需要通过set设置数量，直接连接元素(elements)则默认数量为1',
                description: `forbidden: 卡槽不可以容纳的元素（性相或卡牌），当卡牌符合或卡牌上其中一项性相数量大于等于要求时便不可放入槽中。
                                    当卡牌同时满足required和forbidden时，拒绝进入槽。
                                    slot的forbidden采用或逻辑。
                                    只接受正值`
            },
            {
                type: 'port', label: '必要', requireType: 'elements', multiConnect: true, NotSetWarning: '该条件需要通过set设置数量，直接连接元素(elements)则默认数量为1',
                description: `essential: 卡槽必须容纳的元素（性相或卡牌），当卡牌符合或卡牌上其中一项性相数量大于等于要求时便可放入槽中。
                                    slot的essential采用与逻辑，与recipe相同。
                                    如果存在required，则仍需要满足required中的至少一项
                                    只接受正值`
            }
        ],
        outputs: [
            { type: 'port', label: '卡槽', multiConnect: true, description: 'slots: 卡槽，仅可以在交互(recipes)、卡牌(elements)或事件框(verbs)中使用。' }
        ],
        content: `slots: 卡槽，仅可以在交互(recipes)、卡牌(elements)或事件框(verbs)中使用。`,
        icon: '🎚️',
        properties: [

            { label: '描述', type: 'text', default: '玩家点开卡槽时显示的描述', description: 'description: 玩家点开卡槽时显示的描述' },
            {
                label: '自动吸取', type: 'bool', default: false, description: 'greedy: 代表该卡槽是否会自动吸取卡牌; 此属性在slot从属于verb时被忽略'
            },
            {
                label: '消耗卡牌', type: 'bool', default: false, description: 'consumes: 代表该卡槽是否消耗卡牌; 消耗卡牌时，如果卡牌定义了burnTo，则转换为burnTo定义的卡牌。如果burnTo未定义或为空字符串，而decayTo被定义，则转换为decayTo定义的卡牌。如果burnTo与decayTo都未被定义，则卡牌被销毁'
            },
            {
                label: '行动（容纳卡牌时）', type: 'port', requireType: 'verb', multiConnect: false, default: 'work', description: 'actionId: 使用的行动的id, 当卡槽写在卡牌中时，在该卡牌进入此事件框时会显示; 此属性在slot从属于recipe或verb时被忽略'
            },
            {
                label: '显示条件', type: 'port', requireType: 'elements', multiConnect: true, description: 'ifaspectspresent: 定义元素条件（性相或卡牌），当给出的卡牌符合定义的条件时，将此插槽显示；反之隐藏此插槽。（注意，此代码仅用于element中的slots代码），另外官方没有使用这一条的文件（看来是不好用...）'
            }

        ]
    },
    levers: {
        title: '继承物品',
        color: nodeColorVars.levers,
        inputs: [],
        outputs: [
            { type: 'port', label: '继承物品', multiConnect: true, description: 'lever: 从上一局游戏继承的物品。' },
            { type: 'port', label: '继承物品(卡牌实例)', multiConnect: true, description: '从上一局游戏继承的物品对应的卡牌。' },
        ],
        content: `从上一局游戏中继承的事物。如使徒继承的教会与教徒，或是富家子弟所继承的书籍。
                        某种意义上说，这是一张卡牌，你可以通过effects等代码得到它。`,
        icon: '🎚️',
        fixedProperties: [
            { label: "onGameEnd", type: 'bool', default: false, description: 'onGameEnd: 未知作用' },
            { label: '默认卡牌', type: 'port', requireType: 'elements', multiConnect: false, description: 'defaultValue: 默认得到的卡牌' },
            { label: '权重', type: 'port', requireType: 'elements', multiConnect: true, NotSetWarning: '该条件需要通过set设置权重，直接连接元素(elements)则默认权重为1', description: 'weight: 用于决定继承的性相（或卡牌）的权重，可以为负数。' },
            { label: '需求权重', type: 'int', default: 1, description: 'requiredScore: 需要的权重，只有卡牌满足了权重才会被记录。有多个被记录的卡牌取权重最高者。' },
            { label: '重定向', type: 'port', requireType: 'set', setType: 'dict', multiConnect: false, description: 'redirects: 当卡牌符合左侧id时，会被记录为右侧的id。如欲望无论是几级，都只会记录为一级' }
        ]
    },
    extends: {
        title: '扩充对象',
        color: nodeColorVars.extends,
        inputs: [],
        outputs: [],
        content: `extends: 特殊的写法，可以修改原游戏的数据，如果你不知道该如何使用，请不要使用本节点`,
        fixedProperties: [
            { label: '扩充的对象', type: 'node', default: '' }
        ],
        properties: [,
            { label: '代码', type: 'text', default: '写入新的扩充内容' }
        ]
    },
    copies: {
        title: '引用复制',
        color: nodeColorVars.copies,
        inputs: [],
        outputs: [],
        content: ``,
        fixedProperties: [
            { label: '模式', type: 'select', modeSwitcher: true, default: '简洁', options: ['简洁', '完整', '可编辑'] },
            { label: '引用的对象', type: 'node', default: '' }
        ],
        properties: [
        ],
        exProperties: {
            0: [],
            1: [],
            2: []
        }
    },
    text: {
        title: '文本',
        color: nodeColorVars.text,
        inputs: [],
        outputs: [
            { type: 'port', label: '文本', multiConnect: true }
        ],
        content: `文本常量, 输出string格式`,
        icon: '🎚️',
        fixedProperties: [
            { label: '文本', type: 'text', default: '文本内容' }
        ]
    },
    number: {
        title: '数字',
        color: nodeColorVars.number,
        inputs: [],
        outputs: [
            { type: 'port', label: '数字', multiConnect: true }
        ],
        content: `数字常量，输出int格式`,
        icon: '🎚️',
        fixedProperties: [
            { label: '数字', type: 'number', default: 0 }
        ]
    },
    set: {
        title: '集合',
        color: nodeColorVars.set,
        inputs: [
            { type: 'port', requireType: 'set', multiConnect: true, label: '继承集合', description: '继承之前的集合的元素，扩展成新的集合，注意集合的元素类型必须一致' },
        ],
        outputs: [
            { type: 'port', label: '集合', multiConnect: true, description: '输出集合格式的变量' }
        ],
        content: `集合变量，输出参数集合，可以将多个集合链接，不允许成环`,
        icon: '🎚️',
        fixedProperties: [
            { label: '类型', type: 'select', default: '字典', options: ['字典', '列表', 'xtriggers', 'mutaions'] },
        ],
        properties: [
        ],
        exProperties: {
            0: [{
                label: '字典', type: 'table', columns: [
                    { label: '键', field: 'key', type: 'any', width: '50%' },
                    { label: '值', field: 'value', type: 'any', width: '50%' }
                ],
                description: '键值对，项目可以是任何类型，用于'
            }],
            1: [{
                label: '列表', type: 'table', columns: [
                    { label: '项目', field: 'id', type: 'any', width: '100%' }
                ],
                description: '列表，可以用于deck的spec，属性可以重复'
            }],
            2: [
                { label: '版本', type: 'select', options: ['简易', '复杂'], default: 0, description: '简易版本版本只能实现将该卡牌转换为指定的卡牌，并重置剩余时间；复杂版本可以实现多种变化，但编码格式较简单版本更为复杂。' },

                {

                }],
            3: [{
                label: '重载', type: 'table', columns: [
                    { label: '条件', field: 'filter', type: 'elements', width: '100%' },
                    { label: '目标', field: 'mutate', type: 'elements', width: '100%' },
                    { label: '变化数量', field: 'level', type: 'number', width: '100%' },
                    { label: '增加/减少', field: 'filter', type: 'bool', width: '100%' },

                ],
                description: '重载变化(mutations)给特定或具有特定性相的卡牌重载或增加/减少指定数量的性相（仅在recipes内部使用）'
            }]
        }
    },
    images: {
        title: '图片',
        color: nodeColorVars.images,
        inputs: [],
        outputs: [
            { type: 'port', label: '图片', multiConnect: true }
        ],
        content: `图片常量, 用于图标或背景等使用`,
        icon: '🎚️',
        fixedProperties: [
            { label: '图片id', type: 'text', default: '', description: '存放在image路径下的图片文件名' }
        ]
    }
};

window.nodeColorVars = nodeColorVars;
window.nodeTypes = nodeTypes;

