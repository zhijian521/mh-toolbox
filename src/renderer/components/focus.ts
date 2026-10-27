/**
 * 可聚焦元素的判定，`BaseModal` 的焦点循环与弹层的 Tab 接力共用。
 *
 * 两处必须是同一份规则：`BaseModal` 在列表两端会绕回另一端，如果弹层用的是另一套
 * 选择器，「下一格」和绕回落点就会对不上，焦点会跳过控件或者干脆跳回页面开头。
 *
 * 排除三类：
 *   - `:disabled`；
 *   - `[inert]` 子树：弹窗打开时整个应用外壳被设为 inert；
 *   - `tabIndex < 0`，即显式写了 `tabindex="-1"` 的元素。`BaseNumber` 的加减箭头、
 *     下拉的 `.xitem` 选项都属于这类——只接受程序聚焦，不参与 Tab 序列。
 *     早先选择器直接写 `button`，把箭头按钮也算进来了，Shift+Tab 会停在减号上。
 *
 * 只取有渲染盒的元素，避免把 `display:none` 或未挂载的节点排进序列。
 */
const TABBABLE = 'button, input, select, textarea, a[href], [tabindex]';

export function tabbable(root: ParentNode = document): HTMLElement[] {
    return [...root.querySelectorAll<HTMLElement>(TABBABLE)].filter(
        (element) =>
            !element.matches(':disabled') &&
            !element.closest('[inert]') &&
            element.tabIndex >= 0 &&
            element.getClientRects().length,
    );
}
