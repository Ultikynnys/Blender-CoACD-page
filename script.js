// Unified theme configuration
const THEME_CONFIG = {
  shapes: {
    types: ['hex', 'pent', 'tri', 'circle', 'quad', 'hept', 'oct']
  }
};

// --- Debug utilities ---
// Enable by appending ?debug=1 to the URL or setting window.DEBUG = true
const DEBUG = (typeof window !== 'undefined' && (new URLSearchParams(window.location.search).has('debug') || window.DEBUG === true));
function dbg(...args) { if (DEBUG) console.log('[DEBUG]', ...args); }
function dbgw(...args) { if (DEBUG) console.warn('[DEBUG]', ...args); }
function dbge(...args) { if (DEBUG) console.error('[DEBUG]', ...args); }

// Generic media parser - works for videos, images, etc.
function parseMediaItems(config, options = {}) {
  const items = [];
  if (!config) return items;
  
  const {
    itemsKey = 'items',
    urlsKey = 'urls',
    urlKey = 'url',
    captionsKey = 'captions',
    altKey = 'alts',
    alignmentKey = 'alignments'
  } = options;

  const pushItem = (src, i = 0) => {
    if (!src) return;
    const capArr = Array.isArray(config[captionsKey]) ? config[captionsKey] : [];
    const caption = capArr[i] || '';
    const altArr = Array.isArray(config[altKey]) ? config[altKey] : [];
    const alt = altArr[i] || '';
    const alignArr = Array.isArray(config[alignmentKey]) ? config[alignmentKey] : [];
    const alignment = alignArr[i] || 'center';
    items.push({ src, caption, alt, url: src, alignment });
  };

  // Handle multiple formats: items array, urls array, single item
  if (Array.isArray(config[itemsKey])) {
    config[itemsKey].forEach((item, i) => {
      if (typeof item === 'string') pushItem(item, i);
      else if (item && typeof item === 'object') {
        const capArr = Array.isArray(config[captionsKey]) ? config[captionsKey] : [];
        const altArr = Array.isArray(config[altKey]) ? config[altKey] : [];
        const alignArr = Array.isArray(config[alignmentKey]) ? config[alignmentKey] : [];
        items.push({ 
          src: item.src || item.url || item.image || '', 
          url: item.url || item.src || item.image || '',
          caption: item.caption || item.title || '',
          alt: item.alt || item.alt_text || altArr[i] || capArr[i] || '',
          alignment: item.alignment || alignArr[i] || 'center'
        });
      }
    });
  } else if (Array.isArray(config[urlsKey])) {
    config[urlsKey].forEach((url, i) => pushItem(url, i));
  } else if (config[urlKey]) {
    pushItem(config[urlKey], 0);
  }

  return items.filter(item => item && (item.src || item.url));
}

// Parse showcase videos using generic parser
function parseShowcaseVideos(showcase) {
  return parseMediaItems(showcase, {
    itemsKey: 'videos',
    urlsKey: 'video_urls', 
    urlKey: 'video_url',
    captionsKey: 'video_captions'
  });
}

// Generic carousel creator for both images and videos
function createMediaCarousel(items, cfg, options = {}) {
  const {
    className = 'media-carousel',
    type = 'image', // 'image' or 'video'
    borderClass = 'media-border',
    objectFit = 'cover' // allow callers to override object-fit for images
  } = options;
  
  const carouselId = `${type}-carousel-${Date.now()}`;

  const itemsHtml = items.map((item, index) => {
    const src = item.src || item.url;
    const title = item.title || item.caption || 'Media';
    const alt = item.alt || title;
    const alignment = item.alignment || 'center';
    
    // Detect if this is a video file (mp4, webm, etc.) or an embedded video
    const isVideoFile = /\.(mp4|webm|ogg|mov)$/i.test(src);
    const isEmbedVideo = type === 'video' && !isVideoFile;
    
    // Convert alignment to CSS classes
    const alignmentClass = alignment === 'top-left' ? 'object-position-top-left' : 
                          alignment === 'top-right' ? 'object-position-top-right' : 
                          'object-position-center';
    
    let content;
    if (isVideoFile) {
      // Native video file with autoplay
      content = `<video autoplay loop muted playsinline class="d-block w-100 ${borderClass}" style="object-fit: ${objectFit};">
        <source src="${src}" type="video/${src.match(/\.(\w+)$/)?.[1] || 'mp4'}">
        Your browser does not support the video tag.
      </video>`;
    } else if (isEmbedVideo) {
      // Embedded video (YouTube, Vimeo, etc.)
      content = `<div class="video-frame ${borderClass}"><iframe src="${src}" title="${title}" allowfullscreen loading="lazy"></iframe></div>`;
    } else {
      // Image
      content = `<img src="${src}" alt="${alt}" loading="lazy" class="d-block w-100 ${alignmentClass}" style="object-fit: ${objectFit}; user-select: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; pointer-events: auto;">`;
    }
    
    return `<div class="carousel-item ${index === 0 ? 'active' : ''}" style="user-select: none;">${content}</div>`;
  }).join('');

  const indicatorsHtml = items.length > 1 ? `
    <div class="carousel-indicators">
      ${items.map((_, idx) => `
        <button type="button" data-bs-target="#${carouselId}" data-bs-slide-to="${idx}" 
                class="${idx === 0 ? 'active' : ''}" aria-current="${idx === 0 ? 'true' : 'false'}" 
                aria-label="Slide ${idx + 1}"></button>
      `).join('')}
    </div>
  ` : '';

  const wrapper = document.createElement('div');
  wrapper.classList.add('media-carousel');
  if (className) {
    className.split(/\s+/).filter(Boolean).forEach(cls => wrapper.classList.add(cls));
  }
  // Add navigation arrows HTML for carousels with multiple items
  const navArrowsHtml = items.length > 1 ? `
    <button class="carousel-control-prev" type="button" data-bs-target="#${carouselId}" data-bs-slide="prev">
      <span class="carousel-control-prev-icon" aria-hidden="true"></span>
      <span class="visually-hidden">Previous</span>
    </button>
    <button class="carousel-control-next" type="button" data-bs-target="#${carouselId}" data-bs-slide="next">
      <span class="carousel-control-next-icon" aria-hidden="true"></span>
      <span class="visually-hidden">Next</span>
    </button>
  ` : '';
  
  wrapper.innerHTML = `
    <div id="${carouselId}" class="carousel slide ${type === 'video' ? 'interactive-border' : ''}" data-bs-ride="false">
      <div class="carousel-inner">${itemsHtml}</div>
      ${indicatorsHtml}
      ${navArrowsHtml}
    </div>
  `;

  // Add caption functionality
  const captionEl = document.createElement('div');
  const defaultCaptionClass = type === 'video' ? 'intro__usage-caption' : 'usage-carousel-caption intro__usage-caption';
  captionEl.className = options.captionClass || defaultCaptionClass;
  
  const updateCaption = (index) => {
    const text = getImageCaptionText(items[index]) || '';
    captionEl.innerHTML = text ? mdInlineToHtmlBoldOnly(String(text)) : '';
    colorizeStrongIn(captionEl, cfg);
  };
  
  updateCaption(0);
  wrapper.appendChild(captionEl);

  // Setup carousel event listeners
  const carouselEl = wrapper.querySelector(`#${carouselId}`);
  carouselEl.addEventListener('slid.bs.carousel', () => {
    const activeIndex = Math.max(0, Array.from(carouselEl.querySelectorAll('.carousel-item'))
      .findIndex(i => i.classList.contains('active')));
    updateCaption(activeIndex);
  });

  // Make images and videos zoomable/focusable
  setTimeout(() => {
    wrapper.querySelectorAll('.carousel-item').forEach((item, idx) => {
      const img = item.querySelector('img');
      const video = item.querySelector('video');
      
      if (items[idx]) {
        const caption = getImageCaptionText(items[idx]) || '';
        
        // Make images zoomable
        if (img && !video) {
          makeImageZoomable(img, caption);
        }
        
        // Make videos zoomable/focusable
        if (video) {
          makeImageZoomable(video, caption);
        }
      }
    });
  }, 100);

  setTimeout(() => colorizeStrongIn(wrapper, cfg), 0);
  return wrapper;
}

// Convenience functions for backward compatibility
function createVideoCarousel(videos, cfg, className = 'video-carousel') {
  return createMediaCarousel(videos, cfg, { className, type: 'video', borderClass: 'interactive-border' });
}

// Utility functions
const utils = {
  clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
  randomChoice: (array) => array[Math.floor(Math.random() * array.length)],
  getViewportWidth: () => Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0)
};

// Image zoom functionality
function initImageZoom() {
  let zoomOverlay = document.getElementById('image-zoom-overlay');
  
  if (!zoomOverlay) {
    zoomOverlay = document.createElement('div');
    zoomOverlay.id = 'image-zoom-overlay';
    zoomOverlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.9);
      z-index: 10000;
      display: none;
      align-items: center;
      justify-content: center;
      cursor: zoom-out;
      user-select: none;
      -webkit-user-select: none;
      -moz-user-select: none;
      -ms-user-select: none;
    `;
    
    // Media container that can hold both images and videos
    const mediaContainer = document.createElement('div');
    mediaContainer.id = 'zoomed-media-container';
    mediaContainer.style.cssText = `
      max-width: 95%;
      max-height: 95%;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    
    const zoomedImg = document.createElement('img');
    zoomedImg.id = 'zoomed-image';
    zoomedImg.style.cssText = `
      max-width: 100%;
      max-height: 95vh;
      object-fit: contain;
      transform-origin: center center;
      transition: transform 0.1s ease-out;
      user-select: none;
      -webkit-user-select: none;
      -moz-user-select: none;
      -ms-user-select: none;
      pointer-events: none;
      display: block;
    `;
    
    const zoomedVideo = document.createElement('video');
    zoomedVideo.id = 'zoomed-video';
    zoomedVideo.autoplay = true;
    zoomedVideo.loop = true;
    zoomedVideo.muted = true;
    zoomedVideo.playsInline = true;
    zoomedVideo.style.cssText = `
      max-width: 100%;
      max-height: 95vh;
      object-fit: contain;
      transform-origin: center center;
      transition: transform 0.1s ease-out;
      user-select: none;
      -webkit-user-select: none;
      -moz-user-select: none;
      -ms-user-select: none;
      pointer-events: none;
      display: none;
    `;
    
    mediaContainer.appendChild(zoomedImg);
    mediaContainer.appendChild(zoomedVideo);
    
    const captionOverlay = document.createElement('div');
    captionOverlay.id = 'zoom-caption';
    captionOverlay.style.cssText = `
      position: absolute;
      bottom: 40px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.75);
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 1rem;
      max-width: 80%;
      width: auto;
      text-align: center;
      display: none;
      backdrop-filter: blur(4px);
      z-index: 10001;
      white-space: normal;
      word-wrap: break-word;
    `;
    
    // Create left arrow indicator
    const leftArrow = document.createElement('div');
    leftArrow.id = 'zoom-nav-left';
    leftArrow.innerHTML = '‹';
    leftArrow.style.cssText = `
      position: absolute;
      left: 0;
      top: 0;
      height: 100%;
      width: 120px;
      display: none;
      align-items: center;
      justify-content: center;
      font-size: 5rem;
      color: rgba(255, 255, 255, 0.7);
      cursor: pointer;
      user-select: none;
      z-index: 10001;
      transition: color 0.2s, background-color 0.2s;
      text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
      line-height: 1;
    `;
    leftArrow.addEventListener('mouseenter', () => {
      leftArrow.style.color = 'rgba(255, 255, 255, 1)';
      leftArrow.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
    });
    leftArrow.addEventListener('mouseleave', () => {
      leftArrow.style.color = 'rgba(255, 255, 255, 0.7)';
      leftArrow.style.backgroundColor = 'transparent';
    });
    leftArrow.addEventListener('click', (e) => {
      e.stopPropagation();
      const navFunc = zoomOverlay.navigateZoomedImage;
      if (navFunc) navFunc(-1);
    });
    
    // Create right arrow indicator
    const rightArrow = document.createElement('div');
    rightArrow.id = 'zoom-nav-right';
    rightArrow.innerHTML = '›';
    rightArrow.style.cssText = `
      position: absolute;
      right: 0;
      top: 0;
      height: 100%;
      width: 120px;
      display: none;
      align-items: center;
      justify-content: center;
      font-size: 5rem;
      color: rgba(255, 255, 255, 0.7);
      cursor: pointer;
      user-select: none;
      z-index: 10001;
      transition: color 0.2s, background-color 0.2s;
      text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
      line-height: 1;
    `;
    rightArrow.addEventListener('mouseenter', () => {
      rightArrow.style.color = 'rgba(255, 255, 255, 1)';
      rightArrow.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
    });
    rightArrow.addEventListener('mouseleave', () => {
      rightArrow.style.color = 'rgba(255, 255, 255, 0.7)';
      rightArrow.style.backgroundColor = 'transparent';
    });
    rightArrow.addEventListener('click', (e) => {
      e.stopPropagation();
      const navFunc = zoomOverlay.navigateZoomedImage;
      if (navFunc) navFunc(1);
    });
    
    zoomOverlay.appendChild(mediaContainer);
    zoomOverlay.appendChild(captionOverlay);
    zoomOverlay.appendChild(leftArrow);
    zoomOverlay.appendChild(rightArrow);
    document.body.appendChild(zoomOverlay);
    
    // Close on click (but not on navigation zones)
    zoomOverlay.addEventListener('click', (e) => {
      const rect = zoomOverlay.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const navZoneWidth = 100; // pixels from left/right edges
      
      // Check if clicking in navigation zones
      if (clickX < navZoneWidth || clickX > rect.width - navZoneWidth) {
        // Don't close, let navigation handler deal with it
        return;
      }
      
      zoomOverlay.style.display = 'none';
      if (zoomOverlay.resetZoomState) zoomOverlay.resetZoomState();
      delete zoomOverlay.dataset.carouselId;
      delete zoomOverlay.dataset.currentIndex;
    });
    
    // Close on Escape key and arrow key navigation
    document.addEventListener('keydown', (e) => {
      if (zoomOverlay.style.display === 'flex') {
        if (e.key === 'Escape') {
          zoomOverlay.style.display = 'none';
          if (zoomOverlay.resetZoomState) zoomOverlay.resetZoomState();
          delete zoomOverlay.dataset.carouselId;
          delete zoomOverlay.dataset.currentIndex;
        } else if (e.key === 'ArrowLeft') {
          navigateZoomedImage(-1);
        } else if (e.key === 'ArrowRight') {
          navigateZoomedImage(1);
        }
      }
    });
    
    // Add navigation on click (left/right zones)
    zoomOverlay.addEventListener('click', (e) => {
      const rect = zoomOverlay.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const navZoneWidth = 100;
      
      if (clickX < navZoneWidth) {
        navigateZoomedImage(-1);
        e.stopPropagation();
      } else if (clickX > rect.width - navZoneWidth) {
        navigateZoomedImage(1);
        e.stopPropagation();
      }
    });
    
    // Navigation function
    function navigateZoomedImage(direction) {
      const carouselId = zoomOverlay.dataset.carouselId;
      const currentIndex = parseInt(zoomOverlay.dataset.currentIndex || '0');
      
      if (!carouselId) return;
      
      const carousel = document.getElementById(carouselId);
      if (!carousel) return;
      
      const items = carousel.querySelectorAll('.carousel-item');
      if (items.length <= 1) return;
      
      let newIndex = currentIndex + direction;
      if (newIndex < 0) newIndex = items.length - 1;
      if (newIndex >= items.length) newIndex = 0;
      
      const newItem = items[newIndex];
      const newImg = newItem.querySelector('img');
      
      if (newImg) {
        zoomedImg.src = newImg.src;
        zoomedImg.alt = newImg.alt;
        zoomOverlay.dataset.currentIndex = newIndex;
        
        // Keep caption hidden during navigation (DRY - no captions in focus mode)
        captionOverlay.style.display = 'none';
        
        // Also update the carousel position
        const bsCarousel = bootstrap.Carousel.getInstance(carousel);
        if (bsCarousel) {
          bsCarousel.to(newIndex);
        }
      }
    }
    
    // Store navigation function on overlay for arrow click handlers
    zoomOverlay.navigateZoomedImage = navigateZoomedImage;
    
    // Track current zoom level
    let currentZoom = 1;
    
    // Reset function to clear zoom and pan state
    const resetZoomState = () => {
      currentZoom = 1;
      zoomedImg.style.transform = 'scale(1)';
      zoomedImg.style.transformOrigin = 'center center';
      zoomedVideo.style.transform = 'scale(1)';
      zoomedVideo.style.transformOrigin = 'center center';
    };
    
    // Store reset function on overlay for easy access
    zoomOverlay.resetZoomState = resetZoomState;
    
    // Zoom on mouse position - listen on overlay to capture all movement
    zoomOverlay.addEventListener('mousemove', (e) => {
      if (zoomOverlay.style.display === 'flex' && currentZoom > 1) {
        // Get the currently visible media element (img or video)
        const activeMedia = zoomedVideo.style.display === 'block' ? zoomedVideo : zoomedImg;
        const rect = activeMedia.getBoundingClientRect();
        
        // Calculate position relative to center (0 to 100%)
        const xPercent = ((e.clientX - rect.left) / rect.width) * 100;
        const yPercent = ((e.clientY - rect.top) / rect.height) * 100;
        
        // Apply sensitivity multiplier to amplify movement from center
        const sensitivity = 1.5; // Increase this for more panning distance
        const centerX = 50;
        const centerY = 50;
        const x = centerX + (xPercent - centerX) * sensitivity;
        const y = centerY + (yPercent - centerY) * sensitivity;
        
        activeMedia.style.transformOrigin = `${x}% ${y}%`;
        activeMedia.style.transform = `scale(${currentZoom})`;
      }
    });
    
    // Scroll wheel zoom
    zoomOverlay.addEventListener('wheel', (e) => {
      if (zoomOverlay.style.display === 'flex') {
        e.preventDefault();
        
        // Adjust zoom level based on scroll direction
        const zoomDelta = e.deltaY > 0 ? -0.1 : 0.1;
        currentZoom = Math.max(1, Math.min(5, currentZoom + zoomDelta));
        
        // Get the currently visible media element (img or video)
        const activeMedia = zoomedVideo.style.display === 'block' ? zoomedVideo : zoomedImg;
        
        // Update transform with current zoom
        const rect = activeMedia.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        activeMedia.style.transformOrigin = `${x}% ${y}%`;
        activeMedia.style.transform = `scale(${currentZoom})`;
      }
    }, { passive: false });
  }
  
  return zoomOverlay;
}

function makeImageZoomable(element, caption = '') {
  if (!element || element.classList.contains('zoomable-initialized')) return;
  
  const isVideo = element.tagName === 'VIDEO';
  
  element.style.cursor = 'zoom-in';
  element.classList.add('zoomable-initialized');
  
  const carousel = element.closest('.carousel');
  
  // Store caption on the element
  if (caption) {
    element.dataset.zoomCaption = caption;
  }
  
  // Update cursor based on mouse position
  if (carousel) {
    element.addEventListener('mousemove', (e) => {
      const rect = element.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      // Define safe zones (in pixels from edges)
      const safeZoneBottom = 60; // Bottom area for indicators
      const safeZoneSides = 80;  // Left/right areas for prev/next buttons
      
      // Change cursor based on whether we're in a safe zone
      if (mouseY > rect.height - safeZoneBottom || 
          mouseX < safeZoneSides || 
          mouseX > rect.width - safeZoneSides) {
        element.style.cursor = 'default';
      } else {
        element.style.cursor = 'zoom-in';
      }
    });
    
    element.addEventListener('mouseleave', () => {
      element.style.cursor = 'zoom-in';
    });
  }
  
  element.addEventListener('click', (e) => {
    // Check if click is near carousel controls (safe zone)
    if (carousel) {
      const rect = element.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      
      // Define safe zones (in pixels from edges)
      const safeZoneBottom = 60; // Bottom area for indicators
      const safeZoneSides = 80;  // Left/right areas for prev/next buttons
      
      // Don't zoom if clicking in safe zones
      if (clickY > rect.height - safeZoneBottom || 
          clickX < safeZoneSides || 
          clickX > rect.width - safeZoneSides) {
        return;
      }
    }
    
    e.stopPropagation();
    const overlay = initImageZoom();
    const zoomedImg = overlay.querySelector('#zoomed-image');
    const zoomedVideo = overlay.querySelector('#zoomed-video');
    const captionEl = overlay.querySelector('#zoom-caption');
    
    // Handle video vs image differently
    if (isVideo) {
      // Hide image, show video
      zoomedImg.style.display = 'none';
      zoomedVideo.style.display = 'block';
      
      // Clear previous sources and add new one
      zoomedVideo.innerHTML = '';
      const source = document.createElement('source');
      source.src = element.currentSrc || element.src;
      // Get file extension for type
      const ext = source.src.match(/\.(\w+)$/)?.[1] || 'mp4';
      source.type = `video/${ext}`;
      zoomedVideo.appendChild(source);
      zoomedVideo.load();
      zoomedVideo.play();
    } else {
      // Hide video, show image
      zoomedVideo.style.display = 'none';
      zoomedImg.style.display = 'block';
      zoomedImg.src = element.src;
      zoomedImg.alt = element.alt;
    }
    
    // Store click position for centering
    overlay.dataset.clickX = e.clientX;
    overlay.dataset.clickY = e.clientY;
    
    // Store carousel context for navigation
    const leftArrow = overlay.querySelector('#zoom-nav-left');
    const rightArrow = overlay.querySelector('#zoom-nav-right');
    
    if (carousel) {
      overlay.dataset.carouselId = carousel.id;
      const items = Array.from(carousel.querySelectorAll('.carousel-item'));
      const currentItem = element.closest('.carousel-item');
      const currentIndex = items.indexOf(currentItem);
      overlay.dataset.currentIndex = currentIndex >= 0 ? currentIndex : 0;
      
      // Show arrows if there are multiple items
      if (items.length > 1) {
        if (leftArrow) leftArrow.style.display = 'flex';
        if (rightArrow) rightArrow.style.display = 'flex';
      }
    } else {
      // Hide arrows if not a carousel
      if (leftArrow) leftArrow.style.display = 'none';
      if (rightArrow) rightArrow.style.display = 'none';
    }
    
    // Hide caption in focus view (already shown in carousel view)
    captionEl.style.display = 'none';
    
    overlay.style.display = 'flex';
    
    // Position the image at the click Y position, centered horizontally
    const positionMedia = () => {
      const clickY = parseFloat(overlay.dataset.clickY) || window.innerHeight / 2;
      
      // Get the currently visible media element
      const activeMedia = isVideo ? zoomedVideo : zoomedImg;
      
      // Wait for next frame to ensure media is rendered
      requestAnimationFrame(() => {
        const imgRect = activeMedia.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;
        
        // Calculate position to center image at click Y, centered X
        const left = (viewportWidth - imgRect.width) / 2;
        let top = clickY - (imgRect.height / 2);
        
        // Clamp top position to keep image within viewport
        const minTop = 10; // 10px margin from top
        const maxTop = viewportHeight - imgRect.height - 10; // 10px margin from bottom
        top = Math.max(minTop, Math.min(top, maxTop));
        
        activeMedia.style.position = 'absolute';
        activeMedia.style.left = `${left}px`;
        activeMedia.style.top = `${top}px`;
        
        // Position caption and arrows relative to the image
        const leftArrow = overlay.querySelector('#zoom-nav-left');
        const rightArrow = overlay.querySelector('#zoom-nav-right');
        
        if (leftArrow) {
          leftArrow.style.top = `${top}px`;
          leftArrow.style.height = `${imgRect.height}px`;
        }
        if (rightArrow) {
          rightArrow.style.top = `${top}px`;
          rightArrow.style.height = `${imgRect.height}px`;
        }
        if (captionEl && captionEl.style.display !== 'none') {
          captionEl.style.top = `${top + imgRect.height - 60}px`;
        }
      });
    };
    
    // Wait for media to load before positioning
    if (isVideo) {
      zoomedVideo.addEventListener('loadedmetadata', positionMedia, { once: true });
      // Fallback in case video is already loaded
      if (zoomedVideo.readyState >= 1) {
        positionMedia();
      }
    } else {
      if (zoomedImg.complete) {
        positionMedia();
      } else {
        zoomedImg.addEventListener('load', positionMedia, { once: true });
      }
    }
  });
}

// Theme utilities (outline mode removed)
// Minimal inline markdown to HTML (bold only) with escaping
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Global preset keywords and blacklist (populated from config)
let globalPresetKeywords = {};
let globalPresetBlacklist = [];

// Convert HSL to hex (S=85%, L=55% for vibrant colors)
function hslToHex(h, s = 0.85, l = 0.55) {
  const hueToRgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = Math.round(hueToRgb(p, q, h + 1/3) * 255);
  const g = Math.round(hueToRgb(p, q, h) * 255);
  const b = Math.round(hueToRgb(p, q, h - 1/3) * 255);
  
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

function mdInlineToHtmlBoldOnly(s) {
  // First, extract and protect markdown links from escaping
  const linkPlaceholders = [];
  let text = String(s);
  
  // Extract markdown links [text](url) and replace with placeholders
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, linkText, url) => {
    const placeholder = `__LINK_${linkPlaceholders.length}__`;
    linkPlaceholders.push({ text: linkText, url: url });
    return placeholder;
  });
  
  // Now escape HTML
  const escaped = escapeHtml(text);
  
  // Colorize preset quality keywords BEFORE converting bold markdown
  // This way keywords work even inside **bold** text
  let result = escaped;
  if (globalPresetKeywords && Object.keys(globalPresetKeywords).length > 0) {
    // Sort by keyword length (longest first) to prevent partial matches
    const sortedKeywords = Object.entries(globalPresetKeywords).sort((a, b) => b[0].length - a[0].length);
    
    sortedKeywords.forEach(([keyword, color]) => {
      // Use color directly (now hex values from config instead of hue)
      // Match keywords with proper boundaries (not breaking multi-word keywords)
      const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Match whole keyword when preceded/followed by non-letter chars (but allow spaces within keyword)
      const regex = new RegExp(`(^|[^a-zA-Z])(${escapedKeyword})(?=[^a-zA-Z]|$)`, 'gi');
      const beforeReplace = result;
      result = result.replace(regex, (match, prefix, word, offset) => {
        // Check if this match is part of a blacklisted pattern
        const matchStart = offset + prefix.length;
        const matchEnd = matchStart + word.length;
        
        // Get context around the match (a few chars before and after)
        const contextStart = Math.max(0, matchStart - 20);
        const contextEnd = Math.min(result.length, matchEnd + 20);
        const context = result.substring(contextStart, contextEnd).toLowerCase();
        
        // Check if any blacklisted pattern appears in this context
        const isBlacklisted = globalPresetBlacklist.some(pattern => {
          const patternLower = pattern.toLowerCase();
          return context.includes(patternLower) && patternLower.includes(word.toLowerCase());
        });
        
        if (isBlacklisted) {
          dbg(`Skipping blacklisted match: "${word}" in context`);
          return match; // Don't colorize, return original
        }
        
        return `${prefix}<span class="preset-keyword" style="color: ${color} !important; font-weight: 600;">${word}</span>`;
      });
      if (result !== beforeReplace) {
        dbg(`Colorized keyword: "${keyword}" -> ${color}`);
      }
    });
  } else {
    dbg('No preset keywords loaded for coloring');
  }
  
  // Convert **text** to <strong>text</strong> AFTER colorizing keywords
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  
  // Restore links as HTML <a> tags
  linkPlaceholders.forEach((link, index) => {
    const placeholder = `__LINK_${index}__`;
    const linkHtml = `<a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.text)}</a>`;
    result = result.replace(placeholder, linkHtml);
  });
  
  return result;
}

// Normalize theme colors (no shade derivation)
function normalizeThemeColors(raw = {}) {
  const colors = { ...(raw || {}) };

  // Derive hyperlink color from brand_primary if not given
  if (!colors.hyperlink_color) {
    colors.hyperlink_color = colors.brand_primary || '#00DCDC';
  }

  return colors;
}

// Color helpers (hex only)
function hexToRgb(hex) {
  if (typeof hex !== 'string') return null;
  const m = hex.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return { r, g, b };
}
function rgbToHex(r, g, b) {
  const to2 = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}
function mixHex(hex1, hex2, t) {
  const c1 = hexToRgb(hex1);
  const c2 = hexToRgb(hex2);
  if (!c1 || !c2) return hex1 || hex2 || '#666666';
  const r = c1.r * t + c2.r * (1 - t);
  const g = c1.g * t + c2.g * (1 - t);
  const b = c1.b * t + c2.b * (1 - t);
  return rgbToHex(r, g, b);
}

// Get a contrasting strong color (hex) derived from brand_primary
function getLighterBrandColor(cfg) {
  const raw = cfg?.theme_colors;
  const colors = normalizeThemeColors(raw || {});
  
  // If strong_color is explicitly set, use it directly
  if (raw?.strong_color) {
    return raw.strong_color.trim();
  }
  
  const brand = (raw?.brand_primary || colors.brand_primary || '').trim();
  const rgb = hexToRgb(brand);
  if (!rgb) return '#666666';
  const brightness = rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114; // 0..255
  // Light brands (e.g., white): darken for contrast. Dark brands: lighten.
  if (brightness > 180) {
    return mixHex(brand, '#000000', 0.4); // 40% brand + 60% black
  } else {
    return mixHex(brand, '#FFFFFF', 0.6); // 60% brand + 40% white
  }
}

function colorizeStrongIn(root, cfg) {
  if (!root) return;
  const strongColor = getLighterBrandColor(cfg);
  // Expose the strong color globally so non-text UI (e.g., BA handle) can match it
  try {
    const docRoot = document.documentElement;
    if (docRoot && strongColor) {
      docRoot.style.setProperty('--strong-color', strongColor, 'important');
    }
  } catch {}
  
  root.querySelectorAll('strong').forEach((el) => {
    if (!el.classList.contains('themed-strong')) {
      el.classList.add('themed-strong');
      el.style.setProperty('--strong-color', strongColor);
    }
    // Do not apply outline stroke to strong text to avoid overlapping glyphs
    // in display fonts that lack a true bold face (e.g., Digitalt).
  });
  
  // Also colorize links with theme colors from TOML
  root.querySelectorAll('a').forEach((el) => {
    if (!el.classList.contains('themed-link')) {
      el.classList.add('themed-link');
      // Use hyperlink_color or fall back to brand/primary color
      const t = cfg?.theme_colors || {};
      const linkColor = t.hyperlink_color || t.brand_primary || '#00DCDC';
      el.style.setProperty('--link-color', linkColor);
      el.style.color = linkColor;
    }
  });
}

// Before/After slider functionality
function initBeforeAfterSliders() {
  function initSlider(slider) {
    const initialValue = parseFloat(slider.dataset.initial || '0.5');
    const handle = slider.querySelector('.ba-handle');
    
    const setPosition = (position) => {
      position = utils.clamp(position, 0, 1);
      slider.style.setProperty('--pos', (position * 100).toFixed(2) + '%');
      if (handle) {
        handle.setAttribute('aria-valuenow', String(Math.round(position * 100)));
      }
    };
    
    setPosition(initialValue);

    const pointerToPosition = (event) => {
      const rect = slider.getBoundingClientRect();
      return utils.clamp((event.clientX - rect.left) / rect.width, 0, 1);
    };

    let isDragging = false;
    
    const handlePointerDown = (event) => {
      // Only start dragging if clicking on the handle
      if (event.target === handle || handle.contains(event.target)) {
        isDragging = true;
        slider.classList.add('dragging');
        event.preventDefault();
      }
    };
    
    const handlePointerMove = (event) => {
      if (isDragging) {
        setPosition(pointerToPosition(event));
      }
    };
    
    const handlePointerUp = () => {
      isDragging = false;
      slider.classList.remove('dragging');
    };

    slider.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    // Keyboard navigation
    if (handle) {
      handle.addEventListener('keydown', (event) => {
        const currentPos = parseFloat(getComputedStyle(slider).getPropertyValue('--pos')) / 100 || 0.5;
        const step = event.shiftKey ? 0.1 : 0.02;
        
        if (event.key === 'ArrowLeft') {
          setPosition(currentPos - step);
          event.preventDefault();
        }
        if (event.key === 'ArrowRight') {
          setPosition(currentPos + step);
          event.preventDefault();
        }
      });
    }

    // Make slider images zoomable with single click
    const sliderImages = slider.querySelectorAll('.ba-pane img');
    sliderImages.forEach(img => {
      img.style.cursor = 'zoom-in';
      img.style.pointerEvents = 'auto'; // Ensure images can receive clicks
      img.style.userSelect = 'none';
      img.style.webkitUserSelect = 'none';
      img.style.mozUserSelect = 'none';
      img.style.msUserSelect = 'none';
      
      img.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const overlay = initImageZoom();
        const zoomedImg = overlay.querySelector('#zoomed-image');
        const captionEl = overlay.querySelector('#zoom-caption');
        zoomedImg.src = img.src;
        zoomedImg.alt = img.alt;
        
        // Store click position for centering
        overlay.dataset.clickX = e.clientX;
        overlay.dataset.clickY = e.clientY;
        
        // Hide caption in focus view (consistent with carousel images)
        captionEl.style.display = 'none';
        
        overlay.style.display = 'flex';
        
        // Position the image at the click Y position, centered horizontally
        const positionImage = () => {
          const clickY = parseFloat(overlay.dataset.clickY) || window.innerHeight / 2;
          
          // Wait for next frame to ensure image is rendered
          requestAnimationFrame(() => {
            const imgRect = zoomedImg.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            const viewportWidth = window.innerWidth;
            
            // Calculate position to center image at click Y, centered X
            const left = (viewportWidth - imgRect.width) / 2;
            let top = clickY - (imgRect.height / 2);
            
            // Clamp top position to keep image within viewport
            const minTop = 10; // 10px margin from top
            const maxTop = viewportHeight - imgRect.height - 10; // 10px margin from bottom
            top = Math.max(minTop, Math.min(top, maxTop));
            
            zoomedImg.style.position = 'absolute';
            zoomedImg.style.left = `${left}px`;
            zoomedImg.style.top = `${top}px`;
            
            // Position caption and arrows relative to the image
            const leftArrow = overlay.querySelector('#zoom-nav-left');
            const rightArrow = overlay.querySelector('#zoom-nav-right');
            
            if (leftArrow) {
              leftArrow.style.top = `${top}px`;
              leftArrow.style.height = `${imgRect.height}px`;
            }
            if (rightArrow) {
              rightArrow.style.top = `${top}px`;
              rightArrow.style.height = `${imgRect.height}px`;
            }
            if (captionEl && captionEl.style.display !== 'none') {
              captionEl.style.top = `${top + imgRect.height - 60}px`;
            }
          });
        };
        
        // Wait for image to load before positioning
        if (zoomedImg.complete) {
          positionImage();
        } else {
          zoomedImg.addEventListener('load', positionImage, { once: true });
        }
      });
    });
  }
  
  // Initialize all sliders on the page
  document.querySelectorAll('.ba-slider').forEach(initSlider);
}

// Removed random theme element styling to keep code lean and deterministic

// Background management utilities
function buildBackgroundLayers(site = {}, themeColors = {}) {
  if (!site.background_image) return null;
  const baseImage = `url('${site.background_image}')`;
  
  // Derive pattern colors from theme if not explicitly provided
  let blackColor = site.background_color_black;
  let whiteColor = site.background_color_white;
  
  // Auto-derive from theme colors if not specified
  if (!blackColor && !whiteColor && themeColors) {
    const bgDark = themeColors.bg_dark || '#0A0A0A';
    const brandPrimary = themeColors.brand_primary || '#FFFFFF';
    
    // Use bg_dark for black, and a darkened version of brand_primary for white
    blackColor = bgDark;
    whiteColor = `color-mix(in srgb, ${brandPrimary} 20%, ${bgDark} 80%)`;
  }
  
  if (!blackColor && !whiteColor) {
    return { backgroundImage: baseImage, blendMode: '' };
  }

  const gradientOverlay = `linear-gradient(0deg, ${blackColor || '#000000'}, ${whiteColor || '#ffffff'})`;
  return {
    backgroundImage: `${gradientOverlay}, ${baseImage}`,
    blendMode: 'multiply'
  };
}

function createBackgroundStyle(cfg) {
  const site = cfg?.site || {};
  if (!site.background_image || !site.background_rotation) return null;

  const rotation = site.background_rotation;
  const size = site.background_size || 'auto';
  const position = site.background_position || 'center';
  const repeat = site.background_repeat || 'repeat';
  const layers = buildBackgroundLayers(site, cfg?.theme_colors) || { backgroundImage: `url('${site.background_image}')`, blendMode: '' };
  const blendModeRule = layers.blendMode ? `background-blend-mode: ${layers.blendMode};` : '';

  return `
    .bg-shapes::before {
      content: '';
      position: absolute;
      top: -75%; left: -75%;
      width: 250%; height: 250%;
      background-image: ${layers.backgroundImage};
      background-size: ${size};
      background-position: ${position};
      background-repeat: ${repeat};
      ${blendModeRule}
      transform: rotate(${rotation}deg);
      transform-origin: center;
      z-index: -1;
    }
  `;
}

// Generate background shapes or apply background image
function generateBackgroundShapes(cfg) {
  const container = document.querySelector('.bg-shapes');
  if (!container) return;
  
  // Clean up previous styles
  const existingStyle = document.querySelector('style[data-bg-rotation]');
  if (existingStyle) existingStyle.remove();
  
  // Handle background image
  if (cfg?.site?.background_image) {
    container.innerHTML = '';
    const rotationStyle = createBackgroundStyle(cfg);
    
    if (rotationStyle) {
      // Use pseudo-element for rotation
      const style = document.createElement('style');
      style.setAttribute('data-bg-rotation', 'true');
      style.textContent = rotationStyle;
      document.head.appendChild(style);
    } else {
      // Direct container styling
      const site = cfg.site || {};
      const layers = buildBackgroundLayers(site) || { backgroundImage: `url('${site.background_image}')`, blendMode: '' };
      container.style.backgroundImage = layers.backgroundImage;
      container.style.backgroundBlendMode = layers.blendMode || '';
      
      // If background repeats vertically, calculate size based on page height
      const bgRepeat = site.background_repeat || 'no-repeat';
      if (bgRepeat === 'repeat' || bgRepeat === 'repeat-y') {
        // Get the actual page height
        const pageHeight = Math.max(
          document.body.scrollHeight,
          document.body.offsetHeight,
          document.documentElement.clientHeight,
          document.documentElement.scrollHeight,
          document.documentElement.offsetHeight
        );
        
        // Change from fixed to absolute positioning to allow height control
        container.style.position = 'absolute';
        container.style.top = '0';
        container.style.left = '0';
        container.style.right = '0';
        container.style.height = `${pageHeight}px`;
        container.style.width = '100%';
      }
      
      container.style.backgroundSize = site.background_size || 'cover';
      container.style.backgroundPosition = site.background_position || 'center';
      container.style.backgroundRepeat = bgRepeat;
    }
    
    container.style.opacity = cfg?.site?.background_opacity || '0.3';
    return;
  }
  
  // Generate animated shapes
  container.innerHTML = '';
  container.style.backgroundImage = '';
  container.style.backgroundBlendMode = '';
  const viewportWidth = utils.getViewportWidth();
  const shapeCount = viewportWidth < 600 ? 48 : 96;
  const sizeRange = viewportWidth < 600 ? { min: 18, max: 50 } : { min: 22, max: 60 };
  
  // Create shapes efficiently
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < shapeCount; i++) {
    const shape = document.createElement('span');
    const shapeType = utils.randomChoice(THEME_CONFIG.shapes.types);
    
    shape.className = `shape ${shapeType}`;
    
    const size = Math.round(sizeRange.min + Math.random() * (sizeRange.max - sizeRange.min));
    const top = Math.random() * 100;
    const left = Math.random() * 100;
    const rotation = Math.round(Math.random() * 360);
    
    Object.assign(shape.style, {
      width: `${size}px`,
      height: `${size}px`,
      top: `${top}%`,
      left: `${left}%`,
      transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
      position: 'absolute'
    });
    
    fragment.appendChild(shape);
  }
  container.appendChild(fragment);
}

// ===== Minimal TOML parser (subset) =====
// Supports: [section], [[arrayOfTables]], dotted table names, key = value,
// arrays (incl. multi-line), inline tables { ... }, strings, numbers, booleans.
function parseTomlLight(input) {
  const obj = {};
  let current = obj;
  let currentArraySection = null;
  // When inside an array-of-tables (e.g., [[documentation.pages]]),
  // keep a persistent reference to the current array item root so that
  // nested tables like [documentation.pages.introduction] and nested arrays
  // like [[documentation.pages.comparisons]] attach to the page object,
  // not to the last nested table we stepped into.
  let currentArrayItemRoot = null;

  const stripComments = (line) => {
    let out = '';
    let inStr = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"' && line[i - 1] !== '\\') inStr = !inStr;
      if (c === '#' && !inStr) break;
      out += c;
    }
    return out;
  };

  const isBalancedArray = (s) => {
    let inStr = false;
    let depth = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '"' && s[i - 1] !== '\\') inStr = !inStr;
      if (inStr) continue;
      if (c === '[') depth++;
      else if (c === ']') depth--;
    }
    return depth === 0;
  };

  const splitTopLevel = (s) => {
    const parts = [];
    let buf = '';
    let inStr = false;
    let bracketDepth = 0;
    let braceDepth = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '"' && s[i - 1] !== '\\') inStr = !inStr;
      if (!inStr) {
        if (c === '[') bracketDepth++;
        else if (c === ']') bracketDepth--;
        else if (c === '{') braceDepth++;
        else if (c === '}') braceDepth--;
        else if (c === ',' && bracketDepth === 0 && braceDepth === 0) {
          parts.push(buf.trim());
          buf = '';
          continue;
        }
      }
      buf += c;
    }
    if (buf.trim()) parts.push(buf.trim());
    return parts;
  };

  const parseInlineTable = (raw) => {
    let v = raw.trim();
    if (!v.startsWith('{') || !v.endsWith('}')) return null;
    v = v.slice(1, -1).trim();
    if (!v) return {};
    const obj = {};
    const fields = splitTopLevel(v);
    for (const field of fields) {
      const eq = field.indexOf('=');
      if (eq < 0) continue;
      const key = field.slice(0, eq).trim();
      const val = field.slice(eq + 1).trim();
      obj[key] = parseValue(val);
    }
    return obj;
  };

  const ensurePathObject = (root, dotted) => {
    const parts = dotted.split('.');
    let ref = root;
    for (const p of parts) {
      if (ref[p] === undefined || typeof ref[p] !== 'object' || Array.isArray(ref[p])) {
        ref[p] = {};
      }
      ref = ref[p];
    }
    return ref;
  };

  const pushArrayTableAtPath = (root, dotted) => {
    const parts = dotted.split('.');
    const last = parts.pop();
    let ref = root;
    for (const p of parts) {
      if (ref[p] === undefined || typeof ref[p] !== 'object' || Array.isArray(ref[p])) {
        ref[p] = {};
      }
      ref = ref[p];
    }
    if (!Array.isArray(ref[last])) ref[last] = [];
    const entry = {};
    ref[last].push(entry);
    return entry;
  };

  // Helpers that operate relative to a given root object instead of the global obj
  const ensurePathObjectRelative = (root, dotted) => {
    if (!dotted) return root;
    const parts = dotted.split('.');
    let ref = root;
    for (const p of parts) {
      if (ref[p] === undefined || typeof ref[p] !== 'object' || Array.isArray(ref[p])) {
        ref[p] = {};
      }
      ref = ref[p];
    }
    return ref;
  };

  const pushArrayTableRelative = (root, dotted) => {
    const parts = dotted.split('.');
    const last = parts.pop();
    let ref = root;
    for (const p of parts) {
      if (ref[p] === undefined || typeof ref[p] !== 'object' || Array.isArray(ref[p])) {
        ref[p] = {};
      }
      ref = ref[p];
    }
    if (!Array.isArray(ref[last])) ref[last] = [];
    const entry = {};
    ref[last].push(entry);
    return entry;
  };

  const parseValue = (raw) => {
    let v = raw.trim();
    if (!v) return null;
    if (v.startsWith('[')) {
      // array
      v = v.replace(/^\[/, '').replace(/\]$/, '').trim();
      if (!v) return [];
      return splitTopLevel(v).map(el => parseValue(el));
    }
    if (v.startsWith('{')) {
      // inline table
      const t = parseInlineTable(v);
      return t;
    }
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      const quote = v[0];
      v = v.slice(1, -1);
      if (quote === '"') v = v.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
      return v;
    }
    if (v === 'true') return true;
    if (v === 'false') return false;
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
    return v; // fallback string
  };

  const lines = input.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    let line = stripComments(lines[i]).trim();
    if (!line) continue;

    // Array of tables: [[section]]
    let mArr = line.match(/^\[\[(.+?)\]\]$/);
    if (mArr) {
      const name = mArr[1].trim();
      // If we are inside an array-of-tables context (e.g., [[documentation.pages]])
      // and encounter a nested array like [[documentation.pages.comparisons]], push relative to the
      // current array item root (the page object), not to the last nested table.
      if (currentArraySection && name.startsWith(currentArraySection + '.')) {
        const subpath = name.slice(currentArraySection.length + 1);
        const entry = pushArrayTableRelative(currentArrayItemRoot || current, subpath);
        current = entry; // switch to new nested array table entry
        // keep currentArraySection and currentArrayItemRoot as-is
      } else {
        const entry = pushArrayTableAtPath(obj, name);
        current = entry;
        currentArraySection = name; // entered a new top-level array-of-tables
        currentArrayItemRoot = entry; // track the root object of the array item
      }
      continue;
    }

    // Table: [section]
    let mTbl = line.match(/^\[(.+?)\]$/);
    if (mTbl) {
      const name = mTbl[1].trim();
      // If we are inside an array-of-tables (e.g., [[documentation.pages]]) and
      // we see a nested table like [documentation.pages.introduction],
      // resolve it relative to the current array item root.
      if (currentArraySection && name.startsWith(currentArraySection + '.')) {
        const subpath = name.slice(currentArraySection.length + 1);
        current = ensurePathObjectRelative(currentArrayItemRoot || current, subpath);
        // keep currentArraySection so subsequent nested tables remain relative
      } else {
        current = ensurePathObject(obj, name);
        currentArraySection = null; // switched to a non-array table
        currentArrayItemRoot = null;
      }
      continue;
    }

    // Key = value
    const eqIdx = line.indexOf('=');
    if (eqIdx > 0) {
      const key = line.slice(0, eqIdx).trim();
      let valuePart = line.slice(eqIdx + 1).trim();

      // Handle multi-line arrays
      if (valuePart.startsWith('[') && !isBalancedArray(valuePart)) {
        let buf = valuePart;
        while (i + 1 < lines.length) {
          i++;
          const next = stripComments(lines[i]);
          buf += next;
          if (isBalancedArray(buf)) break;
        }
        valuePart = buf;
      }

      current[key] = parseValue(valuePart);
      continue;
    }
  }

  return obj;
}

// ===== Content loading and rendering from TOML =====
async function loadTomlContent(url) {
  dbg('loadTomlContent: fetching', url);
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  const text = await res.text();
  dbg('loadTomlContent: fetched bytes', text.length);
  
  // Prefer robust external TOML parser (supports inline tables and nested structures)
  const externalParser = (window.TOML && window.TOML.parse) || (window.toml && window.toml.parse);
  if (externalParser) {
    try {
      dbg('loadTomlContent: using external TOML parser');
      const parsed = externalParser(text);
      dbg('loadTomlContent: external parse keys', Object.keys(parsed || {}));
      return parsed;
    } catch (e) {
      dbgw('External TOML parser failed, falling back to lightweight parser:', e);
    }
  }
  
  // Normalize known multiline literal strings for fallback parser (triple quotes)
  // Converts: content_html = '''...'''
  // Into:     content_html = "...\n..." (JSON-escaped)
  const normalizeTomlForFallback = (src) => {
    try {
      const re = /(\n|^)\s*content_html\s*=\s*'''([\s\S]*?)'''/g;
      return src.replace(re, (full, leadingNl, inner) => {
        const json = JSON.stringify(inner);
        return `${leadingNl}content_html = ${json}`;
      });
    } catch {
      return src;
    }
  };

  const normalized = normalizeTomlForFallback(text);
  
  // Fallback to local lightweight parser
  dbg('loadTomlContent: using lightweight parser');
  const fallback = parseTomlLight(normalized);
  dbg('loadTomlContent: fallback parse keys', Object.keys(fallback || {}));
  return fallback;
}

function setMetaTags(meta = {}) {
  const set = (prop, content) => {
    if (!content) return;
    let el = document.querySelector(`meta[property="${prop}"]`);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute('property', prop);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  };
  set('og:type', meta.og_type);
  set('og:url', meta.og_url);
  set('og:title', meta.og_title);
  set('og:description', meta.og_description);
  set('og:image', meta.og_image);
}

// ===== Changelog helpers =====
async function fetchMarkdownContent(url) {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
    return await response.text();
  } catch (error) {
    console.error('Error fetching markdown:', error);
    return null;
  }
}

function parseMarkdownChangelog(markdown) {
  if (!markdown) return [];
  
  const lines = markdown.split('\n');
  const versions = [];
  let currentVersion = null;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Check for version headers (e.g., >## 1.5.2 - INITIAL PUBLIC RELEASE)
    const versionMatch = trimmed.match(/^>##\s+(.+)$/);
    if (versionMatch) {
      if (currentVersion) {
        versions.push(currentVersion);
      }
      
      const fullTitle = versionMatch[1];
      const { title, date } = parseVersionTitleAndDate(fullTitle);
      
      currentVersion = {
        title: title,
        fullTitle: fullTitle,
        date: date,
        changes: []
      };
      continue;
    }
    
    // Check for bullet points (e.g., * Fixed broken imports)
    const bulletMatch = trimmed.match(/^\*\s+(.+)$/);
    if (bulletMatch && currentVersion) {
      currentVersion.changes.push(bulletMatch[1]);
      continue;
    }
  }
  
  // Add the last version if it exists
  if (currentVersion) {
    versions.push(currentVersion);
  }
  
  return versions;
}

function parseVersionTitleAndDate(fullTitle) {
  // Try to extract date patterns from the title
  // Common patterns: DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, MM/DD/YYYY
  const datePatterns = [
    /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/g,  // DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
    /(\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})/g,  // YYYY/MM/DD, YYYY-MM-DD, YYYY.MM.DD
    /(\d{1,2}\s+\w+\s+\d{4})/g,                // DD Month YYYY
    /(\w+\s+\d{1,2},?\s+\d{4})/g               // Month DD, YYYY
  ];
  
  let extractedDate = null;
  let cleanTitle = fullTitle;
  
  for (const pattern of datePatterns) {
    const matches = fullTitle.match(pattern);
    if (matches && matches.length > 0) {
      extractedDate = matches[0];
      // Remove the date from the title
      cleanTitle = fullTitle.replace(pattern, '').trim();
      // Clean up any remaining separators
      cleanTitle = cleanTitle.replace(/\s*[-–-]\s*$/, '').replace(/^\s*[-–-]\s*/, '').trim();
      break;
    }
  }
  
  return {
    title: cleanTitle || fullTitle,
    date: extractedDate
  };
}

// Parse usage images using generic parser
function parseUsageImages(introduction) {
  if (!introduction) return [];
  
  // Use generic parser with usage-specific keys
  const images = parseMediaItems(introduction, {
    itemsKey: 'usage_images',
    itemKey: 'usage_image', 
    captionsKey: 'usage_images_captions',
    altKey: 'usage_images_alt',
    alignmentKey: 'usage_images_alignment'
  });
  
  // Fallback to legacy single image format
  if (images.length === 0) {
    const singleImage = introduction.usage_image || introduction.usageImage;
    const singleAlt = introduction.usage_image_alt || introduction.usageImageAlt || 'Usage illustration';
    const singleCaption = introduction.usage_image_caption || introduction.usageImageCaption || '';
    
    if (singleImage) {
      images.push({ src: singleImage, alt: singleAlt, caption: singleCaption });
    }
  }
  
  return images;
}

// Returns the preferred caption text: explicit caption if present, otherwise the alt text
function getImageCaptionText(img) {
  if (!img) return '';
  const cap = (img.caption !== undefined && img.caption !== null) ? String(img.caption).trim() : '';
  const alt = (img.alt !== undefined && img.alt !== null) ? String(img.alt).trim() : '';
  const title = (img.title !== undefined && img.title !== null) ? String(img.title).trim() : '';
  return cap || alt || title;
}

// (Removed) parseItemImages - no longer needed after unifying comparison rendering

// Use generic carousel for images
function createImageCarousel(images, cfg, className = 'image-carousel', options = {}) {
  // Handle shared alt text option
  if (options.sharedAlt) {
    images = images.map(img => ({ ...img, alt: String(options.sharedAlt) }));
  }
  
  const carousel = createMediaCarousel(images, cfg, { 
    className, 
    type: 'image',
    borderClass: 'media-border',
    ...options
  });
  
  return carousel;
}

const CHANGELOG_VARIANT_RULES = [
  {
    keywords: ['bug', 'fix', 'hotfix'],
    styles: {
      versionClass: 'changelog-version-fix',
      badgeClass: 'bg-danger',
      titleColor: '#ff6b6b',
      borderColor: '#dc3545',
      iconColor: '#dc3545'
    }
  },
  {
    keywords: ['feature', 'update', 'new', 'improvement', 'addition', 'optimization', 'stability', 'qol'],
    styles: {
      versionClass: 'changelog-version-feature',
      badgeClass: 'bg-success',
      titleColor: '#51cf66',
      borderColor: '#28a745',
      iconColor: '#28a745'
    }
  },
  {
    keywords: ['release', 'initial', 'public'],
    styles: {
      versionClass: 'changelog-version-release',
      badgeClass: 'bg-primary',
      titleColor: '#74c0fc',
      borderColor: '#007bff',
      iconColor: '#007bff'
    }
  },
  {
    keywords: ['rework', 'change', 'major'],
    styles: {
      versionClass: 'changelog-version-rework',
      badgeClass: 'bg-warning',
      titleColor: '#ffd43b',
      borderColor: '#ffc107',
      iconColor: '#ffc107'
    }
  }
];

function getChangelogVariantStyles(title = '') {
  const defaults = {
    versionClass: 'changelog-version-default',
    badgeClass: 'bg-secondary',
    titleColor: 'var(--text-white)',
    borderColor: '#8A66D9',
    iconColor: '#8A66D9'
  };

  if (!title) return defaults;
  const lowerTitle = String(title).toLowerCase();

  for (const rule of CHANGELOG_VARIANT_RULES) {
    if (rule.keywords.some(keyword => lowerTitle.includes(keyword))) {
      return { ...defaults, ...rule.styles };
    }
  }

  return defaults;
}

function renderChangelogSection(cfg) {
  const changelogSection = document.getElementById('changelog');
  const changelogTitle = document.getElementById('changelog-title');
  const changelogContent = document.getElementById('changelog-content');
  
  if (!changelogSection || !cfg?.changelog?.enabled) {
    if (changelogSection) changelogSection.style.display = 'none';
    return;
  }
  
  // Set title
  if (changelogTitle && cfg.changelog.title) {
    changelogTitle.textContent = cfg.changelog.title;
  }
  
  // Show the section
  changelogSection.style.display = '';
  
  // Fetch and render changelog content
  if (cfg.changelog.url && changelogContent) {
    fetchMarkdownContent(cfg.changelog.url).then(markdown => {
      if (!markdown) {
        changelogContent.innerHTML = '<p>Unable to load changelog content.</p>';
        return;
      }
      
      const versions = parseMarkdownChangelog(markdown);
      if (versions.length === 0) {
        changelogContent.innerHTML = '<p>No changelog entries found.</p>';
        return;
      }
      
      // Reverse the order so newest versions appear first
      const reversedVersions = versions.reverse();
      
      // Create scrollable container with collapsible versions
      const scrollContainer = document.createElement('div');
      scrollContainer.className = 'changelog-scroll-container';
      
      // Render changelog versions with collapsible sections
      reversedVersions.forEach((version, index) => {
        const versionId = `changelog-version-${index}`;
        const isFirstVersion = index === 0;
        const { versionClass, badgeClass, titleColor, borderColor, iconColor } = getChangelogVariantStyles(version.title);
        
        const changesHtml = version.changes.map(change => 
          `<li class="changelog-change-item" style="--bullet-color: ${iconColor};">${mdInlineToHtmlBoldOnly(change)}</li>`
        ).join('');
        
        const dateHtml = version.date ? `<span class="changelog-version-date">${version.date}</span>` : '';
        
        const versionElement = document.createElement('div');
        versionElement.className = `changelog-version ${versionClass}`;
        versionElement.innerHTML = `
          <div class="changelog-version-header" data-bs-toggle="collapse" data-bs-target="#${versionId}" aria-expanded="${isFirstVersion}" aria-controls="${versionId}" style="border-left-color: ${borderColor};">
            <div class="changelog-version-title-container">
              <h4 class="changelog-version-title" style="color: ${titleColor} !important;">${mdInlineToHtmlBoldOnly(version.title)}</h4>
              <span class="badge ${badgeClass} changelog-version-badge">${version.changes.length} change${version.changes.length !== 1 ? 's' : ''}</span>
            </div>
            <div class="changelog-version-meta">
              ${dateHtml}
              <i class="changelog-toggle-icon" style="color: ${iconColor} !important;">▼</i>
            </div>
          </div>
          <div class="collapse ${isFirstVersion ? 'show' : ''}" id="${versionId}">
            <div class="changelog-version-content">
              ${changesHtml ? `<ul class="changelog-changes">${changesHtml}</ul>` : '<p class="text-muted">No changes listed.</p>'}
            </div>
          </div>
        `;
        
        scrollContainer.appendChild(versionElement);
      });
      
      changelogContent.innerHTML = '';
      changelogContent.appendChild(scrollContainer);
      
      // Apply theme colors to strong elements
      colorizeStrongIn(changelogContent, cfg);
      
      // Add event listeners for toggle icons
      changelogContent.querySelectorAll('.changelog-version-header').forEach(header => {
        header.addEventListener('click', function() {
          const icon = this.querySelector('.changelog-toggle-icon');
          const target = this.getAttribute('data-bs-target');
          const collapse = document.querySelector(target);
          
          // Toggle icon rotation
          setTimeout(() => {
            if (collapse.classList.contains('show')) {
              icon.style.transform = 'rotate(180deg)';
            } else {
              icon.style.transform = 'rotate(0deg)';
            }
          }, 10);
        });
      });
      
    }).catch(error => {
      console.error('Error rendering changelog:', error);
      changelogContent.innerHTML = '<p>Error loading changelog content.</p>';
    });
  }
}

// ===== Citations helpers =====
function parseBibtexEntry(text = '') {
  const entry = {};
  if (typeof text !== 'string') return entry;
  const header = text.match(/@(\w+)\s*\{\s*([^,\n]+)\s*,/i);
  if (header) {
    entry.entrytype = header[1].toLowerCase();
    entry.citekey = header[2];
  }
  // key = {value}
  let m;
  const braceRe = /(\w+)\s*=\s*\{([^}]*)\}/g;
  while ((m = braceRe.exec(text)) !== null) {
    entry[m[1].toLowerCase()] = m[2].trim();
  }
  // key = "value"
  const quoteRe = /(\w+)\s*=\s*"([^"]*)"/g;
  while ((m = quoteRe.exec(text)) !== null) {
    const k = m[1].toLowerCase();
    if (!(k in entry)) entry[k] = m[2].trim();
  }
  return entry;
}

function formatBibtexAuthors(authorField = '') {
  if (!authorField) return '';
  const parts = authorField.split(/\s+and\s+/i).map(s => s.trim()).filter(Boolean);
  const names = parts.map(a => {
    if (a.includes(',')) {
      const bits = a.split(',').map(s => s.trim());
      const last = bits[0] || '';
      const first = bits.slice(1).join(' ').trim();
      return (first ? `${first} ${last}` : last).trim();
    }
    return a.trim();
  });
  return names.join(', ');
}

function formatCitationHtml(fields = {}) {
  const authors = formatBibtexAuthors(fields.author);
  const year = fields.year ? String(fields.year) : '';
  const title = fields.title || '';
  const journal = fields.journal || fields.booktitle || '';
  const volume = fields.volume ? String(fields.volume) : '';
  const number = fields.number ? String(fields.number) : '';
  const pages = fields.pages ? String(fields.pages).replace(/--/g, '–') : '';
  const publisher = fields.publisher || '';

  // Build multiline HTML: line1 = authors (bold) + (year), line2 = title, line3 = journal/volume/number/pages, line4 = publisher
  const line1 = [authors ? `<strong>${authors}</strong>` : '', year ? `(${year})` : '']
    .filter(Boolean)
    .join(' ');
  const line2 = title ? `${title}.` : '';
  let line3 = '';
  if (journal) {
    line3 = `<em>${journal}</em>`;
    if (volume) line3 += ` ${volume}`;
    if (number) line3 += `(${number})`;
    if (pages) line3 += `:${pages}`;
    line3 += '.';
  }
  const line4 = publisher ? `Publisher: ${publisher}.` : '';

  return [line1, line2, line3, line4].filter(s => s && s.trim()).join('<br>');
}

function renderCitationsSection(cfg) {
  // Check if citations are enabled and if there are citation items
  const citationsEnabled = cfg?.citations_config?.enabled !== false; // default to true for backward compatibility
  const items = Array.isArray(cfg?.citations) ? cfg.citations : [];
  
  if (!citationsEnabled || !items.length) return;
  
  const main = document.querySelector('main.content-container') || document.querySelector('main') || document.body;
  if (!main) return;

  const section = document.createElement('section');
  section.className = 'citations section';
  section.id = 'citations';

  const h2 = document.createElement('h2');
  h2.className = 'section__title';
  h2.id = 'citations-title';
  h2.textContent = (cfg?.citations_config?.title) || (cfg?.titles?.citations) || 'Citations';
  section.appendChild(h2);

  const card = document.createElement('div');
  card.className = 'card';

  const list = document.createElement('ol');
  list.className = 'citation-list';

  items.forEach((it) => {
    const li = document.createElement('li');
    const fields = parseBibtexEntry(String(it.bibtex || ''));
    const html = formatCitationHtml(fields);
    if (html) li.innerHTML = html;
    else li.textContent = it.bibtex || it.id || '';
    list.appendChild(li);
  });

  card.appendChild(list);
  section.appendChild(card);
  main.appendChild(section);
}

function applyThemeColors(cfg) {
  // Apply theme colors from TOML to CSS custom properties
  if (cfg?.theme_colors) {
    const root = document.documentElement;
    const colors = normalizeThemeColors(cfg.theme_colors);
    const specialKeys = new Set(['brand_primary','brand_secondary','brand_tertiary','palette']);
    
    // Set unified brand and link colors used by CSS
    if (colors.brand_primary) {
      root.style.setProperty('--brand-color', colors.brand_primary, 'important');
    }
    const linkColor = colors.hyperlink_color || colors.brand_primary;
    if (linkColor) {
      root.style.setProperty('--link-color', linkColor, 'important');
    }
    // Set strong color early so components (e.g., BA handle) have it even before colorizeStrongIn runs
    const strongColorEarly = getLighterBrandColor({ theme_colors: colors });
    if (strongColorEarly) {
      root.style.setProperty('--strong-color', strongColorEarly, 'important');
    }

    // Apply each color with !important to override CSS defaults
    Object.entries(colors).forEach(([key, value]) => {
      if (!value) return;
      if (specialKeys.has(key)) return;
      if (/^primary_/i.test(key)) return; // skip deprecated keys
      const cssVar = `--${key.replace(/_/g, '-')}`;
      root.style.setProperty(cssVar, value, 'important');
    });
  } else {
    // No theme colors block
  }
  
  // Load preset keywords from config for colorizing quality preset names
  if (cfg?.preset_keywords) {
    // Strip quotes from keys (TOML parser may include them) and filter out non-keyword entries
    globalPresetKeywords = {};
    Object.entries(cfg.preset_keywords).forEach(([key, value]) => {
      // Skip entries that don't look like color values
      if (typeof value !== 'string' || !value.startsWith('#')) return;
      // Remove surrounding quotes from key if present
      const cleanKey = key.replace(/^["']|["']$/g, '');
      globalPresetKeywords[cleanKey] = value;
    });
    dbg('applyThemeColors: loaded preset keywords', Object.keys(globalPresetKeywords));
  } else {
    globalPresetKeywords = {};
  }
  
  // Load preset keywords blacklist
  const blacklistPatterns = cfg?.preset_keywords?.blacklist?.patterns;
  dbg('applyThemeColors: blacklist patterns in config?', blacklistPatterns);
  if (blacklistPatterns && Array.isArray(blacklistPatterns)) {
    globalPresetBlacklist = blacklistPatterns.map(s => String(s).toLowerCase());
    dbg('applyThemeColors: loaded preset blacklist', globalPresetBlacklist);
  } else {
    globalPresetBlacklist = [];
    dbg('applyThemeColors: no blacklist found');
  }
}

async function applyFontConfiguration(cfg) {
  // Apply font settings from TOML to CSS custom properties
  let fonts = cfg?.fonts;
  
  // If fonts_config is specified, load fonts from external file
  if (cfg?.fonts_config && !fonts) {
    try {
      dbg('applyFontConfiguration: loading external font config from', cfg.fonts_config);
      const fontCfg = await loadTomlContent(cfg.fonts_config);
      fonts = fontCfg?.fonts;
      dbg('applyFontConfiguration: loaded external fonts', fonts ? Object.keys(fonts) : 'none');
    } catch (e) {
      dbgw('applyFontConfiguration: failed to load external font config:', e);
    }
  }
  
  if (fonts) {
    const root = document.documentElement;
    
    // Apply each font setting with !important to override CSS defaults
    Object.entries(fonts).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        const cssVar = `--${key.replace(/_/g, '-')}`;
        root.style.setProperty(cssVar, value, 'important');
      }
    });
  }
}

// Outline text styles removed (no runtime toggling)

async function renderContent(cfg) {
  // Store config globally for access by other functions
  window.globalConfig = cfg;
  
  // Apply theme colors and fonts first
  applyThemeColors(cfg);
  await applyFontConfiguration(cfg);
  
  // Header: banner + research paper link
  const siteLogo = document.querySelector('.site-logo');
  if (siteLogo) {
    if (cfg?.site?.banner) {
      siteLogo.src = cfg.site.banner;
      siteLogo.style.display = '';
    } else {
      // Hide banner if not defined in TOML
      siteLogo.style.display = 'none';
    }
  }
  const researchBtn = document.querySelector('.research-paper-btn');
  if (researchBtn) {
    const text = cfg?.site?.research_link_text;
    const url = cfg?.site?.research_link_url;
    const title = (cfg?.site?.research_link_title ?? text) || '';
    const target = cfg?.site?.research_link_target ?? '_blank';
    const rel = cfg?.site?.research_link_rel ?? 'noopener noreferrer';
    const enabled = cfg?.site?.research_link_enabled;
    if (enabled === false) {
      // Explicitly disabled via TOML
      researchBtn.style.display = 'none';
    } else if (text && url) {
      researchBtn.textContent = text;
      researchBtn.href = url;
      researchBtn.setAttribute('title', title);
      researchBtn.setAttribute('target', target);
      researchBtn.setAttribute('rel', rel);
      researchBtn.style.display = '';
    } else {
      // Hide the button if TOML doesn't define it
      researchBtn.style.display = 'none';
    }
  }

  // Meta tags (optional)
  if (cfg?.meta) setMetaTags(cfg.meta);
  if (cfg?.site?.title) document.title = cfg.site.title;

  // Introduction
  const introTitle = document.getElementById('intro-title');
  const introContent = document.getElementById('intro-content');
  if (introTitle && cfg?.introduction?.title) introTitle.textContent = cfg.introduction.title;
  if (introContent) {
    // DRY: reuse the same renderer used by documentation pages
    renderIntroductionSection(cfg?.introduction || {}, cfg, 'intro-content', { includeVideo: true });
  }

  // Generic sections (inserted after introduction, before comparisons)
  const introConfig = cfg?.introduction || {};
  const sections = Array.isArray(introConfig.sections) ? introConfig.sections : [];
  if (sections.length > 0) {
    // Process each section individually
    let insertAfter = document.querySelector('.intro');
    
    sections.forEach(section => {
      const sectionType = section.type || 'content';
      const sectionTitle = section.title || '';
      
      // Handle comparison-type sections
      if (sectionType === 'comparisons') {
        const comparisonItems = Array.isArray(section.items) ? section.items : [];
        dbg(`Comparison section "${sectionTitle}": found ${comparisonItems.length} items`);
        if (comparisonItems.length > 0) {
          // Create standalone section element
          const mainSection = document.createElement('section');
          mainSection.className = 'section comparisons';
          
          // Add section title as h2
          if (sectionTitle) {
            const h2 = document.createElement('h2');
            h2.className = 'section__title';
            h2.textContent = sectionTitle;
            mainSection.appendChild(h2);
          }
          
          const comparisonsGrid = document.createElement('div');
          comparisonsGrid.className = 'grid grid--one-col';
          
          comparisonItems.forEach((item, idx) => {
            dbg(`Processing comparison item ${idx}:`, item);
            const el = createComparisonElement(item, cfg);
            if (el) {
              colorizeStrongIn(el, cfg);
              comparisonsGrid.appendChild(el);
              dbg(`Successfully created comparison element ${idx}`);
            } else {
              dbg(`Failed to create comparison element ${idx}`);
            }
          });
          
          mainSection.appendChild(comparisonsGrid);
          
          // Insert after previous section
          if (insertAfter && insertAfter.parentNode) {
            insertAfter.parentNode.insertBefore(mainSection, insertAfter.nextSibling);
            dbg(`Inserted comparison section "${sectionTitle}" with ${comparisonItems.length} items`);
            // Update reference for next section
            insertAfter = mainSection;
          } else {
            dbg(`WARNING: Could not insert comparison section "${sectionTitle}" - no parent found`);
          }
          
          // Initialize before/after sliders and carousels after DOM insertion
          setTimeout(() => {
            // Initialize sliders
            initBeforeAfterSliders();
            
            // Initialize any Bootstrap carousels
            if (typeof bootstrap !== 'undefined') {
              mainSection.querySelectorAll('.carousel').forEach(carouselEl => {
                if (!bootstrap.Carousel.getInstance(carouselEl)) {
                  new bootstrap.Carousel(carouselEl, {
                    interval: false,
                    wrap: true
                  });
                }
              });
            }
          }, 50);
        }
        return; // Skip rest of processing for comparison sections
      }
      
      // Handle content-type sections
      const sectionItems = Array.isArray(section.steps) ? section.steps : [];
      const sectionImages = parseMediaItems(section, {
        itemsKey: 'images',
        captionsKey: 'images_captions',
        altKey: 'images_alt',
        alignmentKey: 'images_alignment'
      });
      
      // Check layout preference for this section
      const imageLayout = section.images_layout || 'vertical';
      const isWideLayout = imageLayout === 'wide' || imageLayout === '16:9' || imageLayout === 'horizontal';

      if ((sectionTitle && sectionItems.length > 0) || sectionImages.length > 0) {
        // Create container for the section
        const sectionContainer = document.createElement('div');
        sectionContainer.className = 'intro__section-container';
        
        // If no images, just render text without grid
        if (sectionImages.length === 0) {
          if (sectionTitle && sectionItems.length > 0) {
            const h3 = document.createElement('h3');
            h3.className = 'intro__usage-title';
            h3.textContent = sectionTitle;
            sectionContainer.appendChild(h3);

            const ul = document.createElement('ul');
            ul.className = 'intro__usage-list';
            let currentLi = null;
            let nestedUl = null;

            sectionItems.forEach(item => {
              const itemStr = String(item);
              const isIndented = /^\s+[•·\-\*]/.test(itemStr);

              if (isIndented) {
                if (!nestedUl) {
                  nestedUl = document.createElement('ul');
                  if (currentLi) {
                    currentLi.appendChild(nestedUl);
                  }
                }
                const li = document.createElement('li');
                const cleanedItem = itemStr.replace(/^\s+[•·\-\*]\s*/, '');
                li.innerHTML = mdInlineToHtmlBoldOnly(cleanedItem);
                colorizeStrongIn(li, cfg);
                nestedUl.appendChild(li);
              } else {
                currentLi = document.createElement('li');
                currentLi.innerHTML = mdInlineToHtmlBoldOnly(itemStr);
                colorizeStrongIn(currentLi, cfg);
                ul.appendChild(currentLi);
                nestedUl = null;
              }
            });
            sectionContainer.appendChild(ul);
          }
        } else if (isWideLayout) {
          // Wide layout: text above, image below (full width)
          if (sectionTitle && sectionItems.length > 0) {
            const h3 = document.createElement('h3');
            h3.className = 'intro__usage-title';
            h3.textContent = sectionTitle;
            sectionContainer.appendChild(h3);

            const ul = document.createElement('ul');
            ul.className = 'intro__usage-list';
            let currentLi = null;
            let nestedUl = null;

            sectionItems.forEach(item => {
              const itemStr = String(item);
              const isIndented = /^\s+[•·\-\*]/.test(itemStr);

              if (isIndented) {
                if (!nestedUl) {
                  nestedUl = document.createElement('ul');
                  if (currentLi) {
                    currentLi.appendChild(nestedUl);
                  }
                }
                const li = document.createElement('li');
                const cleanedItem = itemStr.replace(/^\s+[•·\-\*]\s*/, '');
                li.innerHTML = mdInlineToHtmlBoldOnly(cleanedItem);
                colorizeStrongIn(li, cfg);
                nestedUl.appendChild(li);
              } else {
                currentLi = document.createElement('li');
                currentLi.innerHTML = mdInlineToHtmlBoldOnly(itemStr);
                colorizeStrongIn(currentLi, cfg);
                ul.appendChild(currentLi);
                nestedUl = null;
              }
            });
            sectionContainer.appendChild(ul);
          }
          
          // Add media below text (full width)
          if (sectionImages.length > 0) {
            const mediaContainer = document.createElement('div');
            mediaContainer.className = 'intro__usage-media-wide';
            
            const carousel = createMediaCarousel(sectionImages, cfg, {
              className: 'generic-section-carousel generic-section-carousel--wide',
              type: 'image',
              borderClass: 'media-border',
              objectFit: 'contain'
            });
            if (carousel) mediaContainer.appendChild(carousel);
            
            sectionContainer.appendChild(mediaContainer);
          }
        } else {
          // Vertical layout: side-by-side grid
          const grid = document.createElement('div');
          grid.className = 'intro__usage-grid';

          const mainCol = document.createElement('div');
          mainCol.className = 'intro__usage-main';

          if (sectionTitle && sectionItems.length > 0) {
            const h3 = document.createElement('h3');
            h3.className = 'intro__usage-title';
            h3.textContent = sectionTitle;
            mainCol.appendChild(h3);

            const ul = document.createElement('ul');
            ul.className = 'intro__usage-list';
            let currentLi = null;
            let nestedUl = null;

            sectionItems.forEach(item => {
              const itemStr = String(item);
              const isIndented = /^\s+[•·\-\*]/.test(itemStr);

              if (isIndented) {
                if (!nestedUl) {
                  nestedUl = document.createElement('ul');
                  if (currentLi) {
                    currentLi.appendChild(nestedUl);
                  }
                }
                const li = document.createElement('li');
                const cleanedItem = itemStr.replace(/^\s+[•·\-\*]\s*/, '');
                li.innerHTML = mdInlineToHtmlBoldOnly(cleanedItem);
                colorizeStrongIn(li, cfg);
                nestedUl.appendChild(li);
              } else {
                currentLi = document.createElement('li');
                currentLi.innerHTML = mdInlineToHtmlBoldOnly(itemStr);
                colorizeStrongIn(currentLi, cfg);
                ul.appendChild(currentLi);
                nestedUl = null;
              }
            });
            mainCol.appendChild(ul);
          }

          grid.appendChild(mainCol);

          // Add media if available (side-by-side)
          if (sectionImages.length > 0) {
            const mediaCol = document.createElement('div');
            mediaCol.className = 'intro__usage-media';

            const carousel = createMediaCarousel(sectionImages, cfg, {
              className: 'generic-section-carousel',
              type: 'image',
              borderClass: 'media-border'
            });
            if (carousel) mediaCol.appendChild(carousel);

            grid.appendChild(mediaCol);
          }

          sectionContainer.appendChild(grid);
        }

        // Create standalone section element
        const mainSection = document.createElement('section');
        mainSection.className = 'section generic-section';
        
        // Add section title as h2
        if (sectionTitle) {
          const h2 = document.createElement('h2');
          h2.className = 'section__title';
          h2.textContent = sectionTitle;
          mainSection.appendChild(h2);
        }
        
        // Wrap in grid for consistency
        const grid = document.createElement('div');
        grid.className = 'grid grid--one-col';
        grid.appendChild(sectionContainer);
        mainSection.appendChild(grid);
        
        // Insert after previous section
        if (insertAfter && insertAfter.parentNode) {
          insertAfter.parentNode.insertBefore(mainSection, insertAfter.nextSibling);
          // Update reference for next section
          insertAfter = mainSection;
        }
      }
    });
  }

  // Titles overrides
  if (cfg?.titles) {
    const t = cfg.titles;
    if (t.support) {
      const el = document.getElementById('support-title');
      if (el) el.textContent = t.support;
    }
  }

  // Hide static comparisons section - now using generic sections system
  // Only hide the one with comparisons-grid, not our dynamically created ones
  const staticComparisonsSection = document.querySelector('.comparisons.section:has(#comparisons-grid)');
  if (staticComparisonsSection) {
    staticComparisonsSection.style.display = 'none';
  }

  // Hide static showcase section - now using introduction video or generic sections
  const showcaseSection = document.querySelector('.showcase.section');
  if (showcaseSection) {
    showcaseSection.style.display = 'none';
  }

  // Support
  const supportTitle = document.getElementById('support-title');
  const supportText = document.getElementById('support-text');
  const supportLink = document.getElementById('support-link');
  if (cfg?.support?.title && supportTitle) supportTitle.textContent = cfg.support.title;
  if (supportText && cfg?.support?.text) {
    supportText.innerHTML = mdInlineToHtmlBoldOnly(String(cfg.support.text));
    colorizeStrongIn(supportText, cfg);
  }
  if (supportLink && cfg?.support) {
    if (cfg.support.link_text) supportLink.textContent = cfg.support.link_text;
    if (cfg.support.link_url) supportLink.href = cfg.support.link_url;
  }
  
  // Changelog section
  renderChangelogSection(cfg);
  
  // Citations (appended at the bottom)
  renderCitationsSection(cfg);
  // Final pass: colorize any remaining bold across the page
  colorizeStrongIn(document.body, cfg);
}

// Documentation functionality
let currentView = 'showcase';
let currentDocPage = null;
let globalConfig = null;       // main site config (theme, showcase, etc.)
let docsConfig = null;         // external documentation config when provided

function getDocumentationPagesArray(cfg) {
  const p = cfg?.documentation?.pages;
  if (Array.isArray(p)) return p;
  if (p && typeof p === 'object') {
    try { return Object.values(p); } catch { return []; }
  }
  return [];
}

// Helper function to render introduction section (used by both main and documentation views)
function renderIntroductionSection(introConfig, cfg, containerId, options = {}) {
  const introContent = document.getElementById(containerId);
  if (!introContent || !introConfig) return;
  
  introContent.innerHTML = '';
  
  // Render paragraphs
  const paras = introConfig.paragraphs || [];
  paras.forEach(t => {
    const p = document.createElement('p');
    p.innerHTML = mdInlineToHtmlBoldOnly(String(t));
    colorizeStrongIn(p, cfg);
    introContent.appendChild(p);
  });

  // Build Parameters section
  const paramsTitle = introConfig.parameters_title || 'Parameters';
  const parameters = Array.isArray(introConfig.parameters) ? introConfig.parameters : [];
  const paramNodes = [];
  if (parameters.length > 0) {
    const h3p = document.createElement('h3');
    h3p.className = 'intro__params-title';
    h3p.textContent = paramsTitle;
    paramNodes.push(h3p);

    const ulp = document.createElement('ul');
    ulp.className = 'intro__params-list';
    let currentLi = null;
    let nestedUl = null;
    
    parameters.forEach(item => {
      const itemStr = String(item);
      // Check if this is an indented sub-item (starts with spaces + bullet)
      const isIndented = /^\s+[•·\-\*]/.test(itemStr);
      
      if (isIndented) {
        // This is a sub-item
        if (!nestedUl) {
          // Create nested list if it doesn't exist
          nestedUl = document.createElement('ul');
          if (currentLi) {
            currentLi.appendChild(nestedUl);
          }
        }
        const li = document.createElement('li');
        // Remove leading whitespace and bullet character
        const cleanedItem = itemStr.replace(/^\s+[•·\-\*]\s*/, '');
        li.innerHTML = mdInlineToHtmlBoldOnly(cleanedItem);
        colorizeStrongIn(li, cfg);
        nestedUl.appendChild(li);
      } else {
        // This is a top-level item
        currentLi = document.createElement('li');
        currentLi.innerHTML = mdInlineToHtmlBoldOnly(itemStr);
        colorizeStrongIn(currentLi, cfg);
        ulp.appendChild(currentLi);
        nestedUl = null; // Reset nested list for next group
      }
    });
    paramNodes.push(ulp);
  }

  // Build Usage section
  const usageTitle = introConfig.usage_title || '';
  const usageItems = Array.isArray(introConfig.usage_steps) ? introConfig.usage_steps : [];
  const usageNodes = [];
  if (usageTitle && usageItems.length > 0) {
    const h3 = document.createElement('h3');
    h3.className = 'intro__usage-title';
    h3.textContent = usageTitle;
    usageNodes.push(h3);
  }
  if (usageItems.length > 0) {
    const ul = document.createElement('ul');
    ul.className = 'intro__usage-list';
    let currentLi = null;
    let nestedUl = null;
    
    usageItems.forEach(item => {
      const itemStr = String(item);
      // Check if this is an indented sub-item (starts with spaces + bullet)
      const isIndented = /^\s+[•·\-\*]/.test(itemStr);
      
      if (isIndented) {
        // This is a sub-item
        if (!nestedUl) {
          // Create nested list if it doesn't exist
          nestedUl = document.createElement('ul');
          if (currentLi) {
            currentLi.appendChild(nestedUl);
          }
        }
        const li = document.createElement('li');
        // Remove leading whitespace and bullet character
        const cleanedItem = itemStr.replace(/^\s+[•·\-\*]\s*/, '');
        li.innerHTML = mdInlineToHtmlBoldOnly(cleanedItem);
        colorizeStrongIn(li, cfg);
        nestedUl.appendChild(li);
      } else {
        // This is a top-level item
        currentLi = document.createElement('li');
        currentLi.innerHTML = mdInlineToHtmlBoldOnly(itemStr);
        colorizeStrongIn(currentLi, cfg);
        ul.appendChild(currentLi);
        nestedUl = null; // Reset nested list for next group
      }
    });
    usageNodes.push(ul);
  }

  // Usage images
  const usageImages = parseUsageImages(introConfig);
  
  // Check image layout preference (vertical/portrait or wide/16:9)
  const imageLayout = introConfig.usage_images_layout || introConfig.usage_image_layout || 'vertical'; // 'vertical' or 'wide'
  const isWideLayout = imageLayout === 'wide' || imageLayout === '16:9' || imageLayout === 'horizontal';
  
  // Layout with images
  if (usageImages.length > 0) {
    if (isWideLayout) {
      // Wide layout: text above, image below (full width)
      usageNodes.forEach(node => introContent.appendChild(node));
      paramNodes.forEach(node => introContent.appendChild(node));
      
      const mediaContainer = document.createElement('div');
      mediaContainer.className = 'intro__usage-media-wide';
      
      if (usageImages.length === 1) {
        // Use unified carousel even for single image to keep behavior consistent
        const carousel = createMediaCarousel(usageImages, cfg, {
          className: 'usage-carousel usage-carousel--wide',
          type: 'image',
          borderClass: 'media-border',
          objectFit: 'contain'
        });
        if (carousel) mediaContainer.appendChild(carousel);
      } else {
        // Multiple images - create carousel
        const carousel = createMediaCarousel(usageImages, cfg, {
          className: 'usage-carousel usage-carousel--wide',
          type: 'image',
          borderClass: 'media-border'
        });
        if (carousel) mediaContainer.appendChild(carousel);
      }
      
      introContent.appendChild(mediaContainer);
    } else {
      // Vertical layout: side-by-side grid (original behavior)
      const grid = document.createElement('div');
      grid.className = 'intro__usage-grid';

      const mainCol = document.createElement('div');
      mainCol.className = 'intro__usage-main';
      usageNodes.forEach(node => mainCol.appendChild(node));
      paramNodes.forEach(node => mainCol.appendChild(node));
      grid.appendChild(mainCol);

      const mediaCol = document.createElement('div');
      mediaCol.className = 'intro__usage-media';
      
      if (usageImages.length === 1) {
        // Use unified carousel for single image in vertical layout as well
        const carousel = createMediaCarousel(usageImages, cfg, {
          className: 'usage-carousel',
          type: 'image',
          borderClass: 'media-border'
        });
        if (carousel) mediaCol.appendChild(carousel);
      } else {
        // Multiple images - create carousel
        const carousel = createMediaCarousel(usageImages, cfg, {
          className: 'usage-carousel',
          type: 'image',
          borderClass: 'media-border'
        });
        if (carousel) mediaCol.appendChild(carousel);
      }
      
      grid.appendChild(mediaCol);
      introContent.appendChild(grid);
    }
  } else {
    // No images - just append sections normally
    usageNodes.forEach(node => introContent.appendChild(node));
    paramNodes.forEach(node => introContent.appendChild(node));
  }

  // Quick Start section
  const quickstartTitle = introConfig.quickstart_title || '';
  const quickstartImages = parseMediaItems(introConfig, {
    itemsKey: 'quickstart_images',
    captionsKey: 'quickstart_images_captions',
    altKey: 'quickstart_images_alt',
    alignmentKey: 'quickstart_images_alignment'
  });

  if (quickstartTitle && quickstartImages.length > 0) {
    const quickstartSection = document.createElement('div');
    quickstartSection.className = 'intro__quickstart';
    
    const h3 = document.createElement('h3');
    h3.className = 'intro__usage-title';
    h3.textContent = quickstartTitle;
    quickstartSection.appendChild(h3);
    
    const carousel = createImageCarousel(quickstartImages, cfg, 'quickstart-carousel');
    quickstartSection.appendChild(carousel);
    
    introContent.appendChild(quickstartSection);
  }
  // Optional: introduction-level video (parity with main view)
  const includeVideo = options.includeVideo !== false;
  if (includeVideo) {
    const videoTitle = introConfig.video_title || '';
    const videoUrl = introConfig.video_url || '';
    if (videoUrl) {
      const videoSection = document.createElement('div');
      videoSection.className = 'intro__video';
      if (videoTitle) {
        const h3 = document.createElement('h3');
        h3.className = 'intro__usage-title';
        h3.textContent = videoTitle;
        videoSection.appendChild(h3);
      }
      const videoContainer = document.createElement('div');
      videoContainer.className = 'video-embed';
      const videoFrame = document.createElement('div');
      videoFrame.className = 'video-frame interactive-border';
      const iframe = document.createElement('iframe');
      iframe.src = videoUrl;
      iframe.title = videoTitle || 'Video showcase';
      iframe.allowFullscreen = true;
      iframe.loading = 'lazy';
      videoFrame.appendChild(iframe);
      videoContainer.appendChild(videoFrame);
      videoSection.appendChild(videoContainer);
      introContent.appendChild(videoSection);
    }
  }

  // Colorize any remaining bold text
  colorizeStrongIn(introContent, cfg);
}

// Helper function to create comparison elements (extracted from main renderContent)
function createComparisonElement(comparison, cfg) {
  if (!comparison) return null;
  
  // Handle different comparison types
  if (comparison.image) {
    // Single image card (unified markup with main page)
    const card = document.createElement('div');
    card.className = 'card card--compact';

    const fig = document.createElement('figure');
    fig.className = 'image-card';

    const img = document.createElement('img');
    img.src = comparison.image;
    img.alt = comparison.image_alt || comparison.caption || 'Comparison image';
    img.className = 'media-border';
    img.loading = 'lazy';
    fig.appendChild(img);
    makeImageZoomable(img, comparison.caption || '');

    if (comparison.caption) {
      const cap = document.createElement('figcaption');
      cap.className = 'intro__usage-caption';
      cap.innerHTML = mdInlineToHtmlBoldOnly(String(comparison.caption));
      colorizeStrongIn(cap, cfg);
      fig.appendChild(cap);
    }

    card.appendChild(fig);
    return card;
  } else if (comparison.images && Array.isArray(comparison.images)) {
    // Carousel card (unified markup with main page)
    const card = document.createElement('div');
    card.className = 'card card--compact';
    
    const images = comparison.images.map((src, i) => ({
      src,
      alt: comparison.images_alt?.[i] || `Image ${i + 1}`,
      caption: comparison.images_captions?.[i] || ''
    }));
    
    const carousel = createMediaCarousel(images, cfg, {
      className: 'comparison-carousel',
      type: 'image',
      borderClass: 'media-border'
    });
    
    if (carousel) card.appendChild(carousel);
    
    return card;
  } else if (comparison.before && comparison.after) {
    // Before/after slider - use same markup as main page for consistency
    const card = document.createElement('div');
    card.className = 'card card--compact';

    const initial = typeof comparison.initial === 'number' ? comparison.initial : 0.5;
    const handleShape = comparison.handle_shape || 'pentagon';
    const handleClass = handleShape ? `shape-${handleShape}` : '';
    const sharedCap = getImageCaptionText({ caption: comparison.caption, alt: comparison.alt, title: comparison.title });
    const safeAlt = sharedCap ? escapeHtml(String(sharedCap)) : '';

    card.innerHTML = `
      <div class="ba-slider interactive-border" data-initial="${initial}">
        <div class="ba-pane after">${comparison.after ? `<img src="${comparison.after}" alt="${safeAlt}">` : '<span>After</span>'}</div>
        <div class="ba-pane before">${comparison.before ? `<img src="${comparison.before}" alt="${safeAlt}">` : '<span>Before</span>'}</div>
        <button class="ba-handle ${handleClass}" role="slider" aria-label="Drag to compare" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50" tabindex="0"></button>
      </div>
    `;

    if (sharedCap) {
      const p = document.createElement('p');
      p.className = 'intro__usage-caption';
      p.innerHTML = mdInlineToHtmlBoldOnly(String(sharedCap));
      card.appendChild(p);
    }

    return card;
  }
  
  return null;
}

// Toggle between showcase and documentation views
function toggleView() {
  const showcaseView = document.getElementById('showcase-view');
  const documentationView = document.getElementById('documentation-view');
  const toggleBtn = document.getElementById('view-toggle-btn');
  const supportToggleBtn = document.getElementById('support-view-toggle-btn');
  
  if (!showcaseView || !documentationView || !toggleBtn || !globalConfig) return;
  
  if (currentView === 'showcase') {
    // Switch to documentation
    showcaseView.style.display = 'none';
    documentationView.style.display = 'block';
    currentView = 'documentation';
    
    const toggleText = globalConfig?.documentation?.toggle_text_documentation || 'View Product Showcase';
    toggleBtn.textContent = toggleText;
    if (supportToggleBtn) supportToggleBtn.textContent = toggleText;
    
    // Show TOC, hide any open page
    showDocumentationTOC();
  } else {
    // Switch to showcase
    documentationView.style.display = 'none';
    showcaseView.style.display = 'block';
    currentView = 'showcase';
    
    const toggleText = globalConfig?.documentation?.toggle_text_showcase || 'View Documentation';
    toggleBtn.textContent = toggleText;
    if (supportToggleBtn) supportToggleBtn.textContent = toggleText;
  }
}

// Show documentation table of contents
function showDocumentationTOC() {
  const tocContainer = document.querySelector('.documentation-toc');
  const pageContainer = document.getElementById('documentation-page');
  
  if (tocContainer) tocContainer.style.display = 'block';
  if (pageContainer) pageContainer.style.display = 'none';
  
  currentDocPage = null;
}

// Show specific documentation page
function showDocumentationPage(pageId) {
  const tocContainer = document.querySelector('.documentation-toc');
  const pageContainer = document.getElementById('documentation-page');
  
  if (tocContainer) tocContainer.style.display = 'none';
  if (pageContainer) pageContainer.style.display = 'block';
  
  currentDocPage = pageId;
  dbg('showDocumentationPage:', pageId);
  renderDocumentationPage(pageId);
}

// Render documentation table of contents
function renderDocumentationTOC(cfg) {
  if (!cfg?.documentation?.enabled) return;
  dbg('renderDocumentationTOC: enabled');
  
  const titleEl = document.getElementById('documentation-title');
  const subtitleEl = document.getElementById('documentation-subtitle');
  const gridEl = document.getElementById('documentation-toc-grid');
  
  if (!gridEl) return;
  
  // Set title and subtitle
  if (titleEl && cfg.documentation.toc?.title) {
    titleEl.textContent = cfg.documentation.toc.title;
  }
  if (subtitleEl && cfg.documentation.toc?.subtitle) {
    subtitleEl.innerHTML = mdInlineToHtmlBoldOnly(cfg.documentation.toc.subtitle);
    colorizeStrongIn(subtitleEl, cfg);
  }
  
  // Clear and populate TOC grid
  gridEl.innerHTML = '';
  const sections = Array.isArray(cfg.documentation.toc?.sections) ? cfg.documentation.toc.sections : [];
  const pagesArr = getDocumentationPagesArray(cfg);
  const pageIdSet = new Set(pagesArr.filter(Boolean).map(p => p.id));
  const filteredSections = sections.filter(s => !s?.id || pageIdSet.has(s.id));
  dbg('renderDocumentationTOC: sections', sections.length, 'pages', pagesArr.length, 'filtered', filteredSections.length);
  if (sections.length > 0) {
    (filteredSections.length ? filteredSections : sections).forEach(section => {
      const item = document.createElement('div');
      item.className = 'documentation-toc-item';
      const sectionId = (section && section.id) ? section.id : '';
      const isUnderConstruction = section && section.under_construction === true;
      
      if (isUnderConstruction) {
        item.classList.add('under-construction');
        item.style.cursor = 'not-allowed';
        item.style.opacity = '0.6';
      } else {
        item.onclick = () => sectionId && showDocumentationPage(sectionId);
      }
      
      const contentDiv = document.createElement('div');
      contentDiv.className = 'documentation-toc-content';
      
      const titleDiv = document.createElement('h3');
      titleDiv.className = 'documentation-toc-title';
      titleDiv.textContent = (section && section.title) ? section.title : 'Untitled';
      
      if (isUnderConstruction) {
        const badge = document.createElement('span');
        badge.className = 'under-construction-badge';
        badge.textContent = 'Under Construction';
        badge.style.cssText = `
          display: inline-block;
          margin-left: 0.75rem;
          padding: 0.25rem 0.5rem;
          font-size: 0.75rem;
          font-weight: var(--font-weight-medium);
          background: rgba(255, 193, 7, 0.2);
          color: #ffc107;
          border: 1px solid rgba(255, 193, 7, 0.4);
          border-radius: 4px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        `;
        titleDiv.appendChild(badge);
      }
      
      contentDiv.appendChild(titleDiv);
      
      if (section && section.description) {
        const descDiv = document.createElement('p');
        descDiv.className = 'documentation-toc-description';
        descDiv.textContent = section.description;
        contentDiv.appendChild(descDiv);
      }
      
      item.appendChild(contentDiv);
      
      if (section && section.image) {
        const img = document.createElement('img');
        img.src = section.image;
        img.alt = section.title || 'Documentation image';
        img.className = 'documentation-toc-image';
        item.appendChild(img);
      }
      
      gridEl.appendChild(item);
    });
  } else {
    // Show helpful message if no sections parsed
    const note = document.createElement('p');
    note.className = 'text-muted';
    note.textContent = 'No documentation sections found. Please check your TOML under [documentation.toc].';
    gridEl.appendChild(note);
  }
  colorizeStrongIn(gridEl, cfg);
}

// Render specific documentation page
function renderDocumentationPage(pageId) {
  const cfgDoc = docsConfig || globalConfig;
  const pagesArr = getDocumentationPagesArray(cfgDoc);
  if (!pagesArr.length) return;
  
  const page = pagesArr.find(p => p && p.id === pageId);
  dbg('renderDocumentationPage: target id', pageId, 'pages length', pagesArr.length, 'found?', !!page);
  if (!page) {
    // Graceful placeholder if no matching page exists
    const titleEl = document.getElementById('doc-page-title');
    if (titleEl) titleEl.textContent = 'Documentation page not found';
    const introEl = document.getElementById('doc-page-intro');
    if (introEl) {
      introEl.innerHTML = `<p class="text-muted">No content found for page id: <code>${pageId}</code>. Check your TOML under <code>[[documentation.pages]]</code> for a matching <code>id</code>.</p>`;
    }
    return;
  }
  
  // Set page title
  const titleEl = document.getElementById('doc-page-title');
  if (titleEl && page.title) {
    titleEl.textContent = page.title;
  }
  
  // Render introduction section (reuse existing function)
  const introEl = document.getElementById('doc-page-intro');
  if (introEl) {
    if (page.introduction) {
      introEl.style.display = '';
      renderIntroductionSection(page.introduction, (cfgDoc || globalConfig), 'doc-page-intro');
    } else {
      introEl.innerHTML = '';
      introEl.style.display = 'none';
    }
  }

  // Clean up any previously rendered dynamic sections from other pages
  const cleanupDynamicSections = () => {
    const pageContainer = document.getElementById('documentation-page');
    if (!pageContainer) return;
    
    // Remove all sections that match the pattern section--*
    const dynamicSections = pageContainer.querySelectorAll('section[class*="section--"]');
    dynamicSections.forEach(section => section.remove());
  };
  
  // Clean up before rendering new page
  cleanupDynamicSections();

  // Dynamic section renderer - automatically detects and renders all sections from TOML
  const renderDynamicSections = () => {
    if (!page.introduction) return;
    
    const introConfig = page.introduction;
    
    // Get section order from TOML config, or use auto-detection as fallback
    let sectionOrder = introConfig.section_order;
    
    // Fallback: auto-detect sections if not explicitly defined in TOML
    if (!Array.isArray(sectionOrder) || sectionOrder.length === 0) {
      sectionOrder = [];
      // Auto-detect all sections by looking for *_title properties
      for (const key in introConfig) {
        if (key.endsWith('_title') && key !== 'parameters_title') {
          const sectionKey = key.replace('_title', '');
          // Skip quickstart as it's rendered separately
          if (sectionKey !== 'quickstart') {
            sectionOrder.push(sectionKey);
          }
        }
      }
    }
    
    // Get section ID prefix from config
    const sectionIdPrefix = introConfig.section_id_prefix || 'doc-page-';
    
    // Helper function to create a section
    const createSection = (sectionKey, previousSectionKey) => {
      const titleKey = `${sectionKey}_title`;
      const stepsKey = `${sectionKey}_steps`;
      const imagesKey = `${sectionKey}_images`;
      const captionsKey = `${sectionKey}_images_captions`;
      const altKey = `${sectionKey}_images_alt`;
      const alignmentKey = `${sectionKey}_images_alignment`;
      
      const title = introConfig[titleKey] || '';
      const steps = Array.isArray(introConfig[stepsKey]) ? introConfig[stepsKey] : [];
      const images = parseMediaItems(introConfig, {
        itemsKey: imagesKey,
        captionsKey: captionsKey,
        altKey: altKey,
        alignmentKey: alignmentKey
      });
      
      // Debug logging
      dbg(`Section ${sectionKey}: title="${title}", steps=${steps.length}, images=${images.length}`);
      if (images.length > 0) {
        dbg(`  Images for ${sectionKey}:`, images);
      }
      
      // Remove existing section if it exists
      const sectionId = `${sectionIdPrefix}${sectionKey}`;
      const existingSection = document.getElementById(sectionId);
      if (existingSection) existingSection.remove();
      
      // Only create section if it has content
      if (title && (steps.length > 0 || images.length > 0)) {
        const section = document.createElement('section');
        section.id = sectionId;
        section.className = `section section--${sectionKey}`;
        
        const h2 = document.createElement('h2');
        h2.className = 'section__title';
        h2.textContent = title;
        section.appendChild(h2);
        
        const card = document.createElement('div');
        card.className = 'card';
        
        if (steps.length > 0) {
          const ul = document.createElement('ul');
          ul.className = 'intro__usage-list';
          steps.forEach(item => {
            const li = document.createElement('li');
            li.innerHTML = mdInlineToHtmlBoldOnly(String(item));
            colorizeStrongIn(li, (cfgDoc || globalConfig));
            ul.appendChild(li);
          });
          card.appendChild(ul);
        }
        
        if (images.length > 0) {
          const carousel = createImageCarousel(images, (cfgDoc || globalConfig), `${sectionKey}-carousel`);
          card.appendChild(carousel);
        }
        
        // Check for video URL (single video)
        const videoUrlKey = `${sectionKey}_video_url`;
        const videoUrl = introConfig[videoUrlKey] || '';
        if (videoUrl) {
          const items = [{ url: videoUrl, caption: title || '' }];
          const videoCarousel = createMediaCarousel(items, (cfgDoc || globalConfig), {
            className: 'video-carousel',
            type: 'video',
            borderClass: 'interactive-border'
          });
          // Add a little top margin for spacing like before
          if (videoCarousel) {
            videoCarousel.style.marginTop = '1rem';
            card.appendChild(videoCarousel);
          }
        }
        
        section.appendChild(card);
        
        // Insert after previous section
        const pageContainer = document.getElementById('documentation-page');
        const previousSectionId = `${sectionIdPrefix}${previousSectionKey}`;
        const previousEl = document.getElementById(previousSectionId);
        
        if (pageContainer && previousEl) {
          previousEl.parentNode.insertBefore(section, previousEl.nextSibling);
        }
      }
    };
    
    // Render all sections in order with delays
    const initialSection = introConfig.initial_section || 'intro';
    
    // Timing values are implementation details - hardcoded here
    let delay = 100;
    const delayIncrement = 50;
    let previousSection = initialSection;
    
    sectionOrder.forEach((sectionKey) => {
      setTimeout(() => {
        createSection(sectionKey, previousSection);
        previousSection = sectionKey;
      }, delay);
      delay += delayIncrement;
    });
  };
  
  // Call the dynamic renderer
  renderDynamicSections();

  // Render rich HTML content if provided (page.content_html or page.content_html_url)
  try {
    const pageContainer = document.getElementById('documentation-page');
    if (pageContainer) {
      // Ensure a dedicated rich content section exists
      let richSection = document.getElementById('doc-page-rich');
      let richContent = document.getElementById('doc-page-rich-content');
      if (!richSection) {
        richSection = document.createElement('section');
        richSection.className = 'embed section';
        richSection.id = 'doc-page-rich';
        richSection.style.display = 'none';
        const h2 = document.createElement('h2');
        h2.className = 'section__title';
        h2.id = 'doc-page-rich-title';
        h2.textContent = page.title || 'Documentation';
        const card = document.createElement('div');
        card.className = 'card';
        richContent = document.createElement('div');
        richContent.id = 'doc-page-rich-content';
        card.appendChild(richContent);
        richSection.appendChild(h2);
        richSection.appendChild(card);
        // Append after intro block
        pageContainer.appendChild(richSection);
        // Avoid duplicate page title: hide rich section title when inline HTML will render its own headings
        const richTitleElInit = document.getElementById('doc-page-rich-title');
        if (richTitleElInit) richTitleElInit.style.display = 'none';
      }

      const inlineHtml = (typeof page.content_html === 'string' && page.content_html.trim())
        || (typeof page.introduction?.content_html === 'string' && page.introduction.content_html.trim())
        || '';
      const htmlUrl = (typeof page.content_html_url === 'string' && page.content_html_url.trim())
        || (typeof page.introduction?.content_html_url === 'string' && page.introduction.content_html_url.trim())
        || '';
      const hasInlineHtml = inlineHtml.length > 0;
      const hasHtmlUrl = htmlUrl.length > 0;

      // Always hide rich-section title to prevent duplicate page titles
      const richTitleEl = document.getElementById('doc-page-rich-title');
      if (richTitleEl) richTitleEl.style.display = 'none';

      // Helper to load Prism for syntax highlighting
      const ensurePrismLoaded = () => new Promise((resolve) => {
        // Inject default Prism CSS if not present
        if (!document.querySelector('link[data-prism-css]')) {
          const css = document.createElement('link');
          css.rel = 'stylesheet';
          css.href = 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism.min.css';
          css.setAttribute('data-prism-css', 'true');
          document.head.appendChild(css);
        }
        if (window.Prism) return resolve();
        const core = document.createElement('script');
        core.src = 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js';
        core.async = true;
        core.onload = () => {
          const lang = document.createElement('script');
          lang.src = 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-python.min.js';
          lang.async = true;
          lang.onload = () => resolve();
          document.head.appendChild(lang);
        };
        document.head.appendChild(core);
      });

      // Helper to tag likely function calls for browsers without :has()
      const tagFunctionCalls = (root) => {
        try {
          const props = root.querySelectorAll('.token.property');
          props.forEach((el) => {
            let sib = el.nextSibling;
            // Skip whitespace text nodes
            while (sib && sib.nodeType === Node.TEXT_NODE && /^\s*$/.test(sib.textContent)) {
              sib = sib.nextSibling;
            }
            if (sib && sib.nodeType === Node.ELEMENT_NODE) {
              const s = sib;
              if (s.classList.contains('token') && s.classList.contains('punctuation') && s.textContent.trim() === '(') {
                el.classList.add('token-func-call');
              }
            }
          });
        } catch {}
      };

      const injectHtml = (html) => {
        if (!richContent) return;
        // Try extracting <main> inner content first, fallback to body
        let toInject = html;
        try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');
          const main = doc.querySelector('main');
          toInject = (main && main.innerHTML) || (doc.body && doc.body.innerHTML) || html;
        } catch {}
        richContent.innerHTML = toInject;
        richSection.style.display = 'block';
        colorizeStrongIn(richContent, globalConfig);
        // Attempt syntax highlighting if Prism is available (or after loading it)
        ensurePrismLoaded().then(() => {
          try {
            if (window.Prism && typeof window.Prism.highlightAllUnder === 'function') {
              window.Prism.highlightAllUnder(richContent);
            }
            // Add fallback class for function calls after Prism tokenization
            tagFunctionCalls(richContent);
          } catch {}
        });
      };

      if (hasInlineHtml) {
        injectHtml(String(inlineHtml));
      } else if (hasHtmlUrl) {
        fetch(htmlUrl, { cache: 'no-store' })
          .then(r => r.ok ? r.text() : Promise.reject(new Error('Failed to fetch HTML content')))
          .then(html => injectHtml(html))
          .catch(err => {
            console.error('Error loading rich documentation HTML:', err);
            if (richContent) {
              richContent.innerHTML = '<p class="text-muted">Unable to load documentation content.</p>';
              richSection.style.display = 'block';
            }
          });
      } else if (richSection) {
        richSection.style.display = 'none';
        if (richContent) richContent.innerHTML = '';
      }
    }
  } catch (e) {
    console.warn('renderDocumentationPage: rich content render failed:', e);
  }
  
  // Render comparisons if they exist
  const comparisonsSection = document.getElementById('doc-page-comparisons');
  const comparisonsGrid = document.getElementById('doc-page-comparisons-grid');
  if (page.comparisons && page.comparisons.length > 0 && comparisonsGrid) {
    comparisonsSection.style.display = 'block';
    comparisonsGrid.innerHTML = '';
    
    page.comparisons.forEach(comparison => {
      const comparisonEl = createComparisonElement(comparison, globalConfig);
      if (comparisonEl) {
        comparisonsGrid.appendChild(comparisonEl);
      }
    });
    
    // Re-initialize sliders for this page
    setTimeout(() => {
      initBeforeAfterSliders();
    }, 100);
  } else if (comparisonsSection) {
    comparisonsSection.style.display = 'none';
  }
  
  // Render showcase if it exists
  const showcaseSection = document.getElementById('doc-page-showcase');
  const showcaseContainer = document.getElementById('doc-page-showcase-container');
  if (page.showcase && showcaseContainer) {
    dbg('renderDocumentationPage: showcase present');
    showcaseSection.style.display = 'block';
    showcaseContainer.innerHTML = '';
    
    const videos = parseShowcaseVideos(page.showcase);
    if (videos.length > 0) {
      const carousel = createVideoCarousel(videos, (cfgDoc || globalConfig), 'video-carousel');
      if (carousel) showcaseContainer.appendChild(carousel);
    } else {
      showcaseSection.style.display = 'none';
    }
  } else if (showcaseSection) {
    showcaseSection.style.display = 'none';
  }

  // Render embedded docs (external)
  const embedSection = document.getElementById('doc-page-embed');
  const embedIframe = document.getElementById('doc-embed-iframe');
  const embedOpen = document.getElementById('doc-embed-open');
  const embedTitleEl = document.getElementById('doc-page-embed-title');
  if (embedSection && embedIframe && embedOpen) {
    const embedUrl = page.embed_url || page.embedUrl || page.introduction?.embed_url || page.introduction?.embedUrl || '';
    const embedTitle = page.embed_title || page.embedTitle || page.introduction?.embed_title || page.introduction?.embedTitle || 'Embedded Documentation';
    dbg('renderDocumentationPage: embed url?', !!embedUrl, embedUrl);
    if (embedUrl) {
      embedSection.style.display = 'block';
      if (embedTitleEl) embedTitleEl.textContent = embedTitle;
      embedIframe.src = embedUrl;
      embedOpen.href = embedUrl;
    } else {
      embedSection.style.display = 'none';
      embedIframe.src = '';
      embedOpen.href = '#';
    }
  }
}

// Initialize documentation functionality
async function initDocumentation(cfg) {
  globalConfig = cfg;
  const docUrl = cfg?.documentation?.toml_url || cfg?.documentation?.source_toml;
  const docsEnabled = (cfg?.documentation && cfg.documentation.enabled !== false) || Boolean(docUrl);
  if (!docsEnabled) return;

  // Load external documentation TOML if provided
  if (docUrl) {
    try {
      const loaded = await loadTomlContent(docUrl);
      // If the external file has [documentation], use it; otherwise treat root as documentation
      docsConfig = loaded?.documentation ? loaded : { ...loaded, documentation: loaded.documentation || loaded?.documentation };
      // Ensure theme is present for colorization
      if (!docsConfig.theme_colors && cfg.theme_colors) docsConfig.theme_colors = cfg.theme_colors;
      if (!docsConfig.fonts && cfg.fonts) docsConfig.fonts = cfg.fonts;
      dbg('initDocumentation: external docs loaded from', docUrl);
    } catch (e) {
      console.warn('initDocumentation: failed to load documentation TOML:', e);
      docsConfig = null;
    }
  }

  const activeDocCfg = docsConfig || cfg;
  dbg('initDocumentation: enabled, default_view =', activeDocCfg?.documentation?.default_view);

  // Set up toggle button (header)
  const toggleBtn = document.getElementById('view-toggle-btn');
  if (toggleBtn) {
    const toggleText = (activeDocCfg?.documentation?.toggle_text_showcase)
      || (cfg?.documentation?.toggle_text_showcase)
      || 'View Documentation';
    toggleBtn.textContent = toggleText;
    toggleBtn.onclick = toggleView;
    toggleBtn.style.display = 'inline-block';
    dbg('initDocumentation: toggle button ready');
  }
  
  // Set up toggle button (support section)
  const supportToggleBtn = document.getElementById('support-view-toggle-btn');
  if (supportToggleBtn) {
    const toggleText = (activeDocCfg?.documentation?.toggle_text_showcase)
      || (cfg?.documentation?.toggle_text_showcase)
      || 'View Documentation';
    supportToggleBtn.textContent = toggleText;
    supportToggleBtn.onclick = toggleView;
    supportToggleBtn.style.display = 'inline-block';
    dbg('initDocumentation: support toggle button ready');
  }
  // Back to TOC
  const backBtn = document.getElementById('back-to-toc-btn');
  if (backBtn) backBtn.onclick = showDocumentationTOC;

  // Render TOC using docsConfig if present
  renderDocumentationTOC(activeDocCfg);

  // Initial view
  const defaultView = (activeDocCfg?.documentation?.default_view) || (cfg?.documentation?.default_view) || 'showcase';
  if (defaultView === 'documentation') toggleView();
}

// Scroll up indicator when mouse is below last card
function initScrollUpIndicator() {
  // Create the indicator element
  const indicator = document.createElement('div');
  indicator.id = 'scroll-up-indicator';
  indicator.style.cssText = `
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    display: none;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    pointer-events: none;
    z-index: 9999;
    user-select: none;
    transition: opacity 0.2s ease;
  `;
  
  // Create three triangles
  const triangle1 = document.createElement('div');
  triangle1.className = 'scroll-triangle scroll-triangle-1';
  triangle1.innerHTML = '▲';
  
  const triangle2 = document.createElement('div');
  triangle2.className = 'scroll-triangle scroll-triangle-2';
  triangle2.innerHTML = '▲';
  
  const triangle3 = document.createElement('div');
  triangle3.className = 'scroll-triangle scroll-triangle-3';
  triangle3.innerHTML = '▲';
  
  const triangleStyle = `
    color: var(--brand-color, #8A66D9);
    font-size: 1.5rem;
    line-height: 0.5;
    text-shadow: 0 0 8px var(--brand-color, #8A66D9);
  `;
  
  triangle1.style.cssText = triangleStyle;
  triangle2.style.cssText = triangleStyle;
  triangle3.style.cssText = triangleStyle;
  
  indicator.appendChild(triangle3); // Top
  indicator.appendChild(triangle2); // Middle
  indicator.appendChild(triangle1); // Bottom
  document.body.appendChild(indicator);
  
  // Add flash animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes flash-triangle {
      0% { opacity: 0.2; }
      50% { opacity: 1; }
      100% { opacity: 0.2; }
    }
    
    .scroll-triangle-1 {
      animation: flash-triangle 0.3s linear infinite;
      animation-delay: 0s;
    }
    
    .scroll-triangle-2 {
      animation: flash-triangle 0.3s linear infinite;
      animation-delay: 0.2s;
    }
    
    .scroll-triangle-3 {
      animation: flash-triangle 0.3s linear infinite;
      animation-delay: 0.4s;
    }
  `;
  document.head.appendChild(style);
  
  // Track mouse movement
  let lastMouseY = 0;
  let isVisible = false;
  
  document.addEventListener('mousemove', (e) => {
    lastMouseY = e.clientY;
    updateIndicator();
  });
  
  // Also check on scroll
  window.addEventListener('scroll', () => {
    updateIndicator();
  });
  
  function updateIndicator() {
    // Find the active view (showcase or documentation)
    const showcaseView = document.getElementById('showcase-view');
    const documentationView = document.getElementById('documentation-view');
    
    let activeView = null;
    if (showcaseView && showcaseView.style.display !== 'none') {
      activeView = showcaseView;
    } else if (documentationView && documentationView.style.display !== 'none') {
      activeView = documentationView;
    }
    
    if (!activeView) {
      indicator.style.display = 'none';
      isVisible = false;
      return;
    }
    
    // Get all sections in active view
    const sections = activeView.querySelectorAll('.section');
    
    // Also check for citations section which may be outside the view container
    const citationsSection = document.getElementById('citations');
    const allSections = [...sections];
    if (citationsSection && citationsSection.offsetHeight > 0 && citationsSection.style.display !== 'none') {
      // Check if citations is visible based on current view
      const isShowcaseActive = showcaseView && showcaseView.style.display !== 'none';
      if (isShowcaseActive) {
        allSections.push(citationsSection);
      }
    }
    
    if (allSections.length === 0) {
      indicator.style.display = 'none';
      isVisible = false;
      return;
    }
    
    // Find the last visible section
    let lastSection = null;
    for (let i = allSections.length - 1; i >= 0; i--) {
      const section = allSections[i];
      if (section.offsetHeight > 0 && section.style.display !== 'none') {
        lastSection = section;
        break;
      }
    }
    
    if (!lastSection) {
      indicator.style.display = 'none';
      isVisible = false;
      return;
    }
    
    // Get the bottom position of the last card
    const lastCard = lastSection.querySelector('.card');
    const bottomElement = lastCard || lastSection;
    const rect = bottomElement.getBoundingClientRect();
    const bottomY = rect.bottom;
    
    // Check if mouse is below the last card
    if (lastMouseY > bottomY && bottomY < window.innerHeight) {
      // Show indicator at mouse Y position
      indicator.style.top = `${lastMouseY}px`;
      indicator.style.display = 'flex';
      indicator.style.opacity = '1';
      isVisible = true;
    } else {
      indicator.style.opacity = '0';
      setTimeout(() => {
        if (indicator.style.opacity === '0') {
          indicator.style.display = 'none';
          isVisible = false;
        }
      }, 200);
    }
  }
}

// Page height indicator in bottom right corner
function initPageHeightIndicator() {
  // Create clickable area in bottom right
  const clickArea = document.createElement('div');
  clickArea.id = 'page-height-click-area';
  clickArea.style.cssText = `
    position: fixed;
    bottom: 0;
    right: 0;
    width: 16px;
    height: 16px;
    cursor: pointer;
    z-index: 9998;
    opacity: 0;
    transition: opacity 0.2s ease;
  `;
  
  // Show subtle hint on hover
  clickArea.addEventListener('mouseenter', () => {
    clickArea.style.opacity = '0.1';
    clickArea.style.background = 'var(--brand-color, #8A66D9)';
  });
  
  clickArea.addEventListener('mouseleave', () => {
    clickArea.style.opacity = '0';
    clickArea.style.background = 'transparent';
  });
  
  // Create the height display element
  const heightDisplay = document.createElement('div');
  heightDisplay.id = 'page-height-display';
  heightDisplay.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: rgba(0, 0, 0, 0.85);
    color: var(--text-white);
    padding: 0.75rem 1.25rem;
    border-radius: 8px;
    font-family: var(--font-family-mono);
    font-size: 1rem;
    font-weight: bold;
    border: 2px solid var(--brand-color, #8A66D9);
    box-shadow: 0 0 16px var(--brand-color, #8A66D9);
    backdrop-filter: blur(8px);
    z-index: 10000;
    display: none;
    user-select: none;
    pointer-events: none;
  `;
  
  document.body.appendChild(clickArea);
  document.body.appendChild(heightDisplay);
  
  let hideTimeout = null;
  
  clickArea.addEventListener('click', () => {
    // Calculate page height
    const pageHeight = Math.max(
      document.body.scrollHeight,
      document.body.offsetHeight,
      document.documentElement.clientHeight,
      document.documentElement.scrollHeight,
      document.documentElement.offsetHeight
    );
    
    // Show the height
    heightDisplay.textContent = `${pageHeight}px`;
    heightDisplay.style.display = 'block';
    
    // Clear any existing timeout
    if (hideTimeout) clearTimeout(hideTimeout);
    
    // Hide after 3 seconds
    hideTimeout = setTimeout(() => {
      heightDisplay.style.display = 'none';
    }, 3000);
  });
}

// Initialize all functionality when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  // Prevent flashing hardcoded link before TOML is applied
  const preBtn = document.querySelector('.research-paper-btn');
  if (preBtn) preBtn.style.display = 'none';
  let cfg = null;
  // Determine TOML source (priority: global var -> body data attribute -> URL param -> path-based -> default)
  let tomlUrl = (window.CONTENT_TOML_URL)
    || (document.body && document.body.dataset && document.body.dataset.toml)
    || (new URLSearchParams(window.location.search).get('toml'));
  
  // If no explicit TOML specified, determine from URL path or query params
  if (!tomlUrl) {
    const urlParams = new URLSearchParams(window.location.search);
    const page = urlParams.get('page') || urlParams.get('config');
    dbg('DOMContentLoaded: route page param =', page);
    if (page === 'coacd') {
      tomlUrl = 'content/coacd-collision-generator.toml';
    } else if (page === 'unity') {
      tomlUrl = 'content/ultibridge-unity.toml';
    } else if (page === 'unreal') {
      tomlUrl = 'content/ultibridge-unreal.toml';
    } else if (page === 'ultibake') {
      tomlUrl = 'content/ultibake-main.toml';
    } else if (page === 'ultitools') {
      tomlUrl = 'content/ultitools-addon.toml';
    } else if (page === 'ultistamp') {
      tomlUrl = 'content/ultistamp-decals.toml';
    } else if (page === 'animplus') {
      tomlUrl = 'content/animplus.toml';
    } else if (page === 'api-docs' || page === 'apidocs' || page === 'api') {
      // Route to main UltiBake config; it will load documentation from documentation.toml_url
      tomlUrl = 'content/ultibake-main.toml';
    } else {
      tomlUrl = 'content/coacd-collision-generator.toml'; // default
    }
  }
  dbg('DOMContentLoaded: tomlUrl =', tomlUrl);
  try {
    cfg = await loadTomlContent(tomlUrl);
    dbg('DOMContentLoaded: cfg keys', Object.keys(cfg || {}));
    dbg('DOMContentLoaded: documentation pages (array?)', Array.isArray(cfg?.documentation?.pages), cfg?.documentation?.pages?.length);
    await renderContent(cfg);
    await initDocumentation(cfg);
  } catch (err) {
    console.error('Content load failed:', err);
    console.warn('Using defaults due to error');
  }
  // Initialize interactive/visual features after content is in the DOM
  initBeforeAfterSliders();
  generateBackgroundShapes(cfg);
  initScrollUpIndicator();
  initPageHeightIndicator();
});
