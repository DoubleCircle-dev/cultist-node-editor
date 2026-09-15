import { IEventTarget } from "./IEventTarget.js";

export class IView {
    /** @param {IEventTarget} model */
    constructor(model) {
        /** @type {IEventTarget} */
        this.model = model;
        /** @type {HTMLElement | null} */
        this.element = null;

        /** @type {listenerMap[]} */
        this.listenerMaps = [];
    }

    /**
     * @param {EventTarget} target
     * @param {string} type
     * @param {EventListenerOrEventListenerObject} listener
     */
    bindListener(target, type, listener) {
        const IListener = /** @type {EventListener} */ (listener).bind(this);
        this.listenerMaps.push({ target, type, listener: IListener });
        target.addEventListener(type, IListener);
    }

    /**
     * @param {string} type
     * @param {EventListenerOrEventListenerObject} listener
     */
    onModel(type, listener) {
        this.bindListener(this.model, type, listener);
    }

    removeListeners() {
        this.listenerMaps.forEach((listenerMap) => {
            listenerMap.target.removeEventListener(listenerMap.type, listenerMap.listener);
        });
    }
}
