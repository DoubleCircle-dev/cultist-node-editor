export class StandardMessage {
    static STATUS = {
        // 表示事件阶段
        NOTICE: 'notice',
        START: 'start',
        RUNNING: 'running',
        END: 'end',
        // 表示结果
        FINISHED: 'finished', // 表示完成
        SUCCESS: 'success', // 表示成功
        FAILED: 'failed', // 表示失败
    };

    static ACTION_TYPE = {
        CREATE: 'create', // 表示从无到有
        APPEND: 'append', // 表示添加副本或记录
        DELETE: 'delete',
        UPDATE: 'update', // 表示自模型改变视图
        CHANGE: 'change', // 表示自视图改变模型
        DRAG: 'drag',
        CONNECT: 'connect',
        SELECT: 'select',
    };

    static BASE_TYPE = {
        NODE: 'node',
        CONNECTION: 'connection',
        PROPERTY: 'property',
        PORT: 'port',
        PANEL: 'panel'
    };

    static TARGET_TYPE = {
        // 保留原有的映射
        ...StandardMessage.BASE_TYPE,
        // 自动生成 ALL 版本
        ...Object.entries(StandardMessage.BASE_TYPE).reduce((acc, [key, value]) => {
            acc[`ALL_${key}`] = `$all_{value}`; // 如果需要下划线可改为 `${value}_ALL`
            return acc;
        }, /** @type {Record<string, string>} */ ({})),
    };

    /**
     * @param {(typeof StandardMessage.ACTION_TYPE)[keyof typeof StandardMessage.ACTION_TYPE]} actionType
     * @param {(typeof StandardMessage.TARGET_TYPE)[keyof typeof StandardMessage.TARGET_TYPE]} targetType
     * @param {(typeof StandardMessage.STATUS)[keyof typeof StandardMessage.STATUS]} status
     */
    constructor(actionType, targetType, status) {
        this.actionType = actionType;
        this.targetType = targetType;
        this.status = status;
    }
    

    checkValid() {
        const actionTypeCheck = Object.values(StandardMessage.ACTION_TYPE).includes(this.actionType);
        const targetTypeCheck = Object.values(StandardMessage.TARGET_TYPE).includes(this.targetType);
        const statusCheck = Object.values(StandardMessage.STATUS).includes(this.status);
        return actionTypeCheck && targetTypeCheck && statusCheck;
    }

    get eventName() {
        return `${this.actionType}:${this.targetType}:${this.status}`;
    }

    /**
     * @param {string} eventName
     * @returns {StandardMessage}
     */
    static resolveEventName(eventName) {
        const [actionType, targetType, status] = eventName.split(':');

        return new StandardMessage(actionType, targetType, status);
    }
}

export class StandardDetail extends StandardMessage {
    static ACTION_TYPE = {
        ...StandardMessage.ACTION_TYPE,
    };

    static TARGET_TYPE = {
        ...StandardMessage.TARGET_TYPE,
    };

    static STATUS = {
        ...StandardMessage.STATUS,
    };

    /**
     * @param {(typeof StandardDetail.ACTION_TYPE)[keyof typeof StandardDetail.ACTION_TYPE]} actionType
     * @param {(typeof StandardDetail.TARGET_TYPE)[keyof typeof StandardDetail.TARGET_TYPE]} targetType
     * @param {any} data
     * @param {(typeof StandardDetail.STATUS)[keyof typeof StandardDetail.STATUS]} status
     */
    constructor(actionType, targetType, data, status = StandardDetail.STATUS.FINISHED) {
        super(actionType, targetType, status);

        this.data = data;

        this.undoFunction = null;
        this.redoFunction = null;
    }

    /**
     * @param {Function} undoFunction
     * @param {Function} redoFunction
     */

    registerFunctions(undoFunction, redoFunction) {
        this.undoFunction = undoFunction;
        this.redoFunction = redoFunction;
    }
}
