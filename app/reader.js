const menu = document.querySelector('.chapterMenu');
const narrow = matchMedia('(max-width:760px)');
function setMenuLayout() { menu.open = !narrow.matches; }
setMenuLayout();
narrow.addEventListener('change', setMenuLayout);
