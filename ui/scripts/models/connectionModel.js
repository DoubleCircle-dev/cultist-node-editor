export class ConnectionModel {
    constructor(id, fromNodeId, fromPortId, toNodeId, toPortId) {
        this.id = id;
        this.fromNodeId = fromNodeId;
        this.fromPortId = fromPortId;
        this.toNodeId = toNodeId;
        this.toPortId = toPortId;
    }

    equal(other) {
        if (this === other) {
            return true;
        }
        if (!(other instanceof ConnectionModel)) {
            return false;
        }
        return this.fromNodeId === other.fromNodeId &&
            this.fromPortId === other.fromPortId &&
            this.toNodeId === other.toNodeId &&
            this.toPortId === other.toPortId;
    }

    strictEqual(other) {
        return this.id === other.id && this.equal(other);
    }
}
