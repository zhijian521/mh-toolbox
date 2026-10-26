// Migrated from the immutable v1 baseline; see migration/baseline.json.
export default function install(D, U, gateway, localStorage) {
    /* 角色与目标共用养成指标；中文分组/名称保持与已有历史快照兼容。 */
    Object.assign(D, {
        growthMetrics: [
            { v: 'auxiliarySkills', t: '辅助技能', group: '辅助技能', kind: 'skills', unit: '级' },
            {
                v: 'training',
                t: '人物修炼',
                group: '人物修炼',
                kind: 'training',
                unit: '级',
                fields: D.characterTraining,
            },
            {
                v: 'petTraining',
                t: '召唤兽修炼',
                group: '召唤兽修炼',
                kind: 'training',
                unit: '级',
                fields: D.petTraining,
            },
            { v: 'schoolSkills', t: '师门技能', group: '师门技能', kind: 'skills', unit: '级' },
            {
                v: 'level',
                t: '角色等级',
                group: '基础信息',
                label: '等级',
                kind: 'level',
                unit: '级',
            },
            { v: 'qianyuanPills', t: '乾元丹', group: '其他养成', kind: 'quantity', unit: '个' },
            { v: 'potentialFruits', t: '潜能果', group: '其他养成', kind: 'quantity', unit: '个' },
        ],

        growthCategory(category) {
            return this.growthMetrics.find((metric) => metric.v === category);
        },

        growthMetric(category, key = '') {
            const metric = this.growthCategory(category);
            if (!metric) throw new Error('未知的角色养成项目');
            let label = metric.label || metric.t;
            if (metric.kind === 'skills') {
                if (typeof key !== 'string' || !key.trim()) throw new Error('请选择技能');
                label = key;
            } else if (metric.kind === 'training') {
                const field = metric.fields.find((item) => item.key === key);
                if (!field) throw new Error('未知的修炼项目');
                label = field.label;
            }
            return { ...metric, key, label };
        },

        growthMetricOptions(category, characters = []) {
            const metric = this.growthCategory(category);
            if (metric?.kind === 'training')
                return metric.fields.map((field) => ({ v: field.key, t: field.label }));
            if (metric?.kind !== 'skills') return [];
            const names =
                category === 'auxiliarySkills'
                    ? this.auxiliarySkillNames
                    : characters.flatMap(
                          (character) => this.schoolSkillNames[character.school] || [],
                      );
            return [
                ...new Set([
                    ...names,
                    ...characters.flatMap((character) =>
                        this.normalizeCharacterProgress(character.progress)[category].map(
                            (skill) => skill.name,
                        ),
                    ),
                ]),
            ].map((name) => ({ v: name, t: name }));
        },

        growthValue(character, category, key, { requireSkill = false } = {}) {
            if (!character) throw new Error('角色不存在');
            const metric = this.growthCategory(category);
            if (!metric) return null;
            if (metric.kind === 'level') return this.characterNumber(character.level);
            const progress = character.progress || {};
            if (metric.kind === 'skills') {
                const skill = (progress[category] || []).find((item) => item.name === key);
                if (!skill && requireSkill) throw new Error('该技能已变更，请重新打开快捷编辑');
                return this.characterNumber(skill?.level);
            }
            return this.characterNumber(
                metric.kind === 'training' ? progress[category]?.[key] : progress[category],
            );
        },

        /** 纯草稿构造函数；由调用方在现有事务内交给 applyCharacter，一次保存及回滚。 */
        characterValueChanges(character, category, key, input, { allowMissingSkill = false } = {}) {
            if (!character) throw new Error('角色不存在');
            const metric = this.growthMetric(category, key),
                value = this.characterNumber(input);
            if (input != null && input !== '' && value === null)
                throw new Error('请填写非负整数或留空');
            if (metric.kind === 'level') return { level: value };
            const progress = this.normalizeCharacterProgress(character.progress);
            if (metric.kind === 'skills') {
                const skill = progress[category].find((item) => item.name === key);
                if (skill) skill.level = value;
                else if (allowMissingSkill) progress[category].push({ name: key, level: value });
                else throw new Error('该技能已变更，请重新打开快捷编辑');
            } else if (metric.kind === 'training') progress[category][key] = value;
            else progress[category] = value;
            return { progress };
        },
    });

    // 下拉选项沿用原 API，由同一份指标定义派生。
    D.goalMetrics = D.growthMetrics.map(({ v, t, unit }) => ({ v, t, unit }));
}
