// /src/core/readMode.js
const fs = require('fs').promises;
const path = require('path');

// ========== 工具函数 ==========

function safePath(filePath) {
    try {
        const relative = path.relative(process.cwd(), filePath);
        return relative || filePath;
    } catch (error) {
        return path.basename(filePath);
    }
}

/**
 * 专门处理 Cultist Simulator 的 JSON 文件
 * 这些文件通常包含尾随逗号和制表符
 */
function fixCultistSimulatorJSON(content, filePath) {
    console.log(`修复 Cultist Simulator JSON: ${safePath(filePath)}`);

    if (!content || content.trim() === '') {
        return '{}';
    }

    let result = content;

    // 1. 移除 BOM
    if (result.charCodeAt(0) === 0xFEFF) {
        result = result.substring(1);
    }

    // 2. 修复尾随逗号 - 特别注意数组和对象的尾随逗号
    result = fixTrailingCommasForCultist(result);

    // 3. 修复单引号字符串（有些模组使用单引号）
    result = fixSingleQuotesForCultist(result);

    // 4. 修复可能的注释
    result = removeCommentsForCultist(result);

    // 5. 修复制表符和空格混合缩进（保持结构）
    result = normalizeWhitespaceForCultist(result);

    return result;
}

/**
 * 修复 Cultist Simulator 特有的尾随逗号问题
 */
function fixTrailingCommasForCultist(content) {
    let result = '';
    let inString = false;
    let escaped = false;
    let stack = []; // 跟踪括号类型

    for (let i = 0; i < content.length; i++) {
        const char = content[i];
        const nextChar = i + 1 < content.length ? content[i + 1] : '';

        // 处理转义
        if (char === '\\' && inString && !escaped) {
            escaped = true;
            result += char;
            continue;
        }

        // 处理字符串边界
        if (char === '"' && !escaped) {
            inString = !inString;
            result += char;
            escaped = false;
            continue;
        }

        // 重置转义状态
        if (escaped) {
            escaped = false;
        }

        // 不在字符串中时处理 JSON 结构
        if (!inString) {
            // 记录括号类型
            if (char === '{' || char === '[') {
                stack.push(char);
            } else if (char === '}' || char === ']') {
                stack.pop();
            }

            // 检查尾随逗号
            if (char === ',') {
                // 查找下一个非空白字符
                let j = i + 1;
                while (j < content.length && /\s/.test(content[j])) {
                    j++;
                }

                // 如果逗号后面是 } 或 ]，则删除逗号
                if (j < content.length && (content[j] === '}' || content[j] === ']')) {
                    // 只删除这个逗号，不添加到结果
                    console.log(`移除尾随逗号在位置 ${i}`);
                    continue;
                }
            }
        }

        result += char;
    }

    return result;
}

/**
 * 修复 Cultist Simulator 中可能出现的单引号字符串
 */
function fixSingleQuotesForCultist(content) {
    // Cultist Simulator 模组通常使用双引号，但以防万一
    let result = '';
    let inDoubleString = false;
    let inSingleString = false;
    let escaped = false;

    for (let i = 0; i < content.length; i++) {
        const char = content[i];

        // 处理转义
        if (char === '\\' && (inDoubleString || inSingleString) && !escaped) {
            escaped = true;
            result += char;
            continue;
        }

        // 处理双引号字符串
        if (char === '"' && !escaped) {
            inDoubleString = !inDoubleString;
            result += char;
            escaped = false;
            continue;
        }

        // 处理单引号字符串（转换为双引号）
        if (char === "'" && !escaped) {
            if (!inSingleString && !inDoubleString) {
                // 开始单引号字符串
                inSingleString = true;
                result += '"';
            } else if (inSingleString) {
                // 结束单引号字符串
                inSingleString = false;
                result += '"';
            } else {
                result += char; // 在双引号字符串中的单引号
            }
            escaped = false;
            continue;
        }

        // 重置转义状态
        if (escaped) {
            escaped = false;
        }

        // 在单引号字符串中时，转义双引号
        if (inSingleString && char === '"') {
            result += '\\"';
            continue;
        }

        result += char;
    }

    return result;
}

/**
 * 移除可能的注释（有些模组可能包含注释）
 */
function removeCommentsForCultist(content) {
    // Cultist Simulator 的 JSON 通常没有注释，但有些模组可能添加
    let result = '';
    let inString = false;
    let escaped = false;
    let inLineComment = false;
    let inBlockComment = false;

    for (let i = 0; i < content.length; i++) {
        const char = content[i];
        const nextChar = i + 1 < content.length ? content[i + 1] : '';

        // 处理转义
        if (char === '\\' && inString && !escaped) {
            escaped = true;
            if (!inLineComment && !inBlockComment) result += char;
            continue;
        }

        // 处理字符串边界
        if (char === '"' && !escaped) {
            inString = !inString;
            if (!inLineComment && !inBlockComment) result += char;
            continue;
        }

        // 重置转义状态
        if (escaped) {
            escaped = false;
        }

        // 不在字符串中时处理注释
        if (!inString) {
            // 单行注释
            if (!inBlockComment && char === '/' && nextChar === '/') {
                inLineComment = true;
                i++; // 跳过第二个 '/'
                continue;
            }

            // 块注释开始
            if (!inLineComment && char === '/' && nextChar === '*') {
                inBlockComment = true;
                i++; // 跳过 '*'
                continue;
            }

            // 块注释结束
            if (inBlockComment && char === '*' && nextChar === '/') {
                inBlockComment = false;
                i++; // 跳过 '/'
                continue;
            }

            // 单行注释结束
            if (inLineComment && char === '\n') {
                inLineComment = false;
                result += char; // 保留换行
                continue;
            }
        }

        // 不在注释中时添加字符
        if (!inLineComment && !inBlockComment) {
            result += char;
        }
    }

    return result;
}

/**
 * 标准化空白，保留 Cultist Simulator 的可读格式
 */
function normalizeWhitespaceForCultist(content) {
    // Cultist Simulator 文件通常使用制表符缩进，我们保持这种格式
    // 只确保没有混合缩进问题
    return content;
}

/**
 * 验证和修复 JSON 对象
 */
function validateAndFixJsonObject(content, filePath) {
    try {
        // 尝试直接解析
        return JSON.parse(content);
    } catch (error) {
        console.log(`直接解析失败，尝试修复: ${error.message}`);

        // 尝试修复
        const fixed = fixCultistSimulatorJSON(content, filePath);

        try {
            return JSON.parse(fixed);
        } catch (fixError) {
            console.log(`修复后解析失败: ${fixError.message}`);

            // 尝试提取 JSON 对象
            const extracted = extractJsonObject(fixed);
            if (extracted) {
                try {
                    return JSON.parse(extracted);
                } catch (extractError) {
                    console.log(`提取后解析失败: ${extractError.message}`);
                }
            }

            return null;
        }
    }
}

/**
 * 从内容中提取可能的 JSON 对象
 */
function extractJsonObject(content) {
    // 查找第一个 { 和最后一个 }
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}') + 1;

    if (start >= 0 && end > start) {
        const extracted = content.substring(start, end);
        console.log(`提取 JSON 对象，长度: ${extracted.length}`);
        return extracted;
    }

    // 或者查找第一个 [ 和最后一个 ]
    const startArray = content.indexOf('[');
    const endArray = content.lastIndexOf(']') + 1;

    if (startArray >= 0 && endArray > startArray) {
        const extracted = content.substring(startArray, endArray);
        console.log(`提取 JSON 数组，长度: ${extracted.length}`);
        return extracted;
    }

    return null;
}

// ========== 主要解析函数 ==========

/**
 * 读取 JSON 文件，专门处理 Cultist Simulator 格式
 */
async function readJSONFile(filePath) {
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

        // 验证和修复
        const data = validateAndFixJsonObject(content, filePath);

        if (data === null) {
            return {
                data: {},
                error: `无法解析 JSON 文件: ${safePath(filePath)}`,
                warnings
            };
        }

        console.log(`✅ 成功解析: ${safePath(filePath)}`);

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
 * 递归读取文件夹中的所有 JSON 文件
 */
async function readAllJSONFiles(dirPath, excludeDirs = ['images', 'dll']) {
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
                    const result = await readJSONFile(fullPath);
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

/**
 * 读取完整的模组信息
 */
async function readModFolder(modPath) {
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
        const synopsisResult = await readJSONFile(synopsisPath);
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
        modInfo.content = await readAllJSONFiles(contentPath);

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
                const result = await readJSONFile(filePath);

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
            modInfo.locFiles = await readAllJSONFiles(locPath);
        } catch (error) {
            modInfo.errors.push(`读取 loc 文件夹失败: ${error.message}`);
        }
    }

    return modInfo;
}

/**
 * 分析模组并显示结果
 */
async function analyzeMod(modPath) {
    try {
        console.log(`\n📁 正在读取模组: ${safePath(modPath)}`);
        console.log('='.repeat(50));

        const modData = await readModFolder(modPath);

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

        // 显示成功解析的文件
        if (validFiles.length > 0) {
            console.log('\n✅ 成功解析的文件');
            console.log('-'.repeat(30));
            validFiles.forEach((file, index) => {
                if (index < 10) { // 只显示前10个
                    console.log(`${index + 1}. ${file.relativePath || file.fileName}`);
                    if (file.data && typeof file.data === 'object') {
                        const keys = Object.keys(file.data);
                        if (keys.length > 0) {
                            console.log(`   包含: ${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '...' : ''}`);
                        }
                    }
                }
            });
            if (validFiles.length > 10) {
                console.log(`   ... 还有 ${validFiles.length - 10} 个文件`);
            }
        }

        console.log('\n' + '='.repeat(50));
        console.log('🎉 模组分析完成');

        return modData;

    } catch (error) {
        console.error('读取模组时出错:', error);
        throw error;
    }
}

/**
 * 修复有问题的 JSON 文件
 */
async function fixJsonFile(filePath) {
    try {
        console.log(`🔧 尝试修复文件: ${safePath(filePath)}`);

        // 读取原始内容
        const content = await fs.readFile(filePath, 'utf8');

        // 创建备份
        const backupPath = filePath + '.backup';
        await fs.writeFile(backupPath, content, 'utf8');
        console.log(`📁 备份已创建: ${safePath(backupPath)}`);

        // 修复
        const fixed = fixCultistSimulatorJSON(content, filePath);

        // 验证修复结果
        try {
            JSON.parse(fixed);
            console.log('✅ 修复后的内容可以通过 JSON 验证');
        } catch (error) {
            console.warn('⚠️ 修复后仍无法通过 JSON 验证:', error.message);

            // 尝试提取 JSON 对象
            const extracted = extractJsonObject(fixed);
            if (extracted) {
                try {
                    JSON.parse(extracted);
                    console.log('✅ 提取后可以通过 JSON 验证');
                    await fs.writeFile(filePath, extracted, 'utf8');
                    console.log('✅ 文件已保存（提取版）');
                    return true;
                } catch (e) {
                    console.error('❌ 提取后解析失败:', e.message);
                    return false;
                }
            }
            return false;
        }

        // 保存修复后的文件
        await fs.writeFile(filePath, fixed, 'utf8');
        console.log('✅ 文件已保存');
        return true;

    } catch (error) {
        console.error(`❌ 修复失败: ${error.message}`);
        return false;
    }
}

// ========== 导出 ==========

module.exports = {
    readJSONFile,
    readAllJSONFiles,
    readModFolder,
    analyzeMod,
    fixJsonFile,

    // 工具函数
    fixCultistSimulatorJSON,
    fixTrailingCommasForCultist,
    fixSingleQuotesForCultist,
    removeCommentsForCultist
};
