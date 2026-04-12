import { PortModel } from "./portModel.js";

export class ConnectionModel extends EventTarget {
    constructor(id,formNodeId, toNodeId, startPort, targetPort, startPos = { x: 0, y: 0 }, endPos = { x: 0, y: 0 }) {
        super();
        this.id = id;

        this.formNodeId = formNodeId;
        this.toNodeId = toNodeId;

        /**@type {PortModel} */
        this.startPort = startPort;
        this.targetPort = targetPort


        this.startPos = startPos;
        this.endPos = endPos;

        this.startFlag = false;
        this.endFlag = false;
    }

    remove(){
        this.dispatchEvent(new CustomEvent('delete:conn'))
        this.startPort.remove(this.targetPort);
    }


    emitPos() {
        this.dispatchEvent(new CustomEvent('change:conn', { detail: { startX: (this.startPos.x), startY: (this.startPos.y), endX: (this.endPos.x), endY: (this.endPos.y) } }))
    }

    update(dx=0, dy=0){
        if (this.startFlag && this.endFlag){
            this._updatePos(dx, dy);
        }else if (this.startFlag) {
            this._updateStart(dx, dy);
        }else if(this.endFlag) {
            this._updateEnd(dx, dy);
        }

        this.startFlag = false;
        this.endFlag = false;
    }

    refresh(startPos, endPos){
        this.startPos = startPos;
        this.endPos = endPos;
        this.emitPos();
    }

    _updateStart(dx, dy) {
        this.startPos.x = this.startPos.x + dx;
        this.startPos.y = this.startPos.y + dy;
        this.emitPos();
    }

    _updateEnd(dx, dy) {
        this.endPos.x = this.endPos.x + dx;
        this.endPos.y = this.endPos.y + dy;
        this.emitPos();
    }

    _updatePos(dx, dy) {
        this.startPos.x = this.startPos.x + dx;
        this.startPos.y = this.startPos.y + dy;
        this.endPos.x = this.endPos.x + dx;
        this.endPos.y = this.endPos.y + dy;
        this.emitPos();
    }

}
