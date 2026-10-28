/**
 * 把一次粘贴的文本拆成「一件一块」。
 *
 * 游戏里复制出来的装备文本没有统一的分隔符，这里按两种最可靠的信号切：
 * 1. 空行——从游戏里连续复制多件时通常一段一段隔开；
 * 2. 以「名称：」这类行开头——有的客户端复制出来没有空行，但每件都以名称起头。
 *
 * 其余情况整段当一件。认错了也不要紧：核对列表里可以逐条移除，或者只贴一件重新解析；
 * 相比之下，按空格或标点猜分隔反而会把一件装备拆坏。
 */
export function splitEquipmentBlocks(text: string): string[] {
    const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
    const blocks: string[] = [];
    let current: string[] = [];
    const flush = () => {
        const block = current.join('\n').trim();
        if (block) blocks.push(block);
        current = [];
    };
    for (const line of lines) {
        if (!line.trim()) {
            flush();
            continue;
        }
        const head = /^\s*(?:装备)?名称\s*[:：]/.test(line);
        // 名称行是新一件的起点：只有前面已经有内容时才切，否则第一件会被切出一个空块。
        if (head && current.some((item) => item.trim())) flush();
        current.push(line);
    }
    flush();
    return blocks;
}
