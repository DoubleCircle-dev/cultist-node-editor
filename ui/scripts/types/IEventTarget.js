
export class IEventTarget extends EventTarget {
    constructor() {
        super()

        this._listenersMap = new Map();
    }

    // 重写 addEventListener
    /**
     * @param {string} type
     * @param {EventListener} listener
     * @param {{capture?: boolean}} options
     */
    addEventListener(type, listener, options = {}) {
        super.addEventListener(type, listener, options);

        if (!this._listenersMap.has(type)) {
            this._listenersMap.set(type, new Set());
        }
        const listenerSet = this._listenersMap.get(type);
        listenerSet.add({ listener, options: typeof options === 'object' ? options : { capture: options } });
    }

    // 重写 removeEventListener
    /**
     * @param {string} type
     * @param {EventListener} listener
     * @param {{capture?: boolean}} options
     */
    removeEventListener(type, listener, options = {}) {
        super.removeEventListener(type, listener, options);

        const listenerSet = this._listenersMap.get(type);
        if (listenerSet) {
            // 移除匹配的 listener（注意要比较函数引用）
            for (const item of listenerSet) {
                if (item.listener === listener &&
                    item.options.capture === (typeof options === 'object' ? options.capture : options)) {
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
    /**
     * @param {string} type
     */
    getAllEventListeners(type = null) {
        if (type !== undefined) {
            const set = this._listenersMap.get(type);
            return set ? Array.from(set).map(item => item.listener) : [];
        }
        // 返回所有类型的监听器，格式：{ type: [listener1, listener2], ... }
        const all = {};
        for (const [t, set] of this._listenersMap.entries()) {
            all[t] = Array.from(set).map(item => item.listener);
        }
        return all;
    }
    // 去除所有已注册的监听器（可指定事件类型）
    /**
     * @param {string} type
     */
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
                // 同时从记录的 Set 中删除（其实在循环结束后一次性清空更高效，但直接 delete 也可以）
                listenerSet.delete({ listener, options });
            }
            // 清空该类型对应的 Set
            this._listenersMap.delete(currentType);
        }
    }


    /**
     * 简单的事件分发辅助函数
     * @param {string} type - 事件类型
     * @param {any} detail - 事件详细信息
     */
    emit(type, detail) {
        this.dispatchEvent(new CustomEvent(type, { detail }));
    }


}
