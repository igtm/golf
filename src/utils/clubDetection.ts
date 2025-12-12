import * as ort from 'onnxruntime-web';
import type { ClubData, PoseLandmark } from '../types/swing';


// Model Configuration
const MODEL_PATH = '/models/best.onnx';
const MODEL_INPUT_SIZE = 320;
const CONFIDENCE_THRESHOLD = 0.2; // Lowered back to 0.2 now that hybrid logic provides stability
const IOU_THRESHOLD = 0.45;
const MASK_THRESHOLD = 0.2;

// Class Filtering
// Candidates: 0 (Grip?), 1 (Shaft?), 3 (Head?) -> Need to verify which is which on UI
const TARGET_CLASS_ID = 1;

// Constants for pre-processing
const NUM_CLASSES = 3; // 0, 1, 3 based on data.yaml
const NUM_MASKS = 32;  
const SMOOTHING_FACTOR = 0.3; // Weight for new data (0.3 = moderate smoothing)

let inferenceSession: ort.InferenceSession | null = null;
let isLoading = false;
let lastAngle: number | null = null; // Store last valid angle for EMA

// Helper to sigmoid function
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/**
 * Initializes the ONNX Runtime session
 */
const initSession = async () => {
    if (inferenceSession || isLoading) return;
    
    // Configure WASM paths
    ort.env.wasm.wasmPaths = import.meta.env.DEV 
        ? '/node_modules/onnxruntime-web/dist/' 
        : '/';

    // Optimization: Enable Multi-threading & Proxy
    ort.env.wasm.numThreads = navigator.hardwareConcurrency || 4;
    ort.env.wasm.proxy = true; 

    try {
        isLoading = true;
        
        console.log(`[ClubDetection] Initializing model with threads=${ort.env.wasm.numThreads}`);

        // Try WebGPU first, then WASM
        const options: ort.InferenceSession.SessionOptions = {
            executionProviders: ['webgpu', 'wasm', 'webgl'], 
            graphOptimizationLevel: 'all'
        };

        inferenceSession = await ort.InferenceSession.create(MODEL_PATH, options);
        
        console.log('[ClubDetection] Model loaded successfully');
    } catch (e) {
        console.error('[ClubDetection] Failed to load model:', e);
        throw e;
    } finally {
        isLoading = false;
    }
};

/**
 * Preprocess image: Resize to 320x320 and normalize
 * Returns tensor and scale information for restoring coordinates
 */
const preprocess = (video: HTMLVideoElement | HTMLImageElement |  HTMLCanvasElement): { tensor: ort.Tensor; scale: number; xPadding: number; yPadding: number } => {
    const canvas = document.createElement('canvas');
    canvas.width = MODEL_INPUT_SIZE;
    canvas.height = MODEL_INPUT_SIZE;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    if (!ctx) throw new Error('Could not get 2D context');

    // Letterbox resizing (maintain aspect ratio)
    const w = video.width || (video as HTMLVideoElement).videoWidth;
    const h = video.height || (video as HTMLVideoElement).videoHeight;
    const scale = Math.min(MODEL_INPUT_SIZE / w, MODEL_INPUT_SIZE / h);
    const nw = Math.round(w * scale);
    const nh = Math.round(h * scale);
    const xPadding = (MODEL_INPUT_SIZE - nw) / 2;
    const yPadding = (MODEL_INPUT_SIZE - nh) / 2;

    // Fill with gray (114) like YOLO training
    ctx.fillStyle = '#727272';
    ctx.fillRect(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
    
    // Draw scaled image
    ctx.drawImage(video, xPadding, yPadding, nw, nh);

    // Get image data
    const imageData = ctx.getImageData(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
    const { data } = imageData;

    // Create tensor (1, 3, 320, 320) - BCHW
    const float32Data = new Float32Array(3 * MODEL_INPUT_SIZE * MODEL_INPUT_SIZE);
    
    for (let i = 0; i < MODEL_INPUT_SIZE * MODEL_INPUT_SIZE; i++) {
        // Red
        float32Data[i] = data[i * 4] / 255.0;
        // Green
        float32Data[MODEL_INPUT_SIZE * MODEL_INPUT_SIZE + i] = data[i * 4 + 1] / 255.0;
        // Blue
        float32Data[2 * MODEL_INPUT_SIZE * MODEL_INPUT_SIZE + i] = data[i * 4 + 2] / 255.0;
    }

    const tensor = new ort.Tensor('float32', float32Data, [1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE]);
    
    return { tensor, scale, xPadding, yPadding };
};

/**
 * Detect club in video frame
 */
export async function detectClub(
    video: HTMLVideoElement,
    landmarks: PoseLandmark[], 
    _width?: number,
    _height?: number
): Promise<ClubData | null> {
    if (!inferenceSession) {
        console.log('[ClubDetection] v3.2 Checking session...');
        await initSession();
    }
    if (!inferenceSession) {
        console.error('[ClubDetection] Session failed to initialize');
        return null;
    }

    try {
        const { tensor, scale, xPadding, yPadding } = preprocess(video);
        
        const feeds = { [inferenceSession.inputNames[0]]: tensor };
        const results = await inferenceSession.run(feeds);
        
        const output0 = results[inferenceSession.outputNames[0]]; 
        const output1 = results[inferenceSession.outputNames[1]]; 
        
        if (!output0 || !output1) return null;

        const data = output0.data as Float32Array;
        const dims = output0.dims; 
        const numAnchors = dims[2];

        // Store best detection per class
        // Index 0: Shaft (Class 0)
        // Index 1: Head (Class 1)
        const bestDetections = new Map<number, { score: number; box: number[]; index: number; maskCoeffs: number[] }>();

        // Iterate over all anchors
        for (let i = 0; i < numAnchors; i++) {
            // Check specific classes
            // We care about Class 0 (Shaft) and Class 1 (Head)
            // Model outputs: 0, 1, 2 (mapped to 0, 1, 3)
            const targetIndices = [0, 1]; 

            for (const c of targetIndices) {
                const val = data[(4 + c) * numAnchors + i];
                // Store separate best for each class
                const currentBest = bestDetections.get(c);
                if (!currentBest || val > currentBest.score) {
                    if (val > CONFIDENCE_THRESHOLD) { // 0.5
                        // Decode box
                        const cx = data[0 * numAnchors + i];
                        const cy = data[1 * numAnchors + i];
                        const w = data[2 * numAnchors + i];
                        const h = data[3 * numAnchors + i];
                        const x1 = cx - w / 2;
                        const y1 = cy - h / 2;
                        const x2 = cx + w / 2;
                        const y2 = cy + h / 2;

                        const coeffs: number[] = [];
                        for (let j = 0; j < NUM_MASKS; j++) {
                            coeffs.push(data[(4 + NUM_CLASSES + j) * numAnchors + i]);
                        }

                        bestDetections.set(c, {
                            score: val,
                            box: [x1, y1, x2, y2],
                            index: i,
                            maskCoeffs: coeffs
                        });
                    }
                }
            }
        }

        // Priority 1: Head (Class 1)
        const headDetection = bestDetections.get(1);
        if (headDetection) {
            console.log(`[ClubDetection] Found Head (Class 1) with score ${headDetection.score.toFixed(2)}`);
            // Run Mask Logic for Head
            const headResult = processMask(headDetection, output1, scale, xPadding, yPadding, landmarks, video);
            
            // NEW LOGIC: If processMask returns null (because mask was too small), 
            // we do NOT return here. We let it fall through to the Shaft Detection below.
            if (headResult) {
                 return headResult;
            }
            console.log('[ClubDetection] Head found but mask validation failed. Trying fallback to Shaft...');
        }

        // Priority 2: Shaft (Class 0) - Fallback
        const shaftDetection = bestDetections.get(0);
        if (shaftDetection) {
            console.log(`[ClubDetection] Head missing. Fallback to Shaft (Class 0). Score ${shaftDetection.score.toFixed(2)}`);
            // Geometric Inference: Hands -> Farthest Shaft Corner
            return processShaftFallback(shaftDetection, video, landmarks, scale, xPadding, yPadding);
        }

        return null;

    } catch (e) {
        console.error('[ClubDetection] Inference Error:', e);
        return null;
    }
}

// Fallback using Shaft Box
function processShaftFallback(
    detection: { score: number; box: number[] },
    video: HTMLVideoElement,
    landmarks: PoseLandmark[],
    scale: number, 
    xPadding: number, 
    yPadding: number
): ClubData | null {
    if (!landmarks || landmarks.length <= 16) return null;

    // 1. Get Hands Position (Video Coordinates)
    const videoW = video.videoWidth || video.width;
    const videoH = video.videoHeight || video.height;
    const leftWrist = landmarks[15];
    const rightWrist = landmarks[16];
    const handX = ((leftWrist.x + rightWrist.x) / 2) * videoW;
    const handY = ((leftWrist.y + rightWrist.y) / 2) * videoH;

    // 2. Get Shaft Box Corners (Video Coordinates)
    const b = detection.box; // [x1, y1, x2, y2] in 640 space
    // Convert to video space
    const corners = [
        { x: (b[0] - xPadding) / scale, y: (b[1] - yPadding) / scale }, // Top-Left
        { x: (b[2] - xPadding) / scale, y: (b[1] - yPadding) / scale }, // Top-Right
        { x: (b[2] - xPadding) / scale, y: (b[3] - yPadding) / scale }, // Bottom-Right
        { x: (b[0] - xPadding) / scale, y: (b[3] - yPadding) / scale }  // Bottom-Left
    ];

    // 3. Find Corner Furthest from Hands
    let maxDist = -1;
    let furthestCorner = corners[0];

    for (const p of corners) {
        const dist = Math.sqrt(Math.pow(p.x - handX, 2) + Math.pow(p.y - handY, 2));
        if (dist > maxDist) {
            maxDist = dist;
            furthestCorner = p;
        }
    }

    // 4. Calculate Angle
    const vecX = furthestCorner.x - handX;
    const vecY = furthestCorner.y - handY;
    const angle = Math.atan2(vecY, vecX) * (180 / Math.PI);

    return {
        angle: angle,
        score: detection.score * 0.8, // Penalize confidence
        debugPoint: {
            x: furthestCorner.x / videoW,
            y: furthestCorner.y / videoH
        }
    };
}

/**
 * Process the mask for a detection (Used for Head)
 */
 function processMask(
    detection: { score: number; box: number[]; maskCoeffs: number[] },
    output1: ort.Tensor,
    scale: number,
    xPadding: number,
    yPadding: number,
    landmarks: PoseLandmark[],
    video: HTMLVideoElement
): ClubData | null {

    const proto = output1.data as Float32Array;
    const protoDims = output1.dims; // [1, 32, 160, 160]
    const mh = protoDims[2]; 
    const mw = protoDims[3]; 

    // Box bounds in input space (640x640)
    const b = detection.box;
    const x1 = Math.round(Math.max(0, b[0]));
    const y1 = Math.round(Math.max(0, b[1]));
    const x2 = Math.round(Math.min(MODEL_INPUT_SIZE, b[2]));
    const y2 = Math.round(Math.min(MODEL_INPUT_SIZE, b[3]));

    if (x2 <= x1 || y2 <= y1) return null;

    const maskPixels: { x: number, y: number }[] = [];

    for (let y = y1; y < y2; y++) {
        for (let x = x1; x < x2; x++) {
            // Map 640x640 -> 160x160
            const mx = Math.floor(x * (mw / MODEL_INPUT_SIZE));
            const my = Math.floor(y * (mh / MODEL_INPUT_SIZE));
            
            // Limit checks
            if (mx >= mw || my >= mh) continue;

            // Dot product: maskCoeffs * proto(:, my, mx)
            let sum = 0;
            for (let i = 0; i < NUM_MASKS; i++) {
                // Proto is implicitly flattened: [channel, y, x]
                // index = i * (mh * mw) + my * mw + mx
                sum += detection.maskCoeffs[i] * proto[i * mh * mw + my * mw + mx];
            }

            if (sigmoid(sum) > MASK_THRESHOLD) {
                // Point in the mask.
                // Map back to video coordinates using scale/padding
                const finalX = (x - xPadding) / scale;
                const finalY = (y - yPadding) / scale;
                maskPixels.push({ x: finalX, y: finalY });
            }
        }
    }

    if (!landmarks || landmarks.length <= 16) return null;
    const leftWrist = landmarks[15];
    const rightWrist = landmarks[16];
    const videoW = video.videoWidth || video.width;
    const videoH = video.videoHeight || video.height;
    
    // Hands center in video coords
    const hX = ((leftWrist.x + rightWrist.x) / 2) * videoW;
    const hY = ((leftWrist.y + rightWrist.y) / 2) * videoH;

    // Vector from Hands to Mask Center
    const vecAngle = Math.atan2(y2 - y1, x2 - x1); // Initial Placeholder

    let center: { x: number, y: number };
    let rawAngle = 0;

    // Head Fallback Strategy:
    // If mask is too small, return null so we can fallback to Shaft (Class 0) in the main loop.
    if (maskPixels.length < 3) {
        return null;
    } 

    const pca = computePCA(maskPixels);
    center = pca.center;
    rawAngle = pca.angle * (180 / Math.PI);
    
    let finalAngle = rawAngle;

    // Orientation correction with hands
    if (landmarks && landmarks.length > 16) {
        // Normal PCA correction
        const vecX = center.x - hX;
        const vecY = center.y - hY;
        const vecAngle = Math.atan2(vecY, vecX) * (180 / Math.PI);

        let diff = Math.abs(finalAngle - vecAngle);
        if (diff > 180) diff = 360 - diff;
        if (diff > 90) finalAngle += 180;
        
        if (finalAngle > 180) finalAngle -= 360;
        if (finalAngle < -180) finalAngle += 360;
    }

    // Apply Smoothing
    if (lastAngle !== null) {
        let d = finalAngle - lastAngle;
        if (d > 180) d -= 360;
        if (d < -180) d += 360;
        
        finalAngle = lastAngle + d * SMOOTHING_FACTOR;
        
        if (finalAngle > 180) finalAngle -= 360;
        if (finalAngle < -180) finalAngle += 360;
    }
    lastAngle = finalAngle;

    return { 
        angle: finalAngle, 
        score: detection.score,
        debugPoint: {
            x: center.x / videoW,
            y: center.y / videoH
        }
    };
}

/**
 * Simple NMS implementation
 */
function nms(boxes: number[][], scores: number[], iouThreshold: number): number[] {
    const indices = Array.from(Array(scores.length).keys());
    
    // Sort by score descending
    indices.sort((a, b) => scores[b] - scores[a]);
    
    const picked: number[] = [];
    
    while (indices.length > 0) {
        const current = indices.shift()!;
        picked.push(current);
        
        const removeIndices: number[] = [];
        for (let i = 0; i < indices.length; i++) {
            const index = indices[i];
            const iou = calculateIoU(boxes[current], boxes[index]);
            if (iou > iouThreshold) {
                removeIndices.push(i);
            }
        }
        
        // Remove suppressed
        for (let i = removeIndices.length - 1; i >= 0; i--) {
            indices.splice(removeIndices[i], 1);
        }
    }
    
    return picked;
}

function calculateIoU(box1: number[], box2: number[]): number {
    const x1 = Math.max(box1[0], box2[0]);
    const y1 = Math.max(box1[1], box2[1]);
    const x2 = Math.min(box1[2], box2[2]);
    const y2 = Math.min(box1[3], box2[3]);
    
    const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const area1 = (box1[2] - box1[0]) * (box1[3] - box1[1]);
    const area2 = (box2[2] - box2[0]) * (box2[3] - box2[1]);
    
    return intersection / (area1 + area2 - intersection);
}

/**
 * PCA on a set of points to find principal axis angle
 */
function computePCA(points: { x: number; y: number }[]): { angle: number; center: {x: number, y: number} } {
    if (points.length === 0) return { angle: 0, center: {x:0, y:0} };
    
    // 1. Calculate Mean
    let sumX = 0, sumY = 0;
    for (const p of points) {
        sumX += p.x;
        sumY += p.y;
    }
    const meanX = sumX / points.length;
    const meanY = sumY / points.length;
    
    // 2. Covariance Matrix
    // Cov(x,x), Cov(x,y)
    // Cov(y,x), Cov(y,y)
    let xx = 0, xy = 0, yy = 0;
    
    for (const p of points) {
        const dx = p.x - meanX;
        const dy = p.y - meanY;
        xx += dx * dx;
        xy += dx * dy;
        yy += dy * dy;
    }
    
    xx /= points.length;
    xy /= points.length;
    yy /= points.length;
    
    // 3. Eigen decomposition of 2x2 symmetric matrix
    // lambda = ((xx + yy) +/- sqrt((xx-yy)^2 + 4*xy^2)) / 2
    // We want the eigenvector for the larger lambda (primary axis)
    
    // Angle of the primary eigenvector:
    // theta = 0.5 * atan2(2*xy, xx - yy)
    // This gives the angle of the major axis.
    
    const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
    
    return { 
        angle,
        center: { x: meanX, y: meanY }
    };
}
