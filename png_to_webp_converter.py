import tkinter as tk
from tkinter import filedialog, messagebox, ttk
from pathlib import Path
from PIL import Image
import threading


class PNGtoWebPConverter:
    def __init__(self, root):
        self.root = root
        self.root.title("PNG/GIF to WebP Converter")
        self.root.geometry("650x600")
        self.root.resizable(False, False)
        
        # Variables
        self.folder_path = tk.StringVar()
        self.quality = tk.IntVar(value=90)
        self.delete_original = tk.BooleanVar(value=False)
        self.recursive = tk.BooleanVar(value=True)
        self.skip_existing = tk.BooleanVar(value=True)
        self.is_converting = False
        
        self.setup_ui()
    
    def setup_ui(self):
        # Main frame
        main_frame = ttk.Frame(self.root, padding="20")
        main_frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        
        # Title
        title_label = ttk.Label(main_frame, text="PNG/GIF to WebP Converter", 
                               font=("Arial", 16, "bold"))
        title_label.grid(row=0, column=0, columnspan=3, pady=(0, 20))
        
        # Folder selection
        ttk.Label(main_frame, text="Select Folder:").grid(row=1, column=0, sticky=tk.W, pady=5)
        folder_entry = ttk.Entry(main_frame, textvariable=self.folder_path, width=50)
        folder_entry.grid(row=1, column=1, padx=5, pady=5)
        browse_btn = ttk.Button(main_frame, text="Browse", command=self.browse_folder)
        browse_btn.grid(row=1, column=2, pady=5)
        
        # Quality slider
        ttk.Label(main_frame, text="Quality (1-100):").grid(row=2, column=0, sticky=tk.W, pady=5)
        quality_frame = ttk.Frame(main_frame)
        quality_frame.grid(row=2, column=1, columnspan=2, sticky=(tk.W, tk.E), pady=5)
        
        quality_slider = ttk.Scale(quality_frame, from_=1, to=100, 
                                   variable=self.quality, orient=tk.HORIZONTAL)
        quality_slider.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0, 10))
        
        quality_label = ttk.Label(quality_frame, textvariable=self.quality, width=3)
        quality_label.pack(side=tk.LEFT)
        
        # Recursive checkbox
        recursive_check = ttk.Checkbutton(main_frame, text="Include subfolders (recursive)",
                                         variable=self.recursive)
        recursive_check.grid(row=3, column=0, columnspan=3, sticky=tk.W, pady=5)
        
        # Skip existing checkbox
        skip_check = ttk.Checkbutton(main_frame, text="Skip files that already have a WebP version",
                                     variable=self.skip_existing)
        skip_check.grid(row=4, column=0, columnspan=3, sticky=tk.W, pady=5)
        
        # Delete original checkbox
        delete_check = ttk.Checkbutton(main_frame, text="Delete original PNG/GIF files after conversion",
                                      variable=self.delete_original)
        delete_check.grid(row=5, column=0, columnspan=3, sticky=tk.W, pady=5)
        
        # Progress bar
        self.progress_label = ttk.Label(main_frame, text="Ready to convert")
        self.progress_label.grid(row=6, column=0, columnspan=3, pady=(20, 5))
        
        self.progress_bar = ttk.Progressbar(main_frame, mode='determinate', length=500)
        self.progress_bar.grid(row=7, column=0, columnspan=3, pady=5)
        
        # Status text
        self.status_text = tk.Text(main_frame, height=10, width=70, state='disabled')
        self.status_text.grid(row=8, column=0, columnspan=3, pady=10)
        
        # Scrollbar for status text
        scrollbar = ttk.Scrollbar(main_frame, orient=tk.VERTICAL, command=self.status_text.yview)
        scrollbar.grid(row=8, column=3, sticky=(tk.N, tk.S))
        self.status_text.config(yscrollcommand=scrollbar.set)
        
        # Convert button
        self.convert_btn = ttk.Button(main_frame, text="Convert", command=self.start_conversion)
        self.convert_btn.grid(row=9, column=0, columnspan=3, pady=10)
    
    def browse_folder(self):
        folder = filedialog.askdirectory(title="Select folder containing PNG/GIF files")
        if folder:
            self.folder_path.set(folder)
    
    def log_status(self, message):
        self.status_text.config(state='normal')
        self.status_text.insert(tk.END, message + "\n")
        self.status_text.see(tk.END)
        self.status_text.config(state='disabled')
        self.root.update_idletasks()
    
    def convert_images(self):
        folder = Path(self.folder_path.get())
        
        if not folder.exists():
            messagebox.showerror("Error", "Selected folder does not exist!")
            return
        
        # Find all PNG and GIF files (recursive or current folder only)
        if self.recursive.get():
            image_files = (list(folder.rglob("*.png")) + list(folder.rglob("*.PNG")) +
                          list(folder.rglob("*.gif")) + list(folder.rglob("*.GIF")))
        else:
            image_files = (list(folder.glob("*.png")) + list(folder.glob("*.PNG")) +
                          list(folder.glob("*.gif")) + list(folder.glob("*.GIF")))
        
        if not image_files:
            messagebox.showinfo("Info", "No PNG or GIF files found in the selected folder!")
            self.log_status("No PNG or GIF files found.")
            return
        
        self.log_status(f"Found {len(image_files)} image file(s)")
        self.progress_bar['maximum'] = len(image_files)
        self.progress_bar['value'] = 0
        
        converted_count = 0
        failed_count = 0
        skipped_count = 0
        
        for i, image_file in enumerate(image_files):
            try:
                # Create output path with .webp extension
                webp_file = image_file.with_suffix('.webp')
                
                # Skip if WebP already exists and skip_existing is enabled
                if self.skip_existing.get() and webp_file.exists():
                    self.log_status(f"⊘ Skipped: {image_file.name} (WebP already exists)")
                    skipped_count += 1
                    self.progress_bar['value'] = i + 1
                    self.progress_label.config(text=f"Converting... {i + 1}/{len(image_files)}")
                    self.root.update_idletasks()
                    continue
                
                # Open and convert image
                with Image.open(image_file) as img:
                    # Handle animated GIFs
                    if image_file.suffix.lower() == '.gif' and getattr(img, 'is_animated', False):
                        # Save as animated WebP with better compression
                        frames = []
                        durations = []
                        try:
                            while True:
                                # Convert to RGB/RGBA for better WebP compression
                                frame = img.copy()
                                if frame.mode == 'P':
                                    frame = frame.convert('RGBA')
                                frames.append(frame)
                                durations.append(img.info.get('duration', 100))
                                img.seek(img.tell() + 1)
                        except EOFError:
                            pass
                        
                        frames[0].save(
                            webp_file, 
                            'WEBP', 
                            save_all=True, 
                            append_images=frames[1:],
                            duration=durations,
                            loop=img.info.get('loop', 0),
                            quality=self.quality.get(),
                            method=6,
                            lossless=False,
                            minimize_size=True
                        )
                    else:
                        # Static image conversion
                        if img.mode in ('RGBA', 'LA', 'P'):
                            # Keep alpha channel for WebP
                            img.save(webp_file, 'WEBP', quality=self.quality.get(), method=6)
                        else:
                            img.save(webp_file, 'WEBP', quality=self.quality.get(), method=6)
                
                self.log_status(f"✓ Converted: {image_file.name} -> {webp_file.name}")
                converted_count += 1
                
                # Delete original if checkbox is checked
                if self.delete_original.get():
                    image_file.unlink()
                    self.log_status(f"  Deleted: {image_file.name}")
                
            except Exception as e:
                self.log_status(f"✗ Failed: {image_file.name} - {str(e)}")
                failed_count += 1
            
            # Update progress
            self.progress_bar['value'] = i + 1
            self.progress_label.config(text=f"Converting... {i + 1}/{len(image_files)}")
            self.root.update_idletasks()
        
        # Final summary
        self.log_status("\n" + "="*50)
        self.log_status(f"Conversion complete!")
        self.log_status(f"Successfully converted: {converted_count}")
        self.log_status(f"Skipped: {skipped_count}")
        self.log_status(f"Failed: {failed_count}")
        self.progress_label.config(text="Conversion complete!")
        
        messagebox.showinfo("Complete", 
                          f"Conversion complete!\n\n"
                          f"Converted: {converted_count}\n"
                          f"Skipped: {skipped_count}\n"
                          f"Failed: {failed_count}")
        
        self.is_converting = False
        self.convert_btn.config(state='normal')
    
    def start_conversion(self):
        if not self.folder_path.get():
            messagebox.showwarning("Warning", "Please select a folder first!")
            return
        
        if self.is_converting:
            return
        
        self.is_converting = True
        self.convert_btn.config(state='disabled')
        self.status_text.config(state='normal')
        self.status_text.delete(1.0, tk.END)
        self.status_text.config(state='disabled')
        
        # Run conversion in a separate thread to keep UI responsive
        thread = threading.Thread(target=self.convert_images, daemon=True)
        thread.start()


def main():
    root = tk.Tk()
    app = PNGtoWebPConverter(root)
    root.mainloop()


if __name__ == "__main__":
    main()
