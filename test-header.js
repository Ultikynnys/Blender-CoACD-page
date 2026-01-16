// Test if header is fixed - paste this in browser console
const header = document.querySelector('.site-header');
const computed = window.getComputedStyle(header);
console.log('Header position:', computed.position);
console.log('Header top:', computed.top);
console.log('Header z-index:', computed.zIndex);

// Log scroll position
window.addEventListener('scroll', () => {
    const rect = header.getBoundingClientRect();
    console.log('Scroll Y:', window.scrollY, 'Header top from viewport:', rect.top);
});
