from ultralytics import YOLO
import os


def train():
    # Fix for "double free detected in tcache 2" / OMP issues in WSL
    os.environ['OMP_NUM_THREADS'] = '1'
    os.environ['MKL_NUM_THREADS'] = '1'
    
    # Ensure we are in the right directory or use absolute paths? 
    # Best to use relative from this script location
    script_dir = os.path.dirname(os.path.abspath(__file__))
    data_path = os.path.join(script_dir, '../dataset/club/data.yaml')
    
    print(f"Training using data config: {data_path}")

    # Load model (Nano Segmentation)
    model = YOLO('yolov8n-seg.pt')

    # Train
    results = model.train(
        data=data_path,
        epochs=30, 
        imgsz=320, # Minimal image size for stability
        batch=1,   # Absolute minimum batch size
        workers=0, 
        plots=False, # Disable plotting (matplotlib can cause crashes in WSL)
        project=os.path.join(script_dir, 'runs/train'),
        name='club_seg_v1',
        device='cpu' 
    )

    # Export to ONNX
    path = model.export(format='onnx', opset=12)
    print(f"Exported to {path}")

if __name__ == '__main__':
    train()
