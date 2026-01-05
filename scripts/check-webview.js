// scripts/check-webview.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔍 检查 Webview 代码...');

// 创建临时 TypeScript 配置文件
const tempTsConfig = {
    "compilerOptions": {
        "target": "ES2020",
        "module": "ESNext",
        "lib": ["ES2020", "DOM"],
        "strict": true,
        "noEmit": true,
        "allowJs": true,
        "checkJs": true
    },
    "include": [
        "../ui/**/*.js"
    ],
    "files": [
        "../ui/types/vscode-webview.d.ts"
    ]
};

const tempConfigPath = path.join(__dirname, 'temp-webview-tsconfig.json');
fs.writeFileSync(tempConfigPath, JSON.stringify(tempTsConfig, null, 2));

try {
    // 运行类型检查
    const result = execSync(`npx tsc --project ${tempConfigPath} --noEmit`, {
        encoding: 'utf-8',
        stdio: 'pipe'
    });
    console.log('✅ Webview 代码检查通过');
} catch (error) {
    console.error('❌ Webview 代码检查失败:');
    console.error(error.stdout || error.message);
    process.exit(1);
} finally {
    // 清理临时文件
    fs.unlinkSync(tempConfigPath);
}
