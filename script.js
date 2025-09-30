// Unified theme configuration
const THEME_CONFIG = {
  colors: {
    palette: [
      'var(--primary-pink)',
      'var(--primary-purple)', 
      'var(--primary-teal)',
      'var(--primary-green)'
    ],
    buttonClasses: [
      'btn-theme-pink',
      'btn-theme-purple', 
      'btn-theme-teal',
      'btn-theme-green'
    ]
  },
  shapes: {
    types: ['hex', 'pent', 'tri', 'circle', 'quad', 'hept', 'oct'],
    colors: ['pink', 'purple', 'teal', 'green']
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
    borderClass = 'media-border'
  } = options;
  
  const carouselId = `${type}-carousel-${Date.now()}`;

  const itemsHtml = items.map((item, index) => {
    const isVideo = type === 'video';
    const src = item.src || item.url;
    const title = item.title || item.caption || (isVideo ? 'Video' : 'Image');
    const alt = item.alt || title;
    const alignment = item.alignment || 'center';
    
    // Convert alignment to CSS classes
    const alignmentClass = alignment === 'top-left' ? 'object-position-top-left' : 
                          alignment === 'top-right' ? 'object-position-top-right' : 
                          'object-position-center';
    
    const content = isVideo 
      ? `<div class="video-frame ${borderClass}"><iframe src="${src}" title="${title}" allowfullscreen loading="lazy"></iframe></div>`
      : `<img src="${src}" alt="${alt}" loading="lazy" class="d-block w-100 ${alignmentClass}" style="object-fit: cover; user-select: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; pointer-events: auto;">`;
    
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
  captionEl.className = type === 'video' ? 'intro__usage-caption' : 'usage-carousel-caption intro__usage-caption';
  
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

  // Make images zoomable (only for image carousels, not videos)
  if (type === 'image') {
    setTimeout(() => {
      wrapper.querySelectorAll('.carousel-item').forEach((item, idx) => {
        const img = item.querySelector('img');
        if (img && items[idx]) {
          const caption = getImageCaptionText(items[idx]) || '';
          makeImageZoomable(img, caption);
        }
      });
    }, 100);
  }

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
    
    const zoomedImg = document.createElement('img');
    zoomedImg.id = 'zoomed-image';
    zoomedImg.style.cssText = `
      max-width: 95%;
      max-height: 95%;
      object-fit: contain;
      transform-origin: center center;
      transition: transform 0.1s ease-out;
      user-select: none;
      -webkit-user-select: none;
      -moz-user-select: none;
      -ms-user-select: none;
      pointer-events: none;
    `;
    
    const captionOverlay = document.createElement('div');
    captionOverlay.id = 'zoom-caption';
    captionOverlay.style.cssText = `
      position: absolute;
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
    
    zoomOverlay.appendChild(zoomedImg);
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
      zoomedImg.style.transform = 'scale(1)';
      delete zoomOverlay.dataset.carouselId;
      delete zoomOverlay.dataset.currentIndex;
    });
    
    // Close on Escape key and arrow key navigation
    document.addEventListener('keydown', (e) => {
      if (zoomOverlay.style.display === 'flex') {
        if (e.key === 'Escape') {
          zoomOverlay.style.display = 'none';
          zoomedImg.style.transform = 'scale(1)';
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
        
        // Update caption
        const captionText = newImg.dataset.zoomCaption || newImg.alt || '';
        if (captionText) {
          captionOverlay.innerHTML = mdInlineToHtmlBoldOnly(String(captionText));
          if (window.globalConfig) {
            colorizeStrongIn(captionOverlay, window.globalConfig);
          }
          captionOverlay.style.display = 'block';
        } else {
          captionOverlay.style.display = 'none';
        }
        
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
    
    // Zoom on mouse position - listen on overlay to capture all movement
    zoomOverlay.addEventListener('mousemove', (e) => {
      if (zoomOverlay.style.display === 'flex' && currentZoom > 1) {
        const rect = zoomedImg.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        zoomedImg.style.transformOrigin = `${x}% ${y}%`;
        zoomedImg.style.transform = `scale(${currentZoom})`;
      }
    });
    
    // Scroll wheel zoom
    zoomOverlay.addEventListener('wheel', (e) => {
      if (zoomOverlay.style.display === 'flex') {
        e.preventDefault();
        
        // Adjust zoom level based on scroll direction
        const zoomDelta = e.deltaY > 0 ? -0.1 : 0.1;
        currentZoom = Math.max(1, Math.min(5, currentZoom + zoomDelta));
        
        // Update transform with current zoom
        const rect = zoomedImg.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        zoomedImg.style.transformOrigin = `${x}% ${y}%`;
        zoomedImg.style.transform = `scale(${currentZoom})`;
      }
    }, { passive: false });
  }
  
  return zoomOverlay;
}

function makeImageZoomable(img, caption = '') {
  if (!img || img.classList.contains('zoomable-initialized')) return;
  
  img.style.cursor = 'zoom-in';
  img.classList.add('zoomable-initialized');
  
  const carousel = img.closest('.carousel');
  
  // Store caption on the image element
  if (caption) {
    img.dataset.zoomCaption = caption;
  }
  
  // Update cursor based on mouse position
  if (carousel) {
    img.addEventListener('mousemove', (e) => {
      const rect = img.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      // Define safe zones (in pixels from edges)
      const safeZoneBottom = 60; // Bottom area for indicators
      const safeZoneSides = 80;  // Left/right areas for prev/next buttons
      
      // Change cursor based on whether we're in a safe zone
      if (mouseY > rect.height - safeZoneBottom || 
          mouseX < safeZoneSides || 
          mouseX > rect.width - safeZoneSides) {
        img.style.cursor = 'default';
      } else {
        img.style.cursor = 'zoom-in';
      }
    });
    
    img.addEventListener('mouseleave', () => {
      img.style.cursor = 'zoom-in';
    });
  }
  
  img.addEventListener('click', (e) => {
    // Check if click is near carousel controls (safe zone)
    if (carousel) {
      const rect = img.getBoundingClientRect();
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
    const captionEl = overlay.querySelector('#zoom-caption');
    zoomedImg.src = img.src;
    zoomedImg.alt = img.alt;
    
    // Store click position for centering
    overlay.dataset.clickX = e.clientX;
    overlay.dataset.clickY = e.clientY;
    
    // Store carousel context for navigation
    const leftArrow = overlay.querySelector('#zoom-nav-left');
    const rightArrow = overlay.querySelector('#zoom-nav-right');
    
    if (carousel) {
      overlay.dataset.carouselId = carousel.id;
      const items = Array.from(carousel.querySelectorAll('.carousel-item'));
      const currentItem = img.closest('.carousel-item');
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
    
    // Set caption if available with markdown processing
    const captionText = img.dataset.zoomCaption || img.alt || '';
    if (captionText) {
      captionEl.innerHTML = mdInlineToHtmlBoldOnly(String(captionText));
      // Get the global config from window if available for colorization
      if (window.globalConfig) {
        colorizeStrongIn(captionEl, window.globalConfig);
      }
      captionEl.style.display = 'block';
    } else {
      captionEl.style.display = 'none';
    }
    
    overlay.style.display = 'flex';
    
    // Position the image at the click Y position, centered horizontally
    requestAnimationFrame(() => {
      const clickY = parseFloat(overlay.dataset.clickY) || window.innerHeight / 2;
      
      // Calculate position to center image at click Y, centered X
      const imgRect = zoomedImg.getBoundingClientRect();
      const left = (window.innerWidth - imgRect.width) / 2;
      const top = clickY - (imgRect.height / 2);
      
      zoomedImg.style.position = 'absolute';
      zoomedImg.style.left = `${left}px`;
      zoomedImg.style.top = `${top}px`;
      
      // Position caption and arrows relative to the image
      const leftArrow = overlay.querySelector('#zoom-nav-left');
      const rightArrow = overlay.querySelector('#zoom-nav-right');
      
      if (leftArrow) {
        leftArrow.style.top = `${top + imgRect.height / 2}px`;
      }
      if (rightArrow) {
        rightArrow.style.top = `${top + imgRect.height / 2}px`;
      }
      if (captionEl && captionEl.style.display !== 'none') {
        captionEl.style.top = `${top + imgRect.height - 60}px`;
      }
    });
  });
}

// Theme utilities
function isOutlineThemeActive() {
  return document.body.classList.contains('theme-outline');
}

function toggleOutlineClass(el, active) {
  if (!el) return;
  if (active) el.classList.add('outline-text');
  else el.classList.remove('outline-text');
}


// Minimal inline markdown to HTML (bold only) with escaping
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function mdInlineToHtmlBoldOnly(s) {
  const escaped = escapeHtml(s);
  // Convert **text** to <strong>text</strong>
  return escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

// Assign a theme color to any <strong> elements inside a root node
function pickRandomThemeColor(cfg) {
  if (cfg?.theme_colors?.outline_variant) {
    return cfg?.theme_colors?.outline_fill_color || '#ffffff';
  }
  // Use TOML theme colors if available, otherwise fall back to defaults
  if (cfg?.theme_colors) {
    const colors = cfg.theme_colors;
    const palette = [
      colors.primary_pink,
      colors.primary_purple,
      colors.primary_teal,
      colors.primary_green
    ].filter(Boolean);
    return palette.length > 0 ? utils.randomChoice(palette) : utils.randomChoice(THEME_CONFIG.colors.palette);
  }
  return utils.randomChoice(THEME_CONFIG.colors.palette);
}

function colorizeStrongIn(root, cfg) {
  if (!root) return;
  root.querySelectorAll('strong').forEach((el) => {
    if (!el.classList.contains('themed-strong')) {
      el.classList.add('themed-strong');
      el.style.setProperty('--strong-color', pickRandomThemeColor(cfg));
    }
    // Do not apply outline stroke to strong text to avoid overlapping glyphs
    // in display fonts that lack a true bold face (e.g., Digitalt).
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
        
        // Get caption from the slider's caption element
        const sliderCaption = slider.closest('.card')?.querySelector('.intro__usage-caption');
        if (sliderCaption && sliderCaption.textContent) {
          captionEl.innerHTML = sliderCaption.innerHTML;
          // Apply colorization to match site theme
          if (window.globalConfig) {
            colorizeStrongIn(captionEl, window.globalConfig);
          }
          captionEl.style.display = 'block';
        } else {
          captionEl.style.display = 'none';
        }
        
        overlay.style.display = 'flex';
        
        // Position the image at the click Y position, centered horizontally
        requestAnimationFrame(() => {
          const clickY = parseFloat(overlay.dataset.clickY) || window.innerHeight / 2;
          
          // Calculate position to center image at click Y, centered X
          const imgRect = zoomedImg.getBoundingClientRect();
          const left = (window.innerWidth - imgRect.width) / 2;
          const top = clickY - (imgRect.height / 2);
          
          zoomedImg.style.position = 'absolute';
          zoomedImg.style.left = `${left}px`;
          zoomedImg.style.top = `${top}px`;
          
          // Position caption and arrows relative to the image
          const leftArrow = overlay.querySelector('#zoom-nav-left');
          const rightArrow = overlay.querySelector('#zoom-nav-right');
          
          if (leftArrow) {
            leftArrow.style.top = `${top + imgRect.height / 2}px`;
          }
          if (rightArrow) {
            rightArrow.style.top = `${top + imgRect.height / 2}px`;
          }
          if (captionEl && captionEl.style.display !== 'none') {
            captionEl.style.top = `${top + imgRect.height - 60}px`;
          }
        });
      }, true); // Use capture phase to ensure we get the event first
    });
  }
  
  document.querySelectorAll('.ba-slider').forEach(initSlider);
}

// Unified theme randomization
function randomizeThemeElements() {
  const outline = isOutlineThemeActive();
  const outlineFill = document.documentElement.style.getPropertyValue('--outline-fill') || '#ffffff';
  const outlineStroke = document.documentElement.style.getPropertyValue('--outline-stroke') || outlineFill;
  
  // Randomize heading colors
  document.querySelectorAll('h2').forEach((heading) => {
    const color = outline ? outlineFill : utils.randomChoice(THEME_CONFIG.colors.palette);
    heading.style.color = color;
    toggleOutlineClass(heading, outline);
  });
  
  // Randomize button themes
  document.querySelectorAll('.themed-btn').forEach(button => {
    // Remove all theme classes
    THEME_CONFIG.colors.buttonClasses.forEach(className => {
      button.classList.remove(className);
    });
    
    if (outline) {
      button.classList.add('btn-theme-outline');
      toggleOutlineClass(button, true);
    } else {
      button.classList.remove('btn-theme-outline');
      toggleOutlineClass(button, false);
      const randomTheme = utils.randomChoice(THEME_CONFIG.colors.buttonClasses);
      button.classList.add(randomTheme);
    }
  });
}

// Background management utilities
function buildBackgroundLayers(site = {}) {
  if (!site.background_image) return null;
  const baseImage = `url('${site.background_image}')`;
  const blackColor = site.background_color_black || null;
  const whiteColor = site.background_color_white || null;
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
  const layers = buildBackgroundLayers(site) || { backgroundImage: `url('${site.background_image}')`, blendMode: '' };
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
      container.style.backgroundSize = site.background_size || 'cover';
      container.style.backgroundPosition = site.background_position || 'center';
      container.style.backgroundRepeat = site.background_repeat || 'no-repeat';
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
  const outline = isOutlineThemeActive();
  
  // Create shapes efficiently
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < shapeCount; i++) {
    const shape = document.createElement('span');
    const shapeType = utils.randomChoice(THEME_CONFIG.shapes.types);
    const shapeColor = outline ? 'outline' : utils.randomChoice(THEME_CONFIG.shapes.colors);
    
    shape.className = `shape ${shapeType} ${shapeColor}`;
    
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

// Parse item images using generic parser
function parseItemImages(item) {
  if (!item) return [];
  
  // Use generic parser for consistent handling
  const images = parseMediaItems(item, {
    itemsKey: 'images',
    urlKey: 'image',
    captionsKey: 'images_captions', 
    altKey: 'images_alt'
  });
  
  // Handle single image with image_alt (singular)
  if (images.length === 0 && item.image) {
    images.push({
      src: item.image,
      url: item.image,
      alt: item.image_alt || item.alt || '',
      caption: item.caption || ''
    });
  }
  
  // Add default alt text for items without it
  return images.map((img, idx) => ({
    ...img,
    alt: img.alt || `Feature image ${idx + 1}`
  }));
}

// Use generic carousel for images
function createImageCarousel(images, cfg, className = 'image-carousel', options = {}) {
  // Handle shared alt text option
  if (options.sharedAlt) {
    images = images.map(img => ({ ...img, alt: String(options.sharedAlt) }));
  }
  
  const carousel = createMediaCarousel(images, cfg, { 
    className, 
    type: 'image',
    borderClass: 'media-border'
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
    borderColor: 'var(--primary-purple)',
    iconColor: 'var(--primary-purple)'
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
    const colors = cfg.theme_colors;
    const specialKeys = new Set([
      'outline_variant',
      'outline_fill_color',
      'outline_stroke_color'
    ]);
    
    // Apply each color with !important to override CSS defaults
    Object.entries(colors).forEach(([key, value]) => {
      if (value && !specialKeys.has(key)) {
        const cssVar = `--${key.replace(/_/g, '-')}`;
        root.style.setProperty(cssVar, value, 'important');
      }
    });

    document.body.classList.remove('theme-outline');
    if (colors.outline_variant) {
      document.body.classList.add('theme-outline');
      const fillColor = colors.outline_fill_color || '#ffffff';
      const strokeColor = colors.outline_stroke_color || '#ffffff';
      document.documentElement.style.setProperty('--outline-fill', fillColor);
      document.documentElement.style.setProperty('--outline-stroke', strokeColor);
    } else {
      document.documentElement.style.removeProperty('--outline-fill');
      document.documentElement.style.removeProperty('--outline-stroke');
    }
  } else {
    document.body.classList.remove('theme-outline');
    document.documentElement.style.removeProperty('--outline-fill');
    document.documentElement.style.removeProperty('--outline-stroke');
  }
}

function applyFontConfiguration(cfg) {
  // Apply font settings from TOML to CSS custom properties
  if (cfg?.fonts) {
    const root = document.documentElement;
    const fonts = cfg.fonts;
    
    // Apply each font setting with !important to override CSS defaults
    Object.entries(fonts).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        const cssVar = `--${key.replace(/_/g, '-')}`;
        root.style.setProperty(cssVar, value, 'important');
      }
    });
  }
}

function applyOutlineTextStyles() {
  const outline = isOutlineThemeActive();
  const fill = document.documentElement.style.getPropertyValue('--outline-fill') || '#ffffff';
  
  // Apply outline styles to specific elements
  const selectors = ['.intro__params-title', '.intro__usage-title', '.comparison-caption'];
  selectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((el) => {
      toggleOutlineClass(el, outline);
      el.style.color = outline ? fill : '';
    });
  });
}

function renderContent(cfg) {
  // Apply theme colors and fonts first
  applyThemeColors(cfg);
  applyFontConfiguration(cfg);
  
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
    introContent.innerHTML = '';
    const paras = cfg?.introduction?.paragraphs || [];
    paras.forEach(t => {
      const p = document.createElement('p');
      p.innerHTML = mdInlineToHtmlBoldOnly(String(t));
      colorizeStrongIn(p, cfg);
      introContent.appendChild(p);
    });

    // Build Parameters section nodes (do not append yet)
    const paramsTitle = cfg?.introduction?.parameters_title || cfg?.introduction?.parametersTitle || 'Parameters';
    let parameters = Array.isArray(cfg?.introduction?.parameters)
      ? cfg.introduction.parameters
      : [];
    // Back-compat: if no 'parameters' provided, fall back to 'usage_parameters'
    if ((!parameters || parameters.length === 0) && Array.isArray(cfg?.introduction?.usage_parameters)) {
      parameters = cfg.introduction.usage_parameters;
    } else if ((!parameters || parameters.length === 0) && Array.isArray(cfg?.introduction?.usageParameters)) {
      parameters = cfg.introduction.usageParameters;
    }
    const hasParams = Array.isArray(parameters) && parameters.length > 0;
    const paramNodes = [];
    if (hasParams) {
      const h3p = document.createElement('h3');
      h3p.className = 'intro__params-title';
      h3p.textContent = paramsTitle;
      paramNodes.push(h3p);

      const ulp = document.createElement('ul');
      ulp.className = 'intro__params-list';
      parameters.forEach(item => {
        const li = document.createElement('li');
        li.innerHTML = mdInlineToHtmlBoldOnly(String(item));
        ulp.appendChild(li);
      });
      paramNodes.push(ulp);
    }

    // Build Usage section nodes (do not append yet)
    const usageTitle = cfg?.introduction?.usage_title || cfg?.introduction?.usageTitle || 'Usage';
    let usageItems = Array.isArray(cfg?.introduction?.usage_steps)
      ? cfg.introduction.usage_steps
      : [];
    // Back-compat: if no steps provided and no parameters detected, show legacy usage_parameters as the usage list
    if ((!usageItems || usageItems.length === 0) && (!parameters || parameters.length === 0)) {
      const legacy = Array.isArray(cfg?.introduction?.usage_parameters)
        ? cfg.introduction.usage_parameters
        : (cfg?.introduction?.usageParameters || []);
      usageItems = legacy;
    }
    const usageNodes = [];
    if (usageTitle && usageItems.length > 0) {
      const h3 = document.createElement('h3');
      h3.className = 'intro__usage-title';
      h3.textContent = usageTitle;
      usageNodes.push(h3);
    }
    if (Array.isArray(usageItems) && usageItems.length) {
      const ul = document.createElement('ul');
      ul.className = 'intro__usage-list';
      usageItems.forEach(item => {
        const li = document.createElement('li');
        li.innerHTML = mdInlineToHtmlBoldOnly(String(item));
        colorizeStrongIn(li, cfg);
        ul.appendChild(li);
      });
      usageNodes.push(ul);
    }

    // Usage images (support both single and multiple)
    const usageImages = parseUsageImages(cfg?.introduction);
    
    // If images exist, place Parameters + Usage in left column, images in right column
    if (usageImages.length > 0) {
      const grid = document.createElement('div');
      grid.className = 'intro__usage-grid';

      const mainCol = document.createElement('div');
      mainCol.className = 'intro__usage-main';
      // Usage first
      usageNodes.forEach(node => mainCol.appendChild(node));
      // Then Parameters
      paramNodes.forEach(node => mainCol.appendChild(node));
      grid.appendChild(mainCol);

      const mediaCol = document.createElement('div');
      mediaCol.className = 'intro__usage-media';
      
      if (usageImages.length === 1) {
        const figure = document.createElement('figure');
        const img = document.createElement('img');
        const single = usageImages[0];
        img.src = single.src;
        img.alt = single.alt || '';
        img.loading = 'lazy';
        img.className = 'media-border';
        figure.appendChild(img);
        const capText = getImageCaptionText(single);
        makeImageZoomable(img, capText);
        if (capText) {
          const figcap = document.createElement('figcaption');
          figcap.className = 'intro__usage-caption';
          figcap.innerHTML = mdInlineToHtmlBoldOnly(String(capText));
          colorizeStrongIn(figcap, cfg);
          figure.appendChild(figcap);
        }
        mediaCol.appendChild(figure);
      } else {
        // Multiple images - create carousel
        const carousel = createImageCarousel(usageImages, cfg, 'usage-image-carousel');
        mediaCol.appendChild(carousel);
      }
      
      grid.appendChild(mediaCol);
      introContent.appendChild(grid);
    } else {
      // No images: append sequentially into intro content (Usage first)
      usageNodes.forEach(node => introContent.appendChild(node));
      paramNodes.forEach(node => introContent.appendChild(node));
    }

    // Quick Start section
    const quickstartTitle = cfg?.introduction?.quickstart_title || '';
    const quickstartImages = parseMediaItems(cfg?.introduction, {
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

    // Video showcase in introduction
    const videoTitle = cfg?.introduction?.video_title || '';
    const videoUrl = cfg?.introduction?.video_url || '';
    
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

  // Titles overrides
  if (cfg?.titles) {
    const t = cfg.titles;
    if (t.comparisons) {
      const el = document.getElementById('comparisons-title');
      if (el) el.textContent = t.comparisons;
    }
    if (t.showcase) {
      const el = document.getElementById('showcase-title');
      if (el) el.textContent = t.showcase;
    }
    if (t.support) {
      const el = document.getElementById('support-title');
      if (el) el.textContent = t.support;
    }
  }

  // Comparisons grid
  const grid = document.getElementById('comparisons-grid');
  if (grid) {
    grid.innerHTML = '';
    const items = Array.isArray(cfg?.comparisons) ? cfg.comparisons : [];
    items.forEach(item => {
      const caption = item.caption || '';
      const captionHtml = caption ? mdInlineToHtmlBoldOnly(String(caption)) : '';
      const before = item.before || '';
      const after = item.after || '';
      const hasSliderMedia = Boolean(before || after);
      const imgs = hasSliderMedia ? [] : parseItemImages(item);
      const hasCarouselMedia = imgs.length > 1;
      const hasSingleImage = imgs.length === 1;
      const hasContent = hasSliderMedia || hasCarouselMedia || hasSingleImage;
      if (!hasContent) return;

      const card = document.createElement('div');
      card.className = 'card card--compact';

      // Mode 1: Before/After slider if before/after provided
      if (hasSliderMedia) {
        const initial = typeof item.initial === 'number' ? item.initial : 0.5;
        const color = item.color || 'purple';
        const handleShape = item.handle_shape || 'pentagon';
        const handleClass = handleShape ? `shape-${handleShape}` : '';
        // Shared text used for both alt attribute and the visible caption below
        const sharedCap = getImageCaptionText({ caption, alt: item.alt, title: item.title });
        const safeAlt = sharedCap ? escapeHtml(String(sharedCap)) : '';
        card.innerHTML = `
          <div class="ba-slider interactive-border" data-initial="${initial}" data-color="${color}">
            <div class="ba-pane after">${after ? `<img src="${after}" alt="${safeAlt}">` : '<span>After</span>'}</div>
            <div class="ba-pane before">${before ? `<img src="${before}" alt="${safeAlt}">` : '<span>Before</span>'}</div>
            <button class="ba-handle ${handleClass}" role="slider" aria-label="Drag to compare" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50" tabindex="0"></button>
          </div>
        `;
        // Shared, static caption below the slider
        if (sharedCap) {
          const p = document.createElement('p');
          p.className = 'intro__usage-caption';
          p.innerHTML = mdInlineToHtmlBoldOnly(String(sharedCap));
          card.appendChild(p);
        }
      } else {
        // Mode 2/3: Single image or carousel
        if (hasCarouselMedia) {
          // Dynamic captions for comparison carousels (updates as slides change)
          // But use shared alt text for accessibility consistency
          const sharedAlt = (imgs.map(im => getImageCaptionText(im)).find(Boolean)) || (caption ? String(caption) : '');
          const carousel = createImageCarousel(imgs, cfg, 'image-carousel', { sharedAlt });
          card.appendChild(carousel);
          // Do not add a separate card-level caption to avoid duplication
        } else if (hasSingleImage) {
          const fig = document.createElement('figure');
          fig.className = 'image-card';
          const img = document.createElement('img');
          img.src = imgs[0].src;
          // Use comparison-level caption first, then fall back to image caption/alt
          const capText = caption || getImageCaptionText(imgs[0]);
          img.alt = imgs[0].alt || capText || '';
          img.loading = 'lazy';
          img.className = 'media-border';
          fig.appendChild(img);
          makeImageZoomable(img, capText);
          if (capText) {
            const cap = document.createElement('figcaption');
            cap.className = 'intro__usage-caption';
            cap.innerHTML = mdInlineToHtmlBoldOnly(String(capText));
            fig.appendChild(cap);
          }
          card.appendChild(fig);
        }
      }

      colorizeStrongIn(card, cfg);
      grid.appendChild(card);
    });
  }

  // Showcase (single or multiple videos with carousel)
  const showcase = document.getElementById('showcase-container');
  const showcaseSection = showcase?.closest('section');
  if (showcase) {
    showcase.innerHTML = '';
    const videos = parseShowcaseVideos(cfg?.showcase || {});
    showcase.classList.remove('video-embed');
    
    if (videos.length > 1) {
      showcase.classList.add('video-embed');
      const carousel = createVideoCarousel(videos, cfg, 'video-carousel');
      showcase.appendChild(carousel);
      if (showcaseSection) showcaseSection.style.display = 'block';
    } else if (videos.length === 1) {
      showcase.classList.add('video-embed');
      const single = videos[0];
      const fig = document.createElement('figure');
      fig.className = 'image-card';
      const frame = document.createElement('div');
      frame.className = 'video-frame media-border';
      const iframe = document.createElement('iframe');
      iframe.src = single.url;
      iframe.setAttribute('allowfullscreen', '');
      iframe.loading = 'lazy';
      frame.appendChild(iframe);
      fig.appendChild(frame);
      const capText = getImageCaptionText(single);
      if (capText) {
        const fc = document.createElement('figcaption');
        fc.className = 'intro__usage-caption';
        fc.innerHTML = mdInlineToHtmlBoldOnly(String(capText));
        fig.appendChild(fc);
      }
      showcase.appendChild(fig);
      colorizeStrongIn(showcase, cfg);
      if (showcaseSection) showcaseSection.style.display = 'block';
    } else {
      // No videos - hide the entire showcase section
      if (showcaseSection) showcaseSection.style.display = 'none';
    }
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
  applyOutlineTextStyles();
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

// Helper function to render introduction section (extracted from main renderContent)
function renderIntroductionSection(introConfig, cfg, containerId) {
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
    parameters.forEach(item => {
      const li = document.createElement('li');
      li.innerHTML = mdInlineToHtmlBoldOnly(String(item));
      ulp.appendChild(li);
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
    usageItems.forEach(item => {
      const li = document.createElement('li');
      li.innerHTML = mdInlineToHtmlBoldOnly(String(item));
      colorizeStrongIn(li, cfg);
      ul.appendChild(li);
    });
    usageNodes.push(ul);
  }

  // Usage images
  const usageImages = parseUsageImages(introConfig);
  
  // Layout with images
  if (usageImages.length > 0) {
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
      // Single image
      const single = usageImages[0];
      const fig = document.createElement('figure');
      fig.className = 'intro__usage-figure';
      const img = document.createElement('img');
      img.src = single.src;
      img.alt = single.alt || single.caption || 'Usage image';
      img.className = 'intro__usage-image media-border';
      if (single.alignment) {
        img.classList.add(`object-position-${single.alignment}`);
      }
      fig.appendChild(img);
      const capText = getImageCaptionText(single);
      if (capText) {
        const fc = document.createElement('figcaption');
        fc.className = 'intro__usage-caption';
        fc.innerHTML = mdInlineToHtmlBoldOnly(String(capText));
        fig.appendChild(fc);
      }
      mediaCol.appendChild(fig);
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
  
  // Colorize any remaining bold text
  colorizeStrongIn(introContent, cfg);
}

// Helper function to create comparison elements (extracted from main renderContent)
function createComparisonElement(comparison, cfg) {
  if (!comparison) return null;
  
  // Handle different comparison types
  if (comparison.image) {
    // Single image card
    const card = document.createElement('div');
    card.className = 'comparison-card single-image-card';
    
    const img = document.createElement('img');
    img.src = comparison.image;
    img.alt = comparison.image_alt || comparison.caption || 'Comparison image';
    img.className = 'comparison-single-image media-border';
    card.appendChild(img);
    makeImageZoomable(img, comparison.caption || '');
    
    if (comparison.caption) {
      const caption = document.createElement('p');
      caption.className = 'comparison-caption';
      caption.innerHTML = mdInlineToHtmlBoldOnly(String(comparison.caption));
      colorizeStrongIn(caption, cfg);
      card.appendChild(caption);
    }
    
    return card;
  } else if (comparison.images && Array.isArray(comparison.images)) {
    // Carousel card
    const card = document.createElement('div');
    card.className = 'comparison-card carousel-card';
    
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
    
    if (comparison.caption) {
      const caption = document.createElement('p');
      caption.className = 'comparison-caption';
      caption.innerHTML = mdInlineToHtmlBoldOnly(String(comparison.caption));
      colorizeStrongIn(caption, cfg);
      card.appendChild(caption);
    }
    
    return card;
  } else if (comparison.before && comparison.after) {
    // Before/after slider - use same markup as main page for consistency
    const card = document.createElement('div');
    card.className = 'card card--compact';

    const initial = typeof comparison.initial === 'number' ? comparison.initial : 0.5;
    const color = comparison.color || 'purple';
    const handleShape = comparison.handle_shape || 'pentagon';
    const handleClass = handleShape ? `shape-${handleShape}` : '';
    const sharedCap = getImageCaptionText({ caption: comparison.caption, alt: comparison.alt, title: comparison.title });
    const safeAlt = sharedCap ? escapeHtml(String(sharedCap)) : '';

    card.innerHTML = `
      <div class="ba-slider interactive-border" data-initial="${initial}" data-color="${color}">
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
  
  if (!showcaseView || !documentationView || !toggleBtn || !globalConfig) return;
  
  if (currentView === 'showcase') {
    // Switch to documentation
    showcaseView.style.display = 'none';
    documentationView.style.display = 'block';
    currentView = 'documentation';
    
    const toggleText = globalConfig?.documentation?.toggle_text_documentation || 'View Product Showcase';
    toggleBtn.textContent = toggleText;
    
    // Show TOC, hide any open page
    showDocumentationTOC();
  } else {
    // Switch to showcase
    documentationView.style.display = 'none';
    showcaseView.style.display = 'block';
    currentView = 'showcase';
    
    const toggleText = globalConfig?.documentation?.toggle_text_showcase || 'View Documentation';
    toggleBtn.textContent = toggleText;
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

  // Render Profiles section as separate container after introduction
  setTimeout(() => {
    if (page.introduction) {
      const introConfig = page.introduction;
      const profilesTitle = introConfig.profiles_title || '';
      const profilesSteps = Array.isArray(introConfig.profiles_steps) ? introConfig.profiles_steps : [];
      const profilesImages = parseMediaItems(introConfig, {
        itemsKey: 'profiles_images',
        captionsKey: 'profiles_images_captions',
        altKey: 'profiles_images_alt',
        alignmentKey: 'profiles_images_alignment'
      });

      console.log('Profiles rendering:', { profilesTitle, stepsCount: profilesSteps.length, imagesCount: profilesImages.length });

      // Remove existing profiles section if it exists
      const existingProfiles = document.getElementById('doc-page-profiles');
      if (existingProfiles) existingProfiles.remove();

      if (profilesTitle && (profilesSteps.length > 0 || profilesImages.length > 0)) {
        const profilesSection = document.createElement('section');
        profilesSection.id = 'doc-page-profiles';
        profilesSection.className = 'section section--profiles';
        
        const h2 = document.createElement('h2');
        h2.className = 'section__title';
        h2.textContent = profilesTitle;
        profilesSection.appendChild(h2);
        
        const card = document.createElement('div');
        card.className = 'card';
        
        if (profilesSteps.length > 0) {
          const ul = document.createElement('ul');
          ul.className = 'intro__usage-list';
          profilesSteps.forEach(item => {
            const li = document.createElement('li');
            li.innerHTML = mdInlineToHtmlBoldOnly(String(item));
            colorizeStrongIn(li, (cfgDoc || globalConfig));
            ul.appendChild(li);
          });
          card.appendChild(ul);
        }
        
        if (profilesImages.length > 0) {
          const carousel = createImageCarousel(profilesImages, (cfgDoc || globalConfig), 'profiles-carousel');
          card.appendChild(carousel);
        }
        
        profilesSection.appendChild(card);
        
        // Insert after intro section
        const pageContainer = document.getElementById('documentation-page');
        const introElDelayed = document.getElementById('doc-page-intro');
        if (pageContainer && introElDelayed) {
          introElDelayed.parentNode.insertBefore(profilesSection, introElDelayed.nextSibling);
          console.log('Profiles section inserted after intro');
        } else {
          console.error('Could not insert profiles section', { pageContainer, introElDelayed });
        }
      }
    }
  }, 100);

  // Render SuffixGen section as separate container after profiles
  setTimeout(() => {
    if (page.introduction) {
      const introConfig = page.introduction;
      const suffixgenTitle = introConfig.suffixgen_title || '';
      const suffixgenSteps = Array.isArray(introConfig.suffixgen_steps) ? introConfig.suffixgen_steps : [];
      const suffixgenImages = parseMediaItems(introConfig, {
        itemsKey: 'suffixgen_images',
        captionsKey: 'suffixgen_images_captions',
        altKey: 'suffixgen_images_alt',
        alignmentKey: 'suffixgen_images_alignment'
      });

      // Remove existing suffixgen section if it exists
      const existingSuffixgen = document.getElementById('doc-page-suffixgen');
      if (existingSuffixgen) existingSuffixgen.remove();

      if (suffixgenTitle && (suffixgenSteps.length > 0 || suffixgenImages.length > 0)) {
        const suffixgenSection = document.createElement('section');
        suffixgenSection.id = 'doc-page-suffixgen';
        suffixgenSection.className = 'section section--suffixgen';
        
        const h2 = document.createElement('h2');
        h2.className = 'section__title';
        h2.textContent = suffixgenTitle;
        suffixgenSection.appendChild(h2);
        
        const card = document.createElement('div');
        card.className = 'card';
        
        if (suffixgenSteps.length > 0) {
          const ul = document.createElement('ul');
          ul.className = 'intro__usage-list';
          suffixgenSteps.forEach(item => {
            const li = document.createElement('li');
            li.innerHTML = mdInlineToHtmlBoldOnly(String(item));
            colorizeStrongIn(li, (cfgDoc || globalConfig));
            ul.appendChild(li);
          });
          card.appendChild(ul);
        }
        
        if (suffixgenImages.length > 0) {
          const carousel = createImageCarousel(suffixgenImages, (cfgDoc || globalConfig), 'suffixgen-carousel');
          card.appendChild(carousel);
        }
        
        suffixgenSection.appendChild(card);
        
        // Insert after profiles section
        const pageContainer = document.getElementById('documentation-page');
        const profilesEl = document.getElementById('doc-page-profiles');
        if (pageContainer && profilesEl) {
          profilesEl.parentNode.insertBefore(suffixgenSection, profilesEl.nextSibling);
        }
      }
    }
  }, 150);

  // Render BakeSetGen section as separate container after suffixgen
  setTimeout(() => {
    if (page.introduction) {
      const introConfig = page.introduction;
      const bakesetgenTitle = introConfig.bakesetgen_title || '';
      const bakesetgenSteps = Array.isArray(introConfig.bakesetgen_steps) ? introConfig.bakesetgen_steps : [];
      const bakesetgenImages = parseMediaItems(introConfig, {
        itemsKey: 'bakesetgen_images',
        captionsKey: 'bakesetgen_images_captions',
        altKey: 'bakesetgen_images_alt',
        alignmentKey: 'bakesetgen_images_alignment'
      });

      // Remove existing bakesetgen section if it exists
      const existingBakesetgen = document.getElementById('doc-page-bakesetgen');
      if (existingBakesetgen) existingBakesetgen.remove();

      if (bakesetgenTitle && (bakesetgenSteps.length > 0 || bakesetgenImages.length > 0)) {
        const bakesetgenSection = document.createElement('section');
        bakesetgenSection.id = 'doc-page-bakesetgen';
        bakesetgenSection.className = 'section section--bakesetgen';
        
        const h2 = document.createElement('h2');
        h2.className = 'section__title';
        h2.textContent = bakesetgenTitle;
        bakesetgenSection.appendChild(h2);
        
        const card = document.createElement('div');
        card.className = 'card';
        
        if (bakesetgenSteps.length > 0) {
          const ul = document.createElement('ul');
          ul.className = 'intro__usage-list';
          bakesetgenSteps.forEach(item => {
            const li = document.createElement('li');
            li.innerHTML = mdInlineToHtmlBoldOnly(String(item));
            colorizeStrongIn(li, (cfgDoc || globalConfig));
            ul.appendChild(li);
          });
          card.appendChild(ul);
        }
        
        if (bakesetgenImages.length > 0) {
          const carousel = createImageCarousel(bakesetgenImages, (cfgDoc || globalConfig), 'bakesetgen-carousel');
          card.appendChild(carousel);
        }
        
        bakesetgenSection.appendChild(card);
        
        // Insert after suffixgen section
        const pageContainer = document.getElementById('documentation-page');
        const suffixgenEl = document.getElementById('doc-page-suffixgen');
        if (pageContainer && suffixgenEl) {
          suffixgenEl.parentNode.insertBefore(bakesetgenSection, suffixgenEl.nextSibling);
        }
      }
    }
  }, 200);

  // Render BakeVisualizer section as separate container after bakesetgen
  setTimeout(() => {
    if (page.introduction) {
      const introConfig = page.introduction;
      const bakevisualizerTitle = introConfig.bakevisualizer_title || '';
      const bakevisualizerSteps = Array.isArray(introConfig.bakevisualizer_steps) ? introConfig.bakevisualizer_steps : [];
      const bakevisualizerImages = parseMediaItems(introConfig, {
        itemsKey: 'bakevisualizer_images',
        captionsKey: 'bakevisualizer_images_captions',
        altKey: 'bakevisualizer_images_alt',
        alignmentKey: 'bakevisualizer_images_alignment'
      });

      // Remove existing bakevisualizer section if it exists
      const existingBakevisualizer = document.getElementById('doc-page-bakevisualizer');
      if (existingBakevisualizer) existingBakevisualizer.remove();

      if (bakevisualizerTitle && (bakevisualizerSteps.length > 0 || bakevisualizerImages.length > 0)) {
        const bakevisualizerSection = document.createElement('section');
        bakevisualizerSection.id = 'doc-page-bakevisualizer';
        bakevisualizerSection.className = 'section section--bakevisualizer';
        
        const h2 = document.createElement('h2');
        h2.className = 'section__title';
        h2.textContent = bakevisualizerTitle;
        bakevisualizerSection.appendChild(h2);
        
        const card = document.createElement('div');
        card.className = 'card';
        
        if (bakevisualizerSteps.length > 0) {
          const ul = document.createElement('ul');
          ul.className = 'intro__usage-list';
          bakevisualizerSteps.forEach(item => {
            const li = document.createElement('li');
            li.innerHTML = mdInlineToHtmlBoldOnly(String(item));
            colorizeStrongIn(li, (cfgDoc || globalConfig));
            ul.appendChild(li);
          });
          card.appendChild(ul);
        }
        
        if (bakevisualizerImages.length > 0) {
          const carousel = createImageCarousel(bakevisualizerImages, (cfgDoc || globalConfig), 'bakevisualizer-carousel');
          card.appendChild(carousel);
        }
        
        bakevisualizerSection.appendChild(card);
        
        // Insert after bakesetgen section
        const pageContainer = document.getElementById('documentation-page');
        const bakesetgenEl = document.getElementById('doc-page-bakesetgen');
        if (pageContainer && bakesetgenEl) {
          bakesetgenEl.parentNode.insertBefore(bakevisualizerSection, bakesetgenEl.nextSibling);
        }
      }
    }
  }, 250);

  // Render MultiUV section as separate container after bakevisualizer
  setTimeout(() => {
    if (page.introduction) {
      const introConfig = page.introduction;
      const multiuvTitle = introConfig.multiuv_title || '';
      const multiuvSteps = Array.isArray(introConfig.multiuv_steps) ? introConfig.multiuv_steps : [];
      const multiuvImages = parseMediaItems(introConfig, {
        itemsKey: 'multiuv_images',
        captionsKey: 'multiuv_images_captions',
        altKey: 'multiuv_images_alt',
        alignmentKey: 'multiuv_images_alignment'
      });

      // Remove existing multiuv section if it exists
      const existingMultiuv = document.getElementById('doc-page-multiuv');
      if (existingMultiuv) existingMultiuv.remove();

      if (multiuvTitle && (multiuvSteps.length > 0 || multiuvImages.length > 0)) {
        const multiuvSection = document.createElement('section');
        multiuvSection.id = 'doc-page-multiuv';
        multiuvSection.className = 'section section--multiuv';
        
        const h2 = document.createElement('h2');
        h2.className = 'section__title';
        h2.textContent = multiuvTitle;
        multiuvSection.appendChild(h2);
        
        const card = document.createElement('div');
        card.className = 'card';
        
        if (multiuvSteps.length > 0) {
          const ul = document.createElement('ul');
          ul.className = 'intro__usage-list';
          multiuvSteps.forEach(item => {
            const li = document.createElement('li');
            li.innerHTML = mdInlineToHtmlBoldOnly(String(item));
            colorizeStrongIn(li, (cfgDoc || globalConfig));
            ul.appendChild(li);
          });
          card.appendChild(ul);
        }
        
        if (multiuvImages.length > 0) {
          const carousel = createImageCarousel(multiuvImages, (cfgDoc || globalConfig), 'multiuv-carousel');
          card.appendChild(carousel);
        }
        
        multiuvSection.appendChild(card);
        
        // Insert after bakevisualizer section
        const pageContainer = document.getElementById('documentation-page');
        const bakevisualizerEl = document.getElementById('doc-page-bakevisualizer');
        if (pageContainer && bakevisualizerEl) {
          bakevisualizerEl.parentNode.insertBefore(multiuvSection, bakevisualizerEl.nextSibling);
        }
      }
    }
  }, 300);

  // Render CollectionBake section as separate container after multiuv
  setTimeout(() => {
    if (page.introduction) {
      const introConfig = page.introduction;
      const collectionbakeTitle = introConfig.collectionbake_title || '';
      const collectionbakeSteps = Array.isArray(introConfig.collectionbake_steps) ? introConfig.collectionbake_steps : [];
      const collectionbakeImages = parseMediaItems(introConfig, {
        itemsKey: 'collectionbake_images',
        captionsKey: 'collectionbake_images_captions',
        altKey: 'collectionbake_images_alt',
        alignmentKey: 'collectionbake_images_alignment'
      });

      // Remove existing collectionbake section if it exists
      const existingCollectionbake = document.getElementById('doc-page-collectionbake');
      if (existingCollectionbake) existingCollectionbake.remove();

      if (collectionbakeTitle && (collectionbakeSteps.length > 0 || collectionbakeImages.length > 0)) {
        const collectionbakeSection = document.createElement('section');
        collectionbakeSection.id = 'doc-page-collectionbake';
        collectionbakeSection.className = 'section section--collectionbake';
        
        const h2 = document.createElement('h2');
        h2.className = 'section__title';
        h2.textContent = collectionbakeTitle;
        collectionbakeSection.appendChild(h2);
        
        const card = document.createElement('div');
        card.className = 'card';
        
        if (collectionbakeSteps.length > 0) {
          const ul = document.createElement('ul');
          ul.className = 'intro__usage-list';
          collectionbakeSteps.forEach(item => {
            const li = document.createElement('li');
            li.innerHTML = mdInlineToHtmlBoldOnly(String(item));
            colorizeStrongIn(li, (cfgDoc || globalConfig));
            ul.appendChild(li);
          });
          card.appendChild(ul);
        }
        
        if (collectionbakeImages.length > 0) {
          const carousel = createImageCarousel(collectionbakeImages, (cfgDoc || globalConfig), 'collectionbake-carousel');
          card.appendChild(carousel);
        }
        
        collectionbakeSection.appendChild(card);
        
        // Insert after multiuv section
        const pageContainer = document.getElementById('documentation-page');
        const multiuvEl = document.getElementById('doc-page-multiuv');
        if (pageContainer && multiuvEl) {
          multiuvEl.parentNode.insertBefore(collectionbakeSection, multiuvEl.nextSibling);
        }
      }
    }
  }, 350);

  // Render EnvironmentCollection section as separate container after collectionbake
  setTimeout(() => {
    if (page.introduction) {
      const introConfig = page.introduction;
      const environmentcollectionTitle = introConfig.environmentcollection_title || '';
      const environmentcollectionSteps = Array.isArray(introConfig.environmentcollection_steps) ? introConfig.environmentcollection_steps : [];
      const environmentcollectionImages = parseMediaItems(introConfig, {
        itemsKey: 'environmentcollection_images',
        captionsKey: 'environmentcollection_images_captions',
        altKey: 'environmentcollection_images_alt',
        alignmentKey: 'environmentcollection_images_alignment'
      });

      // Remove existing environmentcollection section if it exists
      const existingEnvironmentcollection = document.getElementById('doc-page-environmentcollection');
      if (existingEnvironmentcollection) existingEnvironmentcollection.remove();

      if (environmentcollectionTitle && (environmentcollectionSteps.length > 0 || environmentcollectionImages.length > 0)) {
        const environmentcollectionSection = document.createElement('section');
        environmentcollectionSection.id = 'doc-page-environmentcollection';
        environmentcollectionSection.className = 'section section--environmentcollection';
        
        const h2 = document.createElement('h2');
        h2.className = 'section__title';
        h2.textContent = environmentcollectionTitle;
        environmentcollectionSection.appendChild(h2);
        
        const card = document.createElement('div');
        card.className = 'card';
        
        if (environmentcollectionSteps.length > 0) {
          const ul = document.createElement('ul');
          ul.className = 'intro__usage-list';
          environmentcollectionSteps.forEach(item => {
            const li = document.createElement('li');
            li.innerHTML = mdInlineToHtmlBoldOnly(String(item));
            colorizeStrongIn(li, (cfgDoc || globalConfig));
            ul.appendChild(li);
          });
          card.appendChild(ul);
        }
        
        if (environmentcollectionImages.length > 0) {
          const carousel = createImageCarousel(environmentcollectionImages, (cfgDoc || globalConfig), 'environmentcollection-carousel');
          card.appendChild(carousel);
        }
        
        environmentcollectionSection.appendChild(card);
        
        // Insert after collectionbake section
        const pageContainer = document.getElementById('documentation-page');
        const collectionbakeEl = document.getElementById('doc-page-collectionbake');
        if (pageContainer && collectionbakeEl) {
          collectionbakeEl.parentNode.insertBefore(environmentcollectionSection, collectionbakeEl.nextSibling);
        }
      }
    }
  }, 400);

  // Render Decals section as separate container after environmentcollection
  setTimeout(() => {
    if (page.introduction) {
      const introConfig = page.introduction;
      const decalsTitle = introConfig.decals_title || '';
      const decalsSteps = Array.isArray(introConfig.decals_steps) ? introConfig.decals_steps : [];
      const decalsImages = parseMediaItems(introConfig, {
        itemsKey: 'decals_images',
        captionsKey: 'decals_images_captions',
        altKey: 'decals_images_alt',
        alignmentKey: 'decals_images_alignment'
      });

      // Remove existing decals section if it exists
      const existingDecals = document.getElementById('doc-page-decals');
      if (existingDecals) existingDecals.remove();

      if (decalsTitle && (decalsSteps.length > 0 || decalsImages.length > 0)) {
        const decalsSection = document.createElement('section');
        decalsSection.id = 'doc-page-decals';
        decalsSection.className = 'section section--decals';
        
        const h2 = document.createElement('h2');
        h2.className = 'section__title';
        h2.textContent = decalsTitle;
        decalsSection.appendChild(h2);
        
        const card = document.createElement('div');
        card.className = 'card';
        
        if (decalsSteps.length > 0) {
          const ul = document.createElement('ul');
          ul.className = 'intro__usage-list';
          decalsSteps.forEach(item => {
            const li = document.createElement('li');
            li.innerHTML = mdInlineToHtmlBoldOnly(String(item));
            colorizeStrongIn(li, (cfgDoc || globalConfig));
            ul.appendChild(li);
          });
          card.appendChild(ul);
        }
        
        if (decalsImages.length > 0) {
          const carousel = createImageCarousel(decalsImages, (cfgDoc || globalConfig), 'decals-carousel');
          card.appendChild(carousel);
        }
        
        decalsSection.appendChild(card);
        
        // Insert after environmentcollection section
        const pageContainer = document.getElementById('documentation-page');
        const environmentcollectionEl = document.getElementById('doc-page-environmentcollection');
        if (pageContainer && environmentcollectionEl) {
          environmentcollectionEl.parentNode.insertBefore(decalsSection, environmentcollectionEl.nextSibling);
        }
      }
    }
  }, 450);

  // Render HighToLow section as separate container after decals
  setTimeout(() => {
    if (page.introduction) {
      const introConfig = page.introduction;
      const hightolowTitle = introConfig.hightolow_title || '';
      const hightolowSteps = Array.isArray(introConfig.hightolow_steps) ? introConfig.hightolow_steps : [];
      const hightolowImages = parseMediaItems(introConfig, {
        itemsKey: 'hightolow_images',
        captionsKey: 'hightolow_images_captions',
        altKey: 'hightolow_images_alt',
        alignmentKey: 'hightolow_images_alignment'
      });

      // Remove existing hightolow section if it exists
      const existingHightolow = document.getElementById('doc-page-hightolow');
      if (existingHightolow) existingHightolow.remove();

      if (hightolowTitle && (hightolowSteps.length > 0 || hightolowImages.length > 0)) {
        const hightolowSection = document.createElement('section');
        hightolowSection.id = 'doc-page-hightolow';
        hightolowSection.className = 'section section--hightolow';
        
        const h2 = document.createElement('h2');
        h2.className = 'section__title';
        h2.textContent = hightolowTitle;
        hightolowSection.appendChild(h2);
        
        const card = document.createElement('div');
        card.className = 'card';
        
        if (hightolowSteps.length > 0) {
          const ul = document.createElement('ul');
          ul.className = 'intro__usage-list';
          hightolowSteps.forEach(item => {
            const li = document.createElement('li');
            li.innerHTML = mdInlineToHtmlBoldOnly(String(item));
            colorizeStrongIn(li, (cfgDoc || globalConfig));
            ul.appendChild(li);
          });
          card.appendChild(ul);
        }
        
        if (hightolowImages.length > 0) {
          const carousel = createImageCarousel(hightolowImages, (cfgDoc || globalConfig), 'hightolow-carousel');
          card.appendChild(carousel);
        }
        
        hightolowSection.appendChild(card);
        
        // Insert after decals section
        const pageContainer = document.getElementById('documentation-page');
        const decalsEl = document.getElementById('doc-page-decals');
        if (pageContainer && decalsEl) {
          decalsEl.parentNode.insertBefore(hightolowSection, decalsEl.nextSibling);
        }
      }
    }
  }, 500);

  // Render AdvancedBaking section as separate container after hightolow
  setTimeout(() => {
    if (page.introduction) {
      const introConfig = page.introduction;
      const advancedbakingTitle = introConfig.advancedbaking_title || '';
      const advancedbakingSteps = Array.isArray(introConfig.advancedbaking_steps) ? introConfig.advancedbaking_steps : [];
      const advancedbakingImages = parseMediaItems(introConfig, {
        itemsKey: 'advancedbaking_images',
        captionsKey: 'advancedbaking_images_captions',
        altKey: 'advancedbaking_images_alt',
        alignmentKey: 'advancedbaking_images_alignment'
      });

      // Remove existing advancedbaking section if it exists
      const existingAdvancedbaking = document.getElementById('doc-page-advancedbaking');
      if (existingAdvancedbaking) existingAdvancedbaking.remove();

      if (advancedbakingTitle && (advancedbakingSteps.length > 0 || advancedbakingImages.length > 0)) {
        const advancedbakingSection = document.createElement('section');
        advancedbakingSection.id = 'doc-page-advancedbaking';
        advancedbakingSection.className = 'section section--advancedbaking';
        
        const h2 = document.createElement('h2');
        h2.className = 'section__title';
        h2.textContent = advancedbakingTitle;
        advancedbakingSection.appendChild(h2);
        
        const card = document.createElement('div');
        card.className = 'card';
        
        if (advancedbakingSteps.length > 0) {
          const ul = document.createElement('ul');
          ul.className = 'intro__usage-list';
          advancedbakingSteps.forEach(item => {
            const li = document.createElement('li');
            li.innerHTML = mdInlineToHtmlBoldOnly(String(item));
            colorizeStrongIn(li, (cfgDoc || globalConfig));
            ul.appendChild(li);
          });
          card.appendChild(ul);
        }
        
        if (advancedbakingImages.length > 0) {
          const carousel = createImageCarousel(advancedbakingImages, (cfgDoc || globalConfig), 'advancedbaking-carousel');
          card.appendChild(carousel);
        }
        
        advancedbakingSection.appendChild(card);
        
        // Insert after hightolow section
        const pageContainer = document.getElementById('documentation-page');
        const hightolowEl = document.getElementById('doc-page-hightolow');
        if (pageContainer && hightolowEl) {
          hightolowEl.parentNode.insertBefore(advancedbakingSection, hightolowEl.nextSibling);
        }
      }
    }
  }, 550);

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
      const single = videos[0];
      const fig = document.createElement('figure');
      fig.className = 'intro__usage-figure';
      const frame = document.createElement('div');
      frame.className = 'intro__usage-video-frame media-border';
      const iframe = document.createElement('iframe');
      iframe.src = single.url;
      iframe.setAttribute('allowfullscreen', '');
      iframe.loading = 'lazy';
      frame.appendChild(iframe);
      fig.appendChild(frame);
      const capText = getImageCaptionText(single);
      if (capText) {
        const fc = document.createElement('figcaption');
        fc.className = 'intro__usage-caption';
        fc.innerHTML = mdInlineToHtmlBoldOnly(String(capText));
        fig.appendChild(fc);
      }
      showcaseContainer.appendChild(fig);
      colorizeStrongIn(showcaseContainer, (cfgDoc || globalConfig));
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

  // Set up toggle button
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
  // Back to TOC
  const backBtn = document.getElementById('back-to-toc-btn');
  if (backBtn) backBtn.onclick = showDocumentationTOC;

  // Render TOC using docsConfig if present
  renderDocumentationTOC(activeDocCfg);

  // Initial view
  const defaultView = (activeDocCfg?.documentation?.default_view) || (cfg?.documentation?.default_view) || 'showcase';
  if (defaultView === 'documentation') toggleView();
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
    renderContent(cfg);
    await initDocumentation(cfg);
  } catch (err) {
    console.error('Content load failed:', err);
    console.warn('Using defaults due to error');
  }
  // Initialize interactive/visual features after content is in the DOM
  initBeforeAfterSliders();
  randomizeThemeElements();
  generateBackgroundShapes(cfg);
  applyOutlineTextStyles();
});
