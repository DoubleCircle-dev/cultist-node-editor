export class IEventTarget extends EventTarget {
    constructor() {
        super();

        /** @private */
        this._listenersMap = new Map();
    }

    // 重写 addEventListener
    /**
     * @param {string} type
     * @param {EventListenerOrEventListenerObject | null} listener
     * @param {boolean | AddEventListenerOptions} [options]
     */
    addEventListener(type, listener, options = {}) {
        super.addEventListener(type, listener, options);

        if (!this._listenersMap.has(type)) {
            this._listenersMap.set(type, new Set());
        }
        const listenerSet = this._listenersMap.get(type);
        listenerSet.add({
            listener,
            options: typeof options === 'object' ? options : { capture: options },
        });
    }

    // 重写 removeEventListener
    /**
     * @param {string} type
     * @param {EventListenerOrEventListenerObject | null} listener
     * @param {{ capture?: boolean }} options
     */
    removeEventListener(type, listener, options = {}) {
        super.removeEventListener(type, listener, options);

        const listenerSet = this._listenersMap.get(type);
        if (listenerSet) {
            // 移除匹配的 listener（注意要比较函数引用）
            for (const item of listenerSet) {
                if (item.listener === listener && item.options.capture === (typeof options === 'object' ? options.capture : options)) {
                    listenerSet.delete(item);
                    break;
                }
            }
            if (listenerSet.size === 0) {
                this._listenersMap.delete(type);
            }
        }
    }

    // 获取所有已注册的监听器（可指定事件类型）
    /** @param {string | null} type */
    getAllEventListeners(type = null) {
        // 修复：原判断 `type !== undefined` 对默认值 null 恒为 true，
        // 导致无参调用永远进入「按类型」分支而返回 []，无法取到全部监听器。
        if (type != null) {
            const set = this._listenersMap.get(type);
            return set ? Array.from(set).map((item) => item.listener) : [];
        }
        // 返回所有类型的监听器，格式：{ type: [listener1, listener2], ... }
        const all = {};
        for (const [t, set] of this._listenersMap.entries()) {
            all[t] = Array.from(set).map((item) => item.listener);
        }
        return all;
    }
    // 去除所有已注册的监听器（可指定事件类型）
    /** @param {string | null} type */
    removeAllEventListeners(type = null) {
        const typesToRemove = type ? [type] : Array.from(this._listenersMap.keys());

        for (const currentType of typesToRemove) {
            const listenerSet = this._listenersMap.get(currentType);
            if (!listenerSet) continue;

            // 复制一份 Set 以免遍历时修改导致问题
            const listenersCopy = Array.from(listenerSet);
            for (const { listener, options } of listenersCopy) {
                // 调用原生 removeEventListener 真正从 EventTarget 内部移除
                super.removeEventListener(currentType, listener, options);
            }
            // 直接清空整个 Set 并删除类型键（原实现里 listenerSet.delete({...})
            // 是新建对象按引用删除，永远匹配不上，属于无效代码）
            listenerSet.clear();
            this._listenersMap.delete(currentType);
        }
    }

    /**
     * 简单的事件分发辅助函数
     *
     * @param {string} type - 事件类型
     * @param {any} detail - 事件详细信息
     */
    emit(type, detail) {
        this.dispatchEvent(new CustomEvent(type, { detail }));
    }

    /** @param {Event} e */
    transmit(e) {
        if (e instanceof CustomEvent) {
            this.dispatchEvent(e);
        } else {
            this.emit(e.type, { originalEvent: e });
        }
    }
}
