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

// Parse showcase videos from TOML (supports multiple shapes, stays backward compatible)
function parseShowcaseVideos(showcase) {
  const vids = [];
  if (!showcase) return vids;

  const pushObj = (url, i = 0) => {
    if (!url) return;
    const capArr = Array.isArray(showcase.video_captions) ? showcase.video_captions : [];
    const caption = capArr[i] || '';
    vids.push({ url, caption });
  };

  if (Array.isArray(showcase.videos)) {
    showcase.videos.forEach((v, i) => {
      if (typeof v === 'string') pushObj(v, i);
      else if (v && typeof v === 'object') vids.push({ url: v.url || v.src || '', caption: v.caption || v.title || '' });
    });
  } else if (Array.isArray(showcase.video_urls)) {
    showcase.video_urls.forEach((u, i) => pushObj(u, i));
  } else if (showcase.video_url) {
    pushObj(showcase.video_url, 0);
  }

  return vids.filter(v => v && v.url);
}

function createVideoCarousel(videos, cfg, className = 'video-carousel') {
  const carouselId = `video-carousel-${Date.now()}`;

  const itemsHtml = videos.map((v, index) => `
    <div class="carousel-item ${index === 0 ? 'active' : ''}">
      <div class="video-frame interactive-border">
        <iframe src="${v.url}" title="${(v.title || v.caption || 'Video')}" allowfullscreen loading="lazy"></iframe>
      </div>
    </div>
  `).join('');

  const indicatorsHtml = videos.length > 1 ? `
    <div class="carousel-indicators">
      ${videos.map((_, idx) => `
        <button type="button" data-bs-target="#${carouselId}" data-bs-slide-to="${idx}" class="${idx === 0 ? 'active' : ''}" aria-current="${idx === 0 ? 'true' : 'false'}" aria-label="Slide ${idx + 1}"></button>
      `).join('')}
    </div>
  ` : '';

  const wrapper = document.createElement('div');
  wrapper.className = className;
  wrapper.innerHTML = `
    <div id="${carouselId}" class="carousel slide interactive-border" data-bs-ride="false">
      <div class="carousel-inner">
        ${itemsHtml}
      </div>
      ${indicatorsHtml}
    </div>
  `;

  const firstCap = getImageCaptionText(videos[0]);
  const captionEl = document.createElement('div');
  captionEl.className = 'intro__usage-caption';
  captionEl.innerHTML = firstCap ? mdInlineToHtmlBoldOnly(String(firstCap)) : '';
  wrapper.appendChild(captionEl);

  setTimeout(() => colorizeStrongIn(wrapper, cfg), 0);

  const carouselEl = wrapper.querySelector(`#${carouselId}`);
  const setCaption = (idx) => {
    const text = getImageCaptionText(videos[idx]) || '';
    captionEl.innerHTML = text ? mdInlineToHtmlBoldOnly(String(text)) : '';
    colorizeStrongIn(captionEl, cfg);
  };
  carouselEl.addEventListener('slid.bs.carousel', () => {
    const items = Array.from(carouselEl.querySelectorAll('.carousel-item'));
    const activeIndex = Math.max(0, items.findIndex(i => i.classList.contains('active')));
    setCaption(activeIndex);
  });

  return wrapper;
}

// Utility functions
const utils = {
  clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
  randomChoice: (array) => array[Math.floor(Math.random() * array.length)],
  getViewportWidth: () => Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0)
};

// Color conversion utilities for background pattern mapping
function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  
  return [h * 360, s * 100, l * 100];
}

function getHueRotation(targetColor) {
  const [hue] = hexToHsl(targetColor);
  return hue;
}

function getSaturation(blackColor, whiteColor) {
  const [, satBlack] = hexToHsl(blackColor);
  const [, satWhite] = hexToHsl(whiteColor);
  return Math.max(satBlack, satWhite);
}

function getBrightness(blackColor, whiteColor) {
  const [, , lightBlack] = hexToHsl(blackColor);
  const [, , lightWhite] = hexToHsl(whiteColor);
  return (lightBlack + lightWhite) / 2;
}

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
    toggleOutlineClass(el, isOutlineThemeActive());
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
      isDragging = true;
      slider.classList.add('dragging');
      setPosition(pointerToPosition(event));
      event.preventDefault();
    };
    
    const handlePointerMove = (event) => {
      if (isDragging) setPosition(pointerToPosition(event));
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
  }
  
  document.querySelectorAll('.ba-slider').forEach(initSlider);
}

// Randomize heading colors
function randomizeHeadingColors() {
  const outline = isOutlineThemeActive();
  document.querySelectorAll('h2').forEach((heading) => {
    const color = outline
      ? (document.documentElement.style.getPropertyValue('--outline-fill') || '#ffffff')
      : utils.randomChoice(THEME_CONFIG.colors.palette);
    heading.style.color = color;
    toggleOutlineClass(heading, outline);
  });
}

// Randomize themed button colors
function randomizeButtonThemes() {
  const outline = isOutlineThemeActive();
  document.querySelectorAll('.themed-btn').forEach(button => {
    THEME_CONFIG.colors.buttonClasses.forEach(className => {
      button.classList.remove(className);
    });
    if (outline) {
      button.classList.add('btn-theme-outline');
      const fill = document.documentElement.style.getPropertyValue('--outline-fill') || '#ffffff';
      const stroke = document.documentElement.style.getPropertyValue('--outline-stroke') || fill;
      toggleOutlineClass(button, true);
    } else {
      button.classList.remove('btn-theme-outline');
      toggleOutlineClass(button, false);
      const randomTheme = utils.randomChoice(THEME_CONFIG.colors.buttonClasses);
      button.classList.add(randomTheme);
    }
  });
}

// Generate background shapes or apply background image
function generateBackgroundShapes(cfg) {
  const container = document.querySelector('.bg-shapes');
  if (!container) return;
  
  // Check if background image is specified in config
  if (cfg?.site?.background_image) {
    container.innerHTML = '';
    // Create rotated background using pseudo-element approach for proper tiling
    if (cfg?.site?.background_rotation) {
      const rotation = cfg.site.background_rotation;
      const imageUrl = cfg.site.background_image;
      
      // Remove any existing rotation style
      const existingStyle = document.querySelector('style[data-bg-rotation]');
      if (existingStyle) existingStyle.remove();
      
      // Create a rotated pseudo-element that extends beyond container bounds
      const style = document.createElement('style');
      style.setAttribute('data-bg-rotation', 'true');
      style.textContent = `
        .bg-shapes::before {
          content: '';
          position: absolute;
          top: -75%;
          left: -75%;
          width: 250%;
          height: 250%;
          background-image: url('${imageUrl}');
          background-size: ${cfg?.site?.background_size || 'auto'};
          background-position: ${cfg?.site?.background_position || 'center'};
          background-repeat: ${cfg?.site?.background_repeat || 'repeat'};
          transform: rotate(${rotation}deg);
          transform-origin: center;
          z-index: -1;
        }
      `;
      document.head.appendChild(style);
      
      // Don't set background on container itself when using rotation
      container.style.opacity = cfg?.site?.background_opacity || '0.3';
    } else {
      // Normal background without rotation
      container.style.backgroundImage = `url('${cfg.site.background_image}')`;
      container.style.backgroundSize = cfg?.site?.background_size || 'cover';
      container.style.backgroundPosition = cfg?.site?.background_position || 'center';
      container.style.backgroundRepeat = cfg?.site?.background_repeat || 'no-repeat';
      container.style.opacity = cfg?.site?.background_opacity || '0.3';
    }
    
    // Apply color mapping for black/white patterns
    if (cfg?.site?.background_color_black || cfg?.site?.background_color_white) {
      const blackColor = cfg.site.background_color_black || '#000000';
      const whiteColor = cfg.site.background_color_white || '#ffffff';
      
      if (cfg?.site?.background_rotation) {
        // Update the pseudo-element style to include color mapping
        const existingStyle = document.querySelector('style[data-bg-rotation]');
        if (existingStyle) existingStyle.remove();
        
        const style = document.createElement('style');
        style.setAttribute('data-bg-rotation', 'true');
        const gradientOverlay = `linear-gradient(0deg, ${blackColor}, ${whiteColor})`;
        style.textContent = `
          .bg-shapes::before {
            content: '';
            position: absolute;
            top: -75%;
            left: -75%;
            width: 250%;
            height: 250%;
            background-image: ${gradientOverlay}, url('${cfg.site.background_image}');
            background-size: ${cfg?.site?.background_size || 'auto'};
            background-position: ${cfg?.site?.background_position || 'center'};
            background-repeat: ${cfg?.site?.background_repeat || 'repeat'};
            background-blend-mode: multiply;
            transform: rotate(${cfg.site.background_rotation}deg);
            transform-origin: center;
            z-index: -1;
          }
        `;
        document.head.appendChild(style);
      } else {
        // Create a gradient overlay to map black/white to custom colors
        const gradientOverlay = `linear-gradient(0deg, ${blackColor}, ${whiteColor})`;
        container.style.backgroundImage = `${gradientOverlay}, url('${cfg.site.background_image}')`;
        container.style.backgroundBlendMode = 'multiply';
      }
      
      // Alternative: Use CSS filter for simpler color tinting
      // const [h, s, l] = hexToHsl(blackColor);
      // container.style.filter = `hue-rotate(${h}deg) saturate(${s * 2}%) brightness(${l}%)`;
    }
    
    return;
  }
  
  // Default: generate animated shapes
  container.innerHTML = '';
  container.style.backgroundImage = '';
  const viewportWidth = utils.getViewportWidth();
  const shapeCount = viewportWidth < 600 ? 48 : 96;
  const sizeRange = viewportWidth < 600 ? { min: 18, max: 50 } : { min: 22, max: 60 };
  const outline = isOutlineThemeActive();
  
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
    
    container.appendChild(shape);
  }
}

// ===== Minimal TOML parser (subset) =====
// Supports: [section], [[arrayOfTables]], key = value, arrays (incl. multi-line), strings, numbers, booleans.
function parseTomlLight(input) {
  const obj = {};
  let current = obj;
  let currentArraySection = null;

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
    let depth = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '"' && s[i - 1] !== '\\') inStr = !inStr;
      if (!inStr) {
        if (c === '[') depth++;
        else if (c === ']') depth--;
        else if (c === ',' && depth === 0) {
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

  const parseValue = (raw) => {
    let v = raw.trim();
    if (!v) return null;
    if (v.startsWith('[')) {
      // array
      v = v.replace(/^\[/, '').replace(/\]$/, '').trim();
      if (!v) return [];
      return splitTopLevel(v).map(el => parseValue(el));
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
      if (!Array.isArray(obj[name])) obj[name] = [];
      const entry = {};
      obj[name].push(entry);
      current = entry;
      currentArraySection = name;
      continue;
    }

    // Table: [section]
    let mTbl = line.match(/^\[(.+?)\]$/);
    if (mTbl) {
      const name = mTbl[1].trim();
      if (!obj[name] || Array.isArray(obj[name])) obj[name] = {};
      current = obj[name];
      currentArraySection = null;
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
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  const text = await res.text();
  console.log('Raw TOML text:', text);
  // Prefer local lightweight parser
  try {
    const parsed = parseTomlLight(text);
    console.log('Parsed TOML:', parsed);
    return parsed;
  } catch (e) {
    console.error('Local parser failed:', e);
    // Fallback to any global TOML parser if available
    const parser = (window.TOML && window.TOML.parse) || (window.toml && window.toml.parse);
    if (!parser) throw new Error('TOML parser not found.');
    return parser(text);
  }
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
      cleanTitle = cleanTitle.replace(/\s*[-–—]\s*$/, '').replace(/^\s*[-–—]\s*/, '').trim();
      break;
    }
  }
  
  return {
    title: cleanTitle || fullTitle,
    date: extractedDate
  };
}

function parseUsageImages(introduction) {
  if (!introduction) return [];
  
  const images = [];
  
  console.log('Parsing usage images, introduction:', introduction);
  
  // Check for multiple images array first
  if (Array.isArray(introduction.usage_images)) {
    console.log('Found usage_images array:', introduction.usage_images);
    const altTexts = Array.isArray(introduction.usage_images_alt) ? introduction.usage_images_alt : [];
    const captions = Array.isArray(introduction.usage_images_captions) ? introduction.usage_images_captions : [];
    
    introduction.usage_images.forEach((img, index) => {
      if (typeof img === 'string') {
        images.push({
          src: img,
          alt: altTexts[index] || `Usage illustration ${index + 1}`,
          caption: captions[index] || ''
        });
      } else if (typeof img === 'object' && img !== null) {
        images.push({
          src: img.src || img.image || '',
          alt: img.alt || altTexts[index] || `Usage illustration ${index + 1}`,
          caption: img.caption || captions[index] || ''
        });
      }
    });
  }
  // Fallback to single image properties
  else {
    console.log('No usage_images array found, checking single image properties');
    const singleImage = introduction.usage_image || introduction.usageImage;
    const singleAlt = introduction.usage_image_alt || introduction.usageImageAlt || 'Usage illustration';
    const singleCaption = introduction.usage_image_caption || introduction.usageImageCaption || '';
    
    if (singleImage) {
      images.push({
        src: singleImage,
        alt: singleAlt,
        caption: singleCaption
      });
    }
  }
  
  console.log('Parsed images:', images);
  return images.filter(img => img.src); // Only return images with valid src
}

// Returns the preferred caption text: explicit caption if present, otherwise the alt text
function getImageCaptionText(img) {
  if (!img) return '';
  const cap = (img.caption !== undefined && img.caption !== null) ? String(img.caption).trim() : '';
  const alt = (img.alt !== undefined && img.alt !== null) ? String(img.alt).trim() : '';
  const title = (img.title !== undefined && img.title !== null) ? String(img.title).trim() : '';
  return cap || alt || title;
}

// Build an images array from a generic item config.
// Supports:
// - images: ["src", ...] with optional images_alt and images_captions arrays
// - images: [{ src, alt, caption }, ...]
// - image: "src" with image_alt, image_caption
// - image: { src, alt, caption }
function parseItemImages(item) {
  const images = [];
  if (!item) return images;

  if (Array.isArray(item.images)) {
    const alts = Array.isArray(item.images_alt) ? item.images_alt : [];
    const caps = Array.isArray(item.images_captions) ? item.images_captions : [];
    item.images.forEach((it, idx) => {
      if (typeof it === 'string') {
        images.push({ src: it, alt: alts[idx] || `Feature image ${idx + 1}`, caption: caps[idx] || '' });
      } else if (it && typeof it === 'object') {
        images.push({ src: it.src || it.image || '', alt: it.alt || alts[idx] || `Feature image ${idx + 1}` , caption: it.caption || caps[idx] || '' });
      }
    });
  } else if (item.image || item.image_alt || item.image_caption) {
    const src = typeof item.image === 'object' ? (item.image.src || item.image.image) : item.image;
    const alt = (typeof item.image === 'object' && item.image.alt) ? item.image.alt : (item.image_alt || 'Feature image');
    const caption = (typeof item.image === 'object' && item.image.caption) ? item.image.caption : (item.image_caption || '');
    if (src) images.push({ src, alt, caption });
  }
  return images.filter(x => x && x.src);
}

function createImageCarousel(images, cfg, className = 'image-carousel', options = {}) {
  console.log('Creating carousel with images:', images);
  const carouselId = `usage-carousel-${Date.now()}`;
  
  // Slides only contain the image; caption is placed outside the carousel to keep
  // indicators decoupled from the caption height.
  const itemsHtml = images.map((img, index) => {
    const altText = (options && options.sharedAlt != null)
      ? String(options.sharedAlt)
      : (img.alt || '');
    return `
      <div class="carousel-item ${index === 0 ? 'active' : ''}">
        <img src="${img.src}" alt="${altText}" loading="lazy" class="d-block w-100">
      </div>
    `;
  }).join('');

  const indicatorsHtml = images.length > 1 ? `
    <div class="carousel-indicators">
      ${images.map((_, index) => `
        <button type="button" data-bs-target="#${carouselId}" data-bs-slide-to="${index}" 
                class="${index === 0 ? 'active' : ''}" aria-current="${index === 0 ? 'true' : 'false'}" 
                aria-label="Slide ${index + 1}"></button>
      `).join('')}
    </div>
  ` : '';

  // Wrapper hosts the carousel and a caption element underneath
  const wrapper = document.createElement('div');
  wrapper.className = className;
  wrapper.innerHTML = `
    <div id="${carouselId}" class="carousel slide" data-bs-ride="false">
      <div class="carousel-inner">
        ${itemsHtml}
      </div>
      ${indicatorsHtml}
    </div>
  `;
  
  // Create caption under the carousel using DRY selection (caption -> alt -> title)
  const staticCaption = !!options.staticCaption;
  const firstCapText = (options.captionText !== undefined)
    ? options.captionText
    : getImageCaptionText(images[0]);
  const captionEl = document.createElement('div');
  captionEl.className = 'usage-carousel-caption intro__usage-caption';
  if (firstCapText) {
    captionEl.innerHTML = mdInlineToHtmlBoldOnly(String(firstCapText));
  }
  wrapper.appendChild(captionEl);
  
  console.log('Generated carousel HTML:', wrapper.innerHTML);
  
  // Apply theme colors to captions
  setTimeout(() => {
    colorizeStrongIn(wrapper, cfg);
  }, 0);
  
  // Sync caption with active slide
  const carouselEl = wrapper.querySelector(`#${carouselId}`);
  if (!staticCaption) {
    const setCaptionFromIndex = (idx) => {
      const text = getImageCaptionText(images[idx]) || '';
      captionEl.innerHTML = text ? mdInlineToHtmlBoldOnly(String(text)) : '';
      colorizeStrongIn(captionEl, cfg);
    };
    // Bootstrap event when slide changes
    carouselEl.addEventListener('slid.bs.carousel', () => {
      const items = Array.from(carouselEl.querySelectorAll('.carousel-item'));
      const activeIndex = Math.max(0, items.findIndex(i => i.classList.contains('active')));
      setCaptionFromIndex(activeIndex);
    });
  }
  
  return wrapper;
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
        
        // Determine version type and color based on title keywords
        const lowerTitle = version.title.toLowerCase();
        let versionClass = 'changelog-version-default';
        let badgeClass = 'bg-secondary';
        let titleColor = 'var(--text-white)';
        let borderColor = 'var(--primary-purple)';
        let iconColor = 'var(--primary-purple)';
        
        // Bug fixes and hotfixes - Red
        if (lowerTitle.includes('bug') || lowerTitle.includes('fix') || lowerTitle.includes('hotfix')) {
          versionClass = 'changelog-version-fix';
          badgeClass = 'bg-danger';
          titleColor = '#ff6b6b';
          borderColor = '#dc3545';
          iconColor = '#dc3545';
        } 
        // Features, updates, improvements - Green
        else if (lowerTitle.includes('feature') || lowerTitle.includes('update') || lowerTitle.includes('new') || 
                 lowerTitle.includes('improvement') || lowerTitle.includes('addition') || lowerTitle.includes('optimization') ||
                 lowerTitle.includes('stability') || lowerTitle.includes('qol')) {
          versionClass = 'changelog-version-feature';
          badgeClass = 'bg-success';
          titleColor = '#51cf66';
          borderColor = '#28a745';
          iconColor = '#28a745';
        } 
        // Releases and initial versions - Blue
        else if (lowerTitle.includes('release') || lowerTitle.includes('initial') || lowerTitle.includes('public')) {
          versionClass = 'changelog-version-release';
          badgeClass = 'bg-primary';
          titleColor = '#74c0fc';
          borderColor = '#007bff';
          iconColor = '#007bff';
        }
        // Reworks and major changes - Orange
        else if (lowerTitle.includes('rework') || lowerTitle.includes('change') || lowerTitle.includes('major')) {
          versionClass = 'changelog-version-rework';
          badgeClass = 'bg-warning';
          titleColor = '#ffd43b';
          borderColor = '#ffc107';
          iconColor = '#ffc107';
        }
        
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
  console.log('applyThemeColors called with cfg:', cfg);
  if (cfg?.theme_colors) {
    const root = document.documentElement;
    const colors = cfg.theme_colors;
    console.log('Applying theme colors:', colors);
    const specialKeys = new Set([
      'outline_variant',
      'outline_fill_color',
      'outline_stroke_color',
      'outline_glow_inner',
      'outline_glow_outer',
      'outline_glow_inner_alpha',
      'outline_glow_outer_alpha'
    ]);
    
    // Apply each color with !important to override CSS defaults
    Object.entries(colors).forEach(([key, value]) => {
      if (value && !specialKeys.has(key)) {
        const cssVar = `--${key.replace(/_/g, '-')}`;
        root.style.setProperty(cssVar, value, 'important');
        console.log(`Set ${cssVar} to ${value}`);
      }
    });

    document.body.classList.remove('theme-outline');
    if (colors.outline_variant) {
      document.body.classList.add('theme-outline');
      const fillColor = colors.outline_fill_color || '#ffffff';
      const strokeColor = colors.outline_stroke_color || '#ffffff';
      document.documentElement.style.setProperty('--outline-fill', fillColor);
      document.documentElement.style.setProperty('--outline-stroke', strokeColor);
      if (colors.outline_glow_inner) {
        document.documentElement.style.setProperty('--outline-glow-inner', colors.outline_glow_inner);
      }
      if (colors.outline_glow_outer) {
        document.documentElement.style.setProperty('--outline-glow-outer', colors.outline_glow_outer);
      }
      if (colors.outline_glow_inner_alpha !== undefined) {
        document.documentElement.style.setProperty('--outline-glow-inner-alpha', colors.outline_glow_inner_alpha);
      }
      if (colors.outline_glow_outer_alpha !== undefined) {
        document.documentElement.style.setProperty('--outline-glow-outer-alpha', colors.outline_glow_outer_alpha);
      }
    } else {
      document.documentElement.style.removeProperty('--outline-fill');
      document.documentElement.style.removeProperty('--outline-stroke');
      document.documentElement.style.removeProperty('--outline-glow-inner');
      document.documentElement.style.removeProperty('--outline-glow-outer');
      document.documentElement.style.removeProperty('--outline-glow-inner-alpha');
      document.documentElement.style.removeProperty('--outline-glow-outer-alpha');
    }
  } else {
    console.log('No theme colors found in cfg');
    document.body.classList.remove('theme-outline');
    document.documentElement.style.removeProperty('--outline-fill');
    document.documentElement.style.removeProperty('--outline-stroke');
    document.documentElement.style.removeProperty('--outline-glow-inner');
    document.documentElement.style.removeProperty('--outline-glow-outer');
    document.documentElement.style.removeProperty('--outline-glow-inner-alpha');
    document.documentElement.style.removeProperty('--outline-glow-outer-alpha');
  }
}

function applyOutlineTextStyles() {
  const outline = isOutlineThemeActive();
  const fill = document.documentElement.style.getPropertyValue('--outline-fill') || '#ffffff';
  const stroke = document.documentElement.style.getPropertyValue('--outline-stroke') || fill;
  const selectors = [
    '.intro__params-title',
    '.intro__usage-title',
    '.comparison-caption'
  ];
  selectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((el) => {
      toggleOutlineClass(el, outline);
      if (outline) {
        el.style.color = fill;
      } else {
        el.style.removeProperty('color');
      }
    });
  });
}

function renderContent(cfg) {
  // Apply theme colors first
  applyThemeColors(cfg);
  
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
    if (usageTitle) {
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

      const card = document.createElement('div');
      card.className = 'card card--compact';

      // Mode 1: Before/After slider if before/after provided
      if (before || after) {
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
        const imgs = parseItemImages(item);
        if (imgs.length > 1) {
          // Dynamic captions for comparison carousels (updates as slides change)
          // But use shared alt text for accessibility consistency
          const sharedAlt = (imgs.map(im => getImageCaptionText(im)).find(Boolean)) || (caption ? String(caption) : '');
          const carousel = createImageCarousel(imgs, cfg, 'image-carousel', { sharedAlt });
          card.appendChild(carousel);
          // Do not add a separate card-level caption to avoid duplication
        } else if (imgs.length === 1) {
          const fig = document.createElement('figure');
          fig.className = 'image-card';
          const img = document.createElement('img');
          img.src = imgs[0].src;
          img.alt = getImageCaptionText(imgs[0]) || '';
          img.loading = 'lazy';
          img.className = 'media-border';
          fig.appendChild(img);
          const capText = getImageCaptionText(imgs[0]);
          if (capText) {
            const cap = document.createElement('figcaption');
            cap.className = 'intro__usage-caption';
            cap.innerHTML = mdInlineToHtmlBoldOnly(String(capText));
            fig.appendChild(cap);
          }
          card.appendChild(fig);
          if (captionHtml && !capText) {
            const p = document.createElement('p');
            p.className = 'comparison-caption';
            p.innerHTML = captionHtml;
            card.appendChild(p);
          }
        }
      }

      colorizeStrongIn(card, cfg);
      grid.appendChild(card);
    });
  }

  // Showcase (single or multiple videos with carousel)
  const showcase = document.getElementById('showcase-container');
  if (showcase) {
    showcase.innerHTML = '';
    const videos = parseShowcaseVideos(cfg?.showcase || {});
    if (videos.length > 1) {
      showcase.classList.remove('placeholder', 'video-placeholder');
      showcase.classList.add('video-embed');
      const carousel = createVideoCarousel(videos, cfg, 'video-carousel');
      showcase.appendChild(carousel);
    } else if (videos.length === 1) {
      showcase.classList.remove('placeholder', 'video-placeholder');
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
    } else {
      // Fallback placeholder
      showcase.classList.remove('video-embed');
      showcase.classList.add('placeholder', 'video-placeholder', 'interactive-border');
      showcase.textContent = (cfg?.showcase && cfg.showcase.placeholder) ? cfg.showcase.placeholder : 'Showcase Video Placeholder';
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
    } else {
      tomlUrl = 'content/coacd-collision-generator.toml'; // default
    }
  }
  try {
    console.log('Loading TOML from:', tomlUrl);
    cfg = await loadTomlContent(tomlUrl);
    console.log('Loaded TOML config:', cfg);
    renderContent(cfg);
  } catch (err) {
    console.error('Content load failed:', err);
    console.warn('Using defaults due to error');
  }
  // Initialize interactive/visual features after content is in the DOM
  initBeforeAfterSliders();
  randomizeHeadingColors();
  randomizeButtonThemes();
  generateBackgroundShapes(cfg);
  applyOutlineTextStyles();
});
