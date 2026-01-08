@echo off
title Image Processor
echo Starting Image Processor GUI...
python "%~dp0image_processor_gui.py"
if errorlevel 1 (
    echo.
    echo Error: Failed to start. Make sure Python and required packages are installed.
    echo Run: pip install opencv-python numpy pillow
    pause
)
