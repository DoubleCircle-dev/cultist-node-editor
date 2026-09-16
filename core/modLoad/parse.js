// /src/core/readModJSON5.js
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const JSON5 = require('json5');

// ========== 工具函数 ==========

/**
 * 安全路径显示
 */
function safePath(filePath) {
    try {
        const relative = path.relative(process.cwd(), filePath);
        return relative || filePath;
    } catch (error) {
        return path.basename(filePath);
    }
}

/**
 * 检查文件是否为二进制文件
 */
function isBinaryFile(content) {
    // 检查前1000个字符中是否有过多控制字符
    let controlCount = 0;
    const sample = content.substring(0, Math.min(1000, content.length));

    for (let i = 0; i < sample.length; i++) {
        const code = sample.charCodeAt(i);
        // 非打印字符且不是常见空白字符（制表符、换行、回车）
        if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
            controlCount++;
        }
    }

    // 如果超过5%的控制字符，可能是二进制文件
    return (controlCount / sample.length) > 0.05;
}

/**
 * 清理文件内容，准备使用 JSON5 解析
 */
function prepareForJSON5(content, filePath) {
    console.log(`准备 JSON5 解析: ${safePath(filePath)}`);

    if (!content || content.trim() === '') {
        return '{}';
    }

    let result = content;

    // 1. 移除 BOM
    if (result.charCodeAt(0) === 0xFEFF) {
        result = result.substring(1);
        console.log('移除了 UTF-8 BOM');
    }

    // 2. 检查是否为二进制文件
    if (isBinaryFile(result)) {
        console.warn('警告: 文件可能包含二进制数据');

        // 尝试转换为 UTF-8
        try {
            const buffer = Buffer.from(result, 'binary');
            result = buffer.toString('utf8');
            console.log('尝试从二进制转换为 UTF-8');
        } catch (error) {
            console.error('转换为 UTF-8 失败:', error.message);
        }
    }

    // 3. 修复常见的 JSON5 问题
    result = fixCommonJSON5Issues(result);

    return result;
}

/**
 * 修复常见的 JSON5 问题
 */
function fixCommonJSON5Issues(content) {
    let fixed = content;

    // JSON5 本身支持大多数非标准语法，但有些极端情况需要处理

    // 1. 修复未转义的换行符（JSON5 允许，但有些字符串中有真正的换行）
    // 将字符串中的换行符转义（除非已经是转义的）
    fixed = fixed.replace(/([^\\])("([^"\\]|\\.)*\n([^"\\]|\\.)*")/g, (match, prefix, str) => {
        // 转义换行符
        return prefix + str.replace(/\n/g, '\\n');
    });

    // 2. 修复未转义的回车符
    fixed = fixed.replace(/([^\\])("([^"\\]|\\.)*\r([^"\\]|\\.)*")/g, (match, prefix, str) => {
        return prefix + str.replace(/\r/g, '\\r');
    });

    // 3. 修复未转义的制表符（通常不需要，但为了安全）
    fixed = fixed.replace(/([^\\])("([^"\\]|\\.)*\t([^"\\]|\\.)*")/g, (match, prefix, str) => {
        return prefix + str.replace(/\t/g, '\\t');
    });

    // 4. 修复未闭合的字符串（尝试添加闭合引号）
    // 计算引号数量
    const quoteCount = (fixed.match(/"/g) || []).length;
    if (quoteCount % 2 !== 0) {
        console.warn('字符串引号未闭合，尝试修复...');
        // 在末尾添加引号
        fixed = fixed + '"';
    }

    return fixed;
}

/**
 * 使用 JSON5 解析内容
 */
function parseWithJSON5(content, filePath) {
    const safeFile = safePath(filePath);

    try {
        console.log(`使用 JSON5 解析: ${safeFile}`);

        // 尝试直接解析
        const data = JSON5.parse(content);
        console.log(`✅ JSON5 解析成功: ${safeFile}`);
        return data;

    } catch (error) {
        console.error(`❌ JSON5 解析失败: ${error.message}`);

        // 显示错误位置
        const match = error.message.match(/at position (\d+)/);
        if (match) {
            const position = parseInt(match[1], 10);
            const start = Math.max(0, position - 100);
            const end = Math.min(content.length, position + 100);

            console.error('错误位置上下文:');
            console.error('...' + content.substring(start, end) + '...');

            // 显示行号
            const lines = content.substring(0, position).split('\n');
            const lineNum = lines.length;
            const column = lines[lines.length - 1].length + 1;

            console.error(`位于: 行 ${lineNum}, 列 ${column}`);

            if (lineNum > 0) {
                console.error('错误行:', lines[lineNum - 1]);
            }
        }

        return null;
    }
}

/**
 * 智能 JSON5 解析，尝试多种方法
 */
function smartJSON5Parse(content, filePath) {
    console.log(`智能 JSON5 解析: ${safePath(filePath)}`);

    // 方法1: 直接 JSON5 解析
    try {
        return JSON5.parse(content);
    } catch (error1) {
        console.log(`方法1失败: ${error1.message}`);

        // 方法2: 清理后解析
        try {
            const cleaned = prepareForJSON5(content, filePath);
            return JSON5.parse(cleaned);
        } catch (error2) {
            console.log(`方法2失败: ${error2.message}`);

            // 方法3: 提取 JSON 对象后解析
            try {
                const extracted = extractJSONObject(content);
                if (extracted) {
                    return JSON5.parse(extracted);
                }
            } catch (error3) {
                console.log(`方法3失败: ${error3.message}`);
            }

            // 方法4: 逐行解析（针对多个 JSON 对象的文件）
            try {
                return parseMultipleJSON5Objects(content, filePath);
            } catch (error4) {
                console.log(`方法4失败: ${error4.message}`);

                // 最后尝试：使用 JavaScript 解析
                try {
                    return parseAsJavaScript(content, filePath);
                } catch (error5) {
                    console.log(`所有方法都失败: ${error5.message}`);
                    return null;
                }
            }
        }
    }
}

/**
 * 提取 JSON 对象
 */
function extractJSONObject(content) {
    // 查找第一个 { 和最后一个 }
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}') + 1;

    if (start >= 0 && end > start) {
        const extracted = content.substring(start, end);
        console.log(`提取 JSON 对象，长度: ${extracted.length}`);
        return extracted;
    }

    // 查找第一个 [ 和最后一个 ]
    const startArray = content.indexOf('[');
    const endArray = content.lastIndexOf(']') + 1;

    if (startArray >= 0 && endArray > startArray) {
        const extracted = content.substring(startArray, endArray);
        console.log(`提取 JSON 数组，长度: ${extracted.length}`);
        return extracted;
    }

    return null;
}

/**
 * 解析多个 JSON5 对象（逐行解析）
 */
function parseMultipleJSON5Objects(content, filePath) {
    console.log('尝试逐行解析多个 JSON5 对象...');

    const lines = content.split('\n');
    const objects = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // 跳过空行和注释
        if (!line || line.startsWith('//') || line.startsWith('/*')) {
            continue;
        }

        // 尝试解析这一行
        try {
            const obj = JSON5.parse(line);
            objects.push(obj);
            console.log(`第 ${i + 1} 行解析成功`);
        } catch (error) {
            // 忽略无法解析的行
            continue;
        }
    }

    if (objects.length === 0) {
        throw new Error('没有找到有效的 JSON5 对象');
    }

    if (objects.length === 1) {
        return objects[0];
    } else {
        console.log(`找到 ${objects.length} 个 JSON5 对象`);
        return objects;
    }
}

/**
 * 使用 JavaScript 解析（最后手段）
 */
function parseAsJavaScript(content, filePath) {
    console.log('⚠️  使用 JavaScript 解析（最后手段）');

    try {
        // 注意：这有安全风险，只用于可信的本地文件
        // 使用 Function 构造函数而不是 eval
        const wrapped = `(${content})`;
        const parseFunction = new Function('return ' + wrapped);
        const result = parseFunction();

        console.log('✅ JavaScript 解析成功');
        return result;

    } catch (error) {
        console.error(`JavaScript 解析失败: ${error.message}`);
        throw error;
    }
}

// ========== 主要解析函数 ==========

/**
 * 读取 JSON 文件（使用 JSON5）
 */
async function readJSONFileJSON5(filePath) {
    const warnings = [];

    try {
        // 检查文件是否存在
        await fs.access(filePath);

        // 读取文件
        let content;
        try {
            content = await fs.readFile(filePath, 'utf8');
        } catch (encodingError) {
            console.log(`UTF-8 读取失败，尝试二进制读取: ${safePath(filePath)}`);
            const buffer = await fs.readFile(filePath);
            content = buffer.toString('binary');
        }

        console.log(`读取文件: ${safePath(filePath)}, 大小: ${content.length} 字节`);

        // 检查是否为空文件
        if (!content || content.trim() === '') {
            console.warn(`空文件: ${safePath(filePath)}`);
            return {
                data: {},
                error: null,
                warnings: ['空文件']
            };
        }

        // 智能解析
        const data = smartJSON5Parse(content, filePath);

        if (data === null) {
            return {
                data: {},
                error: `无法解析 JSON5 文件: ${safePath(filePath)}`,
                warnings
            };
        }

        console.log(`✅ JSON5 解析成功: ${safePath(filePath)}`);

        // 验证数据结构
        if (typeof data === 'object') {
            if (data.decks && Array.isArray(data.decks)) {
                console.log(`找到 ${data.decks.length} 个 deck`);
                warnings.push(`包含 ${data.decks.length} 个 deck 定义`);
            }

            if (data.elements && Array.isArray(data.elements)) {
                console.log(`找到 ${data.elements.length} 个元素`);
                warnings.push(`包含 ${data.elements.length} 个元素定义`);
            }

            if (data.cultures && Array.isArray(data.cultures)) {
                console.log(`找到 ${data.cultures.length} 个文化`);
                warnings.push(`包含 ${data.cultures.length} 个文化定义`);
            }
        }

        return {
            data,
            error: null,
            warnings
        };

    } catch (error) {
        if (error.code === 'ENOENT') {
            return {
                data: {},
                error: `文件不存在: ${safePath(filePath)}`,
                warnings
            };
        }

        return {
            data: {},
            error: `读取失败: ${error.message}`,
            warnings
        };
    }
}

/**
 * 递归读取文件夹中的所有 JSON 文件（使用 JSON5）
 */
async function readAllJSONFilesJSON5(dirPath, excludeDirs = ['images', 'dll']) {
    const results = [];

    async function walkDirectory(currentPath) {
        try {
            const entries = await fs.readdir(currentPath, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(currentPath, entry.name);

                // 跳过排除的文件夹
                if (entry.isDirectory() && excludeDirs.includes(entry.name)) {
                    continue;
                }

                // 递归读取子文件夹
                if (entry.isDirectory()) {
                    await walkDirectory(fullPath);
                    continue;
                }

                // 处理 JSON 文件
                if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.json') {
                    const result = await readJSONFileJSON5(fullPath);
                    results.push({
                        filePath: fullPath,
                        relativePath: path.relative(dirPath, fullPath),
                        fileName: entry.name,
                        data: result.data,
                        error: result.error,
                        warnings: result.warnings
                    });
                }
            }
        } catch (error) {
            console.error(`无法访问目录 ${safePath(currentPath)}:`, error.message);
        }
    }

    await walkDirectory(dirPath);
    return results;
}

// ========== 模组读取函数 ==========

/**
 * 读取完整的模组信息（使用 JSON5）
 */
async function readModFolderJSON5(modPath) {
    const modInfo = {
        synopsis: null,
        content: [],
        otherJSONs: [],
        coverExists: false,
        imagesExist: false,
        locExist: false,
        dllExist: false,
        errors: []
    };

    try {
        // 1. 读取 synopsis.json
        const synopsisPath = path.join(modPath, 'synopsis.json');
        const synopsisResult = await readJSONFileJSON5(synopsisPath);
        if (synopsisResult.error && !synopsisResult.error.includes('文件不存在')) {
            modInfo.errors.push(`synopsis.json: ${synopsisResult.error}`);
        }
        modInfo.synopsis = synopsisResult.data;

    } catch (error) {
        modInfo.errors.push(`无法读取 synopsis.json: ${error.message}`);
    }

    // 2. 检查封面图片
    try {
        await fs.access(path.join(modPath, 'cover.png'));
        modInfo.coverExists = true;
    } catch {
        modInfo.coverExists = false;
        modInfo.errors.push('缺少封面图片 cover.png');
    }

    // 3. 检查可选文件夹
    for (const folder of ['images', 'loc', 'dll']) {
        try {
            await fs.access(path.join(modPath, folder));
            modInfo[`${folder}Exist`] = true;
        } catch {
            modInfo[`${folder}Exist`] = false;
        }
    }

    // 4. 读取 content 文件夹
    const contentPath = path.join(modPath, 'content');
    try {
        await fs.access(contentPath);
        modInfo.content = await readAllJSONFilesJSON5(contentPath);

        // 收集错误
        modInfo.content.forEach(file => {
            if (file.error) {
                modInfo.errors.push(`${file.relativePath}: ${file.error}`);
            }
        });
    } catch (error) {
        modInfo.errors.push(`content 文件夹: ${error.message}`);
    }

    // 5. 读取根目录下的其他 JSON 文件
    try {
        const rootEntries = await fs.readdir(modPath, { withFileTypes: true });

        for (const entry of rootEntries) {
            if (entry.isFile() &&
                entry.name.toLowerCase() !== 'synopsis.json' &&
                path.extname(entry.name).toLowerCase() === '.json') {

                const filePath = path.join(modPath, entry.name);
                const result = await readJSONFileJSON5(filePath);

                modInfo.otherJSONs.push({
                    filePath,
                    fileName: entry.name,
                    location: 'root',
                    ...result
                });

                if (result.error) {
                    modInfo.errors.push(`${entry.name}: ${result.error}`);
                }
            }
        }
    } catch (error) {
        modInfo.errors.push(`读取根目录文件失败: ${error.message}`);
    }

    // 6. 读取 loc 文件夹（如果有）
    if (modInfo.locExist) {
        const locPath = path.join(modPath, 'loc');
        try {
            modInfo.locFiles = await readAllJSONFilesJSON5(locPath);
        } catch (error) {
            modInfo.errors.push(`读取 loc 文件夹失败: ${error.message}`);
        }
    }

    return modInfo;
}

/**
 * 分析模组并显示结果（使用 JSON5）
 */
async function analyzeModJSON5(modPath) {
    try {
        console.log(`\n📁 正在读取模组 (JSON5): ${safePath(modPath)}`);
        console.log('='.repeat(60));

        const modData = await readModFolderJSON5(modPath);

        // 打印摘要
        console.log('\n📋 模组基本信息');
        console.log('-'.repeat(30));
        if (modData.synopsis) {
            console.log(`名称: ${modData.synopsis.name || '未知'}`);
            console.log(`版本: ${modData.synopsis.version || '未知'}`);
            console.log(`作者: ${modData.synopsis.author || '未知'}`);
            if (modData.synopsis.description) {
                const desc = modData.synopsis.description.length > 100
                    ? modData.synopsis.description.substring(0, 100) + '...'
                    : modData.synopsis.description;
                console.log(`描述: ${desc}`);
            }
        } else {
            console.log('⚠️  缺少 synopsis.json 或无法读取');
        }

        console.log('\n📊 文件统计');
        console.log('-'.repeat(30));
        const allFiles = [...modData.content, ...modData.otherJSONs];
        const validFiles = allFiles.filter(f => !f.error);
        const errorFiles = allFiles.filter(f => f.error);

        console.log(`JSON 文件总数: ${allFiles.length}`);
        console.log(`✅ 成功解析: ${validFiles.length}`);
        console.log(`❌ 解析失败: ${errorFiles.length}`);

        if (modData.coverExists) {
            console.log('✅ 封面图片: 存在');
        } else {
            console.log('❌ 封面图片: 缺失');
        }

        if (modData.content.length > 0) {
            console.log(`✅ content 文件夹: ${modData.content.length} 个文件`);
        } else {
            console.log('❌ content 文件夹: 为空或不存在');
        }

        // 统计不同类型的数据
        const dataTypes = {
            decks: 0,
            elements: 0,
            cultures: 0,
            recipes: 0,
            endings: 0,
            legacies: 0,
            verbs: 0,
            other: 0
        };

        validFiles.forEach(file => {
            const data = file.data;

            if (data.decks && Array.isArray(data.decks)) {
                dataTypes.decks++;
            } else if (data.elements && Array.isArray(data.elements)) {
                dataTypes.elements++;
            } else if (data.cultures && Array.isArray(data.cultures)) {
                dataTypes.cultures++;
            } else if (data.recipes && Array.isArray(data.recipes)) {
                dataTypes.recipes++;
            } else if (data.endings && Array.isArray(data.endings)) {
                dataTypes.endings++;
            } else if (data.legacies && Array.isArray(data.legacies)) {
                dataTypes.legacies++;
            } else if (data.verbs && Array.isArray(data.verbs)) {
                dataTypes.verbs++;
            } else if (data.verb && data.verb.length) {
                dataTypes.verbs++;
            } else if (Object.keys(data).length > 0) {
                dataTypes.other++;
            }
        });

        console.log('\n🎴 数据类型分布');
        console.log('-'.repeat(30));
        Object.entries(dataTypes).forEach(([type, count]) => {
            if (count > 0) {
                console.log(`${type}: ${count} 个文件`);
            }
        });

        // 显示错误
        if (modData.errors.length > 0) {
            console.log('\n❌ 发现的问题');
            console.log('-'.repeat(30));
            modData.errors.forEach((error, index) => {
                console.log(`${index + 1}. ${error}`);
            });
        }

        // 显示警告
        const allWarnings = allFiles
            .filter(f => f.warnings && f.warnings.length > 0)
            .flatMap(f => f.warnings.map(w => `${f.fileName}: ${w}`));

        if (allWarnings.length > 0) {
            console.log('\n⚠️  警告');
            console.log('-'.repeat(30));
            allWarnings.forEach((warning, index) => {
                console.log(`${index + 1}. ${warning}`);
            });
        }

        // 显示成功解析的文件示例
        if (validFiles.length > 0) {
            console.log('\n✅ 成功解析的文件示例');
            console.log('-'.repeat(30));

            validFiles.slice(0, 5).forEach((file, index) => {
                console.log(`${index + 1}. ${file.relativePath || file.fileName}`);

                if (file.data.decks && Array.isArray(file.data.decks)) {
                    console.log(`   包含 ${file.data.decks.length} 个 deck`);
                }

                if (file.data.elements && Array.isArray(file.data.elements)) {
                    console.log(`   包含 ${file.data.elements.length} 个元素`);
                }

                if (file.warnings && file.warnings.length > 0) {
                    console.log(`   警告: ${file.warnings.join(', ')}`);
                }
            });

            if (validFiles.length > 5) {
                console.log(`   ... 还有 ${validFiles.length - 5} 个文件`);
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log('🎉 JSON5 模组分析完成');

        return modData;

    } catch (error) {
        console.error('读取模组时出错:', error);
        throw error;
    }
}

/**
 * 修复 JSON 文件为 JSON5 格式
 */
async function fixToJSON5(filePath) {
    try {
        console.log(`🔧 修复文件为 JSON5 格式: ${safePath(filePath)}`);

        // 读取原始内容
        const content = await fs.readFile(filePath, 'utf8');

        // 创建备份
        const backupPath = filePath + '.backup';
        await fs.writeFile(backupPath, content, 'utf8');
        console.log(`📁 备份已创建: ${safePath(backupPath)}`);

        // 尝试解析
        const data = smartJSON5Parse(content, filePath);

        if (data === null) {
            console.error('❌ 无法解析，无法修复');
            return false;
        }

        // 转换为漂亮的 JSON5 格式
        const json5String = JSON5.stringify(data, null, 2);

        // 保存
        await fs.writeFile(filePath, json5String, 'utf8');
        console.log('✅ 文件已保存为 JSON5 格式');

        return true;

    } catch (error) {
        console.error(`❌ 修复失败: ${error.message}`);
        return false;
    }
}

/**
 * 转换 JSON 文件为 JSON5 格式
 */
async function convertToJSON5(filePath) {
    try {
        console.log(`🔄 转换文件为 JSON5 格式: ${safePath(filePath)}`);

        // 读取原始内容
        let content;
        try {
            content = await fs.readFile(filePath, 'utf8');
        } catch {
            const buffer = await fs.readFile(filePath);
            content = buffer.toString('binary');
        }

        // 创建备份
        const backupPath = filePath + '.backup';
        await fs.writeFile(backupPath, content, 'utf8');
        console.log(`📁 备份已创建: ${safePath(backupPath)}`);

        // 尝试使用标准 JSON 解析
        try {
            const data = JSON.parse(content);
            // 转换为 JSON5 格式（添加尾随逗号等）
            const json5String = convertToJSON5Format(data);
            await fs.writeFile(filePath, json5String, 'utf8');
            console.log('✅ 成功转换为 JSON5 格式');
            return true;
        } catch (jsonError) {
            console.log(`标准 JSON 解析失败: ${jsonError.message}`);

            // 尝试使用 JSON5 解析
            try {
                const data = JSON5.parse(content);
                const json5String = JSON5.stringify(data, null, 2);
                await fs.writeFile(filePath, json5String, 'utf8');
                console.log('✅ 使用 JSON5 解析并重新格式化');
                return true;
            } catch (json5Error) {
                console.error(`JSON5 解析也失败: ${json5Error.message}`);
                return false;
            }
        }

    } catch (error) {
        console.error(`❌ 转换失败: ${error.message}`);
        return false;
    }
}

/**
 * 将标准 JSON 对象转换为 JSON5 格式字符串
 */
function convertToJSON5Format(data) {
    // 自定义序列化器，添加尾随逗号
    function stringify(obj, indent = 0) {
        if (obj === null) return 'null';
        if (typeof obj === 'undefined') return 'undefined';
        if (typeof obj === 'number') return obj.toString();
        if (typeof obj === 'boolean') return obj.toString();
        if (typeof obj === 'string') return JSON.stringify(obj);

        if (Array.isArray(obj)) {
            if (obj.length === 0) return '[]';

            const items = obj.map(item => ' '.repeat(indent + 2) + stringify(item, indent + 2));
            return '[\n' + items.join(',\n') + ',\n' + ' '.repeat(indent) + ']';
        }

        if (typeof obj === 'object') {
            const keys = Object.keys(obj);
            if (keys.length === 0) return '{}';

            const items = keys.map(key => {
                return ' '.repeat(indent + 2) + key + ': ' + stringify(obj[key], indent + 2);
            });

            return '{\n' + items.join(',\n') + ',\n' + ' '.repeat(indent) + '}';
        }

        return JSON.stringify(obj);
    }

    return stringify(data);
}

// ========== 测试函数 ==========

/**
 * 测试特定文件（使用 JSON5）
 */
async function testFileJSON5(filePath) {
    console.log(`\n🧪 测试文件 (JSON5): ${safePath(filePath)}`);
    console.log('='.repeat(60));

    try {
        const result = await readJSONFileJSON5(filePath);

        if (result.error) {
            console.log(`❌ 错误: ${result.error}`);

            // 显示文件内容片段
            const content = await fs.readFile(filePath, 'utf8');
            console.log('\n📄 文件前300字符:');
            console.log(content.substring(0, 300));

            console.log('\n📄 文件后300字符:');
            console.log(content.substring(content.length - 300));

            return {
                success: false,
                error: result.error
            };
        } else {
            console.log('✅ 读取成功');

            // 分析数据
            if (result.data.decks && Array.isArray(result.data.decks)) {
                console.log(`🎴 找到 ${result.data.decks.length} 个 deck`);
                result.data.decks.slice(0, 3).forEach((deck, index) => {
                    console.log(`  ${index + 1}. ${deck.id || '未知'}`);
                    if (deck.spec && Array.isArray(deck.spec)) {
                        console.log(`     规格: ${deck.spec.length} 项`);
                    }
                });
                if (result.data.decks.length > 3) {
                    console.log(`  ... 还有 ${result.data.decks.length - 3} 个 deck`);
                }
            }

            if (result.data.elements && Array.isArray(result.data.elements)) {
                console.log(`🔮 找到 ${result.data.elements.length} 个元素`);
            }

            if (result.data.cultures && Array.isArray(result.data.cultures)) {
                console.log(`🌍 找到 ${result.data.cultures.length} 个文化`);
            }

            return {
                success: true,
                data: result.data,
                warnings: result.warnings
            };
        }

    } catch (error) {
        console.error(`测试失败: ${error.message}`);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * 批量测试文件夹中的所有 JSON 文件
 */
async function testDirectoryJSON5(dirPath) {
    console.log(`\n📂 测试目录 (JSON5): ${dirPath}`);

    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        const results = {
            total: 0,
            success: 0,
            failed: 0,
            files: []
        };

        for (const entry of entries) {
            if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
                results.total++;
                const filePath = path.join(dirPath, entry.name);

                console.log(`\n--- ${entry.name} ---`);
                const result = await testFileJSON5(filePath);

                results.files.push({
                    name: entry.name,
                    success: result.success,
                    error: result.error
                });

                if (result.success) {
                    results.success++;
                } else {
                    results.failed++;
                }
            }
        }

        // 显示统计
        console.log('\n' + '='.repeat(60));
        console.log('📊 测试统计 (JSON5)');
        console.log('='.repeat(60));
        console.log(`总计文件: ${results.total}`);
        console.log(`✅ 成功: ${results.success}`);
        console.log(`❌ 失败: ${results.failed}`);

        if (results.failed > 0) {
            console.log('\n❌ 失败的文件:');
            results.files.filter(f => !f.success).forEach((file, index) => {
                console.log(`${index + 1}. ${file.name}: ${file.error}`);
            });
        }

        return results;

    } catch (error) {
        console.error(`读取目录失败: ${error.message}`);
        return null;
    }
}

/**
 * 使用 JSON5 处理模组
 */
async function processModWithJSON5(modPath) {
    console.log(`\n🚀 使用 JSON5 处理模组: ${path.basename(modPath)}`);

    try {
        // 1. 分析模组
        const analysis = await analyzeModJSON5(modPath);

        // 2. 检查有问题的文件
        const allFiles = [...analysis.content, ...analysis.otherJSONs];
        const problematicFiles = allFiles.filter(f => f.error);

        if (problematicFiles.length > 0) {
            console.log(`\n⚠️  发现 ${problematicFiles.length} 个有问题的文件`);

            // 生成修复报告
            const reportPath = path.join(modPath, 'json5_fix_report.txt');
            const report = generateFixReport(modPath, problematicFiles);
            await fs.writeFile(reportPath, report, 'utf8');
            console.log(`📄 修复报告已保存: ${reportPath}`);

            // 提供修复建议
            console.log('\n💡 修复建议:');
            console.log('1. 使用 JSON5 格式重写文件');
            console.log('2. 运行: node tools/json5Converter.js --fix <文件路径>');
            console.log('3. 或运行: node tools/json5Converter.js --convert <文件路径>');
        } else {
            console.log('\n🎉 所有文件都能用 JSON5 解析！');
        }

        return {
            success: problematicFiles.length === 0,
            analysis,
            problematicFiles: problematicFiles.length
        };

    } catch (error) {
        console.error('❌ 处理模组时出错:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * 生成修复报告
 */
function generateFixReport(modPath, problematicFiles) {
    const report = [
        'JSON5 修复报告',
        '='.repeat(50),
        `模组: ${path.basename(modPath)}`,
        `生成时间: ${new Date().toISOString()}`,
        `问题文件数: ${problematicFiles.length}`,
        '',
        '问题文件列表:',
        ...problematicFiles.map((file, index) =>
            `${index + 1}. ${file.relativePath || file.fileName}\n   错误: ${file.error}`
        ),
        '',
        '修复方法:',
        '1. 安装 JSON5 支持（已安装）',
        '2. 使用 JSON5 解析器读取文件',
        '3. 或将文件转换为标准 JSON5 格式',
        '',
        'JSON5 支持的特性:',
        '- 尾随逗号',
        '- 单引号字符串',
        '- 多行字符串',
        '- 未加引号的属性名',
        '- 注释（// 和 /* */）',
        '- 十六进制数字',
        '- 正负无穷大和 NaN',
        '- 额外的空白字符'
    ].join('\n');

    return report;
}

// ========== 最外围键拆分（节点图流水线第 ① 步） ==========

/**
 * 同步读取单个 json / json5 文件（origin 预加载等同步路径用；异步路径见 readJSONFileJSON5）。
 *
 * 返回结构与异步版一致：`{ filePath, relativePath, fileName, data, error, warnings }`。
 * 解析沿用 smartJSON5Parse（含 CRLF / 尾随逗号等修复），失败时 data 为空对象并写 error。
 *
 * @param {string} filePath - 文件绝对路径
 * @returns {{ filePath: string; relativePath: string; fileName: string; data: any; error: string|null; warnings: string[] }}
 */
function readJSONFileSync(filePath) {
    const fileName = path.basename(filePath);
    /** @type {{ filePath: string; relativePath: string; fileName: string; data: any; error: string|null; warnings: string[] }} */
    const result = { filePath, relativePath: fileName, fileName, data: null, error: null, warnings: [] };

    let content;
    try {
        content = fsSync.readFileSync(filePath, 'utf8');
    } catch (e) {
        result.data = {};
        result.error = `读取失败: ${e.message}`;
        return result;
    }

    if (!content || content.trim() === '') {
        result.data = {};
        result.warnings.push('空文件');
        return result;
    }

    const data = smartJSON5Parse(content, filePath);
    if (data === null) {
        result.data = {};
        result.error = `无法解析 JSON5 文件: ${safePath(filePath)}`;
        return result;
    }

    result.data = data;
    return result;
}

/**
 * 递归同步读取目录下全部 .json（默认跳过 images / dll）。
 *
 * @param {string} dirPath - 目录绝对路径（不存在时返回空数组）
 * @param {string[]} [excludeDirs] - 跳过的子目录名
 * @returns {ReturnType<typeof readJSONFileSync>[]} 文件对象数组（relativePath 相对 dirPath）
 */
function readAllJSONFilesSync(dirPath, excludeDirs = ['images', 'dll']) {
    /** @type {ReturnType<typeof readJSONFileSync>[]} */
    const results = [];

    /** 深度优先遍历 */
    const walk = (dir) => {
        let entries;
        try {
            entries = fsSync.readdirSync(dir, { withFileTypes: true });
        } catch (error) {
            console.warn(`无法访问目录 ${safePath(dir)}: ${error.message}`);
            return;
        }
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (excludeDirs.includes(entry.name)) continue;
                walk(full);
                continue;
            }
            if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.json') continue;
            const file = readJSONFileSync(full);
            file.relativePath = path.relative(dirPath, full);
            results.push(file);
        }
    };

    walk(dirPath);
    return results;
}

/**
 * 拆分「最外围键」：整份 JSON → 根键 + 内部 list。
 *
 * 这是流水线第 ① 步的核心：一个数据文件的最外围键一般 1-2 个（recipes / elements…），
 * 键名即前端节点类型，值是该类型的条目列表；全部列表原样输出，不做筛选、不改内容。
 *
 * 三种形态：
 *   - `collection`：`{ "recipes": [ ... ] }` → 每个数组键一组（多个键就多组）；
 *   - `root-array`：文件本身就是数组 → 用 options.category 兜底归类；
 *   - `single-object`：没有数组键（如 synopsis.json）→ 整份当一个条目，由调用方决定是否采用。
 *
 * @param {any} data - 文件解析结果
 * @param {{ category?: string }} [options] - category：无根键可依据时的类别兜底
 * @returns {{
 *     mode: 'collection' | 'root-array' | 'single-object' | 'empty';
 *     rootKeys: string[];
 *     scalarKeys: string[];
 *     groups: { category: string; key: string|null; entries: any[]; isArray: boolean }[];
 * }} 拆分结果
 */
function splitRootKeys(data, options = {}) {
    const hint = options.category || '';

    if (Array.isArray(data)) {
        return {
            mode: 'root-array',
            rootKeys: [],
            scalarKeys: [],
            groups: [{ category: hint || 'misc', key: null, entries: data, isArray: true }],
        };
    }

    if (!data || typeof data !== 'object') {
        return { mode: 'empty', rootKeys: [], scalarKeys: [], groups: [] };
    }

    const keys = Object.keys(data);
    const arrayKeys = keys.filter((k) => Array.isArray(data[k]));

    if (arrayKeys.length) {
        return {
            mode: 'collection',
            rootKeys: keys,
            scalarKeys: keys.filter((k) => !Array.isArray(data[k])),
            groups: arrayKeys.map((k) => ({ category: k, key: k, entries: data[k], isArray: true })),
        };
    }

    return {
        mode: 'single-object',
        rootKeys: keys,
        scalarKeys: keys,
        groups: [{ category: hint || 'misc', key: null, entries: [data], isArray: false }],
    };
}

/**
 * 取文件的类别兜底名：相对路径首段（recipes/x.json → recipes），根目录文件用调用方给的 hint。
 *
 * @param {{ relativePath?: string; fileName?: string }} file - 文件对象
 * @param {string} [fallback] - 无目录信息时的兜底（单文件预览传所在目录名）
 * @returns {string} 类别兜底名
 */
function categoryHintOf(file, fallback) {
    const rel = file.relativePath || '';
    const seg = rel.split(/[\\/]/).filter(Boolean);
    if (seg.length > 1) return seg[0];
    return fallback || 'misc';
}

/**
 * 文件对象数组（`readAllJSONFilesSync` 或 `analyzeModJSON5` 的 `modInfo.content`）→ 待处理「组」列表。
 *
 * 只收集有数组键的集合文件（opts.includeSingle 打开时也收单对象条目），
 * 并给每组带上文件信息，供 toData 建节点时记录来源。
 *
 * @param {Array<{ filePath?: string; relativePath?: string; fileName?: string; data: any; error?: string|null }>} files
 * @param {{ fallbackCategory?: string; includeSingle?: boolean }} [options]
 * @returns {{ groups: Array<{ category: string; key: string|null; entries: any[]; isArray: boolean; file: string; relativePath: string; fileName: string }>; issues: { file: string; message: string }[] }}
 */
function filesToGroups(files, options = {}) {
    /** @type {ReturnType<typeof filesToGroups>['groups']} */
    const groups = [];
    /** @type {{ file: string; message: string }[]} */
    const issues = [];

    (files || []).forEach((file) => {
        if (!file || file.error || file.data == null) return;
        const rel = file.relativePath || file.fileName || '';
        const split = splitRootKeys(file.data, { category: categoryHintOf(file, options.fallbackCategory) });
        const usable = split.groups.filter((g) => g.isArray || options.includeSingle);

        if (!usable.length) {
            issues.push({ file: rel, message: `没有条目列表（${split.mode}），已跳过` });
            return;
        }

        usable.forEach((g) => {
            groups.push({
                ...g,
                file: file.filePath || rel,
                relativePath: rel,
                fileName: file.fileName || path.basename(rel),
            });
        });
    });

    return { groups, issues };
}

// ========== 导出 ==========

module.exports = {
    // 主要函数
    readJSONFileJSON5,
    readAllJSONFilesJSON5,
    readModFolderJSON5,
    analyzeModJSON5,
    processModWithJSON5,

    // 同步读取 + 最外围键拆分（toData 流水线的输入层）
    readJSONFileSync,
    readAllJSONFilesSync,
    splitRootKeys,
    filesToGroups,
    categoryHintOf,

    // 工具函数
    smartJSON5Parse,
    prepareForJSON5,
    fixToJSON5,
    convertToJSON5,

    // 测试函数
    testFileJSON5,
    testDirectoryJSON5,

    // 重新导出 JSON5 库
    JSON5
};
