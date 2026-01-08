"""
Image and Video Processor Tool
==============================
A tool that processes images and videos in a folder:
1. Allows user to draw a rectangle to crop each image/video frame
2. Scales the cropped content to 1080px height
3. Adds blurred background padding to reach 1920px width

For videos:
- Supports start and end time parameters to extract a portion
- Processes frames with the same crop and blur treatment

Requirements: pip install opencv-python numpy pillow
For videos: ffmpeg must be installed and in PATH
"""

import cv2
import numpy as np
import os
import sys
import argparse
import subprocess
import tempfile
import shutil
from pathlib import Path

from media_utils import (
    IMAGE_EXTENSIONS,
    VIDEO_EXTENSIONS,
    DEFAULT_SCREEN_WIDTH,
    DEFAULT_SCREEN_HEIGHT,
    MIN_CROP_SIZE,
    get_media_files,
    is_video,
    check_ffmpeg,
    require_ffmpeg,
    run_ffmpeg_encode,
    parse_time_to_seconds,
    format_time_precise,
    process_image_cv,
    normalize_rect,
    is_valid_crop_rect,
)


class ImageCropper:
    """Interactive cropping UI using OpenCV."""
    
    def __init__(self, image, window_name="Crop Image"):
        self.original = image.copy()
        self.image = image.copy()
        self.window_name = window_name
        self.drawing = False
        self.start_point = None
        self.end_point = None
        self.rect = None
        self.confirmed = False
        self.skipped = False
        
    def mouse_callback(self, event, x, y, flags, param):
        if event == cv2.EVENT_LBUTTONDOWN:
            self.drawing = True
            self.start_point = (x, y)
            self.end_point = (x, y)
            
        elif event == cv2.EVENT_MOUSEMOVE:
            if self.drawing:
                self.end_point = (x, y)
                
        elif event == cv2.EVENT_LBUTTONUP:
            self.drawing = False
            self.end_point = (x, y)
            if self.start_point and self.end_point:
                rect = normalize_rect(
                    self.start_point[0], self.start_point[1],
                    self.end_point[0], self.end_point[1]
                )
                if is_valid_crop_rect(*rect):
                    self.rect = rect
    
    def run(self):
        """Run the interactive cropping UI. Returns the cropped image or None if skipped."""
        cv2.namedWindow(self.window_name, cv2.WINDOW_NORMAL)
        
        # Resize window to fit screen while maintaining aspect ratio
        screen_width, screen_height = 1600, 900
        h, w = self.image.shape[:2]
        scale = min(screen_width / w, screen_height / h, 1.0)
        display_w, display_h = int(w * scale), int(h * scale)
        cv2.resizeWindow(self.window_name, display_w, display_h)
        
        cv2.setMouseCallback(self.window_name, self.mouse_callback)
        
        print("\n" + "="*50)
        print("CROP IMAGE")
        print("="*50)
        print("• Draw a rectangle to select crop area")
        print("• Press ENTER to confirm crop")
        print("• Press 'R' to reset selection")
        print("• Press 'S' to skip cropping (use full image)")
        print("• Press 'Q' to quit processing")
        print("="*50)
        
        while True:
            display = self.original.copy()
            
            # Draw current selection
            if self.start_point and self.end_point:
                cv2.rectangle(display, self.start_point, self.end_point, (0, 255, 0), 2)
                
                # Draw semi-transparent overlay outside selection
                overlay = display.copy()
                x1 = min(self.start_point[0], self.end_point[0])
                y1 = min(self.start_point[1], self.end_point[1])
                x2 = max(self.start_point[0], self.end_point[0])
                y2 = max(self.start_point[1], self.end_point[1])
                
                # Darken areas outside selection
                mask = np.zeros(display.shape[:2], dtype=np.uint8)
                mask[y1:y2, x1:x2] = 255
                overlay[mask == 0] = (overlay[mask == 0] * 0.4).astype(np.uint8)
                display = overlay
                
                # Redraw rectangle on top
                cv2.rectangle(display, self.start_point, self.end_point, (0, 255, 0), 2)
            
            # Add instructions overlay
            cv2.putText(display, "Draw rectangle | ENTER=Confirm | R=Reset | S=Skip | Q=Quit", 
                       (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
            cv2.putText(display, "Draw rectangle | ENTER=Confirm | R=Reset | S=Skip | Q=Quit", 
                       (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 0), 1)
            
            cv2.imshow(self.window_name, display)
            
            key = cv2.waitKey(1) & 0xFF
            
            if key == 13:  # Enter key
                self.confirmed = True
                break
            elif key == ord('r') or key == ord('R'):
                self.start_point = None
                self.end_point = None
                self.rect = None
            elif key == ord('s') or key == ord('S'):
                self.skipped = True
                break
            elif key == ord('q') or key == ord('Q'):
                cv2.destroyAllWindows()
                return None, True  # Signal to quit
        
        cv2.destroyAllWindows()
        
        if self.skipped or self.rect is None:
            return self.original, False
        
        x1, y1, x2, y2 = self.rect
        cropped = self.original[y1:y2, x1:x2]
        return cropped, False


def extract_frame_for_crop(video_path, start_time=None):
    """Extract a single frame from the video for cropping preview."""
    cap = cv2.VideoCapture(str(video_path))
    
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video_path}")
    
    # Seek to start time if specified
    if start_time is not None:
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_number = int(start_time * fps)
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_number)
    
    ret, frame = cap.read()
    cap.release()
    
    if not ret:
        raise ValueError(f"Cannot read frame from video: {video_path}")
    
    return frame


def process_video(video_path, output_path, crop_rect=None, start_time=None, end_time=None,
                  target_width=1920, target_height=1080, blur_radius=50):
    """
    Process a video file:
    1. Optionally trim to start/end time
    2. Apply crop if specified
    3. Scale and add blurred background padding
    
    Args:
        video_path: Path to input video
        output_path: Path for output video
        crop_rect: Tuple (x1, y1, x2, y2) for cropping, or None
        start_time: Start time in seconds, or None for beginning
        end_time: End time in seconds, or None for end
        target_width: Target width (default 1920)
        target_height: Target height (default 1080)
        blur_radius: Blur radius for background (default 50)
    
    Raises:
        ValueError: If video cannot be opened
        RuntimeError: If ffmpeg is required but not available
    """
    # Open video
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise ValueError(f"Failed to open video: {video_path}")
    
    # Get video properties
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    original_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    original_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    duration = total_frames / fps if fps > 0 else 0
    
    print(f"  Video info: {original_width}x{original_height}, {fps:.2f}fps, {duration:.2f}s")
    
    # Calculate frame range based on start/end time
    start_frame = 0
    end_frame = total_frames
    
    if start_time is not None:
        start_frame = int(start_time * fps)
        start_frame = max(0, min(start_frame, total_frames - 1))
    
    if end_time is not None:
        end_frame = int(end_time * fps)
        end_frame = max(start_frame + 1, min(end_frame, total_frames))
    
    frames_to_process = end_frame - start_frame
    print(f"  Processing frames {start_frame} to {end_frame} ({frames_to_process} frames)")
    
    # Create temporary file for intermediate output
    temp_dir = tempfile.mkdtemp()
    temp_output = os.path.join(temp_dir, 'temp_video.mp4')
    
    try:
        # Setup video writer
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(temp_output, fourcc, fps, (target_width, target_height))
        
        if not out.isOpened():
            raise RuntimeError("Failed to create video writer")
        
        # Seek to start frame
        cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
        
        # Process frames
        processed = 0
        for frame_idx in range(frames_to_process):
            ret, frame = cap.read()
            if not ret:
                break
            
            # Apply crop if specified
            if crop_rect is not None:
                x1, y1, x2, y2 = crop_rect
                frame = frame[y1:y2, x1:x2]
            
            # Process frame (scale and add blur padding)
            processed_frame = process_image_cv(
                frame,
                target_width=target_width,
                target_height=target_height,
                blur_radius=blur_radius
            )
            
            out.write(processed_frame)
            processed += 1
            
            # Progress indicator
            if processed % 30 == 0 or processed == frames_to_process:
                progress = (processed / frames_to_process) * 100
                print(f"\r  Processing: {progress:.1f}% ({processed}/{frames_to_process} frames)", end='')
        
        print()  # New line after progress
        
        cap.release()
        out.release()
        
        # Re-encode with ffmpeg (required for proper output)
        require_ffmpeg()
        print("  Re-encoding with ffmpeg...")
        
        audio_offset = start_time if start_time else 0
        audio_duration = (end_time - (start_time or 0)) if end_time else None
        
        run_ffmpeg_encode(
            temp_output,
            str(output_path),
            audio_source=str(video_path),
            audio_offset=audio_offset,
            audio_duration=audio_duration,
            include_audio=True
        )
        
    finally:
        shutil.rmtree(temp_dir)


class VideoSeeker:
    """Interactive video seeking UI using OpenCV for selecting start/end times."""
    
    def __init__(self, video_path, window_name="Video Seeker"):
        self.video_path = str(video_path)
        self.cap = cv2.VideoCapture(self.video_path)
        self.window_name = window_name
        
        if not self.cap.isOpened():
            raise ValueError(f"Could not open video: {video_path}")
        
        self.fps = self.cap.get(cv2.CAP_PROP_FPS)
        self.total_frames = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT))
        self.width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        self.height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        self.duration = self.total_frames / self.fps if self.fps > 0 else 0
        
        self.current_frame = 0
        self.start_frame = 0
        self.end_frame = self.total_frames - 1
        self.confirmed = False
        self.cancelled = False
        
        # For display scaling
        self.scale = 1.0
        
    def frame_to_time(self, frame):
        """Convert frame number to seconds."""
        return frame / self.fps if self.fps > 0 else 0
    
    def get_frame(self, frame_number):
        """Get a specific frame from the video."""
        self.cap.set(cv2.CAP_PROP_POS_FRAMES, frame_number)
        ret, frame = self.cap.read()
        return frame if ret else None
    
    def on_trackbar(self, val):
        """Trackbar callback for current position."""
        self.current_frame = val
    
    def on_start_trackbar(self, val):
        """Trackbar callback for start position."""
        self.start_frame = min(val, self.end_frame - 1)
        cv2.setTrackbarPos('Start', self.window_name, self.start_frame)
    
    def on_end_trackbar(self, val):
        """Trackbar callback for end position."""
        self.end_frame = max(val, self.start_frame + 1)
        cv2.setTrackbarPos('End', self.window_name, self.end_frame)
    
    def draw_ui(self, frame):
        """Draw UI overlay on frame."""
        display = frame.copy()
        h, w = display.shape[:2]
        
        # Draw semi-transparent overlay for text background
        overlay = display.copy()
        cv2.rectangle(overlay, (0, 0), (w, 80), (0, 0, 0), -1)
        cv2.rectangle(overlay, (0, h - 60), (w, h), (0, 0, 0), -1)
        display = cv2.addWeighted(overlay, 0.5, display, 0.5, 0)
        
        # Current time info
        current_time = self.frame_to_time(self.current_frame)
        start_time = self.frame_to_time(self.start_frame)
        end_time = self.frame_to_time(self.end_frame)
        selected_duration = end_time - start_time
        
        # Top text
        cv2.putText(display, f"Current: {format_time_precise(current_time)} (Frame {self.current_frame}/{self.total_frames})", 
                   (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
        cv2.putText(display, f"Start: {format_time_precise(start_time)} | End: {format_time_precise(end_time)} | Duration: {format_time_precise(selected_duration)}", 
                   (10, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 1)
        cv2.putText(display, f"Total: {format_time_precise(self.duration)}", 
                   (10, 75), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
        
        # Bottom instructions
        cv2.putText(display, "[  ] = Start/End at current | ENTER = Confirm | S = Skip | Q = Quit", 
                   (10, h - 35), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
        cv2.putText(display, "LEFT/RIGHT = Seek | SHIFT+Arrow = Fine seek | HOME/END = Go to start/end points", 
                   (10, h - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
        
        # Draw timeline bar
        bar_y = h - 80
        bar_height = 15
        bar_margin = 50
        bar_width = w - 2 * bar_margin
        
        # Background bar
        cv2.rectangle(display, (bar_margin, bar_y), (bar_margin + bar_width, bar_y + bar_height), (50, 50, 50), -1)
        
        # Selected region
        start_x = bar_margin + int((self.start_frame / max(self.total_frames - 1, 1)) * bar_width)
        end_x = bar_margin + int((self.end_frame / max(self.total_frames - 1, 1)) * bar_width)
        cv2.rectangle(display, (start_x, bar_y), (end_x, bar_y + bar_height), (0, 150, 0), -1)
        
        # Current position marker
        curr_x = bar_margin + int((self.current_frame / max(self.total_frames - 1, 1)) * bar_width)
        cv2.line(display, (curr_x, bar_y - 5), (curr_x, bar_y + bar_height + 5), (0, 255, 255), 2)
        
        # Start/End markers
        cv2.line(display, (start_x, bar_y - 8), (start_x, bar_y + bar_height + 8), (0, 255, 0), 2)
        cv2.line(display, (end_x, bar_y - 8), (end_x, bar_y + bar_height + 8), (0, 0, 255), 2)
        
        return display
    
    def run(self):
        """
        Run the interactive video seeking UI.
        Returns: (start_time, end_time, should_quit)
            - start_time and end_time in seconds, or None if using full video
            - should_quit: True if user wants to quit processing entirely
        """
        cv2.namedWindow(self.window_name, cv2.WINDOW_NORMAL)
        
        # Resize window to fit screen
        screen_width, screen_height = DEFAULT_SCREEN_WIDTH, DEFAULT_SCREEN_HEIGHT
        self.scale = min(screen_width / self.width, (screen_height - 100) / self.height, 1.0)
        display_w, display_h = int(self.width * self.scale), int(self.height * self.scale)
        cv2.resizeWindow(self.window_name, display_w, display_h + 100)
        
        # Create trackbars
        cv2.createTrackbar('Position', self.window_name, 0, max(self.total_frames - 1, 1), self.on_trackbar)
        cv2.createTrackbar('Start', self.window_name, 0, max(self.total_frames - 1, 1), self.on_start_trackbar)
        cv2.createTrackbar('End', self.window_name, self.total_frames - 1, max(self.total_frames - 1, 1), self.on_end_trackbar)
        
        print("\n" + "="*50)
        print("VIDEO SEEKER - Select Start and End Times")
        print("="*50)
        print("• Use Position slider or arrow keys to seek")
        print("• Press '[' to set start at current position")
        print("• Press ']' to set end at current position")
        print("• Press HOME to jump to start point")
        print("• Press END to jump to end point")
        print("• Press ENTER to confirm selection")
        print("• Press 'S' to skip (use entire video)")
        print("• Press 'Q' to quit processing")
        print("="*50)
        
        last_shown_frame = -1
        
        while True:
            # Get current frame
            if self.current_frame != last_shown_frame:
                frame = self.get_frame(self.current_frame)
                if frame is None:
                    frame = np.zeros((self.height, self.width, 3), dtype=np.uint8)
                last_shown_frame = self.current_frame
            
            # Draw UI
            display = self.draw_ui(frame)
            cv2.imshow(self.window_name, display)
            
            # Update trackbar position
            cv2.setTrackbarPos('Position', self.window_name, self.current_frame)
            
            key = cv2.waitKey(30) & 0xFF
            
            if key == 13:  # Enter - confirm
                self.confirmed = True
                break
            elif key == ord('q') or key == ord('Q'):  # Quit
                self.cancelled = True
                break
            elif key == ord('s') or key == ord('S'):  # Skip - use full video
                self.start_frame = 0
                self.end_frame = self.total_frames - 1
                self.confirmed = True
                break
            elif key == ord('['):  # Set start
                self.start_frame = min(self.current_frame, self.end_frame - 1)
                cv2.setTrackbarPos('Start', self.window_name, self.start_frame)
            elif key == ord(']'):  # Set end
                self.end_frame = max(self.current_frame, self.start_frame + 1)
                cv2.setTrackbarPos('End', self.window_name, self.end_frame)
            elif key == 82 or key == 0:  # HOME key (varies by system)
                self.current_frame = self.start_frame
            elif key == 87 or key == 1:  # END key
                self.current_frame = self.end_frame
            elif key == 81 or key == 2:  # LEFT arrow
                self.current_frame = max(0, self.current_frame - int(self.fps))  # 1 second back
            elif key == 83 or key == 3:  # RIGHT arrow
                self.current_frame = min(self.total_frames - 1, self.current_frame + int(self.fps))  # 1 second forward
            elif key == ord(',') or key == ord('<'):  # Fine seek backward
                self.current_frame = max(0, self.current_frame - 1)
            elif key == ord('.') or key == ord('>'):  # Fine seek forward
                self.current_frame = min(self.total_frames - 1, self.current_frame + 1)
        
        self.cap.release()
        cv2.destroyAllWindows()
        
        if self.cancelled:
            return None, None, True
        
        start_time = self.frame_to_time(self.start_frame)
        end_time = self.frame_to_time(self.end_frame)
        
        print(f"  Selected range: {format_time_precise(start_time)} to {format_time_precise(end_time)}")
        
        return start_time, end_time, False


def main():
    parser = argparse.ArgumentParser(
        description="Process images and videos: crop, scale to 1080p height, and add blurred padding to 1920p width",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python image_processor.py ./my_media
  python image_processor.py ./my_media -o ./processed
  python image_processor.py ./my_media --blur 30 --no-crop
  python image_processor.py ./my_media --videos-only
  python image_processor.py ./my_media --start 10 --end 30
  python image_processor.py ./my_media --start 1:30 --end 2:45

Time formats supported: seconds (30), MM:SS (1:30), HH:MM:SS (1:30:00)
        """
    )
    parser.add_argument("input_folder", help="Folder containing images/videos to process")
    parser.add_argument("-o", "--output", help="Output folder (default: input_folder/processed)")
    parser.add_argument("--blur", type=int, default=10, help="Blur radius for background (default: 50)")
    parser.add_argument("--no-crop", action="store_true", help="Skip interactive cropping")
    parser.add_argument("--width", type=int, default=1920, help="Target width (default: 1920)")
    parser.add_argument("--height", type=int, default=1080, help="Target height (default: 1080)")
    
    # Video-specific arguments
    parser.add_argument("--videos-only", action="store_true", help="Only process video files (skip images)")
    parser.add_argument("--images-only", action="store_true", help="Only process image files (skip videos)")
    parser.add_argument("--start", type=str, default=None, help="Video start time (e.g., 30, 1:30, or 0:01:30)")
    parser.add_argument("--end", type=str, default=None, help="Video end time (e.g., 60, 2:00, or 0:02:00)")
    parser.add_argument("--end", type=str, default=None, help="Video end time (e.g., 60, 2:00, or 0:02:00)")
    parser.add_argument("--no-seek", action="store_true", help="Skip interactive video seeking (use --start/--end or full video)")
    parser.add_argument("--replace", action="store_true", help="Replace original files instead of saving to processed folder")
    
    args = parser.parse_args()
    
    # Parse start/end times if provided
    start_time = parse_time_to_seconds(args.start)
    end_time = parse_time_to_seconds(args.end)
    
    # Determine filter type
    if args.videos_only:
        filter_type = "videos"
    elif args.images_only:
        filter_type = "images"
    else:
        filter_type = "all"
    
    # Get files
    media_files = get_media_files(args.input_folder, filter_type)
    
    if not media_files:
        print(f"No media files found in: {args.input_folder}")
        sys.exit(1)
    
    # Separate images and videos
    image_files = [f for f in media_files if not is_video(f)]
    video_files = [f for f in media_files if is_video(f)]
    
    print(f"\nFound {len(image_files)} image(s) and {len(video_files)} video(s) to process")
    
    # Check ffmpeg for videos
    if video_files:
        if check_ffmpeg():
            print("✓ ffmpeg found - videos will be re-encoded with audio")
        else:
            print("✗ ffmpeg not found - video processing requires ffmpeg")
            sys.exit(1)
    
    # Setup output folder
    if args.output:
        output_folder = Path(args.output)
    else:
        output_folder = Path(args.input_folder) / "processed"
    
    output_folder.mkdir(parents=True, exist_ok=True)
    print(f"Output folder: {output_folder}")
    
    # Process counters
    processed_count = 0
    skipped_count = 0
    file_index = 0
    total_files = len(media_files)
    
    # Process images
    for image_path in image_files:
        file_index += 1
        print(f"\n[{file_index}/{total_files}] Processing image: {image_path.name}")
        
        # Load image
        image = cv2.imread(str(image_path))
        if image is None:
            print(f"Error: Failed to load image: {image_path}")
            print("Processing cancelled.")
            return
        
        print(f"  Original size: {image.shape[1]}x{image.shape[0]}")
        
        # Interactive cropping
        if not args.no_crop:
            cropper = ImageCropper(image, f"Crop: {image_path.name}")
            cropped_image, should_quit = cropper.run()
            
            if should_quit:
                print("\n\nProcessing cancelled by user.")
                return
            
            if cropped_image is None:
                raise RuntimeError("Cropping failed unexpectedly")
            
            image = cropped_image
            print(f"  Cropped size: {image.shape[1]}x{image.shape[0]}")
        
        # Process image
        result = process_image_cv(
            image,
            target_width=args.width,
            target_height=args.height,
            blur_radius=args.blur
        )
        
        # Save result
        # Save result
        if args.replace:
            output_path = image_path
            # Save to temp then replace
            temp_path = image_path.with_name(f"{image_path.stem}_temp{image_path.suffix}")
            cv2.imwrite(str(temp_path), result)
            os.replace(temp_path, output_path)
            print(f"  ✓ Replaced original: {output_path.name} ({result.shape[1]}x{result.shape[0]})")
        else:
            output_path = output_folder / f"{image_path.stem}_processed{image_path.suffix}"
            cv2.imwrite(str(output_path), result)
            print(f"  ✓ Saved: {output_path.name} ({result.shape[1]}x{result.shape[0]})")
        processed_count += 1
    
    # Process videos
    for video_path in video_files:
        file_index += 1
        print(f"\n[{file_index}/{total_files}] Processing video: {video_path.name}")
        
        # Determine start/end times
        video_start = start_time
        video_end = end_time
        
        # Interactive seeking if not disabled and no times provided via CLI
        if not args.no_seek and (video_start is None and video_end is None):
            seeker = VideoSeeker(video_path, f"Seek: {video_path.name}")
            video_start, video_end, should_quit = seeker.run()
            
            if should_quit:
                print("\n\nProcessing cancelled by user.")
                return
        
        # Get crop rectangle from a frame
        crop_rect = None
        if not args.no_crop:
            # Extract a frame for crop preview
            preview_frame = extract_frame_for_crop(video_path, video_start)
            print(f"  Frame size: {preview_frame.shape[1]}x{preview_frame.shape[0]}")
            cropper = ImageCropper(preview_frame, f"Crop frame: {video_path.name}")
            cropped_frame, should_quit = cropper.run()
            
            if should_quit:
                print("\n\nProcessing cancelled by user.")
                return
            
            if cropper.rect is not None:
                crop_rect = cropper.rect
                print(f"  Crop region: ({crop_rect[0]}, {crop_rect[1]}) to ({crop_rect[2]}, {crop_rect[3]})")
        
        # Process video
        # Process video
        if args.replace:
            # Create a temp output file first
            output_path = video_path.with_name(f"{video_path.stem}_processed_temp{video_path.suffix}")
        else:
            output_path = output_folder / f"{video_path.stem}_processed.mp4"
            
        process_video(
            video_path,
            output_path,
            crop_rect=crop_rect,
            start_time=video_start,
            end_time=video_end,
            target_width=args.width,
            target_height=args.height,
            blur_radius=args.blur
        )
        
        if args.replace:
            # Overwrite original
            try:
                os.replace(output_path, video_path)
                print(f"  ✓ Replaced original: {video_path.name}")
            except OSError as e:
                print(f"  ✗ Error replacing original: {e}")
                # Try to clean up
                if output_path.exists():
                     final_fallback = video_path.with_name(f"{video_path.stem}_processed{video_path.suffix}")
                     os.replace(output_path, final_fallback)
                     print(f"    Saved as: {final_fallback.name}")
        else:
            print(f"  ✓ Saved: {output_path.name}")
        processed_count += 1
    
    # Summary
    print("\n" + "="*50)
    print("PROCESSING COMPLETE")
    print("="*50)
    print(f"  Processed: {processed_count}")
    print(f"  Skipped:   {skipped_count}")
    print(f"  Output:    {output_folder}")
    print("="*50)


if __name__ == "__main__":
    main()
