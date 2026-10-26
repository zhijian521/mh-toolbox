import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import { createDomain } from '../domain/create-domain.js';
import { desktop, plain } from '../services/desktop';
import type { AppData, AppInfo, Domain } from '../app/types';

export const useApplication = defineStore('application', () => {
    let domain: Domain;
    const data = shallowRef<AppData | null>(null);
    const info = shallowRef<AppInfo | null>(null);
    const loading = ref(true),
        startupError = ref(''),
        pending = ref(0);
    const toast = ref(''),
        toastError = ref(false);
    let toastTimer: ReturnType<typeof setTimeout>;
    const busy = computed(() => pending.value > 0);
    const characters = computed(() =>
        data.value
            ? [...data.value.characters].sort(
                  (a, b) =>
                      Number(a.sortOrder ?? Infinity) - Number(b.sortOrder ?? Infinity) ||
                      Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0),
              )
            : [],
    );
    function notify(message: string, error = false) {
        clearTimeout(toastTimer);
        toast.value = message;
        toastError.value = error;
        toastTimer = setTimeout(() => {
            toast.value = '';
        }, 4000);
    }
    async function initialize() {
        loading.value = true;
        startupError.value = '';
        try {
            const gateway = desktop();
            domain = createDomain({ gateway }) as unknown as Domain;
            await domain.init();
            data.value = plain(domain.state);
            info.value = await gateway.info();
        } catch (error) {
            startupError.value = error instanceof Error ? error.message : String(error);
        } finally {
            loading.value = false;
        }
    }
    function rules(): Domain {
        if (!domain) throw new Error('数据尚未就绪');
        return domain;
    }
    async function execute<T>(operation: (domain: Domain) => Promise<T>): Promise<T> {
        pending.value++;
        try {
            return plain(await operation(rules()));
        } finally {
            // Publish only settled snapshots. Rollback replaces domain.state and is published too.
            data.value = plain(rules().state);
            pending.value--;
        }
    }
    return {
        data,
        info,
        loading,
        startupError,
        busy,
        characters,
        toast,
        toastError,
        initialize,
        execute,
        rules,
        notify,
    };
});
