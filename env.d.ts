declare const eruda: any;

// VS Code Webview 提供的 API（普通浏览器中不存在，需 typeof 检测）
declare function acquireVsCodeApi(): any;

// 后端注入的编辑器配置（webview-config.json + 运行时字段如 placeholderImage）
interface Window {
    NODE_EDITOR_CONFIG?: {
        placeholderImage?: string;
        [key: string]: any;
    };
}

// Chrome/Electron 独有：performance.memory 仅在 Chromium 内核可用
interface Performance {
    memory?: {
        totalJSHeapSize: number;
        usedJSHeapSize: number;
        jsHeapSizeLimit: number;
    };
}
