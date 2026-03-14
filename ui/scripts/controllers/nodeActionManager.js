
export class NodeActionManager {
    
    /**
     * @param {HTMLElement} viewport
     * @param {HTMLElement} canvas
     * @param {function} updateStatus
     */
    constructor(viewport, canvas, updateStatus, nodes) {
        this._actions = [];
        this._viewport = viewport;
        this._canvas = canvas;
        this.updateStatus = updateStatus;
    }
}
