/**
 * 弹窗层级。
 *
 * 弹窗可以叠着开：记录列表上再开一个删除确认。叠起来之后有三件事必须按「最上层」
 * 处理，否则表现会很怪：
 *   - `Escape` 只关最上面那层，不能让外层先响应；
 *   - `Tab` 焦点循环只在上层内部转，不能落回被盖住的按钮；
 *   - 背景 inert 由最外层统一设置与移除。若每层各设一次，内层关闭时会把外层的
 *     inert 一起清掉，背景就提前恢复可交互了。
 */
const stack: number[] = [];
const listeners = new Set<() => void>();
let seed = 0;

function shell() {
    return document.getElementById('app-shell');
}
function notify() {
    listeners.forEach((fn) => fn());
}
/** 注册一层并返回它的 id；第一层负责给应用外壳加 inert。 */
export function openLayer() {
    const id = ++seed;
    stack.push(id);
    if (stack.length === 1) shell()?.setAttribute('inert', '');
    notify();
    return id;
}
/** 注销一层；只有回到零层时才解除 inert。 */
export function closeLayer(id: number) {
    const index = stack.indexOf(id);
    if (index >= 0) stack.splice(index, 1);
    if (!stack.length) shell()?.removeAttribute('inert');
    notify();
}
export function isTopLayer(id: number) {
    return stack[stack.length - 1] === id;
}
/** 层级变化订阅，用来让每层知道自己是不是最上面那层。 */
export function onLayerChange(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
