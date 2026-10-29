import type { Domain, EquipmentItem } from '../../app/types';

/**
 * 装备的色调。
 *
 * 跟着「这件装备练到什么程度」走，而不是随便上色：有特技 / 特效是金（最难出），
 * 打过宝石或锻炼是青，其余中性；玉魄整体走绿，与灵饰、常规装备分开。
 *
 * 板面的格子和详情弹窗的装备卡共用这一份判断——同一件装备在两处不能是两种颜色。
 */
export function equipmentTone(rules: Domain, eq: EquipmentItem): string {
    if (rules.isJade(eq.slot)) return 'var(--green)';
    const detail = rules.equipmentDetails(eq);
    if (detail.technique || detail.effects.length) return 'var(--gold)';
    // `bonus` 是打了宝石才有的属性行，不能只看 `gems` 列表——手填的档案常常只有前者。
    if (detail.gems.length || detail.bonus.length || detail.forge !== null) return 'var(--blue)';
    return 'var(--muted)';
}

/**
 * 印在头像右下角的那一个字：取玩家的口头叫法，不是机械截字。
 *
 * 「武器」取第二个字会得到「器」、「衣服」得「服」、「鞋子」得「子」——都不成字眼；
 * 真要跟部位对得上，只能用一张表。装备名千变万化，部位才是稳定的那一维，
 * 所以印的是部位而不是装备。
 */
const PART_SEALS: Record<string, string> = {
    头盔: '盔',
    项链: '链',
    武器: '武',
    衣服: '衣',
    腰带: '腰',
    鞋子: '鞋',
    戒指: '戒',
    耳饰: '耳',
    手镯: '镯',
    佩饰: '佩',
    '玉魄·阳': '阳',
    '玉魄·阴': '阴',
};

export function partSealOf(part: string): string {
    const chars = Array.from(part);
    return PART_SEALS[part] || chars[chars.length - 1] || part;
}

/**
 * 卡片右上角的等级。
 *
 * 玉魄没有装备等级，写的是灵尘总等级——游戏里玉魄的强弱就体现在这里，
 * 留空反而看不出好坏。其余部位按档案里的等级显示，未填就不占位。
 */
export function equipmentLevelText(rules: Domain, eq: EquipmentItem): string {
    const value = rules.isJade(eq.slot) ? rules.equipmentDetails(eq).jade.dust : eq.level;
    return value === '' || value == null ? '' : value + ' 级';
}
