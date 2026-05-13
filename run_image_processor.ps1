$ErrorActionPreference = "Stop"

Write-Host "=========================================="
Write-Host "Starting Image Processor..."
Write-Host "=========================================="

# 1. Find correct Python command
$pyCmd = $null
foreach ($cmd in @("py", "python", "python3")) {
    $found = Get-Command $cmd -ErrorAction SilentlyContinue
    if ($found) {
        $pyCmd = $cmd
        break
    }
}

if (-not $pyCmd) {
    Write-Host "`nERROR: Python was not found in your system PATH!"
    Write-Host "Please install Python (and check 'Add Python to PATH') or the Python Launcher."
    Read-Host "`nPress Enter to exit"
    exit 1
}

Write-Host "Using Python command: $pyCmd"

# 2. Check for dependencies
Write-Host "Checking dependencies..."
$depsOk = & $pyCmd -c "import cv2, numpy, PIL" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "`nMissing required packages (OpenCV, NumPy, or Pillow)."
    $installReq = Read-Host "Would you like to install them now? (y/n)"
    if ($installReq -eq "y") {
        Write-Host "`nInstalling dependencies from requirements.txt..."
        & $pyCmd -m pip install -r "$PSScriptRoot\requirements.txt"
        if ($LASTEXITCODE -ne 0) {
            Write-Host "`nFAILED to install packages. Please run manually:"
            Write-Host "$pyCmd -m pip install opencv-python numpy pillow"
            Read-Host "`nPress Enter to exit"
            exit 1
        }
    } else {
        Write-Host "`nPlease install requirements manually:"
        Write-Host "$pyCmd -m pip install opencv-python numpy pillow"
        Read-Host "`nPress Enter to exit"
        exit 1
    }
}

# 3. Run the GUI
Write-Host "Starting GUI..."
& $pyCmd "$PSScriptRoot\image_processor_gui.py"

if ($LASTEXITCODE -ne 0) {
    Write-Host "`nImage Processor exited with error code $LASTEXITCODE."
    Read-Host "`nPress Enter to exit"
}

exit $LASTEXITCODE
