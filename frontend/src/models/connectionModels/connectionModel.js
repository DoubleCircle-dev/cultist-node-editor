import { IEventTarget } from '../../types/IEventTarget.js';
import { PortModel } from '../propModels/portModel.js';

export class ConnectionModel extends IEventTarget {

    /**
     * @param {string} id - 用来识别属性
     * @param {string} fromNodeId - 连接的起始节点
     * @param {string} toNodeId - 连接的结束节点
     * @param {PortModel} startPort - 连接的起始端口
     * @param {PortModel} targetPort - 连接的结束端口
     * @param {{ x: number; y: number }} startPos - 连接的起始位置
     * @param {{ x: number; y: number }} endPos - 连接的结束位置
     */
    constructor(id, fromNodeId, toNodeId, startPort, targetPort, startPos = { x: 0, y: 0 }, endPos = { x: 0, y: 0 }) {
        super();
        this.id = id;

        this.fromNodeId = fromNodeId;
        this.toNodeId = toNodeId;

        /** @type {PortModel} */
        this.startPort = startPort;
        this.targetPort = targetPort;

        this.startPos = startPos;
        this.endPos = endPos;

        this.startFlag = false;
        this.endFlag = false;
    }

    remove() {
        this.emit('delete:connection', {})
        this.startPort.remove(this.targetPort);
    }

    emitPos() {
        this.emit('change:connection', { startX: this.startPos.x, startY: this.startPos.y, endX: this.endPos.x, endY: this.endPos.y })
    }

    update(dx = 0, dy = 0) {
        if (this.startFlag && this.endFlag) {
            this._updatePos(dx, dy);
        } else if (this.startFlag) {
            this._updateStart(dx, dy);
        } else if (this.endFlag) {
            this._updateEnd(dx, dy);
        }

        this.startFlag = false;
        this.endFlag = false;
    }

    /**
     * @param {{ x: number; y: number }} startPos
     * @param {{ x: number; y: number }} endPos
     */
    refresh(startPos, endPos) {
        this.startPos = startPos;
        this.endPos = endPos;
        this.emitPos();
    }

    /** @private */
    _updateStart(dx, dy) {
        this.startPos.x = this.startPos.x + dx;
        this.startPos.y = this.startPos.y + dy;
        this.emitPos();
    }

    /** @private */
    _updateEnd(dx, dy) {
        this.endPos.x = this.endPos.x + dx;
        this.endPos.y = this.endPos.y + dy;
        this.emitPos();
    }

    /** @private */
    _updatePos(dx, dy) {
        this.startPos.x = this.startPos.x + dx;
        this.startPos.y = this.startPos.y + dy;
        this.endPos.x = this.endPos.x + dx;
        this.endPos.y = this.endPos.y + dy;
        this.emitPos();
    }
}
