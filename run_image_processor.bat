@echo off
setlocal enabledelayedexpansion
title Image Processor

echo ==========================================
echo Starting Image Processor...
echo ==========================================

:: 1. Find correct Python command
set PY_CMD=
for %%P in (py python python3) do (
    where %%P >nul 2>&1
    if !errorlevel! == 0 (
        set PY_CMD=%%P
        goto :found_python
    )
)

if "%PY_CMD%" == "" (
    echo.
    echo ERROR: Python was not found in your system PATH!
    echo Please install Python (and check "Add Python to PATH") or the Python Launcher.
    echo.
    pause
    exit /b 1
)

:found_python
echo Using Python command: %PY_CMD%

:: 2. Check for dependencies
echo Checking dependencies...
%PY_CMD% -c "import cv2, numpy, PIL" >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo Missing required packages (OpenCV, NumPy, or Pillow).
    set /p INSTALL_REQ="Would you like to install them now? (y/n): "
    if /i "!INSTALL_REQ!" == "y" (
        echo.
        echo Installing dependencies from requirements.txt...
        %PY_CMD% -m pip install -r "%~dp0requirements.txt"
        if !errorlevel! neq 0 (
            echo.
            echo FAILED to install packages. Please run manually:
            echo %PY_CMD% -m pip install opencv-python numpy pillow
            pause
            exit /b 1
        )
    ) else (
        echo.
        echo Please install requirements manually:
        echo %PY_CMD% -m pip install opencv-python numpy pillow
        pause
        exit /b 1
    )
)

:: 3. Run the GUI
echo Starting GUI...
%PY_CMD% "%~dp0image_processor_gui.py"

if %errorlevel% neq 0 (
    echo.
    echo Image Processor exited with error code %errorlevel%.
    pause
)

endlocal
