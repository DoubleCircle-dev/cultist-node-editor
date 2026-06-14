import { PanelModel } from './panelModel.js';

export class BottomPanelModel extends PanelModel {
    constructor(id, options = {}) {
        // 强行锁定 type 为 'bottom'
        super(id, 'bottom', options);


    }



}
