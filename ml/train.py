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

    # Load model (Small Segmentation - better accuracy than Nano)
    model = YOLO('yolov8s-seg.pt')

    # Train
    results = model.train(
        data=data_path,
        epochs=100,      # Increased from 30 for better convergence
        imgsz=640,       # Increased from 320 to capture fine details (shafts)
        batch=16,        # Standard batch size for GPU training
        workers=8,       # Enable workers for faster data loading
        plots=True,      # Enable plotting to monitor training
        project=os.path.join(script_dir, 'runs/train'),
        name='club_seg_v2_high_acc',
        # device='0'     # Uncomment to force specific GPU, otherwise auto
    )

    # Export to ONNX
    path = model.export(format='onnx', opset=12)
    print(f"Exported to {path}")

if __name__ == '__main__':
    train()
