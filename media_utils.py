"""
Media Processing Utilities
===========================
Shared constants and utilities for image/video processing.
Used by both image_processor.py (CLI) and image_processor_gui.py (GUI).
"""

import os
import subprocess
import shutil
import tempfile
from pathlib import Path
from typing import Optional, Tuple, List, Set

import cv2
import numpy as np
from PIL import Image, ImageFilter


# =============================================================================
# Constants
# =============================================================================

IMAGE_EXTENSIONS: Set[str] = {'.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.tif', '.webp'}
VIDEO_EXTENSIONS: Set[str] = {'.mp4', '.avi', '.mov', '.mkv', '.webm', '.wmv'}

# Display constants
DEFAULT_SCREEN_WIDTH = 1600
DEFAULT_SCREEN_HEIGHT = 900
MIN_CROP_SIZE = 10  # Minimum size for a valid crop rectangle

# Default processing settings
DEFAULT_TARGET_WIDTH = 1920
DEFAULT_TARGET_HEIGHT = 1080
DEFAULT_BLUR_RADIUS = 10

FFMPEG_ENCODING_OPTS = {
    'video_codec': 'libx264',
    'preset': 'medium',
    'crf': '23',
    'audio_codec': 'aac',
    'audio_bitrate': '192k',
}


# =============================================================================
# File Discovery
# =============================================================================

def get_media_files(
    folder_path: str,
    filter_type: str = "all"
) -> List[Path]:
    """
    Get media files from a folder.
    
    Args:
        folder_path: Path to the folder
        filter_type: "all", "images", or "videos"
    
    Returns:
        List of Path objects for matching files
    
    Raises:
        ValueError: If folder doesn't exist or is not a directory
    """
    folder = Path(folder_path)
    
    if not folder.exists():
        raise ValueError(f"Folder does not exist: {folder_path}")
    
    if not folder.is_dir():
        raise ValueError(f"Path is not a folder: {folder_path}")
    
    if filter_type == "images":
        extensions = IMAGE_EXTENSIONS
    elif filter_type == "videos":
        extensions = VIDEO_EXTENSIONS
    else:
        extensions = IMAGE_EXTENSIONS | VIDEO_EXTENSIONS
    
    files = []
    for f in sorted(folder.iterdir()):
        if f.is_file() and f.suffix.lower() in extensions:
            files.append(f)
    
    return files


def is_video(path) -> bool:
    """Check if a path is a video file."""
    return Path(path).suffix.lower() in VIDEO_EXTENSIONS


def is_image(path) -> bool:
    """Check if a path is an image file."""
    return Path(path).suffix.lower() in IMAGE_EXTENSIONS


def get_video_properties(video_path: str) -> dict:
    """
    Get video properties from a video file.
    
    Args:
        video_path: Path to video file
    
    Returns:
        Dict with keys: fps, total_frames, width, height, duration
    
    Raises:
        ValueError: If video cannot be opened
    """
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video_path}")
    
    props = {
        'fps': cap.get(cv2.CAP_PROP_FPS) or 30,
        'total_frames': int(cap.get(cv2.CAP_PROP_FRAME_COUNT)),
        'width': int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
        'height': int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
    }
    props['duration'] = props['total_frames'] / props['fps'] if props['fps'] > 0 else 0
    cap.release()
    return props


def normalize_rect(x1: int, y1: int, x2: int, y2: int) -> Tuple[int, int, int, int]:
    """
    Normalize a rectangle to ensure x1 <= x2 and y1 <= y2.
    
    Returns:
        (min_x, min_y, max_x, max_y)
    """
    return min(x1, x2), min(y1, y2), max(x1, x2), max(y1, y2)


def is_valid_crop_rect(x1: int, y1: int, x2: int, y2: int, min_size: int = MIN_CROP_SIZE) -> bool:
    """Check if a rectangle is large enough to be a valid crop."""
    return (x2 - x1) > min_size and (y2 - y1) > min_size


def interpolate_crop_keyframes(
    keyframes: dict,
    frame: int,
    video_width: int,
    video_height: int
) -> Optional[Tuple[int, int, int, int]]:
    """
    Interpolate crop rect for a given frame from keyframes.
    
    Uses linear interpolation between surrounding keyframes.
    If frame is before first keyframe, uses first keyframe's crop.
    If frame is after last keyframe, uses last keyframe's crop.
    
    Args:
        keyframes: Dict mapping frame number to crop rect (x1, y1, x2, y2)
        frame: Target frame number
        video_width: Width of video (for clamping)
        video_height: Height of video (for clamping)
    
    Returns:
        Interpolated crop rect (x1, y1, x2, y2), or None if no keyframes
    """
    if not keyframes:
        return None
    
    sorted_frames = sorted(keyframes.keys())
    
    # If only one keyframe, use it
    if len(sorted_frames) == 1:
        return keyframes[sorted_frames[0]]
    
    # Before first keyframe
    if frame <= sorted_frames[0]:
        return keyframes[sorted_frames[0]]
    
    # After last keyframe
    if frame >= sorted_frames[-1]:
        return keyframes[sorted_frames[-1]]
    
    # Find surrounding keyframes
    prev_frame = sorted_frames[0]
    next_frame = sorted_frames[-1]
    
    for kf in sorted_frames:
        if kf <= frame:
            prev_frame = kf
        if kf >= frame and next_frame == sorted_frames[-1]:
            next_frame = kf
            break
    
    # Linear interpolation
    if prev_frame == next_frame:
        return keyframes[prev_frame]
    
    t = (frame - prev_frame) / (next_frame - prev_frame)
    
    prev_rect = keyframes[prev_frame]
    next_rect = keyframes[next_frame]
    
    x1 = int(prev_rect[0] + t * (next_rect[0] - prev_rect[0]))
    y1 = int(prev_rect[1] + t * (next_rect[1] - prev_rect[1]))
    x2 = int(prev_rect[2] + t * (next_rect[2] - prev_rect[2]))
    y2 = int(prev_rect[3] + t * (next_rect[3] - prev_rect[3]))
    
    # Clamp to video bounds
    x1 = max(0, min(x1, video_width))
    y1 = max(0, min(y1, video_height))
    x2 = max(0, min(x2, video_width))
    y2 = max(0, min(y2, video_height))
    
    return (x1, y1, x2, y2)


# =============================================================================
# FFmpeg Utilities
# =============================================================================

def check_ffmpeg() -> bool:
    """
    Check if ffmpeg is available in the system PATH.
    
    Returns:
        True if ffmpeg is available, False otherwise
    """
    try:
        result = subprocess.run(
            ['ffmpeg', '-version'],
            capture_output=True,
            text=True,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
        )
        return result.returncode == 0
    except FileNotFoundError:
        return False


def require_ffmpeg() -> None:
    """
    Ensure ffmpeg is available.
    
    Raises:
        RuntimeError: If ffmpeg is not found
    """
    if not check_ffmpeg():
        raise RuntimeError(
            "ffmpeg is required but not found in PATH. "
            "Please install ffmpeg and ensure it's in your system PATH."
        )


def run_ffmpeg_encode(
    input_path: str,
    output_path: str,
    audio_source: Optional[str] = None,
    audio_offset: float = 0,
    audio_duration: Optional[float] = None,
    include_audio: bool = True,
    speed: float = 1.0
) -> None:
    """
    Re-encode a video file using ffmpeg.
    
    Args:
        input_path: Path to processed video (no audio)
        output_path: Path for output file
        audio_source: Path to original video for audio extraction (optional)
        audio_offset: Seconds to skip in audio source
        audio_duration: Duration of audio to include (optional)
        include_audio: Whether to include audio from audio_source
        speed: Playback speed multiplier (0.5 to 100.0)
    
    Raises:
        RuntimeError: If ffmpeg is not available
        subprocess.CalledProcessError: If ffmpeg fails
    """
    require_ffmpeg()
    
    opts = FFMPEG_ENCODING_OPTS
    
    if include_audio and audio_source:
        # Build command with audio from source
        cmd = ['ffmpeg', '-y', '-i', input_path]
        
        # Add seeking/duration for audio source
        if audio_offset > 0:
            cmd.extend(['-ss', str(audio_offset)])
        if audio_duration:
            cmd.extend(['-t', str(audio_duration)])
        
        cmd.extend(['-i', audio_source])
        cmd.extend(['-map', '0:v', '-map', '1:a?'])
        
        # Audio filter for speed
        af_filters = []
        if abs(speed - 1.0) > 0.01:
            # atempo filter supports 0.5 to 2.0
            # Need to chain for larger/smaller values
            s = speed
            while s > 2.0:
                af_filters.append('atempo=2.0')
                s /= 2.0
            while s < 0.5:
                af_filters.append('atempo=0.5')
                s /= 0.5
            af_filters.append(f'atempo={s}')
            
            cmd.extend(['-af', ','.join(af_filters)])
        
        cmd.extend([
            '-c:v', opts['video_codec'],
            '-preset', opts['preset'],
            '-crf', opts['crf'],
            '-c:a', opts['audio_codec'],
            '-b:a', opts['audio_bitrate'],
            '-shortest',
            '-movflags', '+faststart',
            output_path
        ])
    else:
        # No audio
        cmd = [
            'ffmpeg', '-y', '-i', input_path,
            '-c:v', opts['video_codec'],
            '-preset', opts['preset'],
            '-crf', opts['crf'],
            '-an',
            '-movflags', '+faststart',
            output_path
        ]
    
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
    )
    
    if result.returncode != 0:
        raise subprocess.CalledProcessError(
            result.returncode, cmd, result.stdout, result.stderr
        )


# =============================================================================
# Coordinate Conversion
# =============================================================================

def clamp(value: int, min_val: int, max_val: int) -> int:
    """Clamp a value to the given range."""
    return max(min_val, min(value, max_val))


def canvas_to_image_coords(
    canvas_x: int,
    canvas_y: int,
    image_offset: Tuple[int, int],
    scale: float,
    image_size: Tuple[int, int]
) -> Tuple[int, int]:
    """
    Convert canvas coordinates to image coordinates.
    
    Args:
        canvas_x, canvas_y: Coordinates on the canvas
        image_offset: (x, y) offset of image on canvas
        scale: Display scale factor
        image_size: (width, height) of the original image
    
    Returns:
        (x, y) coordinates in original image space, clamped to image bounds
    """
    img_x = int((canvas_x - image_offset[0]) / scale)
    img_y = int((canvas_y - image_offset[1]) / scale)
    
    img_x = clamp(img_x, 0, image_size[0])
    img_y = clamp(img_y, 0, image_size[1])
    
    return img_x, img_y


def image_to_canvas_coords(
    img_x: int,
    img_y: int,
    image_offset: Tuple[int, int],
    scale: float
) -> Tuple[int, int]:
    """
    Convert image coordinates to canvas coordinates.
    
    Args:
        img_x, img_y: Coordinates in original image space
        image_offset: (x, y) offset of image on canvas
        scale: Display scale factor
    
    Returns:
        (x, y) coordinates on the canvas
    """
    canvas_x = image_offset[0] + int(img_x * scale)
    canvas_y = image_offset[1] + int(img_y * scale)
    return canvas_x, canvas_y


# =============================================================================
# Time Formatting
# =============================================================================

def format_time(seconds: float) -> str:
    """Format seconds as MM:SS."""
    minutes = int(seconds // 60)
    secs = int(seconds % 60)
    return f"{minutes:02d}:{secs:02d}"


def format_time_precise(seconds: float) -> str:
    """Format seconds as MM:SS.ms (for video seeking)."""
    minutes = int(seconds // 60)
    secs = seconds % 60
    return f"{minutes:02d}:{secs:05.2f}"


def parse_time_to_seconds(time_str: Optional[str]) -> Optional[float]:
    """
    Parse a time string to seconds.
    Supports formats: SS, MM:SS, HH:MM:SS, or decimal seconds (e.g., "1.5")
    
    Args:
        time_str: Time string to parse, or None
    
    Returns:
        Time in seconds, or None if input was None
    
    Raises:
        ValueError: If time string is invalid
    """
    if time_str is None:
        return None
    
    time_str = str(time_str).strip()
    
    # Try parsing as float first (plain seconds)
    try:
        return float(time_str)
    except ValueError:
        pass
    
    # Parse HH:MM:SS or MM:SS format
    parts = time_str.split(':')
    if len(parts) == 1:
        return float(parts[0])
    elif len(parts) == 2:
        minutes, seconds = parts
        return int(minutes) * 60 + float(seconds)
    elif len(parts) == 3:
        hours, minutes, seconds = parts
        return int(hours) * 3600 + int(minutes) * 60 + float(seconds)
    else:
        raise ValueError(f"Invalid time format: {time_str}")


# =============================================================================
# Image Processing
# =============================================================================

def process_image_pil(
    pil_image: Image.Image,
    target_width: int = 1920,
    target_height: int = 1080,
    blur_radius: int = 10,
    background_image: Optional[Image.Image] = None
) -> Image.Image:
    """
    Process an image: scale to target height, add blurred background padding.
    
    Uses OpenCV for fast Gaussian blur on downscaled image.
    
    Args:
        pil_image: The cropped/main image to process (RGB)
        target_width: Target output width
        target_height: Target output height
        blur_radius: Blur radius for background
        background_image: Optional uncropped image for blurred background
                         (uses pil_image if None)
    
    Returns:
        Processed PIL Image (RGB)
    """
    # Convert to numpy (RGB format)
    img = np.array(pil_image).copy()
    original_height, original_width = img.shape[:2]
    
    # Get background source
    if background_image is not None:
        bg_source = np.array(background_image).copy()
    else:
        bg_source = img
    bg_source_h, bg_source_w = bg_source.shape[:2]
    
    # Calculate scaling factor to reach target size (Fit behavior)
    scale_h = target_height / original_height
    scale_w = target_width / original_width
    scale_factor = min(scale_h, scale_w)
    
    new_width = int(original_width * scale_factor)
    new_height = int(original_height * scale_factor)
    
    # Scale the main (cropped) image
    scaled_image = cv2.resize(img, (new_width, new_height), interpolation=cv2.INTER_LANCZOS4)
    
    # Need to create blurred background padding
    # Downscale significantly before blurring for performance
    bg_scale = max(target_width / bg_source_w, target_height / bg_source_h)
    final_bg_w = int(bg_source_w * bg_scale) + 4
    final_bg_h = int(bg_source_h * bg_scale) + 4
    
    # Downscale factor for blur (work at lower resolution)
    blur_downscale = 8 if blur_radius > 10 else 4
    work_w = final_bg_w // blur_downscale
    work_h = final_bg_h // blur_downscale
    
    # Resize source to small working resolution
    small_bg = cv2.resize(bg_source, (work_w, work_h), interpolation=cv2.INTER_LINEAR)
    
    # Apply blur on small image
    small_radius = max(1, int(blur_radius / blur_downscale))
    kernel_size = small_radius * 2 + 1
    
    if kernel_size > 1:
        small_bg = cv2.GaussianBlur(small_bg, (kernel_size, kernel_size), 0)
    
    # Upscale back to full size
    background = cv2.resize(small_bg, (final_bg_w, final_bg_h), interpolation=cv2.INTER_LINEAR)
    
    # Center crop to exact target size
    crop_x = (final_bg_w - target_width) // 2
    crop_y = (final_bg_h - target_height) // 2
    background = background[crop_y:crop_y + target_height, crop_x:crop_x + target_width].copy()
    
    # Ensure exact size
    if background.shape[0] != target_height or background.shape[1] != target_width:
        background = cv2.resize(background, (target_width, target_height), interpolation=cv2.INTER_LINEAR)
    
    # Paste scaled image centered on blurred background
    result = background.copy()
    paste_x = (target_width - new_width) // 2
    paste_y = (target_height - new_height) // 2
    result[paste_y:paste_y + new_height, paste_x:paste_x + new_width] = scaled_image
    
    return Image.fromarray(result)


def process_image_cv(
    image: np.ndarray,
    target_width: int = 1920,
    target_height: int = 1080,
    blur_radius: int = 10
) -> np.ndarray:
    """
    Process an OpenCV image (BGR): scale to target height, add blurred padding.
    
    Args:
        image: OpenCV image (BGR format)
        target_width: Target output width
        target_height: Target output height
        blur_radius: Blur radius for background
    
    Returns:
        Processed OpenCV image (BGR)
    """
    # Convert BGR to RGB for processing
    image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    pil_image = Image.fromarray(image_rgb)
    
    # Process
    result_pil = process_image_pil(pil_image, target_width, target_height, blur_radius)
    
    # Convert back to BGR
    result_array = np.array(result_pil)
    return cv2.cvtColor(result_array, cv2.COLOR_RGB2BGR)
