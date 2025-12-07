
import * as ort from 'onnxruntime-web';
import type { ClubData } from './clubDetection'; // Reuse interface

// Configuration
const MODEL_PATH = '/models/club_seg_v1.onnx'; // Expected in public/models
const INPUT_SIZE = 640;
const CONF_THRESHOLD = 0.5;
const CLASS_SHAFT = 1; // Assuming 0=Grip, 1=Shaft, 2=Head

let session: ort.InferenceSession | null = null;

/**
 * Initialize ONNX session
 */
export async function initClubModel() {
    if (session) return;
    try {
        console.log('Loading Club Segmentation Model...');
        session = await ort.InferenceSession.create(MODEL_PATH, {
            executionProviders: ['wasm'], // or 'webgl' if available
        });
        console.log('Model loaded successfully');
    } catch (e) {
        console.error('Failed to load club model:', e);
    }
}

/**
 * Preprocess image for YOLOv8 (Resize, Normalize, CHW)
 */
function preprocess(image: HTMLCanvasElement | HTMLImageElement | HTMLVideoElement): ort.Tensor | null {
    const canvas = document.createElement('canvas');
    canvas.width = INPUT_SIZE;
    canvas.height = INPUT_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Draw and Resize
    ctx.drawImage(image, 0, 0, INPUT_SIZE, INPUT_SIZE);

    // Get Pixel Data
    const imageData = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);
    const { data } = imageData;

    // CHW Layout: 1 x 3 x 640 x 640
    // Float32 input, normalized 0-1
    const size = INPUT_SIZE * INPUT_SIZE;
    const float32Data = new Float32Array(3 * size);

    for (let i = 0; i < size; i++) {
        const r = data[i * 4] / 255.0;
        const g = data[i * 4 + 1] / 255.0;
        const b = data[i * 4 + 2] / 255.0;

        // R
        float32Data[i] = r;
        // G
        float32Data[i + size] = g;
        // B
        float32Data[i + 2 * size] = b;
    }

    return new ort.Tensor('float32', float32Data, [1, 3, INPUT_SIZE, INPUT_SIZE]);
}

/**
 * Detect club from full frame using ML
 */
export async function detectClubML(video: HTMLVideoElement): Promise<ClubData | null> {
    if (!session) {
        await initClubModel();
        if (!session) return null;
    }

    try {
        // Preprocess
        const input = preprocess(video);
        if (!input) return null;

        // Run Inference
        const feeds: Record<string, ort.Tensor> = {};
        const inputName = session.inputNames[0];
        feeds[inputName] = input;

        const results = await session.run(feeds);

        // Output processing logic depends on YOLOv8 export format.
        // Usually output0: [1, 4 + nc + num_masks, 8400]
        // output1: [1, 32, 160, 160] (Proto masks) if segmentation

        // Parsing YOLOv8 output in JS is complex. 
        // For MVP, we presume we get raw tensors and need NMS+Mask decoding.
        // This is heavy.
        // Alternative: Use a library or valid post-processing snippet.
        // Given complexity, we might check if 'yolov8n-pose' (pose) is easier? 
        // But dataset is segmentation.

        // Post-processing logic (Simplied placeholder until implemented properly)
        // We need to parse matching detection for Class 1 (Shaft).

        // TODO: Full YOLOv8 Post-processing (NMS, Mask Prototype multiplication)
        // This requires ~200 lines of matrix math code.

        return null; // Placeholder until Post-processing is ported

    } catch (e) {
        console.error('Inference error:', e);
        return null;
    }
}
