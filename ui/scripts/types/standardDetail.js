export class StandardDetail {
    static ACTION_TYPE = {
        CREATE: 'create',
        DELETE: 'delete',
        UPDATE: 'update',
        DRAG: 'drag',
        ERROR: 'error',
    };
    static TARGET_TYPE = {
        NODE: 'node',
        CONNECTION: 'connection',
        PROPERTY: 'property',
    };

    /**
     * @param {(typeof StandardDetail.ACTION_TYPE)[keyof typeof StandardDetail.ACTION_TYPE]} actionType
     * @param {(typeof StandardDetail.TARGET_TYPE)[keyof typeof StandardDetail.TARGET_TYPE]} targetType
     * @param {any} data
     */
    constructor(actionType, targetType, data) {
        this.type = actionType + ':' + targetType;

        this.actionType = actionType;
        this.targetType = targetType;
        this.data = data;

        this.undoFunction = null;
        this.redoFunction = null;
    }

    checkValid() {
        const actionTypeCheck = Object.values(StandardDetail.ACTION_TYPE).includes(this.actionType);
        const targetTypeCheck = Object.values(StandardDetail.TARGET_TYPE).includes(this.targetType);
        return actionTypeCheck && targetTypeCheck;
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

export class StandardMessage {
    static STATUS = {
        SUCCESS: 'success',
        FAILED: 'failed',
        START: 'start',
        END: 'end',
        RUNNING: 'running',
        FINISHED: 'finished',
    };

    /**
     * @param {(typeof StandardDetail.ACTION_TYPE)[keyof typeof StandardDetail.ACTION_TYPE]} actionType
     * @param {(typeof StandardDetail.TARGET_TYPE)[keyof typeof StandardDetail.TARGET_TYPE]} targetType
     * @param {(typeof StandardMessage.STATUS)[keyof typeof StandardMessage.STATUS]} status
     */
    constructor(actionType, targetType, status) {
        this.actionType = actionType;
        this.targetType = targetType;
        this.status = status;
    }

    checkValid() {
        const actionTypeCheck = Object.values(StandardDetail.ACTION_TYPE).includes(this.actionType);
        const targetTypeCheck = Object.values(StandardDetail.TARGET_TYPE).includes(this.targetType);
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
