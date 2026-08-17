"""
Media Processing Utilities
===========================
Shared constants and utilities for image/video processing.
Used by both image_processor.py (CLI) and image_processor_gui.py (GUI).
"""

import concurrent.futures
import io
import os
import struct
import subprocess
import shutil
import tempfile
import time
from pathlib import Path
from typing import Callable, Optional, Tuple, List, Set

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


# H.264 encoder selection. ffmpeg builds vary wildly in which encoders they
# ship (e.g. the bundled 8.0.1 build has libopenh264 but NOT libx264), so the
# codec must be detected at runtime rather than hardcoded.
VIDEO_ENCODER_PREFERENCE: Tuple[str, ...] = (
    'libx264',        # highest quality, most common
    'libopenh264',    # software fallback shipped by some builds
    'h264_mf',        # Windows MediaFoundation (hardware)
    'h264_qsv',       # Intel Quick Sync (hardware)
    'h264_nvenc',     # NVIDIA (hardware)
    'h264_amf',       # AMD (hardware)
)
_detected_video_encoder: Optional[str] = None  # detection cache; '' = none found


def get_available_video_encoders() -> Set[str]:
    """Return the set of encoder names this ffmpeg build provides."""
    try:
        result = subprocess.run(
            ['ffmpeg', '-hide_banner', '-encoders'],
            capture_output=True,
            text=True,
            timeout=15,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0,
        )
    except (OSError, subprocess.TimeoutExpired):
        return set()
    if result.returncode != 0:
        return set()
    encoders: Set[str] = set()
    for line in result.stdout.splitlines():
        parts = line.split()
        # Encoder rows look like: " V....D libopenh264  OpenH264 H.264 ..."
        if len(parts) >= 2 and parts[0] and parts[0][0] in 'VAS' and parts[1] != '=':
            encoders.add(parts[1])
    return encoders


def detect_h264_encoder() -> str:
    """
    Pick the best H.264 encoder available in this ffmpeg build (cached).

    Returns:
        Encoder name (e.g. 'libx264' or 'libopenh264'), or '' if none found.
    """
    global _detected_video_encoder
    if _detected_video_encoder is None:
        available = get_available_video_encoders()
        _detected_video_encoder = next(
            (name for name in VIDEO_ENCODER_PREFERENCE if name in available),
            '',
        )
    return _detected_video_encoder


def _h264_encoder_args(codec: str) -> List[str]:
    """Per-encoder quality options. `-preset`/`-crf` are x264-only; the other
    encoders use their own rate-control flags (or none at all)."""
    if codec == 'libx264':
        return ['-preset', FFMPEG_ENCODING_OPTS['preset'], '-crf', FFMPEG_ENCODING_OPTS['crf']]
    if codec == 'libopenh264':
        # Quality mode is the closest analog to CRF; no preset/crf support.
        return ['-profile:v', 'high', '-rc_mode', 'quality']
    if codec == 'h264_qsv':
        return ['-global_quality', FFMPEG_ENCODING_OPTS['crf']]
    return []  # h264_mf / h264_nvenc / h264_amf: default rate control


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
        RuntimeError: If ffmpeg is not available, no H.264 encoder is found,
            or the ffmpeg command fails (message includes ffmpeg's stderr)
    """
    require_ffmpeg()

    opts = FFMPEG_ENCODING_OPTS
    codec = detect_h264_encoder()
    if not codec:
        raise RuntimeError(
            "No H.264 video encoder found in this ffmpeg build. "
            "Install an ffmpeg build that includes libx264 or libopenh264 "
            "(e.g. a gyan.dev or BtbN build)."
        )
    encode_args = ['-c:v', codec] + _h264_encoder_args(codec)

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
            *encode_args,
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
            *encode_args,
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
        detail = (result.stderr or result.stdout or '').strip()
        if len(detail) > 1000:
            detail = '...' + detail[-1000:]
        raise RuntimeError(
            f"ffmpeg failed with exit code {result.returncode}."
            + (f"\n{detail}" if detail else "")
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
# Animated WebP Utilities
# =============================================================================

_WEBP_DIR = Path(__file__).parent / "WEBP"


def get_webp_tool_path(tool_name: str) -> Optional[Path]:
    """
    Locate a WebP tool (e.g. 'img2webp.exe', 'webpinfo.exe') inside the WEBP/ folder.

    Returns:
        Path to the tool executable, or None if not found.
    """
    tool_path = _WEBP_DIR / tool_name
    return tool_path if tool_path.is_file() else None


def is_animated_webp(path: Path) -> bool:
    """Check if a WebP file has multiple frames (is animated)."""
    suffix = Path(path).suffix.lower()
    if suffix != '.webp':
        return False
    try:
        with Image.open(path) as img:
            return getattr(img, 'n_frames', 1) > 1
    except Exception:
        return False


def extract_webp_frames(path: Path) -> list[Image.Image]:
    """
    Extract all frames from an animated WebP file.

    Returns:
        List of PIL Image objects (one per frame), each converted to RGB.
    """
    frames: list[Image.Image] = []
    with Image.open(path) as img:
        try:
            while True:
                frame = img.copy()
                if frame.mode in ('RGBA', 'LA', 'P'):
                    frame = frame.convert('RGB')
                frames.append(frame)
                img.seek(img.tell() + 1)
        except EOFError:
            pass
    return frames


def get_frame_durations(path: Path, default_duration: int = 100) -> list[int]:
    """
    Extract per-frame durations (in milliseconds) from an animated WebP.

    Args:
        path: Path to the animated WebP file.
        default_duration: Fallback duration if none is stored in the file.

    Returns:
        List of int durations, one per frame.
    """
    durations: list[int] = []
    with Image.open(path) as img:
        try:
            while True:
                dur = img.info.get('duration', default_duration)
                if isinstance(dur, list):
                    durations.extend(dur)
                else:
                    durations.append(int(dur))
                img.seek(img.tell() + 1)
        except EOFError:
            pass
    return durations


def _parse_webp_chunks(data: bytes) -> List[Tuple[bytes, bytes]]:
    """Parse the chunks of a single-frame RIFF WebP file into (FourCC, payload) pairs."""
    if data[:4] != b'RIFF' or data[8:12] != b'WEBP':
        raise ValueError("Not a valid WebP file")
    pos = 12
    end = 12 + struct.unpack('<I', data[4:8])[0]
    chunks: List[Tuple[bytes, bytes]] = []
    while pos + 8 <= end:
        fourcc = data[pos:pos + 4]
        size = struct.unpack('<I', data[pos + 4:pos + 8])[0]
        chunks.append((fourcc, data[pos + 8:pos + 8 + size]))
        pos += 8 + size + (size & 1)  # RIFF pads odd-sized chunks with one byte
    return chunks


def _webp_bitstream_dims(chunks: List[Tuple[bytes, bytes]]) -> Tuple[int, int]:
    """Extract (width, height) from the VP8/VP8L bitstream of a frame."""
    for fourcc, payload in chunks:
        if fourcc == b'VP8 ':
            # VP8 frame tag: 3 bytes, start code: 3 bytes, then 14-bit width/height.
            width = (payload[6] | (payload[7] << 8)) & 0x3FFF
            height = (payload[8] | (payload[9] << 8)) & 0x3FFF
            return width, height
        if fourcc == b'VP8L':
            bits = int.from_bytes(payload[1:5], 'little')
            return (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1
    raise ValueError("Frame contains neither a VP8 nor VP8L bitstream")


def _assemble_animated_webp(
    frame_files: List[Path],
    durations: List[int],
    output_path: Path,
    loop: int = 0,
) -> None:
    """
    Assemble an animated WebP from single-frame WebP files, entirely in-process.

    This replaces a single ``webpmux -frame ... -frame ... -o out.webp``
    invocation. That command line grows roughly 160 chars per frame, so on
    Windows it exceeds the 32k-character limit and fails with
    ``FileNotFoundError: [WinError 206] The filename or extension is too long``
    at roughly 200+ frames (the GUI processes 600+).

    The container is written by hand per the WebP RIFF spec: a VP8X chunk
    (animation flag, plus alpha flag if any frame carries an ALPH chunk), an
    ANIM chunk (loop count), then one ANMF chunk per frame with the frame's
    encoded VP8/VP8L bitstream.
    """
    anmf_chunks: List[bytes] = []
    canvas_w = canvas_h = None
    has_alpha = False

    for frame_file, duration in zip(frame_files, durations):
        chunks = _parse_webp_chunks(frame_file.read_bytes())
        # The single-frame file's own VP8X is redundant inside an ANMF chunk;
        # keep only the bitstream (and any ALPH) chunks.
        chunks = [(fourcc, payload) for fourcc, payload in chunks if fourcc != b'VP8X']
        if any(fourcc == b'ALPH' for fourcc, _ in chunks):
            has_alpha = True

        width, height = _webp_bitstream_dims(chunks)
        if canvas_w is None:
            canvas_w, canvas_h = width, height
        elif (width, height) != (canvas_w, canvas_h):
            raise ValueError(
                f"Frame {frame_file.name} is {width}x{height}, "
                f"but the animation canvas is {canvas_w}x{canvas_h}"
            )

        frame_payload = b''
        for fourcc, payload in chunks:
            frame_payload += fourcc + struct.pack('<I', len(payload)) + payload
            if len(payload) & 1:
                frame_payload += b'\x00'

        # 16-byte ANMF header: uint24 x/y/width-1/height-1, uint24 duration,
        # then a flags byte (reserved 6 bits + blending 1 bit + disposal 1 bit).
        header = b''.join(
            value.to_bytes(3, 'little')
            for value in (0, 0, canvas_w - 1, canvas_h - 1, duration)
        )
        header += b'\x00'
        body = header + frame_payload
        anmf = b'ANMF' + struct.pack('<I', len(body)) + body
        if len(body) & 1:
            anmf += b'\x00'
        anmf_chunks.append(anmf)

    # VP8X flags: bit 1 = animation, bit 4 = alpha (libwebp constants).
    vp8x_flags = 0x02 | (0x10 if has_alpha else 0)
    vp8x = bytes([vp8x_flags]) + b'\x00\x00\x00'
    vp8x += (canvas_w - 1).to_bytes(3, 'little') + (canvas_h - 1).to_bytes(3, 'little')
    anim = b'\x00\x00\x00\x00' + struct.pack('<H', loop)  # black bgcolor + loop count

    chunks = [
        b'VP8X' + struct.pack('<I', len(vp8x)) + vp8x,
        b'ANIM' + struct.pack('<I', len(anim)) + anim,
    ] + anmf_chunks
    body = b''.join(chunks)

    with open(output_path, 'wb') as f:
        f.write(b'RIFF' + struct.pack('<I', 4 + len(body)) + b'WEBP' + body)


def save_animated_webp(
    frames: list[Image.Image],
    durations: list[int],
    output_path: Path,
    quality: int = 90,
    lossless: bool = False,
    method: int = 6,
    progress_callback: Optional[Callable[[int, int], None]] = None,
) -> None:
    _save_animated_webp_pipe(frames, durations, output_path, quality, lossless, method, progress_callback)


def _save_animated_webp_pipe(
    frames: list[Image.Image],
    durations: list[int],
    output_path: Path,
    quality: int = 90,
    lossless: bool = False,
    method: int = 6,
    progress_callback: Optional[Callable[[int, int], None]] = None,
) -> None:
    cwebp = get_webp_tool_path("cwebp.exe")
    if cwebp is None:
        raise RuntimeError("cwebp.exe not found in WEBP/ folder")

    temp_dir = Path(tempfile.mkdtemp())
    try:
        webp_files: list[Path] = [None] * len(frames)
        t0 = time.time()

        def encode_one(i_frame):
            i, frame = i_frame
            buf = io.BytesIO()
            frame.save(buf, "PNG")
            png_data = buf.getvalue()
            webp_path = temp_dir / f"frame_{i:04d}.webp"
            cmd = [str(cwebp), "-q", str(quality), "-m", str(method), "-o", str(webp_path), "--", "-"]
            if lossless:
                cmd.insert(1, "-lossless")
            subprocess.run(cmd, input=png_data, check=True, capture_output=True, timeout=120,
                           creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
            return (i, webp_path)

        with concurrent.futures.ThreadPoolExecutor(max_workers=min(os.cpu_count() or 4, len(frames))) as executor:
            futures = [executor.submit(encode_one, (i, f)) for i, f in enumerate(frames)]
            for idx, future in enumerate(concurrent.futures.as_completed(futures)):
                i, webp_path = future.result()
                webp_files[i] = webp_path
                if progress_callback:
                    progress_callback(idx + 1, len(frames))

        print(f"Encoded {len(frames)} WebP frames in {time.time() - t0:.1f}s")

        # Mux in-process: webpmux's command line can't hold 200+ frames
        # (WinError 206: filename or extension too long).
        _assemble_animated_webp(webp_files, durations, output_path)

    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"WebP pipe encoding failed: {e.stderr}") from e
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


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
