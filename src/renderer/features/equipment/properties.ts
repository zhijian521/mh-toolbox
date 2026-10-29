import type { Domain, EquipmentItem } from '../../app/types';

/** 编辑中的词条行：数值留空存 null，保存前由 `pruneDetail` 把这一行丢掉。 */
export interface DraftRow {
    key: string;
    value: number | null;
    boost: number | null;
}
/**
 * 属性编辑器的草稿：与领域结构一致，只是词条行的数值允许「还没填」。
 *
 * 这里逐字段写出来而不是 `Omit<EquipmentDetail, ...>`：`EquipmentDetail` 带
 * `[field: string]: any` 索引签名，`Omit` 会把显式字段一起抹平，词条数组退化成
 * `any[]`，`rows.find((row) => ...)` 之类就全是隐式 any。
 */
export type DraftDetail = {
    version: number;
    base: DraftRow[];
    extra: DraftRow[];
    bonus: DraftRow[];
    melt: DraftRow[];
    technique: string;
    effects: string[];
    forge: number | null;
    gems: EquipmentGem[];
    clock: { name: string; level: number | null };
    suit: string;
    element: string;
    durability: number | null;
    repair: number | null;
    maker: string;
    runes: string;
    jade: EquipmentJade;
    legacy: string;
};

/**
 * 把编辑器的草稿收敛成领域要的属性：没填数值的词条整行丢掉。
 *
 * 空行留着会被 `validateEquipmentDetails` 判成「请填写…的数值」——用户只是点了一下
 * 「添加」还没填，不该被当成错误拦下来。反过来说，填了 0 的行必须保留：0 与「没记录」
 * 在装备属性里是两件事。
 */
export function pruneDetail(draft: DraftDetail): EquipmentDetail {
    const rows = (list: DraftRow[]): EquipmentRow[] =>
        list
            .filter((row) => row.key && row.value !== null)
            .map((row) => ({
                key: row.key,
                value: Number(row.value),
                boost: row.boost == null ? null : Number(row.boost),
            }));
    return {
        ...draft,
        base: rows(draft.base),
        extra: rows(draft.extra),
        bonus: rows(draft.bonus),
        melt: rows(draft.melt),
    } as EquipmentDetail;
}

/** 属性行的视觉分组，只决定文字颜色，不参与语义。 */
export type PropertyKind = 'attribute' | 'gem' | 'special' | 'upgrade' | 'legacy';

export interface PropertyRow {
    label: string;
    value: string;
    kind: PropertyKind;
}

/**
 * 一条词条写成「伤害 +480 [强化 +30]」。
 *
 * 领域里的 `equipmentStatText` 用的是 ASCII 连字符，界面上负号要写成 U+2212 才和
 * 页面其它数字一致，所以这里自己拼而不直接用它。
 */
function statText(label: string, row: EquipmentRow) {
    const sign = row.value >= 0 ? '+' : '−';
    const boost = row.boost == null ? '' : ` [${row.boost >= 0 ? '+' : '−'}${Math.abs(row.boost)}]`;
    return `${label} ${sign}${Math.abs(row.value)}${boost}`;
}

/**
 * 把装备属性摊平成「标签 + 值」的行。格子、仓库、选装、详情四处共用同一份口径。
 *
 * 主要属性合成一行（游戏里就是并排显示的两条），其余每条一行。**一处不折叠**：
 * 2026-10-29 用户要求「属性全部展示、不折叠」，所以原先只在详情里出现的钟灵石、
 * 套装、符石、灵尘、奇袭、开光孔、原有属性，现在四处都列出来——它们是这件装备的
 * 完整配置，收起来反而要挨个点开比对。
 *
 * 反过来，五行、耐久、修理失败、制造者**不列**：这四项不参与比较，也不影响要不要
 * 换装，摆进格子只会把真正要看的属性挤下去。数据仍然完整保存，编辑器里照旧能改。
 *
 * 属性为空时返回空数组而不是占位行：调用方需要区分「没录」和「录了但是 0」，
 * 由各自决定要不要显示「未录入属性」。
 */
export function propertyRows(rules: Domain, eq: EquipmentItem): PropertyRow[] {
    const detail = rules.equipmentDetails(eq);
    const rule = rules.equipmentRule(eq.slot);
    const label = (key: string) => rules.equipmentStats[key] || key;
    const rows: PropertyRow[] = [];
    const add = (name: string, value: unknown, kind: PropertyKind = 'attribute') => {
        if (value === '' || value == null || value === undefined) return;
        rows.push({ label: name, value: String(value), kind });
    };

    if (detail.base.length)
        add('', detail.base.map((row) => statText(label(row.key), row)).join(' · '), 'attribute');
    detail.extra.forEach((row) => add('', statText(label(row.key), row), 'attribute'));
    // 宝石属性里与主要属性同 key 的不再重复列一遍，否则「伤害」会出现两次。
    detail.bonus
        .filter((row) => !detail.base.some((base) => base.key === row.key))
        .forEach((row) => add('宝石', statText(label(row.key), row), 'gem'));
    detail.melt.forEach((row) => add('熔炼', statText(label(row.key), row), 'attribute'));
    add('特技', detail.technique, 'special');
    detail.effects.forEach((effect) => add('特效', effect, 'special'));
    if (detail.clock.name)
        add('钟灵石', `${detail.clock.name} ${detail.clock.level} 级`, 'special');

    // 锻炼段数、宝石与精炼合成一行：它们都是「这件装备打到什么程度」。
    const socket: string[] = [];
    if (detail.forge !== null) socket.push(detail.forge + ' 段');
    if (rule.kind === 'accessory' && detail.forge !== null) socket.push('星辉石');
    // 宝石段数通常就等于锻炼等级，这时候再写一遍「（12 段）」只是噪声。
    detail.gems.forEach((gem) =>
        socket.push(
            gem.level == null || gem.level === detail.forge
                ? gem.type
                : `${gem.type}（${gem.level} 段）`,
        ),
    );
    if (socket.length)
        add(
            rule.kind === 'accessory' ? '精炼' : detail.forge === null ? '宝石' : '锻炼',
            socket.join(' '),
            'upgrade',
        );

    add('套装', detail.suit, 'special');
    add('符石', detail.runes, 'upgrade');
    if (rule.kind === 'jade') {
        if (detail.jade.dust !== null) add('灵尘', `${detail.jade.dust} 级`, 'upgrade');
        if (detail.jade.assault)
            // 游戏里写「奇袭法术」，标签已经是「奇袭」，值里再去掉这两个字，
            // 否则列表读起来是「奇袭 奇袭法术 0.5%」。
            add(
                '奇袭',
                String(detail.jade.assault).replace(/^奇袭/, '') +
                    (detail.jade.chance == null ? '' : ` ${detail.jade.chance}%`),
                'special',
            );
        if (detail.jade.holes) add('开光', `${detail.jade.holes} 孔`, 'upgrade');
        detail.jade.enchantments.forEach((value, index) =>
            add(`孔 ${index + 1}`, value || '未强化', 'special'),
        );
    }
    if (detail.legacy) add('原有属性', detail.legacy, 'legacy');
    return rows;
}
