import { BaseNodeModel } from './baseNodeModel.js';

/**
 * 预览节点模型（工具节点 previewNode 的模型控制器，extends BaseNodeModel）。
 *
 * 新形态：**半透明框架** —— 不显示节点头、不使用端口连接引用。
 *   - 通过文本属性「预览目标ID」指定画布上的节点（NodeManager 注入 targetFinder 按 ID 查找）
 *   - 内部由 NodeView 只读渲染「原节点」（无法编辑、无法连线）
 *   - 目标变化 → 维护 this.referenceNode + previewInfo → emit update:preview
 *
 * 由 NodeGenerator 在完成属性构建后调用 bindPreviewControl()。
 */
export class PreviewNodeModel extends BaseNodeModel {
    /**
     * @param {number} uid
     * @param {NodeID} id
     * @param {number} x
     * @param {number} y
     * @param {NodeConfig} config
     */
    constructor(uid, id, x, y, config) {
        super(id, 'previewNode', x, y, config);

        /** 节点唯一序号（与 NodeModel 对齐，供 NodeManager 注册） */
        this.uid = uid;

        /** 被预览的节点（referenceNode） */
        this.referenceNode = null;

        /** @type {((targetId: string) => import('./baseNodeModel.js').BaseNodeModel | null) | null} 按 ID 查找目标节点的引用器（NodeManager 注入） */
        this._targetFinder = null;
    }

    /** @param {(targetId: string) => import('./baseNodeModel.js').BaseNodeModel | null} finder */
    setTargetFinder(finder) {
        this._targetFinder = finder;
    }

    /** @private @returns {string} */
    _getTargetId() {
        const prop = this.properties.find((p) => p.name === 'previewTargetId');
        return prop ? String(prop.value ?? '').trim() : '';
    }

    /**
     * 根据「预览目标ID」刷新 referenceNode 并通知视图。
     */
    refreshPreview() {
        const targetId = this._getTargetId();
        this.referenceNode = targetId && this._targetFinder ? this._targetFinder(targetId) || null : null;

        // 更新「预览对象」只读文本
        const info = this.properties.find((p) => p.name === 'previewInfo');
        if (info) {
            info.updateValue(
                this.referenceNode ? `预览: ${this.referenceNode.title} (#${this.referenceNode.id})` : '未指定预览目标'
            );
        }

        this.emit('update:preview', { referenceNode: this.referenceNode || null });
    }

    /**
     * 绑定预览控制：监听「预览目标ID」文本变化 → 刷新预览。
     * 属性监听器随 BaseProp.dispose/releaseListeners 自动清理。
     */
    bindPreviewControl() {
        const targetProp = this.properties.find((p) => p.name === 'previewTargetId');
        if (targetProp) {
            targetProp.addEventListener('change:property', () => this.refreshPreview());
        }
        // 初始渲染（未指定目标）
        this.refreshPreview();
    }
}

