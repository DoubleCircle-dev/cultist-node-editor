const nodeTypes = {
    blank: {
        title: '空节点',
        color: '#ffffffff',
        inputs: [],
        outputs: [],
        content: `这是一个空节点`,
        icon: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
        fixedProperties: [],
        properties: []
    },
    test: {
        title: '测试节点',
        color: '#6c5ce7',
        inputs: [
            { type: 'port', label: '测试输入' }
        ],
        outputs: [
            { type: 'port', label: '测试输出' }
        ],
        content: `这是一个测试节点<br>ID: <br>类型: 通用测试`,
        icon: '⚡',
        fixedProperties: [
            { label: '常驻文本输入', type: 'text', default: '测试常驻文本' },
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
            { label: '数值', type: 'range', min: 0, max: 100, default: 50 },
            { label: '选项', type: 'select', options: ['选项1', '选项2', '选项3'], default: 0 },
            { label: '开关', type: 'checkbox', default: false },
            { label: '二择', type: 'bool', default: false },
            { label: '数字', type: 'number', min: 0, max: 100, default: 50 },
            { label: '整数输入', type: 'int', default: 0 },
            { label: '文本输入', type: 'text', default: '测试文本' }
        ]
    },
    legacies: {
        title: 'legacy',
        label: '职业(legacies)',
        color: '#d73141ff',
        inputs: [
        ],
        outputs: [
            { type: 'port', label: '初始verb' }
        ],
        content: `添加独立的职业`,
        icon: '⚡',
        fixedProperties: [
            { label: '描述', type: 'text', default: '职业描述', description: 'description: 菜单中选择职业时显示的文本' },
            { label: '初始描述', type: 'text', default: '初始描述', description: 'startdescription: 会显示在开始此职业的新游戏时的弹出窗口。' },
            { label: '起始行动框', type: 'port', requireType: 'verbs', default: 'work', description: 'startingVerbId: 游戏开始时提供给玩家的verb，你可以自创一个，也可以从已有的verb中选择一个' },
        ],
        properties: [
            { label: '前置结局', type: 'port', requireType: 'endings', description: 'fromEnding: 在某结局后必定可选' },
            { label: '非特定结局后续', type: 'bool', default: true, description: 'availableWithoutEndingMatch: 表示游戏是否可以在任何其他职业的任何结束后将此职业视为有效的新开始' },
            { label: '新开始', type: 'bool', default: true, description: 'newstart: 表示我们是否可以在第六历史菜单中手动选择此职业来开始它（就像其他DLC一样）。' },
            { label: '跟踪元素', type: 'list', description: 'statusbarelements: 此职业中在屏幕底部跟踪的元素列表。需要恰好包含四个内容。如果你要跟踪的项目少于4个，你可以重复其中一些使其达到4个。' },
            { label: '桌面图片', type: 'image', description: 'tablecoverimage: 决定桌面背景，如dlc流亡者中的地中海地图。(请将地图放入images/ui中)（没有该字段则使用默认桌面）' },
            { label: '禁用后续职业列表', type: 'list', description: 'excludesOnEnding: 在此职业之后无法选择的其他职业列表。' }
        ]
    },
    endings: {
        title: 'ending',
        label: '结局(endings)',
        color: '#ac0000ff',
        inputs: [
            { type: 'port', label: '前置交互', requireType: 'recipes', description: '达成结局的前置交互(recipes)' },
        ],
        outputs: [
            { type: 'port', label: '结局', description: 'endings: 结局' },
        ],
        content: `endings即游戏中原版或自定义的结局。`,
        icon: '⚡',
        fixedProperties: [
            { label: '描述', type: 'text', default: '在达成该结局时，游戏中显示的文本', description: 'description: 在达成该结局时，游戏中显示的文本' },
            { label: '成就', type: 'text', default: '达成该结局时，解锁的成就', description: 'achievement: 达成该结局时，解锁的成就' },
            { label: '图片', type: 'image', description: 'image: 达成该结局时，在达成该结局时显示的图片' },
            { label: '类型', type: 'select', options: ['坏结局(Melancholy)', '胜利(Grand)', '反面胜利(Vile)'], default: 0, description: 'flavour: 该结局的类型，“Melancholy”代表坏结局；“Grand”代表胜利；“Vile”代表反面胜利。' },
        ],
        properties: [
            { label: '动画', type: 'select', options: ['DramaticLight', 'DramaticLightCool', 'DramaticLightEvil'], default: 0, description: 'anim: 从某个recipe进入该结局时，显示的动画类型。“DramaticLight”在任何结局都可用，“DramaticLightCool”是胜利时显示的动画，“DramaticLightEvil”则是在坏结局时显示。' }
        ]

    },

    // TODO 根据wiki完善recipes
    recipes: {
        title: 'recipe',
        label: '交互(recipes)',
        color: '#f1912aff',
        inputs: [
            { type: 'port', requireType: 'recipes', label: '前置交互', description: '跳转进本交互界面的入口，craftable为真时该recipe可以被玩家主动使用对应行动框触发，否则则只能通过其他方式（如其他的recipe）触发' },

        ],
        outputs: [
            { type: 'port', label: '分支', description: 'alt: 指向满足一定条件后会立刻取代该recipe生效的recipe，如果additional为真值则新的recipe在对应行动框中额外进行且不会立刻取代，要注意这种情况下若该行动框已创建，那么这次转换不会生效。' },
            { type: 'port', label: '链接', description: 'linked: 指向在此recipe后会概率生效的recipe，与alt类似，但需要等待当前recipe结束后才会生效。' },
            { type: 'port', label: '引入', description: 'inductions: 效果类似alt中将卡牌弹出并带入新verb中recipe的功能，expulsion是过滤条件，其中包含filter标识需要的性相，limit标识最多转移个数。' },
        ],
        content: `交互界面(recipes)，也称配方，是使用行动与卡牌交互的一种过程，可以实现多样化的功能`,
        icon: '📖',
        fixedProperties: [
            { label: '使用行动', type: 'port', requireType: 'verb', default: 'work', description: 'actionId: 使用的行动的id，如果此处填空则默认使用上一个recipe的verb' },
            {
                label: '要求', type: 'port-hub', description: 'requirements: 跳转进本交互界面的要求: requirements表示为了进入此recipe，该行动框内需要满足的条件; extantreqs与requirement类似，区别在于它检测的是整个游戏中（包括其他行动框中）的element; tablereqs与requirement类似，区别在于它检测的是桌面上的element。'
                , innerPort: [
                    { type: 'port', requireType: 'set', label: '前置要求', description: '跳转进本交互界面的要求: requirements表示为了进入此recipe，该行动框内需要满足的条件。' },
                    { type: 'port', requireType: 'set', label: '全局要求', description: '跳转进本交互界面的要求: extantreqs与requirement类似，区别在于它检测的是整个游戏中（包括其他行动框中）的element。' },
                    { type: 'port', requireType: 'set', label: '桌面要求', description: '跳转进本交互界面的要求: tablereqs与requirement类似，区别在于它检测的是桌面上的element。' },
                ]
            },
            { label: '起始描述', type: 'text', default: '开始和进行时行动框显示的文本', description: 'startdescription: 开始和进行时行动框显示的文本' },
            { label: '描述', type: 'text', default: '结束后显示的文本', description: 'description: 结束后显示的文本' },
            { label: '起始点', type: 'bool', default: false, description: 'craftable: 为真时该recipe可以被玩家主动使用对应行动框触发，否则则只能通过其他方式（如其他的recipe）触发。' },
            { label: '仅作提示', type: 'bool', default: false, description: 'hintonly: 为真时该recipe无法被实际执行，只做展示描述作用（多用于提示）' },
        ],
        exProperties: [
            { label: '卡槽', type: 'port', requireType: 'slots', description: 'slots: 指定该recipe的卡槽，recipe只能拥有一个卡槽，在其进行时会出现。' },
            { label: '生成元素', type: 'port', requireType: 'set', description: 'effects: 产生（正数）/销毁（负数）对应数量的卡牌。当数值为负数时，可以在卡牌id处填写性相id，表示销毁对应数量具有此性相的卡牌（若实际数量低于销毁数量，则全部销毁。）' },
            { label: '持续时间', type: 'number', default: 0, description: 'warmup: 该recipe的持续时间，单位为秒。' },
            { label: '最大执行次数', type: 'number', default: 0, description: 'maxexecutions: 该recipe的最大执行次数，0表示无限制。' },
            { label: '抽取卡牌', type: 'port', requireType: 'deck', valueType: 'number', description: 'deckeffects: 从一个对应卡组中随机抽取一定数量张牌。' },
            { label: '性相', type: 'port', requireType: 'set', description: 'aspects: 此交互(recipes)的性相，本身并不显示在性相栏中，但是会参与在"induces"和"xtrigger"的作用中。' },
            { label: '重载属性', type: 'port', requireType: 'set', description: 'mutations: 给特定或具有特定性相的卡牌重载（additive为false时）或增加/减少（additive为true时根据level的正负）指定数量的性相，且过滤条件除了性相也可以是卡牌。mutation对性相的改变可以被继承，即使卡牌经过了xtrigger或decayto的变换，变异后的卡牌无法堆叠。' },
            { label: '内置卡池', type: 'port', requireType: 'deck', description: 'internaldeck: 在recipe中直接定义一个卡组。' },
            { label: '特效图片', type: 'image', description: 'burnimage: recipe开始后环绕动作框显示的图片。' },
            { label: '结局', type: 'port', requireType: 'endings', description: 'ending: recipe结束后，根据条件触发结局。' },
            { label: '计时效果', type: 'select', options: ['None', 'Grand', 'Melancholy', 'Pale', 'Vile'], default: 0, description: 'signalEndingFlavour: 改变recipe进行时行动框计时圈线的颜色并播放一个音乐，Grand：黄色/Melancholy：红色/Pale：灰白色/Vile：黄绿色。' },
            // { label: '漫宿效果', type: 'port', requireType: 'mansus', description:'portaleffect: 进入对应的漫宿之路，这会导致配方从与门相关的每个牌组中绘制一张牌，并让您在板上从中进行选择'}
            { label: '漫宿效果', type: 'select', options: ['None', 'wood', 'whitedoor', 'spiderdoor', 'peacockdoor', 'tricuspidgate'], default: 0, description: 'portaleffect: 进入对应的漫宿之路，这会导致配方从与门相关的每个牌组中绘制一张牌，并让您在板上从中进行选择' },
            { label: '终止行动', type: 'port', requireType: 'verb', description: 'haltverb: 强行停止一个进行中的verb，这个verb中的所有elements弹出（需要玩家“收取”才能放在桌面上）' },
            { label: '删除行动', type: 'port', requireType: 'verb', description: 'deleteverb: 强行删除一个进行中的verb，这个verb中的所有elements弹出（需要玩家“收取”才能放在桌面上）' },
            { label: '销毁卡牌', type: 'port', requireType: 'set', description: 'purge: 销毁桌面对应数量的卡牌。若被处理卡牌拥有decayto，则以decay代替销毁。' },
            { label: '提示音', type: 'bool', default: false, description: 'signalimportantloop: 这将使游戏在该recipe进行时播放一个响亮的声音，以提示有重要事情发生。' },
            { label: '全局属性', type: 'port', requireType: 'set', description: 'xpans: 扩展全局属性，类似aspects，但是作用于全局，可以触发桌面上的xtriggers。' }
        ]
    },
    mutations: {
        title: 'mutation',
        label: '重载变化(mutations)',
        color: '#f1ea2aff',
        inputs: [],
        outputs: [],
        content: `重载变化(mutations)给特定或具有特定性相的卡牌重载或增加/减少指定数量的性相`,
        icon: '🔗',
        fixedProperties: [],
        properties: []
    },

    // TODO 根据wiki完善elements
    elements: {
        title: 'element',
        label: '元素(elements)',
        color: '#2196F3',
        inputs: [],
        outputs: [
            { type: 'port', label: '元素', description: 'elements: 游戏中的卡牌、性相均属于elements' }
        ],
        content: `游戏中的卡牌、性相均属于elements`,
        icon: '📇',
        fixedProperties: [
            { label: '类型', type: 'select', options: ['card', 'aspect'], default: 0 },
            { label: '描述', type: 'text', default: '该元素（卡牌或性相）的介绍', description: 'description: 该元素（卡牌或性相）的介绍, 会显示在右上角详情中' },
        ],
        properties: [
            { label: '图标', type: 'image', description: 'icon: 该元素（卡牌或性相）的图标图片，默认为空，此时会寻找和id一致的文件名' },
            { label: '引发', type: 'port', requireType: 'set', description: 'induces: 该元素（卡牌或性相）参与的任意recipe结束时，有对应几率触发induces中相应的recipe；若additional:true则此recipe所需求的行动框可以额外被创建' },

        ],
        ex1Properties: [
            { label: '性相', type: 'port', requireType: 'set', description: 'aspects: 该元素（卡牌）所具有的性相，数值代表等级' },
            { label: '持续时间', type: 'number', default: 0, description: 'duration: 该元素（卡牌）的持续时间，单位为秒；默认为0，不会消逝。' },
            { label: '卡槽', type: 'port', requireType: 'set', description: 'slots: 该元素（卡牌）所拥有的卡槽，可以在交互(recipes)中额外生成卡槽放入卡牌' },
        ],
        ex2Properties: [

        ]
    },
    xtriggers: {
        title: 'xtrigger',
        label: '触变(xtriggers)',
    },
    decks: {
        title: 'deck',
        label: '卡池(decks)',
        color: '#23bf30ff',
        inputs: [],
        outputs: [
            { type: 'port', label: '卡池', description: 'decks: mod中随机抽卡的卡池，可以写在recipe中，也可以单独写出。' }
        ],
        content: `decks是mod中随机抽卡的卡池，可以写在recipe中，也可以单独写出。`,
        icon: '🎛️',
        properties: [
            {
                label: '描述', type: 'text', default: '该卡池的介绍', description: 'description: 该卡池的介绍'
            },
            {
                label: '牌组', type: 'port', requireType: 'set', description: 'spec: 卡池中随机抽取的卡牌列表',
            },
            {
                label: '补充牌组', type: 'bool', default: false, description: 'resetonexhaustion: 是否在卡牌抽完之后重新补充牌组'
            },
            {
                label: '抽取数量', type: 'number', default: 1, description: 'draws: 【仅存在于interaldeck】draws是一次性从卡组中抽取卡牌的数量'
            },
            {
                label: '默认卡牌', type: 'port', requireType: 'elements', default: 'genericrubbishbook', description: '"defaultcard":  卡池里所有卡牌被抽完时默认出现的卡牌'
            }
        ]
    },
    verbs: {
        title: 'verb',
        label: '行动框(verbs)',
        color: '#9C27B0',
        inputs: [
            { type: 'port', label: '初始卡槽', requireType: 'slots', description: 'slot: 该动词带有的唯一卡槽' }
        ],
        outputs: [
            { type: 'port', label: 'verb', description: 'verbs:' }
        ],
        content: `verbs是mod中的动词，将卡牌拖入触发交互界面(recipes)的行动框。`,
        icon: '⚡',
        properties: [
            { label: '描述', type: 'text', default: '该动词的介绍', description: 'description: 该动词的介绍' },
            { label: '可重复', type: 'bool', default: false, description: 'Multiple: 是否允许该动词同时出现多个（默认为否）' },
        ]
    },
    slots: {
        title: 'slot',
        label: '卡槽(slots)',
        color: '#fdf622ff',
        inputs: [
            {
                type: 'set-port', label: '需求',
                description: `required: 卡槽可以容纳的元素（性相或卡牌），当卡牌符合或卡牌上其中一项性相数量大于等于要求时便可放入槽中。
                                    slot的required采用或逻辑，与recipe的与逻辑相反。
                                    只接受正值`
            },
            {
                type: 'set-port', label: '禁止',
                description: `forbidden: 卡槽不可以容纳的元素（性相或卡牌），当卡牌符合或卡牌上其中一项性相数量大于等于要求时便不可放入槽中。
                                    当卡牌同时满足required和forbidden时，拒绝进入槽。
                                    slot的forbidden采用或逻辑。
                                    只接受正值`
            },
            {
                type: 'set-port', label: '必要',
                description: `essential: 卡槽必须容纳的元素（性相或卡牌），当卡牌符合或卡牌上其中一项性相数量大于等于要求时便可放入槽中。
                                    slot的essential采用与逻辑，与recipe相同。
                                    如果存在required，则仍需要满足required中的至少一项
                                    只接受正值`
            }
        ],
        outputs: [
            { type: 'port', label: '卡槽', description: 'slots: 卡槽，可以在交互(recipes)、卡牌(elements)或事件框(verbs)中使用。' }
        ],
        content: `slots: 卡槽，可以在交互(recipes)、卡牌(elements)或事件框(verbs)中使用。`,
        icon: '🎚️',
        properties: [
            {
                label: '行动', type: 'input-port', requireType: 'verb', default: 'work', description: 'actionId: 使用的行动的id, 当卡槽写在卡牌中时，在该卡牌进入此事件框时会显示; 此属性在slot从属于recipe或verb时被忽略'
            },
            { label: '描述', type: 'text', default: '玩家点开卡槽时显示的描述', description: 'description: 玩家点开卡槽时显示的描述' },
            {
                label: '自动吸取', type: 'bool', default: false, description: 'greedy: 代表该卡槽是否会自动吸取卡牌; 此属性在slot从属于verb时被忽略'
            },
            {
                label: '消耗卡牌', type: 'bool', default: false, description: 'consumes: 代表该卡槽是否消耗卡牌; 消耗卡牌时，如果卡牌定义了burnTo，则转换为burnTo定义的卡牌。如果burnTo未定义或为空字符串，而decayTo被定义，则转换为decayTo定义的卡牌。如果burnTo与decayTo都未被定义，则卡牌被销毁'
            },
            {
                label: '显示条件', type: 'set-port', description: 'ifaspectspresent: 定义元素条件（性相或卡牌），当给出的元素符合定义的条件时，将此插槽显示；反之隐藏此插槽。（注意，此代码仅用于element中的slots代码），另外官方没有使用这一条的文件（看来是不好用...）'
            }

        ]
    },
    levers: {
        title: '继承物品',
        color: '#3F51B5',
        inputs: [],
        outputs: [],
        content: `从上一局游戏中继承的事物。如使徒继承的教会与教徒，或是富家子弟所继承的书籍。
                        某种意义上说，这是一张卡牌，你可以通过effects等代码得到它。`,
        icon: '🎚️',
        properties: [
        ]
    },
    extends: {
        title: '扩充对象',
        color: '#3F51B5',
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
        color: '#3F51B5',
        inputs: [],
        outputs: [],
        content: ``,
        fixedProperties: [
            { label: '模式', type: 'select', default: '简洁', options: ['简洁', '完整', '可编辑'] },
            { label: '引用的对象', type: 'node', default: '' }
        ],
        properties: [
        ]
    },
    text: {
        title: '文本',
        color: '#3fb3b5ff',
        inputs: [],
        outputs: [
            { type: 'port', label: '文本' }
        ],
        content: `文本常量, 输出string格式`,
        icon: '🎚️',
        properties: [
            { label: '文本', type: 'text', default: '文本内容' }
        ]
    },
    number: {
        title: '数字',
        color: '#3fb3b5ff',
        inputs: [],
        outputs: [
            { type: 'port', label: '数字' }
        ],
        content: `数字常量，输出int格式`,
        icon: '🎚️',
        properties: []
    },
    /**
    * 集合，用于处理表格或者列表
    * @Type Set
    * 子类型：
    * list: [element1, element2, element3]
    * dict: {elementId1: num, elementId2: num}
    * 具体应用：
    * filter: {过滤的条件id： 数值},
    * xtriggers: [{triggerId: 数值},{triggerId: 数值}],
    * mutation: [{filter: 过滤的条件id,mutate: 需要改变的性相id,level: 数值,additive: 布尔值},{}] 
    */
    set: {
        title: '集合',
        color: '#3fb3b5ff',
        inputs: [
            { type: 'port', requireType: 'set', label: '继承集合', description: '继承之前的集合的元素，扩展成新的集合' },
        ],
        outputs: [
            { type: 'port', label: '集合', description: '输出集合格式的变量' }
        ],
        content: `集合变量，输出参数集合，可以将多个集合链接，不允许成环`,
        icon: '🎚️',
        properties: [
            { label: '类型', type: 'select', default: '字典', options: ['字典', '列表', 'xtriggers', 'mutaions'] },
            { label: '集合', type: 'table' }
        ]
    },
    images: {
        title: '图片',
        color: '#3fb3b5ff',
        inputs: [],
        outputs: [
            { type: 'port', label: '文本' }
        ],
        content: `文本常量, 输出string格式`,
        icon: '🎚️',
        properties: [
            { label: '图片id', type: 'text', default: '', description: '存放在image路径下的图片文件名' }
        ]
    }
};

window.nodeTypes = nodeTypes;
