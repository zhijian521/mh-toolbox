import { ref, type Ref } from 'vue';

/**
 * 预览图上的框选裁剪。
 *
 * 只处理 DOM 与指针：坐标换算、选区方框、把选区按原图像素裁下来。识别、队列、入库
 * 一概不知道——裁完把 dataURL 丢给回调，剩下的事由调用方决定（这里是「换图重识别」）。
 *
 * 坐标要按 `naturalWidth / clientWidth` 换回原图像素：预览是缩到 250px 宽的，直接拿
 * 屏幕坐标去裁只会得到左上角一小块。
 */
export function useImageCrop(onCropped: (dataUrl: string) => void) {
    const cropping = ref(false);
    const cropReady = ref(false);
    const preview: Ref<HTMLElement | undefined> = ref();
    const cropBox: Ref<HTMLElement | undefined> = ref();

    let start: { x: number; y: number } | null = null;
    let rectangle: { x: number; y: number; width: number; height: number } | null = null;

    function pointOf(event: PointerEvent) {
        const image = preview.value?.querySelector('img');
        if (!image) return { x: 0, y: 0 };
        const bounds = image.getBoundingClientRect();
        return {
            x: Math.max(0, Math.min(bounds.width, event.clientX - bounds.left)),
            y: Math.max(0, Math.min(bounds.height, event.clientY - bounds.top)),
        };
    }
    function begin() {
        cropping.value = true;
        cropReady.value = false;
        rectangle = null;
        if (cropBox.value) cropBox.value.hidden = true;
    }
    function cancel() {
        cropping.value = false;
        cropReady.value = false;
        rectangle = null;
        start = null;
        if (cropBox.value) cropBox.value.hidden = true;
    }
    function onPointerDown(event: PointerEvent) {
        if (!cropping.value || event.button !== 0) return;
        event.preventDefault();
        start = pointOf(event);
        rectangle = null;
        cropReady.value = false;
        if (cropBox.value) cropBox.value.hidden = true;
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    }
    function onPointerMove(event: PointerEvent) {
        if (!start) return;
        const end = pointOf(event);
        const image = preview.value?.querySelector('img');
        if (!image) return;
        rectangle = {
            x: Math.min(start.x, end.x),
            y: Math.min(start.y, end.y),
            width: Math.abs(start.x - end.x),
            height: Math.abs(start.y - end.y),
        };
        if (cropBox.value) {
            cropBox.value.hidden = false;
            Object.assign(cropBox.value.style, {
                left: rectangle.x + image.offsetLeft + 'px',
                top: rectangle.y + image.offsetTop + 'px',
                width: rectangle.width + 'px',
                height: rectangle.height + 'px',
            });
            cropReady.value = rectangle.width >= 16 && rectangle.height >= 16;
        }
    }
    function end() {
        start = null;
    }
    function apply() {
        const image = preview.value?.querySelector('img');
        if (!image || !rectangle || !cropReady.value || !image.naturalWidth) return;
        // 预览是缩放过的，按 naturalWidth / clientWidth 换回原图像素再裁。
        const scale = image.naturalWidth / image.clientWidth;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(rectangle.width * scale);
        canvas.height = Math.round(rectangle.height * scale);
        canvas
            .getContext('2d')!
            .drawImage(
                image,
                rectangle.x * scale,
                rectangle.y * scale,
                rectangle.width * scale,
                rectangle.height * scale,
                0,
                0,
                canvas.width,
                canvas.height,
            );
        const dataUrl = canvas.toDataURL('image/png');
        cancel();
        onCropped(dataUrl);
    }

    return {
        cropping,
        cropReady,
        preview,
        cropBox,
        begin,
        cancel,
        apply,
        onPointerDown,
        onPointerMove,
        end,
    };
}
