"""
Image and Video Processor GUI
==============================
A graphical tool that processes images and videos:
1. Select input folder OR single file
2. Draw rectangles to crop each image/video frame
3. Scale to 1080px height with blurred background padding to 1920px width

For videos:
- Visual seeking to select start/end times
- Frame-by-frame cropping option

Requirements: pip install opencv-python numpy pillow
For videos: ffmpeg must be installed and in PATH
"""

import tkinter as tk
from tkinter import ttk, filedialog, messagebox
from PIL import Image, ImageTk
import numpy as np
import cv2
import os
import threading
import queue
import time
import tempfile
import shutil
import concurrent.futures
from pathlib import Path

from media_utils import (
    IMAGE_EXTENSIONS,
    VIDEO_EXTENSIONS,
    MIN_CROP_SIZE,
    check_ffmpeg,
    run_ffmpeg_encode,
    format_time,
    clamp,
    process_image_pil,
    normalize_rect,
    is_valid_crop_rect,
    interpolate_crop_keyframes,
)


class ImageCropCanvas(tk.Canvas):
    """Custom canvas for interactive image cropping."""
    
    def __init__(self, parent, **kwargs):
        super().__init__(parent, **kwargs)
        self.image = None
        self.photo = None
        self.original_image = None
        self.display_scale = 1.0
        self.rect_id = None
        self.start_x = None
        self.start_y = None
        self.crop_rect = None  # (x1, y1, x2, y2) in original image coordinates
        
        # Bind mouse events
        self.bind("<ButtonPress-1>", self.on_press)
        self.bind("<B1-Motion>", self.on_drag)
        self.bind("<ButtonRelease-1>", self.on_release)
        
    def set_image(self, pil_image):
        """Set the image to display."""
        self.original_image = pil_image
        self.crop_rect = None
        self._update_display()
        
    def _update_display(self):
        """Update the canvas display."""
        if self.original_image is None:
            return
            
        # Get canvas size
        canvas_width = self.winfo_width()
        canvas_height = self.winfo_height()
        
        if canvas_width <= 1 or canvas_height <= 1:
            canvas_width = 800
            canvas_height = 600
            
        # Calculate scale to fit image in canvas
        img_width, img_height = self.original_image.size
        scale_w = canvas_width / img_width
        scale_h = canvas_height / img_height
        self.display_scale = min(scale_w, scale_h, 1.0)
        
        # Resize image for display
        display_width = int(img_width * self.display_scale)
        display_height = int(img_height * self.display_scale)
        
        self.image = self.original_image.resize(
            (display_width, display_height), 
            Image.Resampling.LANCZOS
        )
        self.photo = ImageTk.PhotoImage(self.image)
        
        # Center image on canvas
        self.delete("all")
        self.image_x = (canvas_width - display_width) // 2
        self.image_y = (canvas_height - display_height) // 2
        self.create_image(self.image_x, self.image_y, anchor=tk.NW, image=self.photo)
        
        # Redraw crop rectangle if exists
        if self.crop_rect:
            self._draw_crop_rect()
            
    def on_press(self, event):
        """Handle mouse press."""
        self.start_x = event.x
        self.start_y = event.y
        if self.rect_id:
            self.delete(self.rect_id)
            self.rect_id = None
            
    def on_drag(self, event):
        """Handle mouse drag."""
        if self.rect_id:
            self.delete(self.rect_id)
        self.rect_id = self.create_rectangle(
            self.start_x, self.start_y, event.x, event.y,
            outline="#00FF00", width=2
        )
        
    def on_release(self, event):
        """Handle mouse release."""
        if self.start_x is None or self.original_image is None:
            return
            
        # Get rectangle coordinates in canvas space
        x1 = min(self.start_x, event.x)
        y1 = min(self.start_y, event.y)
        x2 = max(self.start_x, event.x)
        y2 = max(self.start_y, event.y)
        
        # Convert to image coordinates
        img_x1 = int((x1 - self.image_x) / self.display_scale)
        img_y1 = int((y1 - self.image_y) / self.display_scale)
        img_x2 = int((x2 - self.image_x) / self.display_scale)
        img_y2 = int((y2 - self.image_y) / self.display_scale)
        
        # Clamp to image bounds
        img_width, img_height = self.original_image.size
        img_x1 = max(0, min(img_x1, img_width))
        img_y1 = max(0, min(img_y1, img_height))
        img_x2 = max(0, min(img_x2, img_width))
        img_y2 = max(0, min(img_y2, img_height))
        
        # Only set crop rect if it's meaningful
        if img_x2 - img_x1 > 10 and img_y2 - img_y1 > 10:
            self.crop_rect = (img_x1, img_y1, img_x2, img_y2)
            
    def _draw_crop_rect(self):
        """Draw the crop rectangle on the canvas."""
        if self.crop_rect is None:
            return
            
        x1, y1, x2, y2 = self.crop_rect
        canvas_x1 = self.image_x + int(x1 * self.display_scale)
        canvas_y1 = self.image_y + int(y1 * self.display_scale)
        canvas_x2 = self.image_x + int(x2 * self.display_scale)
        canvas_y2 = self.image_y + int(y2 * self.display_scale)
        
        if self.rect_id:
            self.delete(self.rect_id)
        self.rect_id = self.create_rectangle(
            canvas_x1, canvas_y1, canvas_x2, canvas_y2,
            outline="#00FF00", width=2
        )
        
    def get_cropped_image(self):
        """Get the cropped image based on current selection."""
        if self.original_image is None:
            return None
            
        if self.crop_rect is None:
            return self.original_image.copy()
            
        x1, y1, x2, y2 = self.crop_rect
        return self.original_image.crop((x1, y1, x2, y2))
        
    def reset_selection(self):
        """Clear the current selection."""
        self.crop_rect = None
        if self.rect_id:
            self.delete(self.rect_id)
            self.rect_id = None


class VideoSeekerCanvas(tk.Canvas):
    """Custom canvas for video seeking with timeline AND crop rectangle drawing."""
    
    def __init__(self, parent, **kwargs):
        super().__init__(parent, **kwargs)
        self.video_path = None
        self.cap = None
        self.photo = None
        self.fps = 0
        self.total_frames = 0
        self.duration = 0
        self.current_frame = 0
        self.start_frame = 0
        self.end_frame = 0
        self.video_width = 0
        self.video_height = 0
        self.display_scale = 1.0
        
        # Image display position
        self.image_x = 0
        self.image_y = 0
        self.display_width = 0
        self.display_height = 0
        
        # Timeline properties
        self.timeline_height = 60
        self.timeline_y = 0
        self.timeline_bar_y = 0
        self.timeline_bar_height = 20
        self.timeline_margin = 20
        
        # Crop keyframes: dict mapping frame number to crop rect (x1, y1, x2, y2)
        self.crop_keyframes = {}
        # Current crop being drawn (not yet added as keyframe)
        self._pending_crop_rect = None
        self.rect_id = None
        self.drawing_crop = False
        self.crop_start_x = None
        self.crop_start_y = None
        
        # Handle dragging state
        self.handle_size = 8  # Size of corner/center handles
        self.dragging_handle = None  # 'tl', 'tr', 'bl', 'br', 'center' or None
        self.drag_start_x = None
        self.drag_start_y = None
        self.drag_start_rect = None  # Crop rect when drag started
        
        # Track if we're dragging on timeline vs video
        self.dragging_timeline_start = False
        self.dragging_timeline_end = False
        
        # Bind mouse events
        self.bind("<ButtonPress-1>", self.on_left_press)
        self.bind("<B1-Motion>", self.on_left_drag)
        self.bind("<ButtonRelease-1>", self.on_left_release)
        self.bind("<ButtonPress-3>", self.on_right_press)
        self.bind("<B3-Motion>", self.on_right_drag)
        self.bind("<ButtonRelease-3>", self.on_right_release)
        
    def load_video(self, video_path):
        """Load a video file."""
        self.video_path = str(video_path)
        if self.cap:
            self.cap.release()
        
        self.cap = cv2.VideoCapture(self.video_path)
        if not self.cap.isOpened():
            return False
        
        self.fps = self.cap.get(cv2.CAP_PROP_FPS) or 30
        self.total_frames = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT))
        self.video_width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        self.video_height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        self.duration = self.total_frames / self.fps if self.fps > 0 else 0
        
        self.current_frame = 0
        self.start_frame = 0
        self.end_frame = self.total_frames - 1
        self.crop_keyframes = {}
        self._pending_crop_rect = None
        self.rect_id = None
        
        self._update_display()
        return True
        
    def _update_display(self):
        """Update the canvas display with current frame and timeline."""
        if self.cap is None:
            return
            
        canvas_width = self.winfo_width()
        canvas_height = self.winfo_height()
        
        if canvas_width <= 1 or canvas_height <= 1:
            canvas_width = 800
            canvas_height = 600
        
        # Get current frame
        self.cap.set(cv2.CAP_PROP_POS_FRAMES, self.current_frame)
        ret, frame = self.cap.read()
        if not ret:
            return
        
        # Convert BGR to RGB
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        pil_image = Image.fromarray(frame_rgb)
        
        # Calculate scale to fit video in canvas (leave room for timeline)
        available_height = canvas_height - self.timeline_height - 20
        scale_w = canvas_width / self.video_width
        scale_h = available_height / self.video_height
        self.display_scale = min(scale_w, scale_h, 1.0)
        
        self.display_width = int(self.video_width * self.display_scale)
        self.display_height = int(self.video_height * self.display_scale)
        
        display_image = pil_image.resize((self.display_width, self.display_height), Image.Resampling.LANCZOS)
        self.photo = ImageTk.PhotoImage(display_image)
        
        # Clear and redraw
        self.delete("all")
        
        # Draw video frame
        self.image_x = (canvas_width - self.display_width) // 2
        self.image_y = 10
        self.create_image(self.image_x, self.image_y, anchor=tk.NW, image=self.photo)
        
        # Get crop for current frame (from keyframes or pending)
        current_crop = self.get_crop_for_frame(self.current_frame)
        
        # Draw crop rectangle and handles if exists
        if current_crop:
            x1, y1, x2, y2 = current_crop
            canvas_x1 = self.image_x + int(x1 * self.display_scale)
            canvas_y1 = self.image_y + int(y1 * self.display_scale)
            canvas_x2 = self.image_x + int(x2 * self.display_scale)
            canvas_y2 = self.image_y + int(y2 * self.display_scale)
            
            # Green for keyframe, yellow for interpolated
            is_keyframe = self.current_frame in self.crop_keyframes
            outline_color = "#00FF00" if is_keyframe else "#FFFF00"
            
            self.rect_id = self.create_rectangle(
                canvas_x1, canvas_y1, canvas_x2, canvas_y2,
                outline=outline_color, width=2
            )
            
            # Draw corner handles
            hs = self.handle_size
            handle_color = outline_color
            
            # Top-left
            self.create_rectangle(canvas_x1 - hs, canvas_y1 - hs, canvas_x1 + hs, canvas_y1 + hs,
                                 fill=handle_color, outline="#000000", tags="handle_tl")
            # Top-right
            self.create_rectangle(canvas_x2 - hs, canvas_y1 - hs, canvas_x2 + hs, canvas_y1 + hs,
                                 fill=handle_color, outline="#000000", tags="handle_tr")
            # Bottom-left
            self.create_rectangle(canvas_x1 - hs, canvas_y2 - hs, canvas_x1 + hs, canvas_y2 + hs,
                                 fill=handle_color, outline="#000000", tags="handle_bl")
            # Bottom-right
            self.create_rectangle(canvas_x2 - hs, canvas_y2 - hs, canvas_x2 + hs, canvas_y2 + hs,
                                 fill=handle_color, outline="#000000", tags="handle_br")
            
            # Center handle for translation
            cx = (canvas_x1 + canvas_x2) // 2
            cy = (canvas_y1 + canvas_y2) // 2
            self.create_oval(cx - hs, cy - hs, cx + hs, cy + hs,
                            fill=handle_color, outline="#000000", tags="handle_center")
        
        # Draw timeline
        self.timeline_y = self.image_y + self.display_height + 10
        self._draw_timeline(canvas_width)
        
    def _draw_timeline(self, canvas_width):
        """Draw the timeline with markers."""
        margin = self.timeline_margin
        bar_height = self.timeline_bar_height
        bar_y = self.timeline_y
        bar_width = canvas_width - 2 * margin
        
        # Store for click detection
        self.timeline_bar_y = bar_y
        
        # Background bar
        self.create_rectangle(margin, bar_y, margin + bar_width, bar_y + bar_height, 
                            fill="#333333", outline="#555555")
        
        # Selected region (green)
        if self.total_frames > 1:
            start_x = margin + int((self.start_frame / (self.total_frames - 1)) * bar_width)
            end_x = margin + int((self.end_frame / (self.total_frames - 1)) * bar_width)
            self.create_rectangle(start_x, bar_y, end_x, bar_y + bar_height, 
                                fill="#006600", outline="")
        
        # Start/End markers (drawn first so current frame line is on top)
        if self.total_frames > 1:
            start_x = margin + int((self.start_frame / (self.total_frames - 1)) * bar_width)
            end_x = margin + int((self.end_frame / (self.total_frames - 1)) * bar_width)
            self.create_line(start_x, bar_y - 8, start_x, bar_y + bar_height + 8, 
                           fill="#00FF00", width=3)
            self.create_line(end_x, bar_y - 8, end_x, bar_y + bar_height + 8, 
                           fill="#FF0000", width=3)
        
        # Current position marker (yellow line) - drawn last to be on top
        if self.total_frames > 1:
            curr_x = margin + int((self.current_frame / (self.total_frames - 1)) * bar_width)
            self.create_line(curr_x, bar_y - 5, curr_x, bar_y + bar_height + 5, 
                           fill="#FFFF00", width=2)
        
        # Time labels
        current_time = self._format_time(self.current_frame / self.fps if self.fps else 0)
        start_time = self._format_time(self.start_frame / self.fps if self.fps else 0)
        end_time = self._format_time(self.end_frame / self.fps if self.fps else 0)
        total_time = self._format_time(self.duration)
        
        self.create_text(margin, bar_y + bar_height + 15, anchor=tk.W, 
                        text=f"Start: {start_time}", fill="#00FF00", font=("Segoe UI", 9))
        self.create_text(canvas_width - margin, bar_y + bar_height + 15, anchor=tk.E,
                        text=f"End: {end_time}", fill="#FF6666", font=("Segoe UI", 9))
        
        # Show keyframe count
        kf_count = len(self.crop_keyframes)
        kf_text = f"Keyframes: {kf_count}"
        self.create_text(canvas_width // 2, bar_y + bar_height + 15, anchor=tk.CENTER,
                        text=f"Current: {current_time} / {total_time} | {kf_text}", fill="#FFFFFF", font=("Segoe UI", 9))
        
        # Draw keyframe markers on timeline
        if self.total_frames > 1:
            for kf_frame in self.crop_keyframes.keys():
                kf_x = margin + int((kf_frame / (self.total_frames - 1)) * bar_width)
                # Draw diamond marker
                size = 5
                self.create_polygon(
                    kf_x, bar_y - 3,       # top
                    kf_x + size, bar_y - 3 - size,  # right
                    kf_x, bar_y - 3 - size * 2,     # top
                    kf_x - size, bar_y - 3 - size,  # left
                    fill="#00FF00", outline="#000000"
                )
        
    def _format_time(self, seconds):
        """Format seconds as MM:SS (wraps shared function)."""
        return format_time(seconds)
    
    def _is_on_timeline(self, y):
        """Check if y coordinate is on the timeline bar."""
        return (self.timeline_bar_y <= y <= self.timeline_bar_y + self.timeline_bar_height + 30)
    
    def _is_on_video(self, x, y):
        """Check if coordinates are on the video frame."""
        return (self.image_x <= x <= self.image_x + self.display_width and
                self.image_y <= y <= self.image_y + self.display_height)
    
    def _get_handle_at(self, x, y):
        """Check if x,y is on a crop handle. Returns handle name or None."""
        current_crop = self.get_crop_for_frame(self.current_frame)
        if not current_crop:
            return None
        
        x1, y1, x2, y2 = current_crop
        canvas_x1 = self.image_x + int(x1 * self.display_scale)
        canvas_y1 = self.image_y + int(y1 * self.display_scale)
        canvas_x2 = self.image_x + int(x2 * self.display_scale)
        canvas_y2 = self.image_y + int(y2 * self.display_scale)
        
        hs = self.handle_size + 4  # Hitbox slightly larger than visual
        
        # Check corners
        if abs(x - canvas_x1) <= hs and abs(y - canvas_y1) <= hs:
            return 'tl'
        if abs(x - canvas_x2) <= hs and abs(y - canvas_y1) <= hs:
            return 'tr'
        if abs(x - canvas_x1) <= hs and abs(y - canvas_y2) <= hs:
            return 'bl'
        if abs(x - canvas_x2) <= hs and abs(y - canvas_y2) <= hs:
            return 'br'
        
        # Check center
        cx = (canvas_x1 + canvas_x2) // 2
        cy = (canvas_y1 + canvas_y2) // 2
        if abs(x - cx) <= hs and abs(y - cy) <= hs:
            return 'center'
        
        return None
    
    def on_left_press(self, event):
        """Handle left button press - check handles, timeline, or start new crop."""
        # First check if clicking on a handle
        handle = self._get_handle_at(event.x, event.y)
        if handle:
            self.dragging_handle = handle
            self.drag_start_x = event.x
            self.drag_start_y = event.y
            self.drag_start_rect = self.get_crop_for_frame(self.current_frame)
            return
        
        if self._is_on_timeline(event.y):
            frame = self._get_frame_from_x(event.x)
            if frame is not None:
                # Ctrl+Click = set start time
                if event.state & 0x4:  # Ctrl key pressed
                    self.start_frame = min(frame, self.end_frame - 1)
                    self.current_frame = self.start_frame
                else:
                    # Normal click = just seek (for setting keyframes)
                    self.current_frame = frame
                self._update_display()
        elif self._is_on_video(event.x, event.y):
            # Click on video = start drawing new crop rectangle
            self.drawing_crop = True
            self.crop_start_x = event.x
            self.crop_start_y = event.y
            self._pending_crop_rect = None
    
    def on_left_drag(self, event):
        """Handle left button drag - handle manipulation, timeline, or draw crop."""
        if self.dragging_handle and self.drag_start_rect:
            # Dragging a handle - compute new rect
            dx = event.x - self.drag_start_x
            dy = event.y - self.drag_start_y
            
            # Convert delta to video coords
            dx_vid = int(dx / self.display_scale)
            dy_vid = int(dy / self.display_scale)
            
            x1, y1, x2, y2 = self.drag_start_rect
            
            if self.dragging_handle == 'center':
                # Translate entire rect
                x1 += dx_vid
                y1 += dy_vid
                x2 += dx_vid
                y2 += dy_vid
            elif self.dragging_handle == 'tl':
                x1 += dx_vid
                y1 += dy_vid
            elif self.dragging_handle == 'tr':
                x2 += dx_vid
                y1 += dy_vid
            elif self.dragging_handle == 'bl':
                x1 += dx_vid
                y2 += dy_vid
            elif self.dragging_handle == 'br':
                x2 += dx_vid
                y2 += dy_vid
            
            # Clamp to video bounds
            x1 = max(0, min(x1, self.video_width))
            y1 = max(0, min(y1, self.video_height))
            x2 = max(0, min(x2, self.video_width))
            y2 = max(0, min(y2, self.video_height))
            
            # Ensure valid rect (x1 < x2, y1 < y2)
            if x1 > x2:
                x1, x2 = x2, x1
            if y1 > y2:
                y1, y2 = y2, y1
            
            # Update pending crop (will become keyframe on release)
            self._pending_crop_rect = (x1, y1, x2, y2)
            self._update_display()
            
        elif self.drawing_crop and self.crop_start_x is not None:
            # Drawing crop rectangle
            if self.rect_id:
                self.delete(self.rect_id)
            self.rect_id = self.create_rectangle(
                self.crop_start_x, self.crop_start_y, event.x, event.y,
                outline="#00FF00", width=2
            )
    
    def on_left_release(self, event):
        """Handle left button release - finalize handle drag, crop, or timeline."""
        # Handle drag finished - auto-create keyframe
        if self.dragging_handle and self._pending_crop_rect:
            self.crop_keyframes[self.current_frame] = self._pending_crop_rect
            self._pending_crop_rect = None
            self.dragging_handle = None
            self.drag_start_rect = None
            self._update_display()
            return
        
        self.dragging_handle = None
        self.drag_start_rect = None
        self.dragging_timeline_start = False
        
        if self.drawing_crop and self.crop_start_x is not None:
            self.drawing_crop = False
            
            # Get rectangle in canvas coordinates
            x1 = min(self.crop_start_x, event.x)
            y1 = min(self.crop_start_y, event.y)
            x2 = max(self.crop_start_x, event.x)
            y2 = max(self.crop_start_y, event.y)
            
            # Convert to video coordinates
            vid_x1 = int((x1 - self.image_x) / self.display_scale)
            vid_y1 = int((y1 - self.image_y) / self.display_scale)
            vid_x2 = int((x2 - self.image_x) / self.display_scale)
            vid_y2 = int((y2 - self.image_y) / self.display_scale)
            
            # Clamp to video bounds
            vid_x1 = max(0, min(vid_x1, self.video_width))
            vid_y1 = max(0, min(vid_y1, self.video_height))
            vid_x2 = max(0, min(vid_x2, self.video_width))
            vid_y2 = max(0, min(vid_y2, self.video_height))
            
            # Only set crop if meaningful size - auto-create keyframe
            if vid_x2 - vid_x1 > 10 and vid_y2 - vid_y1 > 10:
                # Auto-create keyframe when drawing new crop
                self.crop_keyframes[self.current_frame] = (vid_x1, vid_y1, vid_x2, vid_y2)
                self._pending_crop_rect = None
            else:
                self._pending_crop_rect = None
                if self.rect_id:
                    self.delete(self.rect_id)
                    self.rect_id = None
            
            self.crop_start_x = None
            self.crop_start_y = None
            self._update_display()
    
    def on_right_press(self, event):
        """Handle right button press - Ctrl+click sets end time."""
        if self._is_on_timeline(event.y):
            frame = self._get_frame_from_x(event.x)
            if frame is not None:
                # Only Ctrl+Right click sets end time
                if event.state & 0x4:  # Ctrl key pressed
                    self.end_frame = max(frame, self.start_frame + 1)
                    self.current_frame = self.end_frame
                    self._update_display()
    
    def on_right_drag(self, event):
        """Handle right button drag - no-op now."""
        pass
    
    def on_right_release(self, event):
        """Handle right button release."""
        pass
    
    def _get_frame_from_x(self, x):
        """Get frame number from x coordinate on timeline."""
        canvas_width = self.winfo_width()
        bar_width = canvas_width - 2 * self.timeline_margin
        
        if bar_width <= 0 or self.total_frames <= 1:
            return None
        
        relative_x = max(0, min(x - self.timeline_margin, bar_width))
        return int((relative_x / bar_width) * (self.total_frames - 1))
    
    def reset_crop(self):
        """Clear the pending crop rectangle (not keyframes)."""
        self._pending_crop_rect = None
        if self.rect_id:
            self.delete(self.rect_id)
            self.rect_id = None
        self._update_display()
    
    def clear_all_keyframes(self):
        """Clear all crop keyframes."""
        self.crop_keyframes = {}
        self._pending_crop_rect = None
        if self.rect_id:
            self.delete(self.rect_id)
            self.rect_id = None
        self._update_display()
        
    def set_start_at_current(self):
        """Set start point at current position."""
        self.start_frame = min(self.current_frame, self.end_frame - 1)
        self._update_display()
        
    def set_end_at_current(self):
        """Set end point at current position."""
        self.end_frame = max(self.current_frame, self.start_frame + 1)
        self._update_display()
        
    def seek_relative(self, frames):
        """Seek by a number of frames."""
        self.current_frame = max(0, min(self.current_frame + frames, self.total_frames - 1))
        self._update_display()
        
    def get_time_range(self):
        """Get the selected time range in seconds."""
        start_time = self.start_frame / self.fps if self.fps else 0
        end_time = self.end_frame / self.fps if self.fps else 0
        return start_time, end_time
        
    def get_current_frame_image(self):
        """Get the current frame as a PIL Image."""
        return self.get_frame_at_position(self.current_frame)
    
    def get_start_frame_image(self):
        """Get the frame at the start position as a PIL Image."""
        return self.get_frame_at_position(self.start_frame)
    
    def get_frame_at_position(self, frame_num):
        """Get a specific frame as a PIL Image."""
        if self.cap is None:
            return None
        
        self.cap.set(cv2.CAP_PROP_POS_FRAMES, frame_num)
        ret, frame = self.cap.read()
        if not ret:
            return None
        
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        return Image.fromarray(frame_rgb)
    
    def release(self):
        """Release video resources."""
        if self.cap:
            self.cap.release()
            self.cap = None
    
    # =========================================================================
    # Keyframe management methods
    # =========================================================================
    
    def get_crop_for_frame(self, frame_num):
        """
        Get the crop rect for a specific frame.
        Returns keyframe value, interpolated value, or pending crop.
        """
        # If there's a pending crop being drawn, show it
        if self._pending_crop_rect is not None:
            return self._pending_crop_rect
        
        # Check if this frame is a keyframe
        if frame_num in self.crop_keyframes:
            return self.crop_keyframes[frame_num]
        
        # Interpolate from keyframes
        if self.crop_keyframes:
            return interpolate_crop_keyframes(
                self.crop_keyframes,
                frame_num,
                self.video_width,
                self.video_height
            )
        
        return None
    
    @property
    def crop_rect(self):
        """Property for backwards compatibility - returns keyframes dict."""
        return self.crop_keyframes if self.crop_keyframes else None
    
    @crop_rect.setter
    def crop_rect(self, value):
        """Setter for crop_rect property - accepts dict (keyframes) or tuple (single crop)."""
        if isinstance(value, dict):
            self.crop_keyframes = value.copy()
            self._pending_crop_rect = None
        elif isinstance(value, (tuple, list)) and len(value) == 4:
            # Legacy: single crop, verify if valid
            if all(isinstance(x, (int, float)) for x in value):
                # Set as keyframe 0 or just wipe keyframes and set as single? 
                # Let's clean keyframes and set this as implicit single crop derived from frame 0? 
                # Or just put it at frame 0.
                self.crop_keyframes = {0: tuple(value)}
                self._pending_crop_rect = None
        else:
            self.crop_keyframes = {}
            self._pending_crop_rect = None
        self._update_display()
    
    def add_keyframe(self):
        """
        Add a keyframe at the current frame with the pending crop rect.
        Returns True if keyframe was added, False otherwise.
        """
        crop = self._pending_crop_rect or self.get_crop_for_frame(self.current_frame)
        if crop is not None:
            self.crop_keyframes[self.current_frame] = crop
            self._pending_crop_rect = None
            self._update_display()
            return True
        return False
    
    def remove_keyframe(self):
        """
        Remove the keyframe at the current frame.
        Returns True if keyframe was removed, False otherwise.
        """
        if self.current_frame in self.crop_keyframes:
            del self.crop_keyframes[self.current_frame]
            self._update_display()
            return True
        return False
    
    def has_keyframe_at_current(self):
        """Check if there's a keyframe at the current frame."""
        return self.current_frame in self.crop_keyframes
    
    def get_keyframe_count(self):
        """Get the number of keyframes."""
        return len(self.crop_keyframes)
    
    def go_to_next_keyframe(self):
        """Navigate to the next keyframe after current position."""
        if not self.crop_keyframes:
            return False
        sorted_frames = sorted(self.crop_keyframes.keys())
        for kf in sorted_frames:
            if kf > self.current_frame:
                self.current_frame = kf
                self._update_display()
                return True
        return False
    
    def go_to_prev_keyframe(self):
        """Navigate to the previous keyframe before current position."""
        if not self.crop_keyframes:
            return False
        sorted_frames = sorted(self.crop_keyframes.keys(), reverse=True)
        for kf in sorted_frames:
            if kf < self.current_frame:
                self.current_frame = kf
                self._update_display()
                return True
        return False


class MediaProcessorGUI:
    """Main GUI application for image and video processing."""
    
    def __init__(self, root):
        self.root = root
        self.root.title("Image & Video Processor")
        self.root.geometry("1300x900")
        self.root.minsize(1000, 700)
        
        # Configure style
        self.style = ttk.Style()
        self.style.configure("Title.TLabel", font=("Segoe UI", 16, "bold"))
        self.style.configure("Heading.TLabel", font=("Segoe UI", 11, "bold"))
        self.style.configure("Status.TLabel", font=("Segoe UI", 10))
        
        # Variables
        self.input_mode = tk.StringVar(value="folder")  # "folder" or "file"
        self.input_path = tk.StringVar()
        self.output_folder = tk.StringVar()
        self.blur_radius = tk.IntVar(value=10)
        self.file_type_filter = tk.StringVar(value="all")  # "all", "images", "videos"
        self.include_audio = tk.BooleanVar(value=True)  # Include audio in output video
        self.video_speed = tk.DoubleVar(value=1.0)  # Playback speed multiplier
        
        # Resolution presets
        self.resolution_presets = {
            "1080p": {"16:9": (1920, 1080), "9:16": (1080, 1920)},
            "4K": {"16:9": (3840, 2160), "9:16": (2160, 3840)}
        }
        self.resolution_var = tk.StringVar(value="1080p")
        self.aspect_ratio_var = tk.StringVar(value="16:9")
        
        self.media_files = []
        self.current_index = 0
        self.processed_count = 0
        self.current_mode = "image"  # "image" or "video_seek" or "video_crop"
        self.current_video_times = None  # (start, end) times for current video
        self.current_crop_rect = None  # Crop rect for current video
        
        self.current_crop_rect = None  # Crop rect for current video
        
        # Persistence settings
        self.file_settings = {}  # {'path_str': {'crop': [...], 'time': [...]}}
        
        self.cancel_event = threading.Event()
        
        self._build_ui()
        self._check_ffmpeg()
        
    def _check_ffmpeg(self):
        """Check if ffmpeg is available."""
        self.ffmpeg_available = check_ffmpeg()
            
    def _build_ui(self):
        """Build the user interface."""
        # Main container
        main_frame = ttk.Frame(self.root, padding=10)
        main_frame.pack(fill=tk.BOTH, expand=True)
        
        # Left panel - Settings
        left_panel = ttk.Frame(main_frame, width=320)
        left_panel.pack(side=tk.LEFT, fill=tk.Y, padx=(0, 10))
        left_panel.pack_propagate(False)
        
        # Title
        ttk.Label(left_panel, text="Media Processor", style="Title.TLabel").pack(pady=(0, 15))
        
        # Input mode selection
        ttk.Label(left_panel, text="Input Mode:", style="Heading.TLabel").pack(anchor=tk.W)
        mode_frame = ttk.Frame(left_panel)
        mode_frame.pack(fill=tk.X, pady=(5, 10))
        ttk.Radiobutton(mode_frame, text="Folder", variable=self.input_mode, 
                       value="folder", command=self._on_mode_change).pack(side=tk.LEFT)
        ttk.Radiobutton(mode_frame, text="Single File", variable=self.input_mode,
                       value="file", command=self._on_mode_change).pack(side=tk.LEFT, padx=(20, 0))
        
        # Input path
        self.input_label = ttk.Label(left_panel, text="Input Folder:", style="Heading.TLabel")
        self.input_label.pack(anchor=tk.W)
        input_frame = ttk.Frame(left_panel)
        input_frame.pack(fill=tk.X, pady=(5, 10))
        ttk.Entry(input_frame, textvariable=self.input_path, state="readonly").pack(side=tk.LEFT, fill=tk.X, expand=True)
        ttk.Button(input_frame, text="Browse", command=self._browse_input).pack(side=tk.RIGHT, padx=(5, 0))
        
        # File type filter (for folder mode)
        self.filter_label = ttk.Label(left_panel, text="File Type:", style="Heading.TLabel")
        self.filter_label.pack(anchor=tk.W)
        filter_frame = ttk.Frame(left_panel)
        filter_frame.pack(fill=tk.X, pady=(5, 10))
        ttk.Radiobutton(filter_frame, text="All", variable=self.file_type_filter, value="all").pack(side=tk.LEFT)
        ttk.Radiobutton(filter_frame, text="Images", variable=self.file_type_filter, value="images").pack(side=tk.LEFT, padx=(10, 0))
        ttk.Radiobutton(filter_frame, text="Videos", variable=self.file_type_filter, value="videos").pack(side=tk.LEFT, padx=(10, 0))
        self.filter_frame = filter_frame
        
        # Output folder
        ttk.Label(left_panel, text="Output Folder:", style="Heading.TLabel").pack(anchor=tk.W)
        output_frame = ttk.Frame(left_panel)
        output_frame.pack(fill=tk.X, pady=(5, 10))
        ttk.Entry(output_frame, textvariable=self.output_folder, state="readonly").pack(side=tk.LEFT, fill=tk.X, expand=True)
        ttk.Button(output_frame, text="Browse", command=self._browse_output).pack(side=tk.RIGHT, padx=(5, 0))
        
        # Separator
        ttk.Separator(left_panel, orient=tk.HORIZONTAL).pack(fill=tk.X, pady=15)
        
        # Settings
        ttk.Label(left_panel, text="Settings", style="Heading.TLabel").pack(anchor=tk.W, pady=(0, 10))
        
        # Blur radius
        blur_frame = ttk.Frame(left_panel)
        blur_frame.pack(fill=tk.X, pady=5)
        ttk.Label(blur_frame, text="Blur Radius:").pack(side=tk.LEFT)
        ttk.Spinbox(blur_frame, from_=1, to=100, textvariable=self.blur_radius, width=8).pack(side=tk.RIGHT)
        
        # Resolution preset
        res_frame = ttk.Frame(left_panel)
        res_frame.pack(fill=tk.X, pady=5)
        ttk.Label(res_frame, text="Resolution:").pack(side=tk.LEFT)
        res_combo = ttk.Combobox(res_frame, textvariable=self.resolution_var, 
                                  values=["1080p", "4K"], state="readonly", width=10)
        res_combo.pack(side=tk.RIGHT)
        res_combo.bind("<<ComboboxSelected>>", self._update_resolution_display)
        
        # Aspect ratio preset
        aspect_frame = ttk.Frame(left_panel)
        aspect_frame.pack(fill=tk.X, pady=5)
        ttk.Label(aspect_frame, text="Aspect Ratio:").pack(side=tk.LEFT)
        aspect_combo = ttk.Combobox(aspect_frame, textvariable=self.aspect_ratio_var,
                                     values=["16:9", "9:16"], state="readonly", width=10)
        aspect_combo.pack(side=tk.RIGHT)
        aspect_combo.bind("<<ComboboxSelected>>", self._update_resolution_display)
        
        # Resolution display label
        self.resolution_display = ttk.Label(left_panel, text="Output: 1920 × 1080", style="Status.TLabel")
        self.resolution_display.pack(anchor=tk.E, pady=(2, 0))
        
        # Include audio checkbox
        self.audio_checkbox = ttk.Checkbutton(left_panel, text="Include Audio", variable=self.include_audio)
        self.audio_checkbox.pack(anchor=tk.W, pady=(10, 0))
        
        # Playback Speed
        speed_frame = ttk.Frame(left_panel)
        speed_frame.pack(anchor=tk.W, pady=(5, 0))
        ttk.Label(speed_frame, text="Speed:").pack(side=tk.LEFT)
        self.speed_spin = ttk.Spinbox(speed_frame, from_=0.5, to=4.0, increment=0.25, 
                                      textvariable=self.video_speed, width=5)
        self.speed_spin.pack(side=tk.LEFT, padx=5)
        ttk.Label(speed_frame, text="x").pack(side=tk.LEFT)
        
        # ffmpeg status
        self.ffmpeg_label = ttk.Label(left_panel, text="", style="Status.TLabel")
        self.ffmpeg_label.pack(anchor=tk.W, pady=(5, 0))
        
        # Separator
        ttk.Separator(left_panel, orient=tk.HORIZONTAL).pack(fill=tk.X, pady=15)
        
        # Separator
        ttk.Separator(left_panel, orient=tk.HORIZONTAL).pack(fill=tk.X, pady=15)
        
        # File info label
        self.file_count_label = ttk.Label(left_panel, text="", style="Status.TLabel")
        self.file_count_label.pack(anchor=tk.W, pady=5)
        
        # Progress
        self.progress_label = ttk.Label(left_panel, text="", style="Status.TLabel")
        self.progress_label.pack(pady=10)
        
        self.progress_bar = ttk.Progressbar(left_panel, mode="determinate")
        self.progress_bar.pack(fill=tk.X, pady=5)
        
        # Cancel button (below progress bar)
        self.cancel_btn = ttk.Button(left_panel, text="Cancel Processing", command=self._cancel_processing, state=tk.DISABLED)
        self.cancel_btn.pack(fill=tk.X, pady=(5, 0))
        
        # Separator
        ttk.Separator(left_panel, orient=tk.HORIZONTAL).pack(fill=tk.X, pady=15)
        
        # Instructions (will be updated based on mode)
        self.instructions_label = ttk.Label(left_panel, text="", justify=tk.LEFT, wraplength=300)
        self.instructions_label.pack(anchor=tk.W)
        self._update_instructions()
        
        # Right panel - Canvas and controls
        right_panel = ttk.Frame(main_frame)
        right_panel.pack(side=tk.RIGHT, fill=tk.BOTH, expand=True)
        
        # Media info
        self.media_info = ttk.Label(right_panel, text="No media loaded", style="Heading.TLabel")
        self.media_info.pack(pady=(0, 5))
        
        # Canvas container (will swap between image and video canvas)
        self.canvas_frame = ttk.Frame(right_panel, relief=tk.SUNKEN, borderwidth=2)
        self.canvas_frame.pack(fill=tk.BOTH, expand=True)
        
        # Image crop canvas
        self.image_canvas = ImageCropCanvas(self.canvas_frame, bg="#2b2b2b", highlightthickness=0)
        
        # Video seeker canvas
        self.video_canvas = VideoSeekerCanvas(self.canvas_frame, bg="#2b2b2b", highlightthickness=0)
        
        # Show image canvas by default
        self.image_canvas.pack(fill=tk.BOTH, expand=True)
        self.active_canvas = "image"
        
        # Control frames
        self.controls_frame = ttk.Frame(right_panel)
        self.controls_frame.pack(fill=tk.X, pady=10)
        
        # Image controls
        self.image_controls = ttk.Frame(self.controls_frame)
        self.reset_btn = ttk.Button(self.image_controls, text="Reset Selection", command=self._reset_selection, state=tk.DISABLED)
        self.reset_btn.pack(side=tk.LEFT, padx=5)
        self.skip_btn = ttk.Button(self.image_controls, text="Skip (Use Full)", command=self._skip_current, state=tk.DISABLED)
        self.skip_btn.pack(side=tk.LEFT, padx=5)
        self.confirm_btn = ttk.Button(self.image_controls, text="Confirm & Next", command=self._confirm_current, state=tk.DISABLED)
        self.confirm_btn.pack(side=tk.RIGHT, padx=5)
        self.preview_btn = ttk.Button(self.image_controls, text="Preview Result", command=self._preview_result, state=tk.DISABLED)
        self.preview_btn.pack(side=tk.RIGHT, padx=5)
        
        # Video seeking controls
        self.video_seek_controls = ttk.Frame(self.controls_frame)
        
        # Left side: seek controls
        ttk.Button(self.video_seek_controls, text="◀◀ -10s", command=lambda: self._video_seek(-300)).pack(side=tk.LEFT, padx=2)
        ttk.Button(self.video_seek_controls, text="◀ -1s", command=lambda: self._video_seek(-30)).pack(side=tk.LEFT, padx=2)
        ttk.Button(self.video_seek_controls, text="< -1f", command=lambda: self._video_seek(-1)).pack(side=tk.LEFT, padx=2)
        ttk.Button(self.video_seek_controls, text="+1f >", command=lambda: self._video_seek(1)).pack(side=tk.LEFT, padx=2)
        ttk.Button(self.video_seek_controls, text="+1s ▶", command=lambda: self._video_seek(30)).pack(side=tk.LEFT, padx=2)
        ttk.Button(self.video_seek_controls, text="+10s ▶▶", command=lambda: self._video_seek(300)).pack(side=tk.LEFT, padx=2)
        
        # Separator
        ttk.Separator(self.video_seek_controls, orient=tk.VERTICAL).pack(side=tk.LEFT, fill=tk.Y, padx=10)
        
        # Keyframe navigation buttons
        ttk.Button(self.video_seek_controls, text="◀ Prev KF", command=self._prev_keyframe).pack(side=tk.LEFT, padx=2)
        ttk.Button(self.video_seek_controls, text="Next KF ▶", command=self._next_keyframe).pack(side=tk.LEFT, padx=2)
        
        # Clear keyframe button (only active when on a keyframe)
        self.clear_keyframe_btn = ttk.Button(self.video_seek_controls, text="Clear Keyframe", command=self._clear_current_keyframe)
        self.clear_keyframe_btn.pack(side=tk.LEFT, padx=5)
        
        # Clear all keyframes button
        ttk.Button(self.video_seek_controls, text="Clear All", command=self._clear_all_keyframes).pack(side=tk.LEFT, padx=2)
        
        # Right side: process button
        self.video_confirm_btn = ttk.Button(self.video_seek_controls, text="Process Video", command=self._process_video_now)
        self.video_confirm_btn.pack(side=tk.RIGHT, padx=5)
        self.video_skip_btn = ttk.Button(self.video_seek_controls, text="Skip Video", command=self._skip_video)
        self.video_skip_btn.pack(side=tk.RIGHT, padx=5)
        
        # Show image controls by default
        self.image_controls.pack(fill=tk.X)
        
        # Bind resize event
        self.image_canvas.bind("<Configure>", lambda e: self._on_canvas_resize())
        self.video_canvas.bind("<Configure>", lambda e: self._on_video_canvas_resize())
        
    def _on_mode_change(self):
        """Handle input mode change."""
        mode = self.input_mode.get()
        if mode == "folder":
            self.input_label.configure(text="Input Folder:")
            self.filter_label.pack(anchor=tk.W, before=self.filter_frame)
            self.filter_frame.pack(fill=tk.X, pady=(5, 10), after=self.filter_label)
        else:
            self.input_label.configure(text="Input File:")
            self.filter_label.pack_forget()
            self.filter_frame.pack_forget()
        self.input_path.set("")
        self._update_instructions()
        
    def _update_instructions(self):
        """Update the instructions based on current mode."""
        if self.input_mode.get() == "folder":
            text = """Instructions:
1. Select valid Input Folder
2. Editor will load automatically

Images:
• Draw crop rectangle, then Confirm

Videos:
• Left-click timeline = set start
• Right-click timeline = set end
• Draw crop on video frame
• Click 'Process Video'"""
        else:
            text = """Instructions:
1. Select Input File
2. Editor will load automatically

For videos:
• Left-click timeline = set start
• Right-click timeline = set end
• Draw crop rectangle on video
• Click 'Process Video'"""
        self.instructions_label.configure(text=text)
        
    def _browse_input(self):
        """Browse for input folder or file."""
        if self.input_mode.get() == "folder":
            path = filedialog.askdirectory(title="Select Input Folder")
        else:
            filetypes = [
                ("Media files", "*.jpg *.jpeg *.png *.bmp *.tiff *.tif *.webp *.mp4 *.avi *.mov *.mkv *.webm"),
                ("Image files", "*.jpg *.jpeg *.png *.bmp *.tiff *.tif *.webp"),
                ("Video files", "*.mp4 *.avi *.mov *.mkv *.webm"),
                ("All files", "*.*")
            ]
            path = filedialog.askopenfilename(title="Select Input File", filetypes=filetypes)
        
        if path:
            self.input_path.set(path)
            # Auto-set output folder
            if not self.output_folder.get():
                if self.input_mode.get() == "folder":
                    self.output_folder.set(os.path.join(path, "processed"))
                else:
                    self.output_folder.set(os.path.join(os.path.dirname(path), "processed"))
            
            # Auto-start processing
            self._start_processing()
                    
    def _browse_output(self):
        """Browse for output folder."""
        folder = filedialog.askdirectory(title="Select Output Folder")
        if folder:
            self.output_folder.set(folder)
            
    def _start_processing(self):
        """Start the processing workflow."""
        if not self.input_path.get():
            messagebox.showerror("Error", "Please select an input path")
            return
        
        # Get media files
        if self.input_mode.get() == "folder":
            self.media_files = self._get_media_files(self.input_path.get())
        else:
            # Single file
            path = Path(self.input_path.get())
            if path.exists() and path.is_file():
                self.media_files = [path]
            else:
                self.media_files = []
        
        if not self.media_files:
            messagebox.showwarning("Warning", "No media files found")
            return
        
        # Create output folder
        output_path = self.output_folder.get() or os.path.join(
            self.input_path.get() if self.input_mode.get() == "folder" else os.path.dirname(self.input_path.get()),
            "processed"
        )
        self.output_folder.set(output_path)
        os.makedirs(output_path, exist_ok=True)
        
        # Reset state
        self.current_index = 0
        self.processed_count = 0
        self.progress_bar["maximum"] = len(self.media_files)
        self.progress_bar["value"] = 0
        
        # Update ffmpeg status
        if self.ffmpeg_available:
            self.ffmpeg_label.configure(text="✓ ffmpeg found", foreground="green")
        else:
            self.ffmpeg_label.configure(text="⚠ ffmpeg not found (no audio)", foreground="orange")
        
        # Load first file
        self._load_current_media()
        
    def _get_media_files(self, folder):
        """Get all media files from a folder based on filter."""
        filter_type = self.file_type_filter.get()
        if filter_type == "images":
            supported = IMAGE_EXTENSIONS
        elif filter_type == "videos":
            supported = VIDEO_EXTENSIONS
        else:
            supported = IMAGE_EXTENSIONS | VIDEO_EXTENSIONS
        
        files = []
        for f in sorted(Path(folder).iterdir()):
            if f.is_file() and f.suffix.lower() in supported:
                files.append(f)
        return files
        
    def _is_video(self, path):
        """Check if a file is a video."""
        return Path(path).suffix.lower() in VIDEO_EXTENSIONS
        
    def _load_current_media(self):
        """Load the current media file."""
        if self.current_index >= len(self.media_files):
            self._finish_processing()
            return
        
        media_path = self.media_files[self.current_index]
        self.progress_label.configure(text=f"File {self.current_index + 1} of {len(self.media_files)}")
        self.media_info.configure(text=f"{media_path.name}")
        
        if self._is_video(media_path):
            self._load_video(media_path)
        else:
            self._load_image(media_path)
            
    def _load_image(self, image_path):
        """Load an image file."""
        self.current_mode = "image"
        self._show_image_canvas()
        self._set_image_controls_state(True)
        
        try:
            pil_image = Image.open(image_path)
            if pil_image.mode in ('RGBA', 'LA', 'P'):
                pil_image = pil_image.convert('RGB')
            self.image_canvas.set_image(pil_image)
            self.current_media_path = image_path
            
            # Restore settings if available
            path_str = str(image_path)
            if path_str in self.file_settings:
                settings = self.file_settings[path_str]
                if settings.get('crop'):
                    self.image_canvas.crop_rect = settings['crop']
                    self.image_canvas._update_display()
                    
        except Exception as e:
            messagebox.showerror("Error", f"Failed to load image:\n{e}\n\nProcessing cancelled.")
            # Do not continue to next file - cancel as requested
            self.media_info.configure(text=f"Error loading {image_path.name}")
            
    def _load_video(self, video_path):
        """Load a video file for seeking."""
        self.current_mode = "video_seek"
        self._show_video_canvas()
        self.current_media_path = video_path
        self.current_video_times = None
        self.current_crop_rect = None
        
        if not self.video_canvas.load_video(video_path):
            messagebox.showerror("Error", f"Failed to load video:\n{video_path}\n\nProcessing cancelled.")
            # Do not continue to next file - cancel as requested
            self.media_info.configure(text=f"Error loading {video_path.name}")
            return

        # Restore settings if available
        path_str = str(video_path)
        if path_str in self.file_settings:
            settings = self.file_settings[path_str]
            
            if settings.get('time'):
                start_sec, end_sec = settings['time']
                self.video_canvas.start_frame = int(start_sec * self.video_canvas.fps)
                self.video_canvas.end_frame = int(end_sec * self.video_canvas.fps)
                # Clamp
                self.video_canvas.start_frame = max(0, min(self.video_canvas.start_frame, self.video_canvas.total_frames - 1))
                self.video_canvas.end_frame = max(0, min(self.video_canvas.end_frame, self.video_canvas.total_frames - 1))
                if self.video_canvas.start_frame > self.video_canvas.end_frame:
                     self.video_canvas.end_frame = self.video_canvas.total_frames - 1
                self.video_canvas.current_frame = self.video_canvas.start_frame
            
            if settings.get('crop'):
                self.video_canvas.crop_rect = settings['crop']
            
            self.video_canvas._update_display()
            
    def _show_image_canvas(self):
        """Show the image cropping canvas."""
        if self.active_canvas != "image":
            self.video_canvas.pack_forget()
            self.video_seek_controls.pack_forget()
            self.image_canvas.pack(fill=tk.BOTH, expand=True)
            self.image_controls.pack(fill=tk.X)
            self.active_canvas = "image"
            
    def _show_video_canvas(self):
        """Show the video seeking canvas."""
        if self.active_canvas != "video":
            self.image_canvas.pack_forget()
            self.image_controls.pack_forget()
            self.video_canvas.pack(fill=tk.BOTH, expand=True)
            self.video_seek_controls.pack(fill=tk.X)
            self.active_canvas = "video"
            
    def _video_seek(self, frames):
        """Seek video by a number of frames."""
        self.video_canvas.seek_relative(frames)
        
    def _set_video_start(self):
        """Set video start at current position."""
        self.video_canvas.set_start_at_current()
        
    def _set_video_end(self):
        """Set video end at current position."""
        self.video_canvas.set_end_at_current()
    
    def _reset_video_crop(self):
        """Reset the crop rectangle on the video."""
        self.video_canvas.reset_crop()
    
    def _prev_keyframe(self):
        """Go to previous keyframe."""
        self.video_canvas.go_to_prev_keyframe()
    
    def _next_keyframe(self):
        """Go to next keyframe."""
        self.video_canvas.go_to_next_keyframe()
    
    def _clear_current_keyframe(self):
        """Clear the keyframe at the current position."""
        self.video_canvas.remove_keyframe()
    
    def _clear_all_keyframes(self):
        """Clear all crop keyframes."""
        self.video_canvas.clear_all_keyframes()
        
    def _process_video_now(self):
        """Process the video with current time range and crop settings."""
        # Get time range from video canvas
        self.current_video_times = self.video_canvas.get_time_range()
        
        # Get crop rect from video canvas (may be None)
        crop_rect = self.video_canvas.crop_rect
        
        # Save settings for this file
        self.file_settings[str(self.current_media_path)] = {
            'crop': crop_rect,
            'time': self.current_video_times
        }
        
        # Process the video
        self._process_current_video(crop_rect)
        
    def _skip_video(self):
        """Skip this video and move to next file."""
        self.video_canvas.release()
        self.current_index += 1
        self._load_current_media()
            
    def _on_canvas_resize(self):
        """Handle image canvas resize."""
        if self.image_canvas.original_image:
            self.image_canvas._update_display()
            
    def _on_video_canvas_resize(self):
        """Handle video canvas resize."""
        if self.video_canvas.cap:
            self.video_canvas._update_display()
            
    def _reset_selection(self):
        """Reset the current crop selection."""
        self.image_canvas.reset_selection()
        
    def _skip_current(self):
        """Skip cropping and use full image."""
        self.image_canvas.reset_selection()
        self._confirm_current()
        
    def _confirm_current(self):
        """Confirm the current selection and process."""
        if self.current_mode == "image":
            self._process_current_image()
            
    def _process_current_image(self):
        """Process the current image."""
        # Save settings for this file
        self.file_settings[str(self.current_media_path)] = {
            'crop': self.image_canvas.crop_rect
        }

        cropped = self.image_canvas.get_cropped_image()
        if cropped is None:
            return
        
        result = self._apply_processing(cropped)
        
        # Save
        output_path = Path(self.output_folder.get()) / f"{self.current_media_path.stem}_processed{self.current_media_path.suffix}"
        result.save(output_path, quality=95)
        
        self.processed_count += 1
        self.progress_bar["value"] = self.current_index + 1
        
        # Next file
        self.current_index += 1
        self._load_current_media()
        
    def _process_current_video(self, crop_rect):
        """Process the current video."""
        self.media_info.configure(text=f"Processing {self.current_media_path.name}...")
        
        # Disable all controls during processing
        self._set_image_controls_state(False)
        self._set_video_controls_state(False)
        
        # Reset cancel event and enable cancel button
        self.cancel_event.clear()
        self.cancel_btn.configure(state=tk.NORMAL, text="Cancel Processing")
        
        self.root.update()
        
        # Progress callback to update GUI from background thread
        def update_progress(current, total, stage="frames", **kwargs):
            def do_update():
                if stage == "frames":
                    percent = int((current / total) * 100) if total > 0 else 0
                    
                    # Build status text with timing info
                    status_parts = [f"Processing: {percent}% ({current}/{total} frames)"]
                    
                    if 'ms_per_frame' in kwargs:
                        ms = kwargs['ms_per_frame']
                        status_parts.append(f"{ms:.0f}ms/frame")
                    
                    if 'eta_seconds' in kwargs:
                        eta = kwargs['eta_seconds']
                        if eta >= 60:
                            eta_str = f"{int(eta // 60)}m {int(eta % 60)}s"
                        else:
                            eta_str = f"{int(eta)}s"
                        status_parts.append(f"ETA: {eta_str}")
                    
                    self.media_info.configure(text=" | ".join(status_parts))
                    
                    # Update progress label with full timing breakdown
                    if 'timing_breakdown' in kwargs:
                        tb = kwargs['timing_breakdown']
                        breakdown_parts = [
                            f"R:{tb.get('read', 0)}%",
                            f"Cr:{tb.get('crop', 0)}%",
                            f"→PIL:{tb.get('convert_to_pil', 0)}%",
                            f"Blur:{tb.get('process', 0)}%",
                            f"→CV:{tb.get('convert_to_cv', 0)}%",
                            f"W:{tb.get('write', 0)}%"
                        ]
                        self.progress_label.configure(text=" | ".join(breakdown_parts))
                    
                    self.progress_bar["maximum"] = total
                    self.progress_bar["value"] = current
                elif stage == "encoding":
                    self.media_info.configure(text="Re-encoding with ffmpeg...")
                    self.progress_label.configure(text="Adding audio and optimizing...")
            self.root.after(0, do_update)
        
        # Process in background thread
        def process():
            try:
                success = self._process_video_file(
                    self.current_media_path,
                    crop_rect,
                    self.current_video_times,
                    progress_callback=update_progress
                )
                self.root.after(0, lambda: self._on_video_processed(success))
            except Exception as e:
                import traceback
                traceback.print_exc()  # Print full traceback to console
                error_msg = str(e)  # Capture immediately to avoid closure issue
                self.root.after(0, lambda: self._on_video_error(error_msg))
        
        thread = threading.Thread(target=process, daemon=True)
        thread.start()
        
    def _process_video_file(self, video_path, crop_rect, time_range, progress_callback=None):
        """Process a video file (runs in background thread)."""
        print(f"\n=== Starting video processing ===")
        print(f"Video: {video_path}")
        print(f"Crop keyframes: {crop_rect}")
        print(f"Time range: {time_range}")
        
        target_width, target_height = self._get_target_dimensions()
        blur_radius = self.blur_radius.get()
        print(f"Target: {target_width}x{target_height}, blur: {blur_radius}")
        
        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            print("ERROR: Could not open video!")
            return False
        
        fps = cap.get(cv2.CAP_PROP_FPS) or 30
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        print(f"Video info: {total_frames} frames, {fps} fps")
        
        # Calculate frame range
        start_frame = 0
        end_frame = total_frames
        
        if time_range:
            start_time, end_time = time_range
            start_frame = int(start_time * fps)
            end_frame = int(end_time * fps)
            start_frame = max(0, min(start_frame, total_frames - 1))
            end_frame = max(start_frame + 1, min(end_frame, total_frames))
        
        video_speed = self.video_speed.get()
        print(f"Speed: {video_speed}x")
        
        input_frames_count = end_frame - start_frame
        frames_to_process = int(input_frames_count / video_speed)
        print(f"Processing frames {start_frame} to {end_frame} ({input_frames_count} input -> {frames_to_process} output frames)")
        
        # Create temp file
        temp_dir = tempfile.mkdtemp()
        temp_output = os.path.join(temp_dir, 'temp_video.mp4')
        print(f"Temp output: {temp_output}")
        
        try:
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            out = cv2.VideoWriter(temp_output, fourcc, fps, (target_width, target_height))
            
            if not out.isOpened():
                raise RuntimeError(f"Failed to create VideoWriter at {temp_output}")
            
            print(f"VideoWriter created successfully")
            cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
            
            # Timing accumulators
            import time
            timing_stats = {
                'read': 0.0,
                'process': 0.0,  # Combined for parallel part
                'write': 0.0
            }
            process_start_time = time.time()
            
            # Get video dimensions for crop interpolation
            video_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            video_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            
            # Function to be executed in thread pool
            def process_frame_task(frame_idx, actual_frame_num, frame):
                # Determine crop for this frame
                frame_crop = None
                if crop_rect:
                    # crop_rect is actually crop_keyframes dict
                    if isinstance(crop_rect, dict):
                        frame_crop = interpolate_crop_keyframes(
                            crop_rect,
                            actual_frame_num,
                            video_width,
                            video_height
                        )
                    else:
                        # Legacy: single tuple crop
                        frame_crop = crop_rect
                
                # Apply crop
                if frame_crop:
                    x1, y1, x2, y2 = frame_crop
                    frame_cropped = frame[y1:y2, x1:x2]
                else:
                    frame_cropped = frame
                
                # Convert to PIL for processing
                frame_rgb = cv2.cvtColor(frame_cropped, cv2.COLOR_BGR2RGB)
                pil_frame = Image.fromarray(frame_rgb)
                
                # Also convert original for background blur
                original_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                pil_original = Image.fromarray(original_rgb)
                
                # Apply processing (blur + padding)
                processed_pil = self._apply_processing(pil_frame, pil_original)
                
                # Convert back to OpenCV
                processed_np = np.array(processed_pil)
                processed_bgr = cv2.cvtColor(processed_np, cv2.COLOR_RGB2BGR)
                
                return processed_bgr
            
            # Queues for pipeline
            # Bounded read queue to control memory usage
            read_queue = queue.Queue(maxsize=16)
            write_queue = queue.Queue()
            
            # Semaphore to bound the number of active futures (prevent OOM)
            # Total frames in flight = read_queue items + semaphore count
            max_workers = os.cpu_count() or 4
            submit_sem = threading.Semaphore(max_workers * 2)
            
            # Start Reader Thread
            def reader_thread():
                print(f"Reader thread started (speed={video_speed}x)")
                
                # Setup seek
                cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
                current_cap_pos = start_frame
                
                # Cache for slow motion (duplicating frames)
                cached_frame = None
                cached_frame_idx = -1
                
                for i in range(frames_to_process):
                    if self.cancel_event.is_set(): break
                    
                    # Calculate target input frame index
                    target_input_idx = start_frame + int(i * video_speed)
                    target_input_idx = min(target_input_idx, total_frames - 1)
                    
                    # If same as cached, reuse (handling speed < 1.0)
                    if target_input_idx == cached_frame_idx and cached_frame is not None:
                        while not self.cancel_event.is_set():
                            try:
                                read_queue.put((i, cached_frame), timeout=0.1)
                                break
                            except queue.Full: continue
                        continue
                    
                    # Seek or Skip if needed
                    if target_input_idx != current_cap_pos:
                        diff = target_input_idx - current_cap_pos
                        if 0 < diff < 50: # Efficient skip
                            for _ in range(diff): cap.grab()
                        elif diff != 0: # Seek
                            cap.set(cv2.CAP_PROP_POS_FRAMES, target_input_idx)
                        current_cap_pos = target_input_idx
                    
                    t0 = time.time()
                    ret, frame = cap.read()
                    timing_stats['read'] += time.time() - t0
                    
                    if not ret:
                        print(f"WARNING: Reader stopped early at output {i} (input {target_input_idx})")
                        break
                    
                    current_cap_pos += 1
                    cached_frame = frame
                    cached_frame_idx = target_input_idx
                    
                    if i == 0:
                        print(f"First frame read successfully, shape: {frame.shape}")
                        
                    # Put with timeout to allow checking cancel event
                    while not self.cancel_event.is_set():
                        try:
                            read_queue.put((i, frame), timeout=0.5)
                            break
                        except queue.Full:
                            continue
                        
                read_queue.put(None) # Sentinel
                print("Reader thread finished")

            # Start Writer Thread
            def writer_thread():
                print("Writer thread started")
                next_write = 0
                buffer = {}
                
                while next_write < frames_to_process:
                    if self.cancel_event.is_set(): break
                    
                    try:
                        item = write_queue.get(timeout=0.1)
                    except queue.Empty:
                        continue
                        
                    idx, result = item
                    buffer[idx] = result
                    
                    while next_write in buffer:
                        if self.cancel_event.is_set(): break
                        
                        t0 = time.time()
                        out.write(buffer[next_write])
                        timing_stats['write'] += time.time() - t0
                        del buffer[next_write]
                        
                        next_write += 1
                        
                        # Progress update
                        if progress_callback and (next_write % 10 == 0):
                            elapsed = time.time() - process_start_time
                            ms_per_frame = (elapsed / next_write) * 1000
                            remaining = frames_to_process - next_write
                            eta = (remaining * elapsed / next_write) if next_write > 0 else 0
                            
                            # Simple stats since we are decoupled
                            total_time = sum(timing_stats.values())
                            timing_breakdown = {}
                            if total_time > 0:
                                for step, step_time in timing_stats.items():
                                    timing_breakdown[step] = int((step_time / total_time) * 100)
                            
                            progress_callback(
                                next_write, frames_to_process, "frames",
                                ms_per_frame=ms_per_frame,
                                eta_seconds=eta,
                                timing_breakdown=timing_breakdown
                            )
                            
                print("Writer thread finished")

            t_read = threading.Thread(target=reader_thread, daemon=True)
            t_write = threading.Thread(target=writer_thread, daemon=True)
            t_read.start()
            t_write.start()

            # Main Submit Loop
            print(f"Starting execution pool with {max_workers} workers")
            
            with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
                while True:
                    if self.cancel_event.is_set(): break
                    
                    item = read_queue.get()
                    if item is None: break
                    
                    idx, frame = item
                    # Calculate input frame number for crop interpolation
                    actual_frame_num = start_frame + int(idx * video_speed)
                    
                    # Wait for slot
                    submit_sem.acquire()
                    
                    # Define closure safely
                    def on_future_done(f, f_idx=idx):
                        try:
                            res = f.result()
                            write_queue.put((f_idx, res))
                        except Exception as e:
                            print(f"Task error frame {f_idx}: {e}")
                            import traceback
                            traceback.print_exc()
                        finally:
                            submit_sem.release()

                    future = executor.submit(process_frame_task, idx, actual_frame_num, frame)
                    future.add_done_callback(on_future_done)
            
            # Wait for threads
            t_read.join()
            t_write.join()
            
            if self.cancel_event.is_set():
                 raise InterruptedError("Processing cancelled")
                
            
            cap.release()
            out.release()
            
            # Output path
            output_path = Path(self.output_folder.get()) / f"{video_path.stem}_processed.mp4"
            
            # Re-encode with ffmpeg (required for output)
            if progress_callback:
                progress_callback(0, 0, "encoding")
            
            include_audio = self.include_audio.get()
            audio_offset = time_range[0] if time_range else 0
            audio_duration = (time_range[1] - time_range[0]) if time_range else None
            
            run_ffmpeg_encode(
                temp_output,
                str(output_path),
                audio_source=str(video_path) if include_audio else None,
                audio_offset=audio_offset,
                audio_duration=audio_duration,
                include_audio=include_audio,
                speed=video_speed
            )
            
            return True
            
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)
                
    def _on_video_processed(self, success):
        """Called when video processing completes."""
        if success:
            self.processed_count += 1
        self.progress_bar["value"] = self.current_index + 1
        
        # Release video resources
        self.video_canvas.release()
        
        # Re-enable controls
        self._set_video_controls_state(True)
        self._set_image_controls_state(True)
        
        # Next file
        self.current_index += 1
        self._load_current_media()
        
    def _cancel_processing(self):
        """Cancel the current processing task."""
        if messagebox.askyesno("Cancel", "Stop processing?"):
            self.cancel_event.set()
            self.cancel_btn.configure(text="Cancelling...", state=tk.DISABLED)

    def _on_video_error(self, error):
        """Called when video processing fails."""
        is_cancelled = "cancelled" in str(error).lower()
        
        if is_cancelled:
            self.media_info.configure(text="Processing cancelled.")
        else:
            messagebox.showerror("Error", f"Video processing failed:\n{error}")
            
        self.video_canvas.release()
        
        # Re-enable controls
        self._set_video_controls_state(True)
        self._set_image_controls_state(True)
        
        # Only advance if NOT cancelled (allow retry)
        if not is_cancelled:
            self.current_index += 1
            
        self._load_current_media()
        
    def _update_resolution_display(self, event=None):
        """Update the resolution display label."""
        width, height = self._get_target_dimensions()
        self.resolution_display.configure(text=f"Output: {width} × {height}")
        
    def _get_target_dimensions(self):
        """Get target dimensions based on current presets."""
        resolution = self.resolution_var.get()
        aspect = self.aspect_ratio_var.get()
        return self.resolution_presets[resolution][aspect]
        
    def _apply_processing(self, pil_image, background_image=None):
        """Apply the image processing (scale + blur padding).
        
        Args:
            pil_image: The cropped/main image to process
            background_image: Optional uncropped image to use for blurred background
                              If None, uses pil_image for background
        """
        target_width, target_height = self._get_target_dimensions()
        blur_radius = self.blur_radius.get()
        
        return process_image_pil(
            pil_image,
            target_width=target_width,
            target_height=target_height,
            blur_radius=blur_radius,
            background_image=background_image
        )
        
    def _preview_result(self):
        """Show a preview of the processed result."""
        cropped = self.image_canvas.get_cropped_image()
        if cropped is None:
            return
        
        result = self._apply_processing(cropped)
        
        # Show in a new window
        preview_window = tk.Toplevel(self.root)
        preview_window.title("Preview Result")
        
        # Scale for display
        display_width = min(result.width, 1280)
        display_height = int(result.height * (display_width / result.width))
        display_image = result.resize((display_width, display_height), Image.Resampling.LANCZOS)
        
        photo = ImageTk.PhotoImage(display_image)
        label = ttk.Label(preview_window, image=photo)
        label.image = photo
        label.pack()
        
    def _set_image_controls_state(self, enabled):
        """Enable or disable image crop controls."""
        state = tk.NORMAL if enabled else tk.DISABLED
        self.reset_btn.configure(state=state)
        self.skip_btn.configure(state=state)
        self.confirm_btn.configure(state=state)
        self.preview_btn.configure(state=state)
    
    def _set_video_controls_state(self, enabled):
        """Enable or disable video controls."""
        state = tk.NORMAL if enabled else tk.DISABLED
        self.video_confirm_btn.configure(state=state)
        self.video_skip_btn.configure(state=state)
        # Also disable all the seek buttons in the frame
        for child in self.video_seek_controls.winfo_children():
            if isinstance(child, ttk.Button):
                child.configure(state=state)
        
    def _finish_processing(self):
        """Called when all files have been processed."""
        # Cleanup last item
        self.image_canvas.delete("all")
        self.image_canvas.original_image = None
        self.video_canvas.release()
        
        # Reset batch state
        self.current_index = 0
        self.processed_count = 0
        self.progress_bar["value"] = 0
        
        # Disable cancel button
        self.cancel_btn.configure(state=tk.DISABLED)
        
        # Reload first file to unlock controls
        if self.media_files:
            self._load_current_media()
            self.media_info.configure(text=f"Batch Finished! Loaded {self.media_files[0].name} for restart.")
            # Ensure controls are enabled (should be handled by _load_current_media, but force it just in case)
            if self._is_video(self.media_files[0]):
                self._set_video_controls_state(True)
            else:
                self._set_image_controls_state(True)
        else:
            self.media_info.configure(text="Processing complete!")
        
        messagebox.showinfo(
            "Complete",
            f"Processing complete!\n\n"
            f"Processed: {self.processed_count} files\n"
            f"Output folder: {self.output_folder.get()}"
        )


def main():
    root = tk.Tk()
    
    # Icon is optional - tkinter will use default if none available
    
    app = MediaProcessorGUI(root)
    root.mainloop()


if __name__ == "__main__":
    main()
