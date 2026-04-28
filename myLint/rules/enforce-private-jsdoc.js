/** @file 自定义 ESLint 规则：强制以下划线开头的方法添加 @private 注释 */

module.exports = {
    meta: {
        type: 'suggestion',
        docs: {
            description: '要求以 "_" 开头的方法或属性必须包含 @private JSDoc 标签',
            category: 'Stylistic Issues',
            recommended: false,
        },
        fixable: 'code',
        schema: [],
    },

    /**
     * @param {import('eslint').Rule.RuleContext} context - ESLint 规则上下文
     * @returns {import('eslint').Rule.RuleListener} 规则监听器
     */
    create(context) {
        const sourceCode = context.sourceCode;

        /**
         * 判断节点是否位于类的成员方法（包括构造函数）内部
         *
         * @param {import('estree').Node & {
         *     parent: import('estree').Node;
         * }} node - AST 节点
         * @returns {boolean}
         */
        function isInsideClassMember(node) {
            return sourceCode.getAncestors(node).some((ancestor) => ancestor.type === 'MethodDefinition' && ancestor.kind === 'constructor');
        }

        /**
         * 获取节点的前导 JSDoc 注释（紧邻的最后一个 /** 注释）
         *
         * @param {import('estree').Node} node - AST 节点
         * @returns {import('estree').Comment | null}
         */
        function getJSDocComment(node) {
            const commentsBefore = sourceCode.getCommentsBefore(node);
            if (commentsBefore.length === 0) return null;

            // 取最后一个注释，并检查是否为 JSDoc 风格
            const lastComment = commentsBefore[commentsBefore.length - 1];
            return lastComment.type === 'Block' && lastComment.value.startsWith('*') ? lastComment : null;
        }

        /**
         * 检查并报告节点是否包含 @private 标签
         *
         * @param {import('estree').Node} node - AST 节点
         * @param {string} memberName - 成员名称
         * @param {import('estree').Comment | null} jsdoc - JSDoc 注释
         */
        function checkAndReport(node, memberName, jsdoc) {
            if (!jsdoc || !jsdoc.value.includes('@private')) {
                context.report({
                    node,
                    message: `私有成员 "_${memberName}" 必须包含 @private JSDoc 标签。`,

                    fix(fixer) {
                        if (!jsdoc) {
                            // 完全没有注释，插入标准 JSDoc 块
                            return fixer.insertTextBefore(node, '/**\n * @private\n */\n');
                        }

                        // 已有注释但缺少 @private，插入到注释块内部末尾
                        if (!jsdoc.range) {
                            return fixer.insertTextBefore(node, '/**\n * @private\n */\n');
                        }

                        // 在结束符 '*/' 之前插入 '@private' 行
                        return fixer.insertTextBeforeRange([jsdoc.range[1] - 2, jsdoc.range[1]], '\n * @private');
                    },
                });
            }
        }

        /** @param {import('estree').MethodDefinition | import('estree').PropertyDefinition} node */
        function checkMember(node) {
            // 1. 类型守卫：只处理标识符名称（非 #私有字段）
            if (node.key.type !== 'Identifier' || !node.key.name.startsWith('_')) {
                return;
            }

            // 2. 获取当前节点的 JSDoc 注释块
            const jsdoc = getJSDocComment(node);

            checkAndReport(node, node.key.name.slice(1), jsdoc);
        }

        /**
         * @param {import('estree').AssignmentExpression & {
         *     parent: import('estree').Node;
         * }} node
         */
        function checkAssignment(node) {
            // 只处理 this._xxx 形式的赋值
            if (
                node.left.type !== 'MemberExpression' ||
                node.left.object.type !== 'ThisExpression' ||
                node.left.property.type !== 'Identifier' ||
                !node.left.property.name.startsWith('_')
            ) {
                return;
            }

            if (!isInsideClassMember(node)) {
                return;
            }

            const memberName = node.left.property.name.slice(1);

            // 注释通常附着在包含赋值表达式的语句节点上（ExpressionStatement）
            const statement = node.parent;
            if (statement.type !== 'ExpressionStatement') {
                return;
            }

            const jsdoc = getJSDocComment(statement);
            checkAndReport(statement, memberName, jsdoc);
        }

        return {
            MethodDefinition: checkMember,
            PropertyDefinition: checkMember,
            AssignmentExpression: checkAssignment,
        };
    },
};
