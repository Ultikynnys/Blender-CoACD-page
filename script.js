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

// Utility functions
const utils = {
  clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
  randomChoice: (array) => array[Math.floor(Math.random() * array.length)],
  getViewportWidth: () => Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0)
};

// Header fade on scroll
function initHeaderFade() {
  const header = document.querySelector('.site-header');
  if (!header) return;
  
  const fadeDistance = 140;
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  
  const updateOpacity = () => {
    const scrollY = window.scrollY || window.pageYOffset || 0;
    const opacity = Math.max(0, Math.min(1, 1 - scrollY / fadeDistance));
    
    header.style.opacity = prefersReduced ? 1 : opacity.toFixed(3);
    header.style.pointerEvents = opacity < 0.05 ? 'none' : 'auto';
  };
  
  updateOpacity();
  window.addEventListener('scroll', updateOpacity, { passive: true });
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
  document.querySelectorAll('h2').forEach((heading) => {
    const color = utils.randomChoice(THEME_CONFIG.colors.palette);
    heading.style.color = color;
  });
}

// Randomize themed button colors
function randomizeButtonThemes() {
  document.querySelectorAll('.themed-btn').forEach(button => {
    // Remove existing theme classes
    THEME_CONFIG.colors.buttonClasses.forEach(className => {
      button.classList.remove(className);
    });
    
    // Add random theme class
    const randomTheme = utils.randomChoice(THEME_CONFIG.colors.buttonClasses);
    button.classList.add(randomTheme);
  });
}

// Generate background shapes
function generateBackgroundShapes() {
  const container = document.querySelector('.bg-shapes');
  if (!container) return;
  
  container.innerHTML = '';
  const viewportWidth = utils.getViewportWidth();
  const shapeCount = viewportWidth < 600 ? 48 : 96;
  const sizeRange = viewportWidth < 600 ? { min: 18, max: 50 } : { min: 22, max: 60 };
  
  for (let i = 0; i < shapeCount; i++) {
    const shape = document.createElement('span');
    const shapeType = utils.randomChoice(THEME_CONFIG.shapes.types);
    const shapeColor = utils.randomChoice(THEME_CONFIG.shapes.colors);
    
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

// Initialize all functionality when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  initHeaderFade();
  initBeforeAfterSliders();
  randomizeHeadingColors();
  randomizeButtonThemes();
  generateBackgroundShapes();
});
