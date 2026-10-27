<script setup lang="ts">
import { nextTick, onErrorCaptured, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { reportRendererError } from '../app/error-reporting';
import PageHeader from './PageHeader.vue';

/**
 * 页面级错误边界。
 *
 * 只有两个页面时，一个页面渲染抛错最多是「这一块空白」；页面数量上来以后，同样的
 * 空白会出现在任意模块上——用户只看得到侧栏，既不知道发生了什么，也没有出路
 * （全局 errorHandler 只写日志，界面上什么都不会变）。
 *
 * 三件事：把失败页面换成可读的替代界面；先把错误按原样报给主进程日志；留两条出路。
 *
 * `onErrorCaptured` 返回 false 会终止向上冒泡，`app.config.errorHandler` 因此收不到
 * 同一个错误——这正是想要的，一个已知失败的页面不该再被当成「未处理异常」，但代价
 * 是上报必须在这里自己做，漏掉就等于错误彻底没了记录。
 *
 * 失败状态按路由重置：切换路由等同于放弃出错的页面，新的路由组件会重新挂载。
 */
const props = defineProps<{ resetKey?: string }>();
const router = useRouter();

interface Failure {
    message: string;
    stack: string;
    phase: string;
}

/** Vue 给出的 info 是英文短语，直接显示对用户没有意义，能认的翻掉，认不出就原样留着。 */
const phases: Record<string, string> = {
    'setup function': '组件初始化',
    'render function': '页面渲染',
    'component event handler': '事件处理',
    'component lifecycle hook': '生命周期回调',
    'watcher callback': '数据监听',
    'watcher getter': '数据监听',
    'directive hook': '指令回调',
    'transition hook': '过渡回调',
};

const failure = ref<Failure | null>(null);
const panel = ref<HTMLElement | null>(null);

onErrorCaptured((error, _instance, info) => {
    reportRendererError('组件渲染异常（' + info + '）', error);
    const detail = error instanceof Error ? error : new Error(String(error));
    failure.value = {
        message: detail.message || detail.name || '未知错误',
        stack: detail.stack ?? '',
        phase: phases[info] ?? info,
    };
    // 焦点随着失败子树一起消失，交给替代界面，键盘用户不至于掉回文档开头。
    void nextTick(() => panel.value?.focus());
    return false;
});

watch(
    () => props.resetKey,
    () => {
        failure.value = null;
    },
);

/** 重开当前页：清掉失败状态后，路由组件会重新挂载一次。 */
function retry() {
    failure.value = null;
}

function backToCharacters() {
    // 已在角色页时 push 不会触发路由变化，也就不会有重置，直接清状态重挂。
    if (router.currentRoute.value.path === '/characters') {
        failure.value = null;
        return;
    }
    // 交给路由：path 一变，上面的 watch 就清掉失败状态，避免先渲染一帧受伤的旧页面。
    void router.push('/characters');
}
</script>

<template>
    <slot v-if="!failure" />
    <template v-else>
        <PageHeader
            title="页面出错了"
            description="这个页面在渲染时出现异常，已经停在这里；其他页面和已保存的手账数据不受影响。"
        >
            <template #actions>
                <button class="btn compact" @click="retry">重开此页面</button>
                <button class="btn compact primary" @click="backToCharacters">返回角色页</button>
            </template>
        </PageHeader>
        <div class="page-content">
            <section
                ref="panel"
                class="boundary-panel"
                tabindex="-1"
                aria-labelledby="boundary-title"
            >
                <h2 id="boundary-title">这个页面没能显示</h2>
                <p class="boundary-message">{{ failure.message }}</p>
                <p class="hint">
                    错误发生在{{
                        failure.phase
                    }}。详细信息已写入应用日志；重开此页面通常就能恢复，若反复出现，请把日志一并反馈。
                </p>
                <details v-if="failure.stack" class="boundary-detail">
                    <summary>技术细节</summary>
                    <pre>{{ failure.stack }}</pre>
                </details>
            </section>
        </div>
    </template>
</template>

<style scoped>
.boundary-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-width: 680px;
    padding: 18px 20px;
    border: 1px solid #b33a3a40;
    border-radius: 5px;
    background: var(--paper);
}
.boundary-panel:focus {
    outline: none;
}
.boundary-message {
    padding: 9px 11px;
    border-radius: 4px;
    background: #b33a3a0a;
    color: var(--red);
    font-size: 13px;
    line-height: 1.6;
    word-break: break-word;
}
.boundary-detail summary {
    font-size: 12px;
}
.boundary-detail pre {
    max-height: 260px;
    overflow: auto;
    margin-top: 8px;
    padding: 9px 11px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--paper-2);
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 11.5px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-all;
}
</style>
